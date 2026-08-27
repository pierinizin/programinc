-- =============================================================================
-- INCOVIA — Documentos de funcionários
-- =============================================================================
-- Cole no SQL Editor do Supabase e clique em Run. Pode rodar mais de uma vez.
-- Não apaga nada e não altera dado existente.
--
-- CONTEXTO. Isto guarda dado pessoal de gente de verdade: CPF, RG, CTPS,
-- contrato, e — em categoria separada — ASO e atestado, que a LGPD classifica
-- como dado SENSÍVEL (Art. 5º, II) e trata com regra mais dura.
--
-- POR QUE NÃO REUSEI O MODELO DAS FOTOS. A policy do bucket 'fotos' usa
-- pode_ler(), que vale para visualizador, editor e admin. Provei no espelho do
-- banco: hoje um 'visualizador' lê a tabela de colaboradores inteira, igual ao
-- admin. Se documento seguisse esse molde, todo visualizador abriria o RG e o
-- ASO das 47 pessoas. Aqui é eh_admin() em tudo — tabela e arquivos.
--
-- TRÊS CAMADAS, porque uma só sempre falha em algum dia ruim:
--   1. a tabela 'documentos' só é lida por admin (RLS)
--   2. o bucket 'documentos' só é lido por admin (policy no storage.objects)
--   3. todo acesso fica registrado em 'documentos_acessos', que ninguém apaga
--
-- Não sou advogado: confirme com seu contador ou jurídico por quanto tempo
-- cada documento precisa ser guardado antes de apagar qualquer coisa.
-- =============================================================================

create extension if not exists pgcrypto;


