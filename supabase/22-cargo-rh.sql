-- =============================================================================
-- 22 · Cargo RH
-- -----------------------------------------------------------------------------
-- Por causa da LGPD, documentos, atestados e arquivos de férias (dados de
-- saúde e pessoais) só abriam para o admin. O RH precisa cuidar disso sem
-- virar admin. Este cargo:
--
--   VÊ      tudo o que um editor vê (Programação, equipes, contratos, etc.),
--           mais documentos, atestados e arquivos de férias de TODOS.
--   EDITA   documentos e atestados de todos (e as faltas que o atestado gera
--           sozinho), férias de todos, e o cadastro e as faltas de quem é de
--           FORA do trecho (escritório, oficina, outros — o /administrativo).
--   NÃO     edita Programação, equipes, pátio, veículos, contratos,
--           integrações, nem o cadastro e as faltas avulsas do trecho.
--           Não vê usuários nem cargos.
--
-- Como foi feito: as regras antigas NÃO foram tocadas. Para cada tabela entram
-- regras novas, só do RH, ao lado das que já existiam (no Postgres, regras do
-- mesmo tipo se somam com "ou"). Admin, editor e visualizador continuam
-- exatamente como antes. As exceções são as 3 telas de pendência
-- (documentos_pendencias, atestados_faltando, atestados_sem_falta), que
-- filtravam "só admin" por dentro e passam a filtrar "admin ou RH".
--
-- Precisa do 21-setor.sql rodado antes. Pode rodar mais de uma vez.
-- =============================================================================


-- 1. O cargo existe ------------------------------------------------------------
do $$
declare
  c record;
begin
  -- derruba a regra antiga de cargos válidos (seja qual for o nome dela)
  for c in
    select conname from pg_constraint
     where conrelid = 'public.perfis'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%cargo%'
  loop
    execute format('alter table public.perfis drop constraint %I', c.conname);
  end loop;
  alter table public.perfis
    add constraint perfis_cargo_check
    check (cargo in ('pendente', 'visualizador', 'editor', 'admin', 'rh'));
end
$$;

-- O admin atribui o cargo pela tela de Aprovações; esta função é a única porta.
create or replace function public.definir_cargo_usuario(uid uuid, novo_cargo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.eh_admin() then
    raise exception 'Apenas administradores podem alterar cargos'
      using errcode = '42501';
  end if;
  if novo_cargo not in ('pendente', 'visualizador', 'editor', 'admin', 'rh') then
    raise exception 'Cargo inválido: %', novo_cargo using errcode = '22023';
  end if;
  if uid = auth.uid() then
    raise exception 'Você não pode alterar o próprio cargo'
      using errcode = '42501';
  end if;
  update public.perfis set cargo = novo_cargo where id = uid;
end;
$$;
revoke execute on function public.definir_cargo_usuario(uuid, text) from public, anon;
grant execute on function public.definir_cargo_usuario(uuid, text) to authenticated;


-- 2. As perguntas que as regras fazem -----------------------------------------
-- RH lê tudo que o visualizador/editor lê.
create or replace function public.pode_ler()
returns boolean language sql stable set search_path = public as $$
  select public.meu_cargo() in ('visualizador', 'editor', 'admin', 'rh');
$$;

create or replace function public.eh_rh()
returns boolean language sql stable set search_path = public as $$
  select public.meu_cargo() = 'rh';
$$;

-- Quem pode ver e mexer em documentos, atestados e arquivos de férias.
create or replace function public.pode_documentos()
returns boolean language sql stable set search_path = public as $$
  select public.meu_cargo() in ('admin', 'rh');
$$;

-- A pessoa é de fora do trecho? (security definer para a regra de uma tabela
-- poder perguntar sobre o cadastro sem depender das regras do cadastro.)
create or replace function public.colaborador_fora_do_trecho(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select setor <> 'trecho' from public.colaboradores where id = cid), false);
$$;
revoke execute on function public.colaborador_fora_do_trecho(uuid) from public, anon;
grant execute on function public.colaborador_fora_do_trecho(uuid) to authenticated;

revoke execute on function public.eh_rh() from public, anon;
grant execute on function public.eh_rh() to authenticated;
revoke execute on function public.pode_documentos() from public, anon;
grant execute on function public.pode_documentos() to authenticated;


-- 3. Regras novas, só do RH ---------------------------------------------------
-- Cadastro: só de quem é de fora do trecho (e não pode "mover" alguém para o
-- trecho, nem tirar alguém do trecho — o with check olha a linha como fica).
drop policy if exists colaboradores_insert_rh on public.colaboradores;
create policy colaboradores_insert_rh on public.colaboradores
  for insert to authenticated
  with check (public.eh_rh() and setor <> 'trecho');

