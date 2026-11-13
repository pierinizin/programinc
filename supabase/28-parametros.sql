-- =============================================================================
-- 28 · Parâmetros — as listas e regras que eram fixas no código
-- -----------------------------------------------------------------------------
-- Cria duas tabelas que a tela Parâmetros (menu Sistema → Parâmetros) edita:
--
--   parametros_itens   uma linha por item de lista: funções, tipos de serviço,
--                      motivos de "não realizado", tipos de veículo.
--                      Funções têm marcações em `dados`: setor (trecho/fora),
--                      lidera (pode ser encarregado), dirige (cobra CNH…).
--   parametros_regras  valores com número: horário padrão, máximo por
--                      equipe, dias do aviso de "falta dar baixa".
--
-- Já entra tudo preenchido com o que o app usa hoje, mais o que já existe
-- digitado no banco (nenhuma função, tipo ou motivo some). Nada muda até
-- alguém editar.
--
-- Também:
--   • a regra de documentos passa a usar as marcações da função ("dirige",
--     "pode ser encarregado") em vez de procurar a palavra no nome;
--   • renomear um item muda junto em quem já usa (renomear_parametro);
--   • o motivo de "não realizado" deixa de ter a lista travada no banco —
--     quem manda agora é a tabela.
--
-- Quem vê: todo mundo que já lê o app. Quem edita: só admin.
-- Precisa do 22 (cargo RH) e do 24 rodados antes. Pode rodar mais de uma vez.
-- =============================================================================


-- 1. Tabelas -------------------------------------------------------------------
create table if not exists public.parametros_itens (
  id         uuid primary key default gen_random_uuid(),
  lista      text not null check (lista in ('funcao', 'tipo_servico', 'motivo_nao_realizado', 'tipo_veiculo')),
  valor      text not null check (length(trim(valor)) > 0),
  ordem      integer not null default 0,
  ativo      boolean not null default true,
  dados      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lista, valor)
);
create index if not exists parametros_itens_lista_idx on public.parametros_itens (lista, ordem);

