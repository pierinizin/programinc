-- =============================================================================
-- 26 · Abrir o app com UM pedido só
-- -----------------------------------------------------------------------------
-- O app abria fazendo 18 pedidos (13 tabelas + documentos), e cada pedido ao
-- Supabase custa de 1 a 3 s neste servidor. Esta função devolve tudo de uma
-- vez, num pacote só.
--
--   carga_inicial()  — devolve as mesmas tabelas que o app buscava uma a uma,
--                      e os documentos para quem pode vê-los (admin e RH).
--
-- As PERMISSÕES NÃO MUDAM: a função roda com o usuário que chamou (security
-- invoker), então cada tabela passa pelas mesmas regras de sempre — cada
-- pessoa recebe exatamente o que já recebia.
--
-- Também coloca "férias" e o "histórico de ativo/inativo" no tempo real: o app
-- já escutava as duas, mas o banco nunca avisava mudança nelas.
--
-- Precisa do 22 (cargo RH) rodado antes. Pode rodar mais de uma vez.
-- =============================================================================


-- 1. Tempo real também para férias e histórico de status -----------------------
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['ferias', 'colaboradores_status_historico']
    loop
      if not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end
$$;


-- 2. A carga inteira num pedido -------------------------------------------------
create or replace function public.carga_inicial()
returns jsonb
language sql
stable
security invoker          -- as regras de cada tabela valem como sempre
set search_path = public
as $$
  select jsonb_build_object(
    'colaboradores',                coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.colaboradores t), '[]'::jsonb),
    'veiculos',                     coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.veiculos t), '[]'::jsonb),
    'programacoes',                 coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.programacoes t), '[]'::jsonb),
    'faltas',                       coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.faltas t), '[]'::jsonb),
    'ferias',                       coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.ferias t), '[]'::jsonb),
    'colaboradores_status_historico', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.colaboradores_status_historico t), '[]'::jsonb),
    'patio',                        coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.patio t), '[]'::jsonb),
    'perfis',                       coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.perfis t), '[]'::jsonb),
    'concessionarias',              coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.concessionarias t), '[]'::jsonb),
    'contratos',                    coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.contratos t), '[]'::jsonb),
    'grupos_integracao',            coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.grupos_integracao t), '[]'::jsonb),
    'grupos_integracao_contratos',  coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.grupos_integracao_contratos t), '[]'::jsonb),
    'integracoes',                  coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.integracoes t), '[]'::jsonb),
    -- Documentos só para quem pode (admin e RH). Para os outros nem calcula.
    'documentos', case when (select public.pode_documentos())
      then coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.documentos t), '[]'::jsonb) end,
    'tipos_documento', case when (select public.pode_documentos())
      then coalesce((select jsonb_agg(to_jsonb(t)) from public.tipos_documento t), '[]'::jsonb) end,
    'painel_prazos', case when (select public.pode_documentos())
      then coalesce((select jsonb_agg(to_jsonb(t)) from public.painel_prazos t), '[]'::jsonb) end,
    -- Quais tabelas o tempo real acompanha: o app deixa de recarregar estas
    -- depois de cada gravação, porque o aviso do banco já traz a mudança.
    'tempo_real', coalesce((select jsonb_agg(tablename::text) from pg_publication_tables
                              where pubname = 'supabase_realtime' and schemaname = 'public'), '[]'::jsonb)
  );
$$;

revoke execute on function public.carga_inicial() from public, anon;
grant execute on function public.carga_inicial() to authenticated;

notify pgrst, 'reload schema';


-- 3. Conferência ---------------------------------------------------------------
select * from (
  select 1 as ord, 'função carga_inicial' as item,
    case when exists (select 1 from pg_proc where proname = 'carga_inicial') then 'ok' else '>>> FALTANDO <<<' end as situacao
  union all
  select 2, 'tempo real acompanha',
    (select string_agg(tablename, ', ' order by tablename) from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public')
) t order by ord;