drop policy if exists colaboradores_update_rh on public.colaboradores;
create policy colaboradores_update_rh on public.colaboradores
  for update to authenticated
  using (public.eh_rh() and setor <> 'trecho')
  with check (public.eh_rh() and setor <> 'trecho');

-- O histórico de ativo/inativo é escrito pelo gatilho do cadastro com o
-- usuário de quem mexeu: o RH precisa poder escrever ali, só para quem é dele.
drop policy if exists historico_status_rh on public.colaboradores_status_historico;
create policy historico_status_rh on public.colaboradores_status_historico
  for all to authenticated
  using (public.eh_rh() and public.colaborador_fora_do_trecho("colaboradorId"))
  with check (public.eh_rh() and public.colaborador_fora_do_trecho("colaboradorId"));

-- Faltas: as de quem é de fora do trecho, e as que um atestado gera sozinho
-- (origem_documento_id preenchido) — de qualquer pessoa.
drop policy if exists faltas_insert_rh on public.faltas;
create policy faltas_insert_rh on public.faltas
  for insert to authenticated
  with check (public.eh_rh() and (origem_documento_id is not null
                                  or public.colaborador_fora_do_trecho("colaboradorId")));

drop policy if exists faltas_update_rh on public.faltas;
create policy faltas_update_rh on public.faltas
  for update to authenticated
  using (public.eh_rh() and (origem_documento_id is not null
                             or public.colaborador_fora_do_trecho("colaboradorId")))
  with check (public.eh_rh() and (origem_documento_id is not null
                                  or public.colaborador_fora_do_trecho("colaboradorId")));

drop policy if exists faltas_delete_rh on public.faltas;
create policy faltas_delete_rh on public.faltas
  for delete to authenticated
  using (public.eh_rh() and (origem_documento_id is not null
                             or public.colaborador_fora_do_trecho("colaboradorId")));

-- Férias: de todos.
drop policy if exists ferias_escrita_rh on public.ferias;
create policy ferias_escrita_rh on public.ferias
  for all to authenticated
  using (public.eh_rh()) with check (public.eh_rh());

-- Documentos e o registro de quem abriu cada arquivo.
drop policy if exists documentos_rh on public.documentos;
create policy documentos_rh on public.documentos
  for all to authenticated
  using (public.eh_rh()) with check (public.eh_rh());

drop policy if exists acessos_select_rh on public.documentos_acessos;
create policy acessos_select_rh on public.documentos_acessos
  for select to authenticated using (public.eh_rh());

drop policy if exists acessos_insert_rh on public.documentos_acessos;
create policy acessos_insert_rh on public.documentos_acessos
  for insert to authenticated with check (public.eh_rh() and quem = auth.uid());
-- (continua sem regra de alterar ou apagar o registro: ninguém apaga rastro)

-- Arquivos: documentos e férias de todos; foto só de quem é de fora do trecho.
drop policy if exists "documentos_arquivos_rh" on storage.objects;
create policy "documentos_arquivos_rh" on storage.objects
  for all to authenticated
  using (bucket_id = 'documentos' and public.eh_rh())
  with check (bucket_id = 'documentos' and public.eh_rh());

drop policy if exists "ferias_arquivos_rh" on storage.objects;
create policy "ferias_arquivos_rh" on storage.objects
  for all to authenticated
  using (bucket_id = 'ferias' and public.eh_rh())
  with check (bucket_id = 'ferias' and public.eh_rh());

drop policy if exists "fotos_enviar_rh" on storage.objects;
create policy "fotos_enviar_rh" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fotos' and public.eh_rh()
    and public.colaborador_fora_do_trecho(
      nullif(regexp_replace(name, '^colaboradores/([0-9a-f-]{36})\.jpg$', '\1'), name)::uuid)
  );

drop policy if exists "fotos_atualizar_rh" on storage.objects;
create policy "fotos_atualizar_rh" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'fotos' and public.eh_rh()
    and public.colaborador_fora_do_trecho(
      nullif(regexp_replace(name, '^colaboradores/([0-9a-f-]{36})\.jpg$', '\1'), name)::uuid)
  )
  with check (
    bucket_id = 'fotos' and public.eh_rh()
    and public.colaborador_fora_do_trecho(
      nullif(regexp_replace(name, '^colaboradores/([0-9a-f-]{36})\.jpg$', '\1'), name)::uuid)
  );


