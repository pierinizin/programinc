-- =============================================================================
-- INCOVIA — Endurecimento de funções (responde aos avisos do linter Supabase)
-- =============================================================================
-- Cole no SQL Editor do Supabase e clique em Run. Pode rodar mais de uma vez.
-- Não apaga função nenhuma e não muda o comportamento de nada.
--
-- O QUE ELE RESOLVE, e o que NÃO era problema:
--
--  · "Function Search Path Mutable" — legítimo, e é o que este arquivo conserta.
--    Sem search_path fixo, uma função pode resolver nomes por um schema que não
--    é o esperado. Nas suas funções o risco hoje é baixo (elas chamam tudo
--    qualificado, e no Supabase o papel 'authenticated' não cria schema), mas
--    é barato fechar e some da lista.
--
--  · "Signed-In Users Can Execute SECURITY DEFINER Function" — NÃO é falha em
--    definir_cargo_usuario e deletar_usuario_completo. Elas PRECISAM ser
--    chamáveis por usuário logado, senão o admin não promove ninguém. A
--    proteção está DENTRO delas. Testei os dois casos: 'pendente' e
--    'visualizador' tentando se promover recebem
--    "Apenas administradores podem alterar cargos", e nem o admin muda o
--    próprio cargo. O linter não enxerga a guarda interna, só o grant.
--
--  · "Public Can Execute SECURITY DEFINER Function" — esse vale fechar. São
--    funções de trigger; ninguém precisa poder chamá-las direto, muito menos
--    sem estar logado. Revogar NÃO quebra o trigger: gatilho roda por conta do
--    dono da tabela, não por permissão de execução de quem disparou.
--
-- ATENÇÃO — o linter apontou 'cria_perfil_novo_usuario', que NÃO existe no
-- security.sql atual. É resíduo de uma versão anterior. A seção 3 mostra o
-- código dela para você decidir se apaga. Não apago sozinho: se ainda houver
-- trigger apontando para ela, remover quebraria o cadastro de usuários novos.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. search_path fixo em toda função nossa que não tem
-- -----------------------------------------------------------------------------
-- Só mexe no que é NOSSO: funções de extensão (pgcrypto, uuid-ossp) ficam de
-- fora — são mantidas pelo autor da extensão e alterá-las quebra o update dela.
do $$
declare
  f record;
  n int := 0;
begin
  for f in
    select p.oid::regprocedure as assinatura
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.prokind = 'f'
       and not exists (
         select 1 from pg_depend d
          where d.objid = p.oid and d.deptype = 'e'   -- pertence a extensão
       )
       and not exists (
         select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
          where cfg like 'search_path=%'
       )
  loop
    execute format('alter function %s set search_path = public', f.assinatura);
    raise notice 'search_path fixado em %', f.assinatura;
    n := n + 1;
  end loop;
  raise notice '% função(ões) endurecida(s)', n;
end
$$;


-- -----------------------------------------------------------------------------
-- 2. Ninguém sem login executa função security definer
-- -----------------------------------------------------------------------------
-- Tira EXECUTE de 'public' e 'anon' em TODA função security definer do schema
-- public — inclusive as que eu não conheço, como a tal cria_perfil_novo_usuario.
-- Os grants para 'authenticated' que já existem são preservados: quem precisa
-- chamar continua chamando.
do $$
declare
  f record;
  n int := 0;
begin
  for f in
    select p.oid::regprocedure as assinatura
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.prosecdef
       and not exists (
         select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e'
       )
  loop
    execute format('revoke execute on function %s from public', f.assinatura);
    execute format('revoke execute on function %s from anon', f.assinatura);
    raise notice 'execute revogado de public/anon em %', f.assinatura;
    n := n + 1;
  end loop;
  raise notice '% função(ões) definer fechada(s)', n;
end
$$;

-- As duas RPCs que o painel de admin chama precisam continuar acessíveis a
-- quem está logado — a checagem de admin é feita dentro delas.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='public' and p.proname='definir_cargo_usuario') then
    grant execute on function public.definir_cargo_usuario(uuid, text) to authenticated;
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='public' and p.proname='deletar_usuario_completo') then
    grant execute on function public.deletar_usuario_completo(uuid) to authenticated;
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='public' and p.proname='meu_cargo') then
    grant execute on function public.meu_cargo() to authenticated;
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 3. O resíduo: veja antes de apagar
-- -----------------------------------------------------------------------------
-- Mostra o código de qualquer função security definer que NÃO faz parte do
-- security.sql atual. Leia; se for cópia velha do handle_new_user e nenhum
-- trigger usar, aí sim pode remover — na mão, sabendo o que está fazendo.
select p.proname as funcao,
       coalesce((select string_agg(t.tgname, ', ')
                   from pg_trigger t where t.tgfoid = p.oid and not t.tgisinternal),
                'nenhum trigger usa') as usada_por,
       left(pg_get_functiondef(p.oid), 400) as inicio_do_codigo
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prosecdef
   and p.proname not in ('meu_cargo','definir_cargo_usuario','deletar_usuario_completo',
                         'handle_new_user','limpar_membro_das_programacoes',
                         'limpar_veiculo_das_programacoes');


-- -----------------------------------------------------------------------------
-- 4. Conferência
-- -----------------------------------------------------------------------------
select * from (
  select 1 as ord, 'funcoes sem search_path' as item,
    case when (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                where n.nspname='public' and p.prokind='f'
                  and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
                  and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c
                                   where c like 'search_path=%')) = 0
         then 'ok — todas fixadas' else '>>> AINDA HA FUNCOES SEM search_path <<<' end as situacao
  union all
  select 2, 'definer executavel por anon',
    case when (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                where n.nspname='public' and p.prosecdef
                  and has_function_privilege('anon', p.oid, 'execute')) = 0
         then 'ok — nenhuma' else '>>> ANON AINDA EXECUTA ALGUMA <<<' end
  union all
  select 3, 'admin ainda promove usuarios',
    case when has_function_privilege('authenticated',
           (select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='definir_cargo_usuario' limit 1), 'execute')
         then 'ok — painel de acessos continua funcionando'
         else '>>> QUEBROU: authenticated perdeu o acesso a RPC <<<' end
) t order by ord;
