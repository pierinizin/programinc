-- =============================================================================
-- 25 · DIAGNÓSTICO de desempenho (SÓ LEITURA — não muda nada no banco)
-- -----------------------------------------------------------------------------
-- Rode cada bloco separado no SQL Editor: selecione só as linhas do bloco
-- (do "select" até o ";") e clique em Run. Rodando o arquivo inteiro de uma
-- vez, o editor mostra só o resultado do último. Mande um print de cada um.
-- Nenhum deles mostra dado de pessoa: só números, nomes de tabelas e o texto
-- das consultas.
-- =============================================================================


-- [1] O 24-desempenho-regras.sql já foi rodado?
--     regras_lentas precisa dar 0. Se der mais que 0, rode o 24.
select
  (select count(*) from pg_policies
    where schemaname in ('public','storage')
      and not (schemaname = 'public' and tablename = 'perfis')
      and (coalesce(qual,'') || ' ' || coalesce(with_check,''))
          ~ '(?<!SELECT )(?<!select )(?<!SELECT auth\.)(?<!select auth\.)(?<!SELECT public\.)(?<!select public\.)(public\.|auth\.)?\m(pode_ler|pode_escrever|eh_admin|eh_rh|pode_documentos|uid)\(\)')
    as regras_lentas,
  (select count(*) from pg_indexes where indexname = 'documentos_colaborador_tipo_idx') as indice_do_24;


-- [2] O que mais gasta tempo no banco (desde a última vez que zerou)
--     Mostra as 15 consultas que mais somaram tempo. Se aparecer algo do
--     "realtime" lá no topo, o tempo do banco está indo para o tempo real.
select
  round(total_exec_time::numeric / 1000, 1)                 as segundos_no_total,
  calls                                                      as vezes,
  round((total_exec_time / nullif(calls, 0))::numeric, 1)    as ms_cada,
  rows                                                       as linhas,
  left(regexp_replace(query, '\s+', ' ', 'g'), 140)          as consulta
from extensions.pg_stat_statements
order by total_exec_time desc
limit 15;


-- [3] Tamanho das tabelas e "lixo" acumulado (linhas mortas esperando limpeza)
select
  relname                                   as tabela,
  n_live_tup                                as linhas,
  n_dead_tup                                as linhas_mortas,
  pg_size_pretty(pg_total_relation_size(relid)) as tamanho_total,
  coalesce(last_autovacuum, last_vacuum)    as ultima_limpeza
from pg_stat_user_tables
where schemaname = 'public'
order by pg_total_relation_size(relid) desc
limit 20;


-- [4] Extensões ligadas no banco
--     Se aparecer pg_cron na lista, ele tem tarefas agendadas — me avise que
--     eu mando a consulta para ver quais são. (Sem pg_cron, tudo certo.)
select extname as extensao, extversion as versao
  from pg_extension
 order by 1;


-- [5] Tabelas que o tempo real (realtime) acompanha
select tablename
  from pg_publication_tables
 where pubname = 'supabase_realtime'
 order by 1;


-- [6] Memória e cache: quanto das leituras sai da memória (ideal: acima de 99)
select
  round(100.0 * sum(heap_blks_hit) / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2)
    as percentual_lido_da_memoria
from pg_statio_user_tables;
