-- =============================================================================
-- INCOVIA — Em viagem
-- =============================================================================
-- Cole no SQL Editor do Supabase e clique em Run. Pode rodar mais de uma vez.
-- Não apaga nada e não altera dado existente.
--
-- Terceira zona do quadro do dia, entre Pátio e Faltas: quem está viajando
-- (deslocamento, mudança de obra, etc.) — não foi pra obra naquele dia, mas
-- também não faltou. Funciona exatamente como o Pátio: arrasta pra dentro,
-- clique duplo pra tirar.
--
-- Tabela própria (e não um "tipo" dentro de 'patio') pelo mesmo motivo que o
-- pátio não mora dentro de 'faltas': são situações diferentes, e misturar
-- estragaria as contagens de cada uma. A estrutura é cópia fiel da do pátio.
-- =============================================================================

create table if not exists public.viagem (
  id uuid primary key default gen_random_uuid(),
  "colaboradorId" uuid not null references public.colaboradores(id) on delete cascade,
  "data" date not null,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A mesma pessoa não pode estar duas vezes em viagem no mesmo dia. Sem isso,
-- dois cliques rápidos (ou duas abas abertas) criam registro duplicado.
create unique index if not exists viagem_pessoa_dia_idx
  on public.viagem ("colaboradorId", "data");
create index if not exists viagem_data_idx on public.viagem ("data");


-- -----------------------------------------------------------------------------
-- Trigger de updated_at, igual ao das outras tabelas
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    drop trigger if exists viagem_set_updated_at on public.viagem;
    create trigger viagem_set_updated_at
      before update on public.viagem
      for each row execute function public.set_updated_at();
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.viagem enable row level security;
alter table public.viagem force row level security;

drop policy if exists viagem_select on public.viagem;
drop policy if exists viagem_insert on public.viagem;
drop policy if exists viagem_update on public.viagem;
drop policy if exists viagem_delete on public.viagem;

create policy viagem_select on public.viagem
  for select to authenticated using (public.pode_ler());

create policy viagem_insert on public.viagem
  for insert to authenticated with check (public.pode_escrever());

create policy viagem_update on public.viagem
  for update to authenticated
  using (public.pode_escrever()) with check (public.pode_escrever());

-- Igual ao pátio: apagar é liberado pra editor, porque tirar alguém da zona
-- "Em viagem" é o mesmo gesto de tirar do pátio ou de uma equipe.
create policy viagem_delete on public.viagem
  for delete to authenticated using (public.pode_escrever());

revoke all on public.viagem from anon;

-- Realtime, para o quadro atualizar em outra máquina
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public' and tablename = 'viagem'
    ) then
      alter publication supabase_realtime add table public.viagem;
    end if;
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- Conferência
-- -----------------------------------------------------------------------------
select 'tabela' as item,
       case when exists (select 1 from information_schema.tables
                          where table_schema = 'public' and table_name = 'viagem')
            then 'ok' else '>>> FALTANDO <<<' end as situacao
union all
select 'rls ligado',
       case when exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                          where n.nspname = 'public' and c.relname = 'viagem' and c.relrowsecurity)
            then 'ok' else '>>> DESLIGADO <<<' end
union all
select 'policies',
       count(*)::text || ' de 4'
       || case when count(*) = 4 then '  ok' else '  >>> INCOMPLETO <<<' end
  from pg_policies where schemaname = 'public' and tablename = 'viagem'
union all
select 'indice unico',
       case when exists (select 1 from pg_indexes
                          where schemaname = 'public' and indexname = 'viagem_pessoa_dia_idx')
            then 'ok' else '>>> FALTANDO <<<' end
union all
select 'em viagem hoje', count(*)::text
  from public.viagem where "data" = current_date;
