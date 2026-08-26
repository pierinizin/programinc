-- =============================================================================
-- INCOVIA — Fotos dos colaboradores (Supabase Storage)
-- =============================================================================
-- Cole no SQL Editor do Supabase e clique em Run. Pode rodar mais de uma vez.
-- Não apaga nada e não altera dado existente.
--
-- O QUE ELE FAZ
--   1. Cria a coluna foto_path em colaboradores (só o caminho, não a URL).
--   2. Cria um bucket PRIVADO chamado 'fotos'.
--   3. Aplica policies no mesmo padrão do security.sql:
--        visualizador/editor/admin veem   |   editor/admin enviam   |   admin apaga
--
-- POR QUE BUCKET PRIVADO
--   Foto de funcionário é dado pessoal. Num bucket público, qualquer pessoa
--   com o link vê a imagem, sem login — e links vazam por WhatsApp, histórico
--   de navegador, print. Privado significa que o app pede uma URL assinada e
--   temporária a cada carregamento. Fica coerente com a RLS que já aplicamos:
--   não faria sentido blindar a tabela e deixar o rosto das pessoas aberto.
--
-- POR QUE GUARDAR O CAMINHO E NÃO A URL
--   URL assinada expira. Se você gravar a URL no banco, ela para de funcionar
--   em uma hora. O banco guarda 'colaboradores/<id>.jpg' e o app pede a
--   assinatura na hora de exibir.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Coluna do caminho da foto
-- -----------------------------------------------------------------------------
alter table public.colaboradores
  add column if not exists foto_path text;


-- -----------------------------------------------------------------------------
-- 2. Bucket privado
-- -----------------------------------------------------------------------------
-- 5 MB por arquivo já é folgado: o app reduz a imagem para 256x256 no
-- navegador antes de enviar, então o que chega aqui costuma ter ~30 KB.
-- O limite existe para barrar envio direto pela API, não o uso normal.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];


-- -----------------------------------------------------------------------------
-- 3. Policies do bucket
-- -----------------------------------------------------------------------------
-- Reutilizam as funções que o security.sql já criou. Se elas não existirem,
-- rode o security.sql antes deste arquivo.

drop policy if exists "fotos_ver"      on storage.objects;
drop policy if exists "fotos_enviar"   on storage.objects;
drop policy if exists "fotos_atualizar" on storage.objects;
drop policy if exists "fotos_apagar"   on storage.objects;

create policy "fotos_ver" on storage.objects
  for select to authenticated
  using (bucket_id = 'fotos' and public.pode_ler());

create policy "fotos_enviar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos' and public.pode_escrever());

create policy "fotos_atualizar" on storage.objects
  for update to authenticated
  using (bucket_id = 'fotos' and public.pode_escrever())
  with check (bucket_id = 'fotos' and public.pode_escrever());

create policy "fotos_apagar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fotos' and public.eh_admin());


-- -----------------------------------------------------------------------------
-- 4. Conferência
-- -----------------------------------------------------------------------------
-- Tem que aparecer: a coluna foto_path, o bucket 'fotos' com publico = false,
-- e as 4 policies.

select 'coluna' as item,
       case when exists (
         select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'colaboradores'
            and column_name = 'foto_path'
       ) then 'ok — foto_path existe' else '>>> FALTANDO <<<' end as situacao
union all
select 'bucket',
       coalesce((select case when public then '>>> PUBLICO — deveria ser privado <<<'
                             else 'ok — privado' end
                   from storage.buckets where id = 'fotos'), '>>> NAO CRIADO <<<')
union all
select 'policies',
       (select count(*)::text || ' de 4'
          || case when count(*) = 4 then '  ok' else '  >>> INCOMPLETO <<<' end
          from pg_policies
         where schemaname = 'storage' and tablename = 'objects'
           and policyname like 'fotos_%')
union all
select 'funcoes de cargo',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = 'public' and p.proname = 'pode_ler')
            then 'ok' else '>>> RODE O security.sql PRIMEIRO <<<' end;
