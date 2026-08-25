-- =============================================================================
-- INCOVIA — Row Level Security, papéis e RPCs
-- =============================================================================
-- Rode este arquivo INTEIRO no SQL Editor do Supabase (projeto de produção).
-- É idempotente: pode rodar mais de uma vez sem quebrar nada.
--
-- Por que isso é necessário: a VITE_SUPABASE_ANON_KEY vai no bundle JavaScript
-- público. Sem RLS, qualquer pessoa que abra o DevTools no site consegue ler,
-- escrever e apagar tudo pela API REST — inclusive mudar o próprio cargo para
-- 'admin'. O controle no React (userRole === 'admin') é só cosmético.
--
-- ATENÇÃO — antes de rodar, confirme que existe pelo menos um usuário com
-- cargo = 'admin' na tabela perfis, senão você se tranca fora do sistema:
--
--   select id, email, cargo from public.perfis;
--   -- se precisar:
--   update public.perfis set cargo = 'admin' where email = 'SEU@EMAIL.COM';
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Tabela de perfis + criação automática no cadastro
-- -----------------------------------------------------------------------------
-- Todo usuário novo entra como 'pendente' e não enxerga nada até um admin
-- promover para 'visualizador', 'editor' ou 'admin'.

create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  email text,
  cargo text not null default 'pendente'
    check (cargo in ('pendente', 'visualizador', 'editor', 'admin')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfis (id, nome, email, cargo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', ''),
    new.email,
    'pendente'          -- nunca confie em cargo vindo do metadata do cliente
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- -----------------------------------------------------------------------------
-- 2. Função auxiliar de cargo
-- -----------------------------------------------------------------------------
-- security definer para poder ler 'perfis' de dentro das policies sem cair em
-- recursão infinita de RLS. stable para o Postgres avaliar uma vez por query.

create or replace function public.meu_cargo()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select cargo from public.perfis where id = auth.uid()),
    'pendente'
  );
$$;

revoke execute on function public.meu_cargo() from public, anon;
grant execute on function public.meu_cargo() to authenticated;

-- Atalhos de leitura
create or replace function public.pode_ler()
returns boolean language sql stable as $$
  select public.meu_cargo() in ('visualizador', 'editor', 'admin');
$$;

create or replace function public.pode_escrever()
returns boolean language sql stable as $$
  select public.meu_cargo() in ('editor', 'admin');
$$;

create or replace function public.eh_admin()
returns boolean language sql stable as $$
  select public.meu_cargo() = 'admin';
$$;


-- -----------------------------------------------------------------------------
-- 3. Ligar RLS em todas as tabelas
-- -----------------------------------------------------------------------------
alter table public.perfis         enable row level security;
alter table public.colaboradores  enable row level security;
alter table public.veiculos       enable row level security;
alter table public.programacoes   enable row level security;
alter table public.faltas         enable row level security;

-- force: garante que nem o dono da tabela escapa das policies
alter table public.perfis         force row level security;
alter table public.colaboradores  force row level security;
alter table public.veiculos       force row level security;
alter table public.programacoes   force row level security;
alter table public.faltas         force row level security;


-- -----------------------------------------------------------------------------
-- 4. Policies — perfis (a tabela mais sensível)
-- -----------------------------------------------------------------------------
-- Regra de ouro: NINGUÉM altera a própria coluna 'cargo'. Promoção só via a
-- RPC definir_cargo_usuario() lá embaixo, que valida quem está chamando.

drop policy if exists "perfis_select" on public.perfis;
drop policy if exists "perfis_update" on public.perfis;
drop policy if exists "perfis_insert" on public.perfis;
drop policy if exists "perfis_delete" on public.perfis;

-- Admin vê todos; qualquer outro vê só a própria linha.
create policy "perfis_select" on public.perfis
  for select to authenticated
  using (id = auth.uid() or public.eh_admin());

-- Update direto: o próprio usuário só pode mexer em 'nome', e o cargo tem que
-- continuar exatamente o mesmo. Admin também não muda cargo por aqui.
create policy "perfis_update" on public.perfis
  for update to authenticated
  using (id = auth.uid() or public.eh_admin())
  with check (
    (id = auth.uid() or public.eh_admin())
    and cargo = (select p.cargo from public.perfis p where p.id = perfis.id)
  );

-- Insert só pelo trigger (security definer). Ninguém insere perfil pela API.
create policy "perfis_insert" on public.perfis
  for insert to authenticated
  with check (false);

