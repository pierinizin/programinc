-- =============================================================================
-- INCOVIA — Catálogo de documentos e controle de vencimento
-- =============================================================================
-- Rode DEPOIS do 07-documentos.sql. Pode rodar mais de uma vez.
-- Não apaga nada.
--
-- POR QUE ISTO EXISTE. A foto da sua agenda não é uma pilha de arquivos: é uma
-- MATRIZ — 15 documentos × cada pessoa, com "ok" e com "-". O valor não está em
-- guardar o PDF, está em responder "quem está faltando o quê" sem você abrir a
-- agenda e conferir na mão.
--
-- E metade da lista VENCE: ASO, CNH e todas as NRs. Arquivo guardado não avisa
-- quando expira. Aqui cada documento tem data de validade e o sistema calcula
-- a pendência sozinho — que é a diferença entre um arquivo morto e algo que
-- serve quando o fiscal aparece.
--
-- OS PRAZOS ABAIXO SÃO SUGESTÃO, NÃO LEI. Validade de treinamento de NR e
-- periodicidade de ASO variam por risco, função e política da empresa. Confirme
-- com seu técnico de segurança / SESMT e ajuste com o UPDATE do fim do arquivo.
-- Eu não sou advogado nem engenheiro de segurança do trabalho.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Catálogo de tipos
-- -----------------------------------------------------------------------------
create table if not exists public.tipos_documento (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null,

  -- casa com as categorias do 07-documentos.sql; 'saude' é a sensível da LGPD
  categoria text not null default 'outro'
    check (categoria in ('identificacao','contrato','ctps','saude','treinamento','outro')),

  obrigatorio boolean not null default true,

  -- Alguns valem para todo mundo; direção defensiva, por exemplo, só faz
  -- sentido para quem dirige. Sem isto, a lista de pendências acusaria falta
  -- de um documento que aquela pessoa nunca precisou ter.
  aplica_a text not null default 'todos'
    check (aplica_a in ('todos','motorista','encarregado','motorista_encarregado')),

  vence boolean not null default false,
  meses_validade int,
  -- avisar com quanta antecedência (dias)
  alerta_dias int not null default 30,
  ordem int not null default 100,

  check (not vence or meses_validade is not null)
);

alter table public.tipos_documento enable row level security;
alter table public.tipos_documento force row level security;

drop policy if exists tipos_documento_select on public.tipos_documento;
drop policy if exists tipos_documento_escrita on public.tipos_documento;

-- O CATÁLOGO não é dado pessoal: é a lista de quais documentos existem.
-- Quem pode ler o cadastro pode ver a lista; só admin altera.
create policy tipos_documento_select on public.tipos_documento
  for select to authenticated using (public.pode_ler());
create policy tipos_documento_escrita on public.tipos_documento
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());


-- -----------------------------------------------------------------------------
-- 2. A lista da sua agenda
-- -----------------------------------------------------------------------------
insert into public.tipos_documento
  (codigo, nome, categoria, aplica_a, vence, meses_validade, ordem)
values
  ('rg_cpf',        'RG / CPF',                     'identificacao','todos',                false, null, 10),
  ('foto_3x4',      'Foto 3x4',                     'identificacao','todos',                false, null, 20),
  ('ficha_registro','Ficha de Registro',            'contrato',     'todos',                false, null, 30),
  ('esocial',       'e-Social',                     'contrato',     'todos',                false, null, 40),
  ('tipagem',       'Tipagem sanguínea',            'saude',        'todos',                false, null, 50),
  ('aso',           'ASO',                          'saude',        'todos',                true,    12, 60),
  ('cnh',           'CNH',                          'identificacao','motorista',            true,    60, 70),
  ('ficha_epi',     'Ficha de EPI',                 'outro',        'todos',                false, null, 80),
  ('ordem_servico', 'Ordem de Serviço',             'outro',        'todos',                false, null, 90),
  ('nr06',          'NR-06 — EPI',                  'treinamento',  'todos',                true,    12, 100),
  ('nr11',          'NR-11 — Movimentação de cargas','treinamento', 'todos',                true,    12, 110),
  ('nr12',          'NR-12 — Máquinas e equipamentos','treinamento','todos',                true,    24, 120),
  ('nr18',          'NR-18 — Construção',           'treinamento',  'todos',                true,    12, 130),
  ('nr35',          'NR-35 — Trabalho em altura',   'treinamento',  'todos',                true,    24, 140),
  ('direcao_def',   'Direção defensiva',            'treinamento',  'motorista_encarregado',true,    24, 150)
on conflict (codigo) do nothing;   -- roda de novo sem duplicar nem sobrescrever seus ajustes


-- -----------------------------------------------------------------------------
-- 3. Ligar o documento ao tipo e à validade
-- -----------------------------------------------------------------------------
alter table public.documentos
  add column if not exists tipo_id uuid references public.tipos_documento(id) on delete set null,
  add column if not exists emitido_em date,
  add column if not exists valido_ate date;