create table if not exists public.parametros_regras (
  chave      text primary key check (chave in ('horario_padrao', 'max_equipe', 'dias_sem_baixa')),
  valor      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.parametros_itens  enable row level security;
alter table public.parametros_itens  force row level security;
alter table public.parametros_regras enable row level security;
alter table public.parametros_regras force row level security;

drop policy if exists parametros_itens_leitura on public.parametros_itens;
create policy parametros_itens_leitura on public.parametros_itens
  for select to authenticated using ((select public.pode_ler()));
drop policy if exists parametros_itens_escrita on public.parametros_itens;
create policy parametros_itens_escrita on public.parametros_itens
  for all to authenticated using ((select public.eh_admin())) with check ((select public.eh_admin()));

drop policy if exists parametros_regras_leitura on public.parametros_regras;
create policy parametros_regras_leitura on public.parametros_regras
  for select to authenticated using ((select public.pode_ler()));
drop policy if exists parametros_regras_escrita on public.parametros_regras;
create policy parametros_regras_escrita on public.parametros_regras
  for all to authenticated using ((select public.eh_admin())) with check ((select public.eh_admin()));

revoke all on public.parametros_itens, public.parametros_regras from anon;
grant select, insert, update, delete on public.parametros_itens, public.parametros_regras to authenticated;


-- 2. Preenche com o que existe hoje -------------------------------------------
insert into public.parametros_itens (lista, valor, ordem, dados) values
  ('funcao', 'Encarregado',                     10, '{"setor":"trecho","lidera":true}'),
  ('funcao', 'Motorista de Veículos Médios',    20, '{"setor":"trecho","dirige":true}'),
  ('funcao', 'Ajudante de produção',            30, '{"setor":"trecho"}'),
  ('funcao', 'Operador de máquina de pintura',  40, '{"setor":"trecho"}'),
  ('funcao', 'Auxiliar administrativo',        110, '{"setor":"fora"}'),
  ('funcao', 'Assistente administrativo',      120, '{"setor":"fora"}'),
  ('funcao', 'Mecânico',                       130, '{"setor":"fora"}'),
  ('funcao', 'Almoxarife',                     140, '{"setor":"fora"}'),
  ('funcao', 'Técnico de segurança do trabalho', 150, '{"setor":"fora"}'),
  ('funcao', 'Auxiliar de serviços gerais',    160, '{"setor":"fora"}'),
  ('tipo_servico', 'Pintura - Mecânica e Manual', 10, '{}'),
  ('tipo_servico', 'Implantação de Tachas',       20, '{}'),
  ('tipo_servico', 'Implantação de Defensa',      30, '{}'),
  ('motivo_nao_realizado', 'CHUVA',       10, '{}'),
  ('motivo_nao_realizado', 'MANUTENÇÃO',  20, '{}'),
  ('motivo_nao_realizado', 'VIAGEM',      30, '{}'),
  ('motivo_nao_realizado', 'INTEGRAÇÃO',  40, '{}'),
  ('motivo_nao_realizado', 'OUTROS',      50, '{}'),
  ('tipo_veiculo', 'Caminhão',    10, '{}'),
  ('tipo_veiculo', 'Caminhonete', 20, '{}'),
  ('tipo_veiculo', 'Carro',       30, '{}'),
  ('tipo_veiculo', 'Outro',       40, '{}')
on conflict (lista, valor) do nothing;

-- O que já está digitado no banco e não estava na lista entra também, no fim.
insert into public.parametros_itens (lista, valor, ordem, dados)
select 'funcao', f, 500,
       jsonb_build_object('setor', case when bool_or(coalesce(c.setor, 'trecho') = 'trecho') then 'trecho' else 'fora' end,
                          'lidera', f ilike '%encarregad%', 'dirige', f ilike '%motorista%')
  from (select trim(funcao) as f, setor from public.colaboradores) c
 where f is not null and f <> ''
 group by f
on conflict (lista, valor) do nothing;

insert into public.parametros_itens (lista, valor, ordem)
select distinct 'tipo_servico', trim("tipoEquipe"), 500 from public.programacoes
 where trim(coalesce("tipoEquipe", '')) <> ''
on conflict (lista, valor) do nothing;

insert into public.parametros_itens (lista, valor, ordem)
select distinct 'motivo_nao_realizado', trim("motivoNaoExecucao"), 500 from public.programacoes
 where trim(coalesce("motivoNaoExecucao", '')) <> ''
on conflict (lista, valor) do nothing;

insert into public.parametros_itens (lista, valor, ordem)
select distinct 'tipo_veiculo', trim(tipo), 500 from public.veiculos
 where trim(coalesce(tipo, '')) <> ''
on conflict (lista, valor) do nothing;

insert into public.parametros_regras (chave, valor) values
  ('horario_padrao', '{"horarioInicio":"06:30","horarioInicioObra":"07:30","horarioSaidaAlmoco":"11:30","horarioRetornoAlmoco":"13:00","horarioFimObra":"17:00","horarioSaida":"18:00"}'),
  ('max_equipe', '10'),
  ('dias_sem_baixa', '30')
on conflict (chave) do nothing;


-- 3. Motivo de "não realizado": a lista agora é a tabela ----------------------
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.programacoes'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%motivoNaoExecucao%'
  loop
    execute format('alter table public.programacoes drop constraint %I', c.conname);
  end loop;
end
$$;


-- 4. Marcações da função (usadas pela regra de documentos) --------------------
-- Função fora da lista (texto antigo) cai na regra de sempre: pelo nome.
create or replace function public.funcao_dirige(nome text)
returns boolean language sql stable set search_path = public as $$
  select coalesce(
    (select coalesce((p.dados->>'dirige')::boolean, false) from public.parametros_itens p
      where p.lista = 'funcao' and p.valor = nome limit 1),
    coalesce(nome, '') ilike '%motorista%');
$$;

create or replace function public.funcao_lidera(nome text)
returns boolean language sql stable set search_path = public as $$
  select coalesce(
    (select coalesce((p.dados->>'lidera')::boolean, false) from public.parametros_itens p
      where p.lista = 'funcao' and p.valor = nome limit 1),
    coalesce(nome, '') ilike '%encarregad%');
$$;

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
where (select public.pode_documentos())
  and c.status <> 'inativo'
  and t.codigo <> 'atestado'          -- atestado é cobrado pela falta, não pela matriz
  and (
    (c.setor <> 'trecho' and t.vale_fora_trecho)
    or (
      c.setor = 'trecho' and t.vale_trecho
      and (
        t.aplica_a = 'todos'
        or (t.aplica_a = 'motorista'            and public.funcao_dirige(c.funcao))
        or (t.aplica_a = 'encarregado'          and public.funcao_lidera(c.funcao))
        or (t.aplica_a = 'motorista_encarregado'
            and (public.funcao_dirige(c.funcao) or public.funcao_lidera(c.funcao)))
      )
    )
  );


-- 5. Renomear muda junto em quem já usa ---------------------------------------
create or replace function public.renomear_parametro(p_id uuid, p_novo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  it public.parametros_itens;
  novo text := trim(p_novo);
begin
  if not public.eh_admin() then raise exception 'Só o administrador muda parâmetros.'; end if;
  if novo is null or novo = '' then raise exception 'O nome não pode ficar vazio.'; end if;
  select * into it from public.parametros_itens where id = p_id;
  if not found then raise exception 'Item não encontrado.'; end if;
  if it.valor = novo then return; end if;
  if exists (select 1 from public.parametros_itens where lista = it.lista and valor = novo) then
    raise exception 'Já existe "%" nesta lista.', novo;
  end if;

  update public.parametros_itens set valor = novo, updated_at = now() where id = p_id;
  if it.lista = 'funcao' then
    update public.colaboradores set funcao = novo where funcao = it.valor;
  elsif it.lista = 'tipo_servico' then
    update public.programacoes set "tipoEquipe" = novo where "tipoEquipe" = it.valor;
  elsif it.lista = 'motivo_nao_realizado' then
    update public.programacoes set "motivoNaoExecucao" = novo where "motivoNaoExecucao" = it.valor;
  elsif it.lista = 'tipo_veiculo' then
    update public.veiculos set tipo = novo where tipo = it.valor;
  end if;
end
$$;
revoke execute on function public.renomear_parametro(uuid, text) from public, anon;
grant execute on function public.renomear_parametro(uuid, text) to authenticated;


-- 6. Tempo real (outras telas abertas recebem a mudança) ----------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['parametros_itens', 'parametros_regras'] loop
      if not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end
$$;

notify pgrst, 'reload schema';


-- 7. Conferência --------------------------------------------------------------
select lista, count(*) as itens, count(*) filter (where ativo) as ativos
  from public.parametros_itens group by lista
union all
select 'regras', count(*), count(*) from public.parametros_regras
order by 1;
