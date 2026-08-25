-- =============================================================================
-- INCOVIA — Remover policies antigas que anulam a segurança nova
-- =============================================================================
-- Cole no SQL Editor do Supabase e clique em Run. Pode rodar mais de uma vez.
--
-- Por quê: policies permissivas se SOMAM com OR. Uma sobra antiga do tipo
-- "for select using (true)" faz todo mundo continuar vendo tudo, mesmo com a
-- RLS ligada e as policies novas no lugar.
--
-- Este arquivo remove apenas policies cujo nome não é um dos 20 criados pelo
-- security.sql. Não apaga tabela, não apaga dado, não mexe em cargo.
--
-- No fim ele mostra o estado final: tem que dar "4 policies  ok" nas 5 tabelas.
-- =============================================================================

do $$
declare
  r record;
  nomes_ok text[] := array[
    'perfis_select',        'perfis_insert',        'perfis_update',        'perfis_delete',
    'colaboradores_select', 'colaboradores_insert', 'colaboradores_update', 'colaboradores_delete',
    'veiculos_select',      'veiculos_insert',      'veiculos_update',      'veiculos_delete',
    'programacoes_select',  'programacoes_insert',  'programacoes_update',  'programacoes_delete',
    'faltas_select',        'faltas_insert',        'faltas_update',        'faltas_delete'
  ];
begin
  for r in
    select tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename in ('perfis','colaboradores','veiculos','programacoes','faltas')
       and policyname <> all(nomes_ok)
  loop
    raise notice 'removendo policy antiga: % (tabela %)', r.policyname, r.tablename;
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end
$$;


-- Estado final
select tablename as tabela,
       count(*)::text || ' policies'
       || case when count(*) = 4 then '  ok' else '  >>> AINDA ERRADO <<<' end as situacao
  from pg_policies
 where schemaname = 'public'
   and tablename in ('perfis','colaboradores','veiculos','programacoes','faltas')
 group by tablename
 order by tablename;
