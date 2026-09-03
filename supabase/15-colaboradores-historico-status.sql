-- =============================================================================
-- INCOVIA — Histórico de status do colaborador (ativo/inativo por período)
-- =============================================================================
-- Rode DEPOIS do schema.sql e security.sql. Pode rodar mais de uma vez.
--
-- POR QUE. 'colaboradores.status' sempre foi um interruptor só: ativo ou
-- inativo, sem nenhuma data junto. Toda a conta de "quem pode ser escalado"
-- (a fita de contadores da Programação e a lista de livres do quadro, as
-- duas em src/lib/dia.js) olhava só esse interruptor — nunca a data do dia
-- sendo visto. Isso gerava dois problemas espelhados:
--
--   1. Inativar alguém HOJE também apagava ele das programações de dias
--      PASSADOS, quando ele realmente estava ativo — o histórico mudava
--      sozinho, sem ninguém ter mexido nele.
--   2. Um colaborador cadastrado hoje aparecia como opção de escala em dias
--      ANTERIORES à própria contratação, se alguém voltasse o calendário.
--
-- A correção pede memória: não "ele está ativo?", mas "ele estava ativo NESTE
-- dia?". Esta tabela guarda um período por trecho contínuo de status — um
-- histórico completo, não só a última troca — e um gatilho o mantém sozinho,
-- então nenhum dos três lugares que hoje mudam o status de um colaborador
-- (o menu rápido, a inativação em massa, o formulário de editar) precisa de
-- código novo para isto continuar certo.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. A tabela — um período por trecho contínuo de status
-- -----------------------------------------------------------------------------
-- fim = null é o período em aberto: o status que vale agora. Só pode haver UM
-- período aberto por colaborador (índice único parcial logo abaixo) — é o que
-- garante que a história nunca vira um emaranhado de intervalos sobrepostos.
create table if not exists public.colaboradores_status_historico (
  id uuid primary key default gen_random_uuid(),
  "colaboradorId" uuid not null references public.colaboradores(id) on delete cascade,
  status text not null check (status in ('ativo', 'inativo')),
  inicio date not null,
  fim date,
  created_at timestamptz not null default now(),
  check (fim is null or fim >= inicio)
);

create index if not exists colaboradores_status_historico_colaborador_idx
  on public.colaboradores_status_historico ("colaboradorId", inicio);

-- Nunca dois períodos abertos para a mesma pessoa: se isso acontecesse, "está
-- disponível hoje" deixaria de ter uma resposta única.
create unique index if not exists colaboradores_status_historico_aberto_idx
  on public.colaboradores_status_historico ("colaboradorId") where fim is null;

comment on table public.colaboradores_status_historico is
  'Um período por trecho contínuo de status do colaborador. fim = null é o período aberto (o status atual). Mantida sozinha pelo gatilho colaboradores_marca_historico_status — nunca escrita direto pelo app.';


-- -----------------------------------------------------------------------------
-- 2. Preenche quem já existe, antes do gatilho existir
-- -----------------------------------------------------------------------------
-- Quem já está ATIVO: um período aberto desde o cadastro (created_at) — é a
-- melhor informação que temos, e coincide com a realidade na esmagadora
-- maioria dos casos (poucas pessoas passam por altos e baixos de status).
insert into public.colaboradores_status_historico ("colaboradorId", status, inicio, fim)
select c.id, 'ativo', c.created_at::date, null
  from public.colaboradores c
 where c.status = 'ativo'
   and not exists (
     select 1 from public.colaboradores_status_historico h
      where h."colaboradorId" = c.id and h.status = 'ativo'
   );

-- Quem já está INATIVO: não existe como saber a data real em que cada um foi
-- desligado antes deste arquivo existir — então não fingimos saber. O que dá
-- para garantir é que dias PASSADOS (quando essa pessoa provavelmente
-- trabalhava) parem de ser tratados como "indisponível" a partir de agora:
-- um período ativo fictício do cadastro até ontem, e inativo de hoje em
-- diante (o de baixo). Quem quiser a data real de desligamento de alguém
-- específico pode corrigir esta linha à mão depois — é só um período comum.
insert into public.colaboradores_status_historico ("colaboradorId", status, inicio, fim)
select c.id, 'ativo', c.created_at::date, current_date - 1
  from public.colaboradores c
 where c.status = 'inativo'
   and c.created_at::date <= current_date - 1
   and not exists (
     select 1 from public.colaboradores_status_historico h where h."colaboradorId" = c.id
   );

insert into public.colaboradores_status_historico ("colaboradorId", status, inicio, fim)
select c.id, 'inativo', current_date, null
  from public.colaboradores c
 where c.status = 'inativo'
   and not exists (
     select 1 from public.colaboradores_status_historico h
      where h."colaboradorId" = c.id and h.status = 'inativo'
   );


-- -----------------------------------------------------------------------------
-- 3. O gatilho: toda troca de status abre e fecha período sozinha
-- -----------------------------------------------------------------------------
create or replace function public.registrar_historico_status_colaborador()
returns trigger
language plpgsql as $$
declare
  hoje date := current_date;
