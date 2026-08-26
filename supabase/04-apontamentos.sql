-- =============================================================================
-- INCOVIA — Marcação de apontamentos do Kartado
-- =============================================================================
-- Cole no SQL Editor do Supabase e clique em Run. Pode rodar mais de uma vez.
-- Não apaga nada e não altera dado existente.
--
-- Você escolheu guardar SÓ A MARCAÇÃO, não o boletim inteiro. Então são quatro
-- colunas em 'programacoes' — nenhuma tabela nova, nenhuma policy nova: as
-- policies de UPDATE que o security.sql já criou valem para estas colunas.
--
--   apontamentoSeriais  quais apontamentos do Kartado caíram nesta equipe.
--                       É array porque a mesma equipe pode gerar mais de um
--                       apontamento no mesmo dia.
--   apontamentoLancado  atalho para filtrar e para o selo no quadro.
--   apontamentoEm       quando foi conciliado.
--   apontamentoPor      quem conciliou. Lançamento tem peso de medição —
--                       saber quem confirmou importa numa divergência.
--
-- camelCase entre aspas para casar com o resto do schema e com o que o app
-- envia. Mexer nisso quebra a tela.
-- =============================================================================

alter table public.programacoes
  add column if not exists "apontamentoSeriais" text[] not null default '{}',
  add column if not exists "apontamentoLancado" boolean not null default false,
  add column if not exists "apontamentoEm" timestamptz,
  add column if not exists "apontamentoPor" uuid references public.perfis(id) on delete set null;

-- Um serial não pode estar em duas equipes ao mesmo tempo — seria produção
-- contada em dobro na medição. O índice não impede, mas encontra na hora.
create index if not exists programacoes_apontamentos_idx
  on public.programacoes using gin ("apontamentoSeriais");


-- -----------------------------------------------------------------------------
-- Conferência
-- -----------------------------------------------------------------------------
select 'colunas' as item,
       count(*)::text || ' de 4'
       || case when count(*) = 4 then '  ok' else '  >>> INCOMPLETO <<<' end as situacao
  from information_schema.columns
 where table_schema = 'public' and table_name = 'programacoes'
   and column_name in ('apontamentoSeriais', 'apontamentoLancado',
                       'apontamentoEm', 'apontamentoPor')
union all
select 'indice',
       case when exists (select 1 from pg_indexes
                          where schemaname = 'public'
                            and indexname = 'programacoes_apontamentos_idx')
            then 'ok' else '>>> FALTANDO <<<' end
union all
select 'ja lancados',
       count(*)::text || ' programação(ões) com apontamento'
  from public.programacoes where "apontamentoLancado";


-- =============================================================================
-- Para achar um serial lançado em duas equipes (não deveria acontecer):
--
--   select unnest("apontamentoSeriais") as serial, count(*), array_agg(id)
--     from public.programacoes
--    where "apontamentoLancado"
--    group by 1 having count(*) > 1;
-- =============================================================================
