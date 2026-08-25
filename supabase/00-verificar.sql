-- =============================================================================
-- INCOVIA — Verificação ANTES de mexer no banco de produção
-- =============================================================================
-- Cole no SQL Editor do Supabase e clique em Run. Leia a tabela que sair.
--
-- 100% somente-leitura: não cria, não altera e não apaga nada.
--
-- É UMA consulta só de propósito. O SQL Editor do Supabase mostra apenas o
-- resultado do ÚLTIMO comando do script, então várias consultas separadas
-- fariam você perder as respostas anteriores. Aqui tudo volta numa tabela só,
-- com as colunas: secao | item | detalhe.
--
-- Nenhuma coluna é referenciada pelo nome direto (nem created_at, nem email) —
-- tudo sai de to_jsonb ou do catálogo do Postgres. Assim a consulta funciona
-- seja qual for a estrutura real das suas tabelas.
-- =============================================================================

with

-- 1. Quais tabelas existem de verdade -----------------------------------------
-- Esperado: colaboradores, faltas, perfis, programacoes, veiculos.
tabelas as (
  select '1. TABELAS' as secao,
         table_name   as item,
         ''           as detalhe
    from information_schema.tables
   where table_schema = 'public'
     and table_type = 'BASE TABLE'
),

-- 2. As colunas batem com o que o App.jsx manda? -------------------------------
-- O app manda camelCase ("tipoEquipe", "membroIds", "colaboradorId").
-- Se aqui aparecer snake_case (tipo_equipe), o schema.sql NÃO serve.
colunas as (
  select '2. COLUNAS'  as secao,
         table_name    as item,
         string_agg(column_name, ', ' order by ordinal_position) as detalhe
    from information_schema.columns
   where table_schema = 'public'
     and table_name in ('colaboradores', 'veiculos', 'programacoes', 'faltas', 'perfis')
   group by table_name
),

-- 3. Falta updated_at em alguma tabela? ----------------------------------------
-- Se aparecer QUALQUER linha aqui, NÃO rode o schema.sql inteiro: o trigger
-- set_updated_at faria toda atualização falhar com
--   ERROR: record "new" has no field "updated_at"
-- A coluna 'detalhe' já vem com o comando pronto para corrigir.
falta_updated as (
  select '3. FALTA updated_at' as secao,
         t.table_name          as item,
         format('alter table public.%I add column updated_at timestamptz not null default now();',
                t.table_name)  as detalhe
    from information_schema.tables t
   where t.table_schema = 'public'
     and t.table_name in ('colaboradores', 'veiculos', 'programacoes', 'faltas')
     and not exists (
       select 1 from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = t.table_name
          and c.column_name = 'updated_at'
     )
),

-- 4. RLS está ligada? ----------------------------------------------------------
-- Hoje, provavelmente 'NAO' em tudo. É o que o security.sql resolve.
rls as (
  select '4. RLS'   as secao,
         tablename  as item,
         case when rowsecurity then 'LIGADA' else '>>> DESLIGADA <<<' end as detalhe
    from pg_tables
   where schemaname = 'public'
),

-- 5. Quantas policies cada tabela tem hoje? ------------------------------------
policies as (
  select '5. POLICIES' as secao,
         tablename      as item,
         count(*)::text || ' policy(ies): ' || string_agg(policyname, ', ') as detalhe
    from pg_policies
   where schemaname = 'public'
   group by tablename
),

-- 6. As funções de segurança: existem? têm checagem de cargo? ------------------
-- Olhe o corpo de deletar_usuario_completo. Se NÃO tiver nenhuma checagem de
-- cargo/admin, hoje qualquer usuário autenticado apaga a conta de qualquer um.
funcoes as (
  select '6. FUNCOES' as secao,
         p.proname     as item,
         case when p.prosecdef then 'SECURITY DEFINER | ' else 'security invoker | ' end
         || case
              -- só estas duas precisam validar quem chamou; as outras não
              when p.proname not in ('deletar_usuario_completo', 'definir_cargo_usuario')
                then 'n/a'
              when p.prosrc ~* '(eh_admin\(\)|meu_cargo\(\))'
                then 'TEM checagem de admin'
              else '>>> SEM CHECAGEM DE ADMIN — FURO DE SEGURANCA <<<'
            end
         || ' | corpo: '
         || regexp_replace(left(p.prosrc, 300), '\s+', ' ', 'g') as detalhe
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('deletar_usuario_completo', 'definir_cargo_usuario',
                       'meu_cargo', 'handle_new_user')
),

-- 7. Existe um admin? ----------------------------------------------------------
-- TEM que aparecer pelo menos um 'admin' — o SEU usuário. Se não aparecer,
-- rode ANTES do security.sql:
--   update public.perfis set cargo = 'admin' where email = 'SEU@EMAIL.COM';
--
-- Usamos to_jsonb para não depender de quais colunas a tabela tem.
perfis_lista as (
  select '7. PERFIS' as secao,
         coalesce(to_jsonb(p) ->> 'email',
                  to_jsonb(p) ->> 'nome',
                  to_jsonb(p) ->> 'id')            as item,
         coalesce(to_jsonb(p) ->> 'cargo', '(sem coluna cargo)') as detalhe
    from public.perfis p
),

-- 8. Volume de dados reais (confirma que o seed NÃO deve rodar) ----------------
contagens as (
  select '8. DADOS' as secao, 'colaboradores' as item, count(*)::text as detalhe from public.colaboradores
  union all
  select '8. DADOS', 'veiculos',      count(*)::text from public.veiculos
  union all
  select '8. DADOS', 'programacoes',  count(*)::text from public.programacoes
  union all
  select '8. DADOS', 'faltas',        count(*)::text from public.faltas
),

tudo as (
  select * from tabelas
  union all select * from colunas
  union all select * from falta_updated
  union all select * from rls
  union all select * from policies
  union all select * from funcoes
  union all select * from perfis_lista
  union all select * from contagens
)

select secao, item, detalhe
  from tudo
 order by secao, item;


-- =============================================================================
-- COMO LER O RESULTADO
--
--   Seção 2 mostra camelCase  E  seção 3 não aparece
--     -> pode rodar schema.sql e depois security.sql.
--
--   Seção 3 apareceu com alguma linha
--     -> rode primeiro os comandos da coluna 'detalhe' dessas linhas,
--        depois schema.sql, depois security.sql.
--
--   Seção 2 mostra snake_case, ou falta alguma tabela na seção 1
--     -> NÃO rode o schema.sql. Me mande a seção 2 para eu ajustar.
--
--   Seção 6 diz "SEM checagem de cargo" em deletar_usuario_completo
--     -> confirma o furo de segurança; o security.sql substitui a função.
--
--   Seção 7 sem nenhum 'admin'
--     -> promova o seu usuário ANTES de rodar o security.sql.
--
--   Seção 8 com qualquer número > 0
--     -> confirmado: NÃO rode o seed.sql neste banco.
-- =============================================================================