begin
  if tg_op = 'INSERT' then
    insert into public.colaboradores_status_historico ("colaboradorId", status, inicio, fim)
    values (new.id, new.status, coalesce(new.created_at::date, hoje), null);
    return new;
  end if;

  -- Um update que só toca telefone ou foto não pode fechar nem abrir período
  -- nenhum — só reage quando o status de fato muda.
  if new.status is distinct from old.status then
    -- Duas trocas de status no mesmo dia (inativou e reativou de novo na
    -- hora, por exemplo): o período aberto atual também começou hoje, e
    -- fechá-lo com fim = hoje - 1 seria ANTES do próprio início — o check
    -- da tabela rejeitaria a linha na hora. Ele nunca existiu como período
    -- à parte: apaga em vez de fechar. Isto tem que vir ANTES do update de
    -- fechamento abaixo, nunca depois — não dá para consertar um check
    -- violado com uma limpeza posterior, o Postgres já teria recusado a
    -- linha no update.
    delete from public.colaboradores_status_historico
     where "colaboradorId" = new.id and fim is null and inicio = hoje;

    -- O que sobrou (se sobrou) começou antes de hoje — fechar com
    -- fim = hoje - 1 é sempre válido agora.
    update public.colaboradores_status_historico
       set fim = hoje - 1
     where "colaboradorId" = new.id and fim is null;

    insert into public.colaboradores_status_historico ("colaboradorId", status, inicio, fim)
    values (new.id, new.status, hoje, null);
  end if;

  return new;
end;
$$;

drop trigger if exists colaboradores_marca_historico_status on public.colaboradores;
create trigger colaboradores_marca_historico_status
  after insert or update on public.colaboradores
  for each row execute function public.registrar_historico_status_colaborador();


-- -----------------------------------------------------------------------------
-- 4. RLS — mesma régua de quem já pode mudar o status do colaborador
-- -----------------------------------------------------------------------------
-- Só o gatilho grava aqui, nunca o app direto — mas ele roda como o mesmo
-- usuário que mexeu em 'colaboradores' (não é security definer), então a
-- policy de escrita segue quem já pode escrever colaborador (editor/admin),
-- não a de exclusão (só admin) — senão um editor comum inativando alguém
-- duas vezes no mesmo dia esbarraria em RLS na hora de o gatilho limpar o
-- intervalo invertido.
alter table public.colaboradores_status_historico enable row level security;
alter table public.colaboradores_status_historico force row level security;

drop policy if exists "colaboradores_status_historico_select" on public.colaboradores_status_historico;
drop policy if exists "colaboradores_status_historico_insert" on public.colaboradores_status_historico;
drop policy if exists "colaboradores_status_historico_update" on public.colaboradores_status_historico;
drop policy if exists "colaboradores_status_historico_delete" on public.colaboradores_status_historico;

create policy "colaboradores_status_historico_select" on public.colaboradores_status_historico
  for select to authenticated using (public.pode_ler());

create policy "colaboradores_status_historico_insert" on public.colaboradores_status_historico
  for insert to authenticated with check (public.pode_escrever());

create policy "colaboradores_status_historico_update" on public.colaboradores_status_historico
  for update to authenticated using (public.pode_escrever()) with check (public.pode_escrever());

create policy "colaboradores_status_historico_delete" on public.colaboradores_status_historico
  for delete to authenticated using (public.pode_escrever());

revoke all on public.colaboradores_status_historico from anon;


-- -----------------------------------------------------------------------------
-- 5. Conferência
-- -----------------------------------------------------------------------------
select * from (
  select 1 as ord, 'tabela colaboradores_status_historico' as item,
    case when exists (select 1 from information_schema.tables
                       where table_schema='public' and table_name='colaboradores_status_historico')
         then 'ok' else '>>> FALTANDO <<<' end as situacao
  union all
  select 2, 'indice de periodo aberto unico',
    case when exists (select 1 from pg_indexes where schemaname='public'
                       and indexname='colaboradores_status_historico_aberto_idx')
         then 'ok' else '>>> FALTANDO <<<' end
  union all
  select 3, 'gatilho de historico',
    case when exists (select 1 from pg_trigger where tgname='colaboradores_marca_historico_status')
         then 'ok' else '>>> FALTANDO <<<' end
  union all
  select 4, 'policies (4 esperadas)',
    (select count(*)::text || ' de 4' || case when count(*)=4 then '  ok' else '  >>> INCOMPLETO <<<' end
       from pg_policies where schemaname='public' and tablename='colaboradores_status_historico')
  union all
  select 5, 'colaboradores sem nenhum periodo (esperado: 0)',
    (select count(*)::text from public.colaboradores c
      where not exists (select 1 from public.colaboradores_status_historico h where h."colaboradorId" = c.id))
  union all
  select 6, 'colaboradores com mais de um periodo aberto (esperado: 0)',
    (select count(*)::text from (
       select "colaboradorId" from public.colaboradores_status_historico
        where fim is null group by "colaboradorId" having count(*) > 1
     ) x)
  union all
  select 7, 'total de periodos no historico',
    (select count(*)::text from public.colaboradores_status_historico)
) t order by ord;


-- =============================================================================
-- TESTAR NA MÃO, depois de rodar:
--
--   -- inativa um colaborador de teste e confere se o período fechou e abriu
--   update public.colaboradores set status = 'inativo' where id = '<uuid>';
--   select status, inicio, fim from public.colaboradores_status_historico
--    where "colaboradorId" = '<uuid>' order by inicio;
--   -- espera: o período 'ativo' antigo agora com fim = ontem, e um 'inativo'
--   -- novo com inicio = hoje e fim nulo.
--
--   -- reativa e confere de novo
--   update public.colaboradores set status = 'ativo' where id = '<uuid>';
-- =============================================================================