-- -----------------------------------------------------------------------------
-- 1. Tabela de documentos
-- -----------------------------------------------------------------------------
create table if not exists public.documentos (
  id uuid primary key default gen_random_uuid(),
  "colaboradorId" uuid not null references public.colaboradores(id) on delete restrict,

  -- 'saude' fica separado de propósito: é a categoria sensível da LGPD.
  -- Mantê-la nomeada permite endurecer só ela depois, sem tocar no resto.
  categoria text not null default 'outro'
    check (categoria in ('identificacao','contrato','ctps','saude','treinamento','outro')),

  titulo text not null,
  nome_arquivo text not null,

  -- Caminho ALEATÓRIO, nunca derivado do id do colaborador. Com caminho
  -- previsível ('documentos/<id>/rg.pdf'), quem descobrisse o padrão poderia
  -- tentar adivinhar arquivos. O caminho real vive só nesta linha.
  caminho text not null unique,

  mime text,
  tamanho_bytes bigint,
  observacao text,

  enviado_por uuid references public.perfis(id) on delete set null,
  enviado_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documentos_colaborador_idx
  on public.documentos ("colaboradorId");
create index if not exists documentos_categoria_idx
  on public.documentos (categoria);

do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    drop trigger if exists documentos_set_updated_at on public.documentos;
    create trigger documentos_set_updated_at
      before update on public.documentos
      for each row execute function public.set_updated_at();
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 2. Registro de acesso — quem abriu o quê, quando
-- -----------------------------------------------------------------------------
-- APPEND-ONLY de propósito: existe policy de insert e de select, e NENHUMA de
-- update ou delete. Com RLS forçada, o que não tem policy é proibido — nem o
-- admin reescreve o próprio rastro. Um log que o suspeito pode editar não é
-- log, é decoração.
create table if not exists public.documentos_acessos (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid references public.documentos(id) on delete set null,
  colaborador_id uuid,
  quem uuid references public.perfis(id) on delete set null,
  acao text not null check (acao in ('abriu','enviou','apagou','listou')),
  quando timestamptz not null default now()
);

create index if not exists documentos_acessos_quando_idx
  on public.documentos_acessos (quando desc);
create index if not exists documentos_acessos_doc_idx
  on public.documentos_acessos (documento_id);


-- -----------------------------------------------------------------------------
-- 3. Bucket privado
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentos', 'documentos', false,
  15728640,   -- 15 MB: um PDF de contrato digitalizado cabe; vídeo não entra
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do update
  set public = false,                       -- reforça: nunca público
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- -----------------------------------------------------------------------------
-- 4. RLS — tudo aqui é só de admin
-- -----------------------------------------------------------------------------
alter table public.documentos enable row level security;
alter table public.documentos force row level security;
alter table public.documentos_acessos enable row level security;
alter table public.documentos_acessos force row level security;

drop policy if exists documentos_select on public.documentos;
drop policy if exists documentos_insert on public.documentos;
drop policy if exists documentos_update on public.documentos;
drop policy if exists documentos_delete on public.documentos;

create policy documentos_select on public.documentos
  for select to authenticated using (public.eh_admin());
create policy documentos_insert on public.documentos
  for insert to authenticated with check (public.eh_admin());
create policy documentos_update on public.documentos
  for update to authenticated
  using (public.eh_admin()) with check (public.eh_admin());
create policy documentos_delete on public.documentos
  for delete to authenticated using (public.eh_admin());

drop policy if exists acessos_select on public.documentos_acessos;
drop policy if exists acessos_insert on public.documentos_acessos;

create policy acessos_select on public.documentos_acessos
  for select to authenticated using (public.eh_admin());
-- quem grava o log é sempre o próprio usuário logado: ninguém escreve
-- rastro em nome de outro
create policy acessos_insert on public.documentos_acessos
  for insert to authenticated with check (public.eh_admin() and quem = auth.uid());
-- sem policy de update e sem policy de delete = ninguém altera nem apaga


-- -----------------------------------------------------------------------------
-- 5. Storage — o arquivo em si
-- -----------------------------------------------------------------------------
drop policy if exists "documentos_ver"       on storage.objects;
drop policy if exists "documentos_enviar"    on storage.objects;
drop policy if exists "documentos_atualizar" on storage.objects;
drop policy if exists "documentos_apagar"    on storage.objects;

create policy "documentos_ver" on storage.objects
  for select to authenticated
  using (bucket_id = 'documentos' and public.eh_admin());

create policy "documentos_enviar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documentos' and public.eh_admin());

create policy "documentos_atualizar" on storage.objects
  for update to authenticated
  using (bucket_id = 'documentos' and public.eh_admin())
  with check (bucket_id = 'documentos' and public.eh_admin());

create policy "documentos_apagar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documentos' and public.eh_admin());

revoke all on public.documentos, public.documentos_acessos from anon;


-- -----------------------------------------------------------------------------
-- 6. Conferência
-- -----------------------------------------------------------------------------
select * from (
  select 1 as ord, 'tabela documentos' as item,
    case when exists (select 1 from information_schema.tables
                       where table_schema='public' and table_name='documentos')
         then 'ok' else '>>> FALTANDO <<<' end as situacao
  union all
  select 2, 'tabela de acessos',
    case when exists (select 1 from information_schema.tables
                       where table_schema='public' and table_name='documentos_acessos')
         then 'ok' else '>>> FALTANDO <<<' end
  union all
  select 3, 'bucket privado',
    coalesce((select case when public then '>>> PUBLICO — CORRIJA AGORA <<<'
                          else 'ok — privado, 15MB, so pdf/jpg/png/webp' end
                from storage.buckets where id='documentos'), '>>> NAO CRIADO <<<')
  union all
  select 4, 'policies da tabela (4 esperadas)',
    (select count(*)::text || ' de 4' || case when count(*)=4 then '  ok' else '  >>> INCOMPLETO <<<' end
       from pg_policies where schemaname='public' and tablename='documentos')
  union all
  select 5, 'policies do storage (4 esperadas)',
    (select count(*)::text || ' de 4' || case when count(*)=4 then '  ok' else '  >>> INCOMPLETO <<<' end
       from pg_policies where schemaname='storage' and tablename='objects'
        and policyname like 'documentos_%')
  union all
  select 6, 'log e append-only',
    case when not exists (select 1 from pg_policies
                           where schemaname='public' and tablename='documentos_acessos'
                             and cmd in ('UPDATE','DELETE'))
         then 'ok — ninguem altera nem apaga o log'
         else '>>> EXISTE POLICY DE UPDATE/DELETE NO LOG <<<' end
  union all
  select 7, 'so admin le documentos',
    case when (select count(*) from pg_policies
                where schemaname='public' and tablename='documentos'
                  and coalesce(qual,'')||coalesce(with_check,'') not like '%eh_admin%') = 0
         then 'ok — toda policy exige admin'
         else '>>> ALGUMA POLICY NAO EXIGE ADMIN <<<' end
) t order by ord;


-- =============================================================================
-- Para auditar depois: quem andou abrindo documento
--
--   select a.quando, p.email, a.acao, d.titulo, c.nome
--     from public.documentos_acessos a
--     left join public.perfis p on p.id = a.quem
--     left join public.documentos d on d.id = a.documento_id
--     left join public.colaboradores c on c.id = a.colaborador_id
--    order by a.quando desc limit 100;
-- =============================================================================
