-- =============================================================================
-- INCOVIA — A "chavinha": documento que não se aplica a esta pessoa
-- =============================================================================
-- Rode DEPOIS do 07, 09, 10 e 11. Pode rodar mais de uma vez. Não apaga nada.
--
-- POR QUE. "Finalizado" só pode significar "não falta nada" se "não falta
-- nada" for alcançável. Hoje não é: um motorista sem CNH categoria E nunca
-- vai ter esse documento anexado, porque ele nunca vai existir — e sem um
-- jeito de dizer isso ao sistema, a pasta dele fica "Nunca entregue" para
-- sempre, mesmo em dia com tudo que de fato se aplica a ele.
--
-- A chavinha resolve isto com um bit por documento: "este tipo não se aplica
-- a esta pessoa". Fica na própria linha de `documentos` — a mesma linha que
-- guardaria o arquivo, se houvesse um — porque dispensado e anexado são dois
-- estados do mesmo slot (pessoa × tipo), nunca os dois ao mesmo tempo.
-- =============================================================================

alter table public.documentos
  add column if not exists dispensado boolean not null default false;

comment on column public.documentos.dispensado is
  'true = "não se aplica a esta pessoa" (a chavinha). Nunca junto com caminho preenchido: anexar um arquivo desliga a chavinha.';

-- Documento dispensado não é papelada pendente — dá pra registrar sem
-- arquivo nem validade. A constraint de "um por pessoa x tipo" (do 11) já
-- cobre isto: dispensar cria/reusa a mesma linha que o anexo usaria.


-- -----------------------------------------------------------------------------
-- As views aprendem a nova situação
-- -----------------------------------------------------------------------------
-- DERRUBAR ANTES DE RECRIAR, e não 'create or replace' — mesmo motivo do 11:
-- 'dispensado' entra no meio da lista de colunas de documentos_pendencias, e o
-- Postgres recusa alterar o meio de uma view existente (ERRO 42P16). View não
-- guarda dado, só a definição; a ordem importa porque painel_prazos depende
-- desta.
drop view if exists public.painel_prazos;
drop view if exists public.documentos_pendencias;

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
where public.eh_admin()
  and c.status <> 'inativo'
  and t.codigo <> 'atestado'          -- atestado é cobrado pela falta, não pela matriz
  and (
    t.aplica_a = 'todos'
    or (t.aplica_a = 'motorista'            and c.funcao ilike '%motorista%')
    or (t.aplica_a = 'encarregado'          and c.funcao ilike '%encarregado%')
    or (t.aplica_a = 'motorista_encarregado'
        and (c.funcao ilike '%motorista%' or c.funcao ilike '%encarregado%'))
  );

grant select on public.documentos_pendencias to authenticated;
revoke all on public.documentos_pendencias from anon;


-- -----------------------------------------------------------------------------
-- O painel continua ignorando o que não compromete a conformidade
-- -----------------------------------------------------------------------------
-- 'dispensado' entra na mesma exclusão de 'sem o PDF': documentos_pendencias
-- sabe do estado (a pasta da pessoa usa isso), mas o painel de prazos só
-- mostra o que exige uma ação.
create or replace view public.painel_prazos
with (security_invoker = true) as
select
  p.colaborador_id, p.colaborador,
  p.documento                             as assunto,
  p.situacao,
  p.valido_ate                            as data_limite,
  p.dias_restantes,
  case p.situacao
    when 'vencido'              then 1
    when 'faltando'             then 2
    when 'vence em breve'       then 3
    when 'sem data de validade' then 4
    else 9
  end                                     as urgencia,
  'documento'                             as origem
from public.documentos_pendencias p
where p.situacao not in ('ok', 'sem o PDF', 'dispensado')

union all

select
  a.colaborador_id, a.colaborador,
  'Atestado da falta de ' || to_char(a.dia_da_falta, 'DD/MM/YYYY'),
  'atestado nao anexado',
  a.dia_da_falta, -a.dias_atras, 1, 'atestado'
from public.atestados_faltando a

union all

select
  s.colaborador_id, s.colaborador,
  'Falta não lançada (atestado de ' || to_char(s.emitido_em, 'DD/MM') || ')',
  'falta nao lancada',
  s.valido_ate, (s.valido_ate - current_date), 3, 'atestado'
from public.atestados_sem_falta s;

grant select on public.painel_prazos to authenticated;
revoke all on public.painel_prazos from anon;


-- -----------------------------------------------------------------------------
-- Conferência
-- -----------------------------------------------------------------------------
select * from (
  select 1 as ord, 'coluna dispensado existe' as item,
    case when exists (select 1 from information_schema.columns
                where table_schema='public' and table_name='documentos'
                  and column_name='dispensado')
         then 'ok' else '>>> FALTANDO <<<' end
  union all
  select 2, 'painel ignora dispensado',
    case when (select count(*) from pg_views where schemaname='public'
                and viewname='painel_prazos' and definition like '%dispensado%') = 1
         then 'ok — dispensado nao polui o painel' else '>>> VIEW ANTIGA <<<' end
  union all
  select 3, 'painel responde',
    (select count(*)::text || ' pendencias hoje' from public.painel_prazos)
) t order by ord;
