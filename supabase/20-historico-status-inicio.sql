-- =============================================================================
-- 20 · Histórico de status: começar no PRIMEIRO DIA DE TRABALHO, não em 25/08
-- -----------------------------------------------------------------------------
-- O histórico de ativo/inativo (15-colaboradores-historico-status.sql) só foi
-- criado em ago/2026. Para quem já trabalhava, o primeiro período "ativo"
-- nasceu na data em que a coluna created_at foi criada (25/08/2026), e não
-- na contratação. Resultado: em qualquer dia ANTES disso, quem ficou sem
-- equipe sumia da lista de livres ("Todo mundo já está escalado"). Foi o
-- caso do Emerson no dia 11/08.
--
-- O que este script faz, para cada colaborador:
--   • acha o primeiro dia em que ele aparece trabalhando: numa equipe
--     (encarregado ou membro), numa falta ou no pátio;
--   • se esse dia é ANTES do começo do histórico dele:
--       - se o primeiro período é "ativo", puxa o início dele pra esse dia;
--       - se o primeiro período é "inativo", cria um período "ativo" do
--         primeiro dia de trabalho até a véspera do inativo.
--
-- Não mexe em programação, falta nem pátio: só no histórico de status.
-- Quem foi contratado depois (primeiro trabalho depois do início do
-- histórico) não é tocado. Pode rodar mais de uma vez: na segunda não muda
-- nada.
--
-- Rode inteiro no SQL Editor do Supabase. A tabela do fim mostra quem mudou.
-- =============================================================================

drop table if exists _ajuste_historico;
create temp table _ajuste_historico as
with atividade as (
  select "encarregadoId" as colaborador_id, "data" from public.programacoes
   where "encarregadoId" is not null
  union all
  select unnest("membroIds"), "data" from public.programacoes
  union all
  select "colaboradorId", "data" from public.faltas
  union all
  select "colaboradorId", "data" from public.patio
),
primeira as (
  select colaborador_id, min("data") as primeiro_dia
    from atividade
   group by colaborador_id
),
primeiro_periodo as (
  select distinct on (h."colaboradorId")
         h.id, h."colaboradorId" as colaborador_id, h.status, h.inicio
    from public.colaboradores_status_historico h
   order by h."colaboradorId", h.inicio, h.created_at
)
select pp.id as periodo_id, pp.colaborador_id, pp.status, pp.inicio as inicio_antes,
       p.primeiro_dia
  from primeiro_periodo pp
  join primeira p using (colaborador_id)
  join public.colaboradores c on c.id = pp.colaborador_id
 where p.primeiro_dia < pp.inicio;

-- Primeiro período "ativo": só puxa o início pra trás.
update public.colaboradores_status_historico h
   set inicio = a.primeiro_dia
  from _ajuste_historico a
 where h.id = a.periodo_id
   and a.status = 'ativo';

-- Primeiro período "inativo": antes dele a pessoa trabalhava — cria o
-- período "ativo" que faltava, terminando na véspera.
insert into public.colaboradores_status_historico ("colaboradorId", status, inicio, fim)
select a.colaborador_id, 'ativo', a.primeiro_dia, a.inicio_antes - 1
  from _ajuste_historico a
 where a.status = 'inativo';

-- Quem mudou (vazio = nada pra ajustar).
select c.nome,
       to_char(a.inicio_antes, 'DD/MM/YYYY') as historico_comecava,
       to_char(a.primeiro_dia, 'DD/MM/YYYY') as agora_comeca,
       case a.status when 'ativo' then 'início puxado' else 'período ativo criado' end as o_que_mudou
  from _ajuste_historico a
  join public.colaboradores c on c.id = a.colaborador_id
 order by c.nome;