-- Delete só pela RPC deletar_usuario_completo().
create policy "perfis_delete" on public.perfis
  for delete to authenticated
  using (false);


-- -----------------------------------------------------------------------------
-- 5. Policies — dados operacionais
-- -----------------------------------------------------------------------------
-- Padrão: visualizador/editor/admin leem; editor/admin escrevem; só admin apaga.

do $$
declare
  t text;
begin
  foreach t in array array['colaboradores', 'veiculos', 'programacoes', 'faltas']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.pode_ler())',
      t || '_select', t);

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.pode_escrever())',
      t || '_insert', t);

    execute format(
      'create policy %I on public.%I for update to authenticated using (public.pode_escrever()) with check (public.pode_escrever())',
      t || '_update', t);

    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.eh_admin())',
      t || '_delete', t);
  end loop;
end
$$;

-- Nenhuma tabela é exposta para visitantes não autenticados.
revoke all on public.perfis, public.colaboradores, public.veiculos,
              public.programacoes, public.faltas from anon;


-- -----------------------------------------------------------------------------
-- 6. RPC: promover / rebaixar usuário
-- -----------------------------------------------------------------------------
-- O App chamava supabase.from('perfis').update({cargo}) direto, o que agora é
-- bloqueado pela policy. Passa a chamar esta função, que checa o cargo de quem
-- está chamando NO SERVIDOR.

create or replace function public.definir_cargo_usuario(uid uuid, novo_cargo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.eh_admin() then
    raise exception 'Apenas administradores podem alterar cargos'
      using errcode = '42501';
  end if;

  if novo_cargo not in ('pendente', 'visualizador', 'editor', 'admin') then
    raise exception 'Cargo inválido: %', novo_cargo using errcode = '22023';
  end if;

  if uid = auth.uid() then
    raise exception 'Você não pode alterar o próprio cargo'
      using errcode = '42501';
  end if;

  update public.perfis set cargo = novo_cargo where id = uid;
end;
$$;

revoke execute on function public.definir_cargo_usuario(uuid, text) from public, anon;
grant execute on function public.definir_cargo_usuario(uuid, text) to authenticated;


-- -----------------------------------------------------------------------------
-- 7. RPC: excluir usuário — AGORA COM GUARDA
-- -----------------------------------------------------------------------------
-- A versão anterior desta função (se for security definer sem checagem) permite
-- que QUALQUER usuário autenticado apague a conta de qualquer outro. Este
-- create or replace substitui aquela versão. Confira depois com:
--   select prosrc from pg_proc where proname = 'deletar_usuario_completo';

create or replace function public.deletar_usuario_completo(uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.eh_admin() then
    raise exception 'Apenas administradores podem excluir usuários'
      using errcode = '42501';
  end if;

  if uid = auth.uid() then
    raise exception 'Você não pode excluir a própria conta'
      using errcode = '42501';
  end if;

  delete from public.perfis where id = uid;
  delete from auth.users where id = uid;   -- o cascade cuida do resto
end;
$$;

revoke execute on function public.deletar_usuario_completo(uuid) from public, anon;
grant execute on function public.deletar_usuario_completo(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 8. Realtime
-- -----------------------------------------------------------------------------
-- O Realtime respeita RLS, mas as tabelas precisam estar na publicação.
do $$
declare
  t text;
begin
  foreach t in array array['colaboradores', 'veiculos', 'programacoes', 'faltas', 'perfis']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then
      null;  -- já estava na publicação
    end;
  end loop;
end
$$;


-- -----------------------------------------------------------------------------
-- 9. Correção do typo em funcao
-- -----------------------------------------------------------------------------
update public.colaboradores
   set funcao = 'Operador de máquina de pintura'
 where funcao = 'Operadador de máquina de pintura';


-- -----------------------------------------------------------------------------
-- 10. Conferência
-- -----------------------------------------------------------------------------
-- Rode depois e confirme que rowsecurity = true em todas as linhas:
--
--   select tablename, rowsecurity
--     from pg_tables
--    where schemaname = 'public'
--    order by tablename;
--
-- E que as policies existem:
--
--   select tablename, policyname, cmd
--     from pg_policies
--    where schemaname = 'public'
--    order by tablename, policyname;
--
-- Teste prático: abra o site numa aba anônima, logue com um usuário 'visualizador' e
-- rode no console do navegador — deve falhar:
--
--   await supabase.from('perfis').update({cargo:'admin'}).eq('id', SEU_ID)
-- =============================================================================