-- 4. As telas de pendência passam a valer para admin OU RH -------------------
-- Mesmas colunas de antes (versão do 21 e do 10); só o filtro de quem vê mudou.
create or replace view public.documentos_pendencias
with (security_invoker = true) as
select
  c.id                as colaborador_id,
  c.nome              as colaborador,
  c.funcao,
  t.codigo            as tipo,
  t.nome              as documento,
  t.categoria,
  t.obrigatorio,
  d.id                as documento_id,
  d.valido_ate,
  (d.caminho is not null) as tem_arquivo,
  coalesce(d.dispensado, false) as dispensado,
  case
    when d.id is null                                   then 'faltando'
    when d.dispensado                                   then 'dispensado'
    when t.vence and d.valido_ate is null               then 'sem data de validade'
    when t.vence and d.valido_ate < current_date        then 'vencido'
    when t.vence and d.valido_ate < current_date + (t.alerta_dias || ' days')::interval
                                                        then 'vence em breve'
    when d.caminho is null                              then 'sem o PDF'
    else 'ok'
  end                 as situacao,
  case when d.valido_ate is not null
       then (d.valido_ate - current_date) end as dias_restantes
from public.colaboradores c
cross join public.tipos_documento t
left join lateral (
  select d2.* from public.documentos d2
   where d2."colaboradorId" = c.id and d2.tipo_id = t.id
   order by coalesce(d2.valido_ate, d2.emitido_em, d2.enviado_em::date) desc
   limit 1
) d on true
where public.pode_documentos()
  and c.status <> 'inativo'
  and t.codigo <> 'atestado'          -- atestado é cobrado pela falta, não pela matriz
  and (
    (c.setor <> 'trecho' and t.vale_fora_trecho)
    or (
      c.setor = 'trecho' and t.vale_trecho
      and (
        t.aplica_a = 'todos'
        or (t.aplica_a = 'motorista'            and c.funcao ilike '%motorista%')
        or (t.aplica_a = 'encarregado'          and c.funcao ilike '%encarregado%')
        or (t.aplica_a = 'motorista_encarregado'
            and (c.funcao ilike '%motorista%' or c.funcao ilike '%encarregado%'))
      )
    )
  );

create or replace view public.atestados_faltando
with (security_invoker = true) as
select
  f.id                as falta_id,
  f."colaboradorId"   as colaborador_id,
  c.nome              as colaborador,
  f.data              as dia_da_falta,
  f.motivo,
  (current_date - f.data) as dias_atras
from public.faltas f
join public.colaboradores c on c.id = f."colaboradorId"
where public.pode_documentos()
  and f.motivo in ('atestado_medico','acidente_trabalho')
  and not exists (
    select 1
      from public.documentos d
      join public.tipos_documento t on t.id = d.tipo_id
     where d."colaboradorId" = f."colaboradorId"
       and t.codigo = 'atestado'
       and d.emitido_em is not null
       and d.valido_ate is not null
       and f.data between d.emitido_em and d.valido_ate
  );

create or replace view public.atestados_sem_falta
with (security_invoker = true) as
select
  d.id            as documento_id,
  d."colaboradorId" as colaborador_id,
  c.nome          as colaborador,
  d.emitido_em,
  d.valido_ate,
  (d.valido_ate - d.emitido_em + 1) as dias_cobertos,
  (select count(*) from public.faltas f
    where f."colaboradorId" = d."colaboradorId"
      and f.data between d.emitido_em and d.valido_ate) as faltas_lancadas
from public.documentos d
join public.tipos_documento t on t.id = d.tipo_id
join public.colaboradores c on c.id = d."colaboradorId"
where public.pode_documentos()
  and t.codigo = 'atestado'
  and d.emitido_em is not null
  and d.valido_ate is not null
  and (select count(*) from public.faltas f
        where f."colaboradorId" = d."colaboradorId"
          and f.data between d.emitido_em and d.valido_ate) = 0;

notify pgrst, 'reload schema';


-- 5. Conferência ---------------------------------------------------------------
select * from (
  select 1 as ord, 'cargo rh aceito' as item,
    case when pg_get_constraintdef((select oid from pg_constraint where conname = 'perfis_cargo_check'))
              like '%rh%' then 'ok' else '>>> FALTANDO <<<' end as situacao
  union all
  select 2, 'regras novas do RH',
    (select count(*)::text || ' de 13' from pg_policies
      where policyname in ('colaboradores_insert_rh','colaboradores_update_rh','historico_status_rh',
                           'faltas_insert_rh','faltas_update_rh','faltas_delete_rh','ferias_escrita_rh',
                           'documentos_rh','acessos_select_rh','acessos_insert_rh',
                           'documentos_arquivos_rh','ferias_arquivos_rh','fotos_enviar_rh'))
  union all
  select 3, 'pendências abrem para admin ou RH',
    case when (select count(*) from pg_views where schemaname = 'public'
                and viewname in ('documentos_pendencias','atestados_faltando','atestados_sem_falta')
                and definition like '%pode_documentos%') = 3
         then 'ok' else '>>> VIEW ANTIGA <<<' end
  union all
  select 4, 'usuários com cargo rh',
    (select count(*)::text from public.perfis where cargo = 'rh')
) t order by ord;
