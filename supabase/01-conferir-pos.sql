-- =============================================================================
-- INCOVIA — Conferência PÓS-aplicação (somente leitura)
-- =============================================================================
-- Uma consulta só. Cole no SQL Editor e clique em Run.
-- Procure por qualquer linha que comece com ">>>".
-- =============================================================================

with

-- 1. Algum cargo fora dos 4 previstos? Quem estiver fora fica SEM VER NADA.
--    As policies só liberam 'visualizador', 'editor' e 'admin'.
cargos_brutos as (
  select coalesce(to_jsonb(p) ->> 'cargo', '(nulo)') as cargo from public.perfis p
),
cargos as (
  select '1. CARGOS EM USO' as secao,
         cargo              as item,
         count(*)::text || ' usuario(s)'
         || case
              when cargo in ('pendente','visualizador','editor','admin') then ''
              else '  >>> CARGO DESCONHECIDO: ESSAS PESSOAS NAO VAO VER NADA <<<'
            end as detalhe
    from cargos_brutos
   group by cargo
),

-- 2. Tem admin? Tem gente presa em 'pendente' esperando liberação?
admins as (
  select '2. ACESSO' as secao,
         'admins'    as item,
         case when count(*) = 0
              then '>>> NENHUM ADMIN — VOCE ESTA TRANCADO FORA <<<'
              else count(*)::text || ' admin(s)' end as detalhe
    from public.perfis p
   where coalesce(to_jsonb(p) ->> 'cargo','') = 'admin'
  union all
  select '2. ACESSO', 'pendentes',
         count(*)::text || ' aguardando liberacao na aba Acessos'
    from public.perfis p
   where coalesce(to_jsonb(p) ->> 'cargo','') = 'pendente'
),

-- 3. RLS ligada em tudo?
rls as (
  select '3. RLS' as secao, tablename as item,
         case when rowsecurity then 'ok' else '>>> DESLIGADA <<<' end as detalhe
    from pg_tables
   where schemaname = 'public'
     and tablename in ('perfis','colaboradores','veiculos','programacoes','faltas')
),

-- 4. 4 policies por tabela?
pol as (
  select '4. POLICIES' as secao, tablename as item,
         count(*)::text || ' de 4'
         || case when count(*) = 4 then '' else '  >>> INCOMPLETO <<<' end as detalhe
    from pg_policies
   where schemaname = 'public'
   group by tablename
),

-- 5. As duas funções críticas validam o chamador?
fn as (
  select '5. FUNCOES' as secao, p.proname as item,
         case when p.prosrc ~* 'eh_admin\(\)'
              then 'ok — valida admin'
              else '>>> SEM CHECAGEM DE ADMIN <<<' end as detalhe
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('deletar_usuario_completo','definir_cargo_usuario')
),

-- 6. O trigger de cadastro está no lugar?
trg as (
  select '6. TRIGGER' as secao, 'on_auth_user_created' as item,
         case when count(*) > 0 then 'ok — novo cadastro entra como pendente'
              else '>>> AUSENTE <<<' end as detalhe
    from pg_trigger where tgname = 'on_auth_user_created' and not tgisinternal
),

tudo as (
  select * from cargos
  union all select * from admins
  union all select * from rls
  union all select * from pol
  union all select * from fn
  union all select * from trg
)
select secao, item, detalhe from tudo order by secao, item;
