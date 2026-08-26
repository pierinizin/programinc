-- =============================================================================
-- INCOVIA — Pátio
-- =============================================================================
-- Cole no SQL Editor do Supabase e clique em Run. Pode rodar mais de uma vez.
-- Não apaga nada e não altera dado existente.
--
-- Por que uma tabela nova e não uma coluna em 'faltas':
-- pátio e falta são coisas diferentes. Quem está no pátio VEIO trabalhar e não
-- foi para obra nenhuma; quem tem falta NÃO veio. Guardar os dois no mesmo
-- lugar contaminaria a contagem de faltas do colaborador, que já alimenta o
-- histórico e os relatórios. São eventos distintos, tabelas distintas.
--
-- A estrutura espelha 'faltas' de propósito: mesma dupla (colaborador, data),
-- mesmo padrão de policies, para não inventar um jeito novo de fazer o mesmo.
-- =============================================================================

create table if not exists public.patio (
  id uuid primary key default gen_random_uuid(),
  "colaboradorId" uuid not null references public.colaboradores(id) on delete cascade,
  "data" date not null,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A mesma pessoa não pode estar duas vezes no pátio no mesmo dia. Sem isso,
-- dois cliques rápidos (ou duas abas abertas) criam registro duplicado.
create unique index if not exists patio_pessoa_dia_idx
  on public.patio ("colaboradorId", "data");
create index if not exists patio_data_idx on public.patio ("data");


-- -----------------------------------------------------------------------------
-- Trigger de updated_at, igual ao das outras tabelas
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    drop trigger if exists patio_set_updated_at on public.patio;
    create trigger patio_set_updated_at
      before update on public.patio
      for each row execute function public.set_updated_at();
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.patio enable row level security;
alter table public.patio force row level security;

drop policy if exists patio_select on public.patio;
drop policy if exists patio_insert on public.patio;
drop policy if exists patio_update on public.patio;
drop policy if exists patio_delete on public.patio;

create policy patio_select on public.patio
  for select to authenticated using (public.pode_ler());

create policy patio_insert on public.patio
  for insert to authenticated with check (public.pode_escrever());

create policy patio_update on public.patio
  for update to authenticated
  using (public.pode_escrever()) with check (public.pode_escrever());

-- ATENÇÃO — esta linha difere das outras tabelas de propósito.
-- Nas demais, apagar é só de admin. Aqui não: tirar alguém do pátio é o mesmo
-- gesto de tirar alguém de uma equipe (que é um update liberado para editor).
-- Se editor pudesse pôr no pátio mas não tirar, o quadro travaria na prática.
-- Querendo o padrão restrito, troque pode_escrever() por eh_admin().
create policy patio_delete on public.patio
  for delete to authenticated using (public.pode_escrever());

revoke all on public.patio from anon;

-- Realtime, para o quadro atualizar em outra máquina
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public' and tablename = 'patio'
    ) then
      alter publication supabase_realtime add table public.patio;
    end if;
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- Conferência
-- -----------------------------------------------------------------------------
select 'tabela' as item,
       case when exists (select 1 from information_schema.tables
                          where table_schema = 'public' and table_name = 'patio')
            then 'ok' else '>>> FALTANDO <<<' end as situacao
union all
select 'rls ligado',
       case when exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                          where n.nspname = 'public' and c.relname = 'patio' and c.relrowsecurity)
            then 'ok' else '>>> DESLIGADO <<<' end
union all
select 'policies',
       count(*)::text || ' de 4'
       || case when count(*) = 4 then '  ok' else '  >>> INCOMPLETO <<<' end
  from pg_policies where schemaname = 'public' and tablename = 'patio'
union all
select 'indice unico',
       case when exists (select 1 from pg_indexes
                          where schemaname = 'public' and indexname = 'patio_pessoa_dia_idx')
            then 'ok' else '>>> FALTANDO <<<' end
union all
select 'no pátio hoje', count(*)::text
  from public.patio where "data" = current_date;