create index if not exists documentos_tipo_idx on public.documentos (tipo_id);
create index if not exists documentos_validade_idx on public.documentos (valido_ate)
  where valido_ate is not null;


-- -----------------------------------------------------------------------------
-- 4. A pergunta que a agenda respondia na mão
-- -----------------------------------------------------------------------------
-- Uma linha por (pessoa × documento que ela precisa ter), com a situação.
-- 'faltando' é o "-" da sua agenda, calculado sozinho.
--
-- security_invoker: a view respeita as policies de quem consulta, em vez de
-- rodar com o poder de quem a criou. Sem isso, ela seria um buraco por onde um
-- visualizador leria dado que a policy da tabela nega.
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
  case
    when d.id is null                                   then 'faltando'
    when t.vence and d.valido_ate is null               then 'sem data de validade'
    when t.vence and d.valido_ate < current_date        then 'vencido'
    when t.vence and d.valido_ate < current_date + (t.alerta_dias || ' days')::interval
                                                        then 'vence em breve'
    else 'ok'
  end                 as situacao,
  case when d.valido_ate is not null
       then (d.valido_ate - current_date) end as dias_restantes
from public.colaboradores c
cross join public.tipos_documento t
left join lateral (
  -- o mais recente daquele tipo, para aquela pessoa
  select d2.* from public.documentos d2
   where d2."colaboradorId" = c.id and d2.tipo_id = t.id
   order by coalesce(d2.valido_ate, d2.emitido_em, d2.enviado_em::date) desc
   limit 1
) d on true
-- Só admin: documento é admin-only, e sem esta linha um visualizador veria a
-- matriz inteira com TUDO marcado como "faltando" — porque as policies escondem
-- os documentos dele. Não vazaria nada, mas mostraria uma mentira, que numa tela
-- de conferência é pior do que não mostrar.
where public.eh_admin()
  and c.status <> 'inativo'
  and (
    t.aplica_a = 'todos'
    or (t.aplica_a = 'motorista'            and c.funcao ilike '%motorista%')
    or (t.aplica_a = 'encarregado'          and c.funcao ilike '%encarregado%')
    or (t.aplica_a = 'motorista_encarregado'
        and (c.funcao ilike '%motorista%' or c.funcao ilike '%encarregado%'))
  );


-- -----------------------------------------------------------------------------
-- 4b. Permissão de leitura
-- -----------------------------------------------------------------------------
-- View nova nasce sem grant; sem isto a tela recebe "permission denied".
-- A view filtra por eh_admin() internamente, então isto não afrouxa nada.
grant select on public.documentos_pendencias to authenticated;
grant select on public.tipos_documento to authenticated;
revoke all on public.documentos_pendencias from anon;
revoke all on public.tipos_documento from anon;


-- -----------------------------------------------------------------------------
-- 5. Conferência
-- -----------------------------------------------------------------------------
select * from (
  select 1 as ord, 'catalogo' as item,
    (select count(*)::text || ' tipos cadastrados' from public.tipos_documento) as situacao
  union all
  select 2, 'colunas de validade',
    case when (select count(*) from information_schema.columns
                where table_schema='public' and table_name='documentos'
                  and column_name in ('tipo_id','emitido_em','valido_ate')) = 3
         then 'ok' else '>>> INCOMPLETO <<<' end
  union all
  select 3, 'view de pendencias',
    case when exists (select 1 from information_schema.views
                       where table_schema='public' and table_name='documentos_pendencias')
         then 'ok' else '>>> FALTANDO <<<' end
  union all
  select 4, 'view so responde a admin',
    case when (select count(*) from pg_views
                where schemaname='public' and viewname='documentos_pendencias'
                  and definition like '%eh_admin%') = 1
         then 'ok' else '>>> A VIEW NAO FILTRA POR ADMIN <<<' end
  union all
  select 5, 'view respeita RLS',
    case when exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                       where n.nspname='public' and c.relname='documentos_pendencias'
                         and 'security_invoker=true' = any(c.reloptions))
         then 'ok — usa as policies de quem consulta'
         else '>>> SEM security_invoker — RISCO DE VAZAMENTO <<<' end
) t order by ord;


-- =============================================================================
-- AJUSTAR OS PRAZOS (faça isto com seu técnico de segurança)
--
--   update public.tipos_documento set meses_validade = 12 where codigo = 'nr35';
--   update public.tipos_documento set vence = false      where codigo = 'nr12';
--   update public.tipos_documento set aplica_a = 'todos'  where codigo = 'direcao_def';
--
-- VER AS PENDÊNCIAS (é o que substitui a conferência na agenda):
--
--   select colaborador, documento, situacao, valido_ate, dias_restantes
--     from public.documentos_pendencias
--    where situacao <> 'ok'
--    order by colaborador, documento;
--
-- QUEM VENCE NOS PRÓXIMOS 30 DIAS:
--
--   select colaborador, documento, valido_ate, dias_restantes
--     from public.documentos_pendencias
--    where situacao = 'vence em breve' order by dias_restantes;
-- =============================================================================
