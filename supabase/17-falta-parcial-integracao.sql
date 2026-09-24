-- =============================================================================
-- INCOVIA — Falta parcial (meio período) + "Não realizado · Integração"
-- =============================================================================
-- Pode rodar mais de uma vez. Não apaga nada.
--
-- 1) FALTA PARCIAL. Uma falta continua sendo uma linha em public.faltas (uma
--    por pessoa por dia, como sempre), mas agora pode estar LIGADA A UMA
--    EQUIPE do dia: a pessoa foi pra obra e trabalhou só um pedaço.
--
--      programacao_id  — a equipe em que ela estava (se a equipe for apagada,
--                        a falta parcial vai junto: sem equipe, não existe
--                        "parte do dia na obra")
--      trabalhou_de    — hora em que começou a trabalhar
--      trabalhou_ate   — hora em que parou
--
--    O intervalo que FALTOU não é gravado: é calculado na tela comparando
--    esse horário com a jornada da equipe (Início obra → Fim obra, descontando
--    o almoço). Assim, se alguém corrigir o horário da programação depois, o
--    cálculo acompanha sozinho, em vez de ficar uma conta velha gravada.
--
--    Falta comum (dia inteiro) continua exatamente igual: essas três colunas
--    ficam vazias.
--
-- 2) "NÃO REALIZADO · INTEGRAÇÃO". Novo motivo para equipe que não executou
--    o serviço porque o dia foi de integração de segurança. O banco tinha uma
--    lista fechada de motivos aceitos (check constraint) — ela é trocada aqui
--    pela mesma lista + 'INTEGRAÇÃO'.
--
-- 3) "FOLGA" como motivo de falta NÃO precisa de nada no banco: faltas.motivo
--    é texto livre, a lista de motivos mora no app (src/lib/motivos.js).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Colunas da falta parcial
-- -----------------------------------------------------------------------------
alter table public.faltas
  add column if not exists programacao_id uuid
    references public.programacoes(id) on delete cascade;

alter table public.faltas add column if not exists trabalhou_de  time;
alter table public.faltas add column if not exists trabalhou_ate time;

-- Ou é falta de dia inteiro (as três vazias), ou é parcial com as três
-- preenchidas e um intervalo que faz sentido. Nada no meio do caminho.
alter table public.faltas drop constraint if exists faltas_parcial_coerente;
alter table public.faltas add constraint faltas_parcial_coerente check (
  (programacao_id is null and trabalhou_de is null and trabalhou_ate is null)
  or
  (programacao_id is not null and trabalhou_de is not null and trabalhou_ate is not null
   and trabalhou_de < trabalhou_ate)
);

create index if not exists faltas_programacao_idx on public.faltas (programacao_id);


-- -----------------------------------------------------------------------------
-- 2. Quem pode APAGAR uma falta parcial
-- -----------------------------------------------------------------------------
-- A regra geral (security.sql) é: só admin apaga falta. Continua valendo para
-- falta de dia inteiro. A falta parcial é diferente: ela nasce e morre DENTRO
-- da equipe — é desfeita ao marcar "trabalhou o dia todo" ou ao tirar a pessoa
-- da equipe, o mesmo gesto que o editor já faz ao montar o dia. Se o editor
-- pudesse lançar e não pudesse desfazer, a pessoa ficaria presa com o anel
-- vermelho na equipe errada.
--
-- Postgres junta policies do mesmo comando com OU: esta aqui só AMPLIA o
-- apagar para editor, e só em linha que é parcial. A de admin continua lá.
drop policy if exists faltas_delete_parcial on public.faltas;
create policy faltas_delete_parcial on public.faltas
  for delete to authenticated
  using (public.pode_escrever() and programacao_id is not null);


-- -----------------------------------------------------------------------------
-- 3. Novo motivo de "Não realizado": INTEGRAÇÃO
-- -----------------------------------------------------------------------------
-- O check foi criado sem nome no schema.sql, então o Postgres deu um nome
-- automático. Em vez de adivinhar, procura qualquer check da tabela que
-- mencione a coluna e derruba — depois recria com nome fixo.
do $$
declare
  c record;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'public.programacoes'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%motivoNaoExecucao%'
  loop
    execute format('alter table public.programacoes drop constraint %I', c.conname);
  end loop;
end
$$;

alter table public.programacoes add constraint programacoes_motivo_nao_execucao_check check (
  "motivoNaoExecucao" is null or "motivoNaoExecucao" = ''
  or "motivoNaoExecucao" in ('CHUVA', 'MANUTENÇÃO', 'VIAGEM', 'INTEGRAÇÃO', 'OUTROS')
);


-- -----------------------------------------------------------------------------
-- Conferência (opcional — rode depois pra ver se ficou certo)
-- -----------------------------------------------------------------------------
--   select column_name, data_type from information_schema.columns
--    where table_name = 'faltas' and column_name in
--          ('programacao_id', 'trabalhou_de', 'trabalhou_ate');
--   -- espera 3 linhas
--
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.programacoes'::regclass and contype = 'c';
--   -- a de motivoNaoExecucao deve listar INTEGRAÇÃO
