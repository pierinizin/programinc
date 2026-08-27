-- =============================================================================
-- INCOVIA — Auditoria de segurança (SOMENTE LEITURA)
-- =============================================================================
-- Cole no SQL Editor do Supabase e clique em Run.
-- NÃO altera nada. Nenhum create, nenhum update, nenhum delete.
--
-- Rode ANTES de subir qualquer documento de funcionário. O código-fonte pode
-- dizer uma coisa e a produção estar outra: policy apagada na mão, tabela nova
-- sem RLS, bucket criado público por engano. Isto olha o banco de verdade.
--
-- Leia a coluna SITUACAO. Tudo que começa com >>> é problema.
-- =============================================================================

with

-- 1. Tabelas do schema public sem RLS ligada -----------------------------------
sem_rls as (
  select c.relname as tabela
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not c.relrowsecurity
),

-- 2. Tabelas com RLS ligada mas SEM force (o dono da tabela escapa) ------------
sem_force as (
  select c.relname as tabela
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and c.relrowsecurity
     and not c.relforcerowsecurity
),

-- 3. Tabelas com RLS ligada e NENHUMA policy (ninguém lê — quebra silenciosa) --
sem_policy as (
  select c.relname as tabela
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and c.relrowsecurity
     and not exists (
       select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = c.relname
     )
),

-- 4. Policies abertas demais: liberam para qualquer autenticado sem checar cargo
-- Uma policy que diz apenas 'false' NEGA tudo: é a mais segura que existe.
-- A primeira versão desta consulta acusava essas como risco, e um alarme falso
-- ensina a ignorar o alarme. Por isso o teste é: não cita cargo E não nega.
policies_frouxas as (
  select tablename || '.' || policyname as alvo
    from pg_policies
   where schemaname in ('public', 'storage')
     and coalesce(qual, 'true') !~ 'meu_cargo|pode_ler|pode_escrever|eh_admin|auth\.uid'
     and coalesce(with_check, 'true') !~ 'meu_cargo|pode_ler|pode_escrever|eh_admin|auth\.uid'
     and coalesce(btrim(qual), 'x') <> 'false'
     and coalesce(btrim(with_check), 'x') <> 'false'
     and (qual is not null or with_check is not null)
),

-- 5. Qualquer coisa concedida ao papel anon (visitante não autenticado) --------
grants_anon as (
  select table_name || ' (' || privilege_type || ')' as alvo
    from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public'
),

-- 6. Buckets públicos ---------------------------------------------------------
buckets_publicos as (
  select id from storage.buckets where public
),

-- 7. Buckets sem limite de tamanho ou sem lista de tipos permitidos -----------
buckets_frouxos as (
  select id from storage.buckets
   where file_size_limit is null or allowed_mime_types is null
),

-- 8. Funções security definer sem search_path fixo ----------------------------
--    Sem search_path, um schema malicioso no caminho pode sequestrar a função.
definer_sem_path as (
  select p.proname as fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and not exists (
       select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
        where cfg like 'search_path=%'
     )
),

-- 9. Quantos admins existem ---------------------------------------------------
contagem_admin as (
  select count(*) as n from public.perfis where cargo = 'admin'
),

-- 10. Usuários pendentes esperando liberação ----------------------------------
pendentes as (
  select count(*) as n from public.perfis where cargo = 'pendente'
)

select * from (
  select 1 as ord, 'RLS desligada' as item,
         case when (select count(*) from sem_rls) = 0 then 'ok — todas as tabelas com RLS'
              else '>>> RISCO ALTO: ' || (select string_agg(tabela, ', ') from sem_rls) end as situacao
  union all
  select 2, 'RLS sem FORCE',
         case when (select count(*) from sem_force) = 0 then 'ok'
              else '>>> ATENCAO: ' || (select string_agg(tabela, ', ') from sem_force)
                   || ' — o dono da tabela ignora as policies' end
  union all
  select 3, 'RLS sem policy',
         case when (select count(*) from sem_policy) = 0 then 'ok'
              else '>>> ' || (select string_agg(tabela, ', ') from sem_policy)
                   || ' — ninguem consegue ler; provavel quebra' end
  union all
  select 4, 'Policies sem checagem de cargo',
         case when (select count(*) from policies_frouxas) = 0 then 'ok'
              else '>>> RISCO ALTO: ' || (select string_agg(alvo, ', ') from policies_frouxas) end
  union all
  select 5, 'Acesso concedido a anon',
         case when (select count(*) from grants_anon) = 0 then 'ok — visitante nao le nada'
              else '>>> RISCO ALTO: ' || (select string_agg(alvo, ', ') from grants_anon) end
  union all
  select 6, 'Buckets publicos',
         case when (select count(*) from buckets_publicos) = 0 then 'ok — todos privados'
              else '>>> RISCO ALTO: ' || (select string_agg(id, ', ') from buckets_publicos)
                   || ' — arquivos abertos na internet' end
  union all
  select 7, 'Buckets sem limite de tamanho/tipo',
         case when (select count(*) from buckets_frouxos) = 0 then 'ok'
              else '>>> ATENCAO: ' || (select string_agg(id, ', ') from buckets_frouxos) end
  union all
  select 8, 'Funcoes definer sem search_path',
         case when (select count(*) from definer_sem_path) = 0 then 'ok'
              else '>>> ATENCAO: ' || (select string_agg(fn, ', ') from definer_sem_path) end
  union all
  select 9, 'Administradores',
         case when (select n from contagem_admin) = 0
                then '>>> CRITICO: nenhum admin — voce esta trancado fora'
              when (select n from contagem_admin) = 1
                then 'ok, mas so 1 — se perder o acesso, ninguem promove ninguem'
              else (select n::text from contagem_admin) || ' admins' end
  union all
  select 10, 'Usuarios pendentes',
         case when (select n from pendentes) = 0 then 'nenhum'
              else (select n::text from pendentes)
                   || ' aguardando liberacao (nao enxergam nada ate serem promovidos)' end
  union all
  select 11, 'Extensao pgcrypto',
         case when exists (select 1 from pg_extension where extname = 'pgcrypto')
              then 'ok — disponivel para gerar caminhos aleatorios'
              else 'ausente — rode: create extension if not exists pgcrypto' end
) t
order by ord;


-- =============================================================================
-- DETALHAMENTO — rode separado se algum item acima acusar problema
-- =============================================================================
-- Todas as policies, para ler uma a uma:
--
--   select schemaname, tablename, policyname, cmd, roles, qual, with_check
--     from pg_policies
--    where schemaname in ('public','storage')
--    order by schemaname, tablename, policyname;
--
-- Quem tem qual cargo:
--
--   select email, cargo from public.perfis order by cargo, email;
--
-- O que existe em cada bucket:
--
--   select bucket_id, count(*), pg_size_pretty(sum((metadata->>'size')::bigint))
--     from storage.objects group by bucket_id;
-- =============================================================================
