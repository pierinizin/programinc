-- =============================================================================
-- 27 · Carga única mais leve (json em vez de jsonb)
-- -----------------------------------------------------------------------------
-- O diagnóstico mostrou a carga_inicial levando ~740 ms no servidor. Ela
-- montava o pacote em "jsonb", o formato que o Postgres usa para guardar e
-- pesquisar — e que custa converter. Para só ENTREGAR ao app, o "json" simples
-- basta e é mais barato. No banco de teste: ~68 ms → ~40 ms (cerca de 40% a
-- menos), com o conteúdo idêntico (conferido campo a campo).
--
-- Mesmo resultado, mesmas permissões (security invoker). O app não muda.
-- Precisa do 26 rodado antes. Pode rodar mais de uma vez.
-- =============================================================================

-- O tipo de retorno mudou (jsonb -> json): o Postgres exige recriar a função.
-- Tudo vai numa transação só no SQL Editor, então o app não fica sem ela.
drop function if exists public.carga_inicial();

create function public.carga_inicial()
returns json
language sql
stable
security invoker          -- as regras de cada tabela valem como sempre
set search_path = public
as $$
  select json_build_object(
    'colaboradores',                coalesce((select json_agg(t order by t.id) from public.colaboradores t), '[]'::json),
    'veiculos',                     coalesce((select json_agg(t order by t.id) from public.veiculos t), '[]'::json),
    'programacoes',                 coalesce((select json_agg(t order by t.id) from public.programacoes t), '[]'::json),
    'faltas',                       coalesce((select json_agg(t order by t.id) from public.faltas t), '[]'::json),
    'ferias',                       coalesce((select json_agg(t order by t.id) from public.ferias t), '[]'::json),
    'colaboradores_status_historico', coalesce((select json_agg(t order by t.id) from public.colaboradores_status_historico t), '[]'::json),
    'patio',                        coalesce((select json_agg(t order by t.id) from public.patio t), '[]'::json),
    'perfis',                       coalesce((select json_agg(t order by t.id) from public.perfis t), '[]'::json),
    'concessionarias',              coalesce((select json_agg(t order by t.id) from public.concessionarias t), '[]'::json),
    'contratos',                    coalesce((select json_agg(t order by t.id) from public.contratos t), '[]'::json),
    'grupos_integracao',            coalesce((select json_agg(t order by t.id) from public.grupos_integracao t), '[]'::json),
    'grupos_integracao_contratos',  coalesce((select json_agg(t order by t.id) from public.grupos_integracao_contratos t), '[]'::json),
    'integracoes',                  coalesce((select json_agg(t order by t.id) from public.integracoes t), '[]'::json),
    -- Documentos só para quem pode (admin e RH). Para os outros nem calcula.
    'documentos', case when (select public.pode_documentos())
      then coalesce((select json_agg(t order by t.id) from public.documentos t), '[]'::json) end,
    'tipos_documento', case when (select public.pode_documentos())
      then coalesce((select json_agg(t) from public.tipos_documento t), '[]'::json) end,
    'painel_prazos', case when (select public.pode_documentos())
      then coalesce((select json_agg(t) from public.painel_prazos t), '[]'::json) end,
    -- Quais tabelas o tempo real acompanha: o app deixa de recarregar estas
    -- depois de cada gravação, porque o aviso do banco já traz a mudança.
    'tempo_real', coalesce((select json_agg(tablename::text) from pg_publication_tables
                              where pubname = 'supabase_realtime' and schemaname = 'public'), '[]'::json)
  );
$$;

revoke execute on function public.carga_inicial() from public, anon;
grant execute on function public.carga_inicial() to authenticated;

notify pgrst, 'reload schema';

select 'carga_inicial devolve ' || pg_get_function_result('public.carga_inicial()'::regprocedure) as conferencia;
