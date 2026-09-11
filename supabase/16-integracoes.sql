-- =============================================================================
-- INCOVIA — Integrações
-- =============================================================================
-- Pode rodar mais de uma vez. Não apaga nada.
--
-- O QUE É UMA INTEGRAÇÃO. É o registro de que um colaborador passou pela
-- integração de segurança daquele contrato — com data de quando foi feita e
-- até quando vale (igual a um exame ou treinamento periódico: vence e precisa
-- ser refeita).
--
-- O PROBLEMA DO "MESMO LUGAR, CONTRATANTES DIFERENTES". Às vezes um mesmo
-- canteiro tem contrato com mais de um contratante (ex.: "VIAS DO CAFÉ" tem
-- contrato na EPR e na MOTIVA) e a integração de segurança feita lá vale para
-- os dois — a pessoa não faz a integração duas vezes só porque o papel do
-- contrato é de empresas diferentes. 'grupos_integracao' existe para isso: é
-- um rótulo que junta dois ou mais contratos DENTRO da tela de Integrações,
-- sem mexer em nada fora dela — a Programação, os Relatórios e o cadastro de
-- Contratantes continuam vendo cada contrato separado, como sempre.
--
-- Integrar alguém num grupo grava UMA linha (ligada ao grupo, não a um
-- contrato específico) e vale automaticamente para todos os contratos que
-- estiverem dentro do grupo naquele momento.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. O grupo (o rótulo "CONTRATO: VIAS DO CAFÉ")
-- -----------------------------------------------------------------------------
create table if not exists public.grupos_integracao (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- -----------------------------------------------------------------------------
-- 2. Quais contratos estão dentro do grupo
-- -----------------------------------------------------------------------------
-- Um contrato só pode estar em UM grupo por vez — é por isso que existe
-- "desfazer" em vez de "sair do grupo": para um contrato trocar de grupo, ele
-- sai de um e entra no outro, nunca fica nos dois ao mesmo tempo.
create table if not exists public.grupos_integracao_contratos (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references public.grupos_integracao(id) on delete cascade,
  contrato_id uuid not null references public.contratos(id) on delete cascade,
  created_at timestamptz not null default now(),

  unique (contrato_id)
);

create index if not exists grupos_integracao_contratos_grupo_idx
  on public.grupos_integracao_contratos (grupo_id);


-- -----------------------------------------------------------------------------
-- 3. A integração em si
-- -----------------------------------------------------------------------------
-- Liga a UM contrato OU a UM grupo — nunca aos dois, nunca a nenhum (o check
-- abaixo garante isso). Uma pessoa tem no máximo UMA linha por contrato/grupo:
-- reintegrar depois de vencido é editar a validade desta mesma linha, não
-- criar outra — a tela de Integrações mostra o estado atual, não o histórico.
create table if not exists public.integracoes (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  contrato_id uuid references public.contratos(id) on delete cascade,
  grupo_id uuid references public.grupos_integracao(id) on delete cascade,

  data_integracao date not null default current_date,
  validade date not null,
  observacao text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (num_nonnulls(contrato_id, grupo_id) = 1),
  check (validade >= data_integracao)
);

-- Uma linha por pessoa por contrato solto, e uma linha por pessoa por grupo.
-- Índice SEM filtro de propósito (não "where ... is not null"): em Postgres,
-- NULL nunca é igual a NULL, então duas linhas com contrato_id nulo (as de
-- grupo) já não colidem sozinhas — o índice comum faz o mesmo efeito do
-- parcial E ainda funciona como alvo de "on conflict" no upsert que a tela usa
-- para montar/desfazer grupo sem duplicar gente.
create unique index if not exists integracoes_colaborador_contrato_idx
  on public.integracoes (colaborador_id, contrato_id);
create unique index if not exists integracoes_colaborador_grupo_idx
  on public.integracoes (colaborador_id, grupo_id);

create index if not exists integracoes_colaborador_idx on public.integracoes (colaborador_id);
create index if not exists integracoes_contrato_idx on public.integracoes (contrato_id);
create index if not exists integracoes_grupo_idx on public.integracoes (grupo_id);
create index if not exists integracoes_validade_idx on public.integracoes (validade);

do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    drop trigger if exists grupos_integracao_set_updated_at on public.grupos_integracao;
    create trigger grupos_integracao_set_updated_at before update on public.grupos_integracao
      for each row execute function public.set_updated_at();
    drop trigger if exists integracoes_set_updated_at on public.integracoes;
    create trigger integracoes_set_updated_at before update on public.integracoes
      for each row execute function public.set_updated_at();
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 4. RLS
-- -----------------------------------------------------------------------------
alter table public.grupos_integracao            enable row level security;
alter table public.grupos_integracao            force row level security;
alter table public.grupos_integracao_contratos  enable row level security;
alter table public.grupos_integracao_contratos  force row level security;
alter table public.integracoes                  enable row level security;
alter table public.integracoes                  force row level security;

drop policy if exists grupos_integracao_select on public.grupos_integracao;
drop policy if exists grupos_integracao_escrita on public.grupos_integracao;
drop policy if exists grupos_integracao_contratos_select on public.grupos_integracao_contratos;
drop policy if exists grupos_integracao_contratos_escrita on public.grupos_integracao_contratos;
drop policy if exists integracoes_select on public.integracoes;
drop policy if exists integracoes_insert on public.integracoes;
drop policy if exists integracoes_update on public.integracoes;
drop policy if exists integracoes_delete on public.integracoes;

-- grupos_integracao / grupos_integracao_contratos são cadastro, igual
-- concessionarias/contratos: ler é liberado a quem já lê o resto, montar ou
-- desfazer um grupo é só admin — um agrupamento errado junta a lista de
-- integrados de contratos que não deveriam estar juntos.
create policy grupos_integracao_select on public.grupos_integracao
  for select to authenticated using (public.pode_ler());
create policy grupos_integracao_escrita on public.grupos_integracao
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

create policy grupos_integracao_contratos_select on public.grupos_integracao_contratos
  for select to authenticated using (public.pode_ler());
create policy grupos_integracao_contratos_escrita on public.grupos_integracao_contratos
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- integracoes é DIA A DIA, igual colaboradores/veiculos/programacoes — e por
-- isso é a única exceção da casa à regra "só admin apaga". Nas outras tabelas
-- operacionais, apagar é raro e sério (perde a ficha da pessoa, do veículo,
-- da obra), então fica travado para admin e o dia a dia usa UPDATE. Aqui uma
-- integração é mais parecida com marcar/desmarcar um nome na equipe do dia:
-- arrastou errado, arrasta de volta para fora — não é uma perda de registro
-- que mereça travar o editor. Por isso editor também apaga aqui.
create policy integracoes_select on public.integracoes
  for select to authenticated using (public.pode_ler());
create policy integracoes_insert on public.integracoes
  for insert to authenticated with check (public.pode_escrever());
create policy integracoes_update on public.integracoes
  for update to authenticated using (public.pode_escrever()) with check (public.pode_escrever());
create policy integracoes_delete on public.integracoes
  for delete to authenticated using (public.pode_escrever());

grant select, insert, update, delete on public.integracoes to authenticated;
grant select on public.grupos_integracao, public.grupos_integracao_contratos to authenticated;
revoke all on public.grupos_integracao, public.grupos_integracao_contratos, public.integracoes from anon;


-- -----------------------------------------------------------------------------
-- 5. Realtime
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['grupos_integracao', 'grupos_integracao_contratos', 'integracoes']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then
      null;  -- já estava na publicação
    end;
  end loop;
end
$$;


-- -----------------------------------------------------------------------------
-- 6. Conferência
-- -----------------------------------------------------------------------------
select * from (
  select 1 as ord, 'tabelas' as item,
    case when (select count(*) from information_schema.tables
                where table_schema='public'
                  and table_name in ('grupos_integracao','grupos_integracao_contratos','integracoes')) = 3
         then 'ok' else '>>> FALTANDO <<<' end as situacao
  union all
  select 2, 'grupos com escrita so por admin',
    case when (select count(*) from pg_policies
                where schemaname='public'
                  and tablename in ('grupos_integracao','grupos_integracao_contratos')
                  and cmd='ALL' and qual like '%eh_admin%') = 2
         then 'ok' else '>>> POLICY DE ESCRITA ABERTA DEMAIS <<<' end
  union all
  select 3, 'integracoes com delete de editor',
    case when exists (select 1 from pg_policies
                where schemaname='public' and tablename='integracoes'
                  and cmd='DELETE' and qual like '%pode_escrever%')
         then 'ok (proposital — ver comentario no arquivo)' else '>>> revisar <<<' end
  union all
  select 4, 'rls ligada e forcada',
    case when (select count(*) from pg_tables
                where schemaname='public'
                  and tablename in ('grupos_integracao','grupos_integracao_contratos','integracoes')
                  and rowsecurity) = 3
         then 'ok' else '>>> FALTANDO <<<' end
) t order by ord;
-- =============================================================================
