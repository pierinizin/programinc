-- =============================================================================
-- INCOVIA — Concessionárias e contratos
-- =============================================================================
-- Pode rodar mais de uma vez. Não apaga nada e não altera programação nenhuma.
--
-- O QUE ISTO RESOLVE. Hoje 'contratante' é texto livre: "MOTIVA", "Motiva" e
-- "MOTIVA S.A." são três empresas diferentes para o banco e a mesma para você.
-- Isso quebra filtro, quebra relatório e quebra a conciliação do Kartado, que
-- compara texto com texto.
--
-- O QUE ISTO NÃO FAZ, DE PROPÓSITO. Nada de valor de contrato, saldo, medição
-- ou alarme de vigência. Você foi claro: o contrato serve para DIZER QUAL É e
-- aparecer na equipe. Guardar valor aqui criaria um controle financeiro
-- paralelo ao do escritório, que desatualiza em uma semana e ninguém confia.
--
-- A COLUNA DE TEXTO CONTINUA. 'contratante' segue existindo e preenchida com a
-- sigla: as exportações e o Kartado leem ela, e ela é a rede de segurança se
-- uma ligação sair errada — o que estava escrito antes não se perde.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. A empresa
-- -----------------------------------------------------------------------------
create table if not exists public.concessionarias (
  id uuid primary key default gen_random_uuid(),

  -- A SIGLA é o que aparece no card da equipe, onde o espaço é curto. O nome
  -- completo existe para documento e para não haver dúvida de quem é quem.
  sigla text not null unique,
  nome text not null,

  cnpj text,
  contato_nome text,
  contato_email text,
  contato_telefone text,
  observacao text,

  -- Cor de reconhecimento no quadro. Padrão é o amarelo da casa; quem quiser
  -- diferenciar duas concessionárias muda aqui.
  cor text not null default '#FFC72C',

  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists concessionarias_sigla_idx
  on public.concessionarias (upper(sigla));


-- -----------------------------------------------------------------------------
-- 2. O contrato
-- -----------------------------------------------------------------------------
create table if not exists public.contratos (
  id uuid primary key default gen_random_uuid(),
  concessionaria_id uuid not null
    references public.concessionarias(id) on delete restrict,

  numero text not null,
  objeto text,
  trecho text,

  -- Datas informativas: aparecem na lista e servem para você saber qual está
  -- valendo. NÃO geram aviso — foi decisão sua, e um alarme que ninguém pediu
  -- vira paisagem.
  inicio date,
  fim date,

  ativo boolean not null default true,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (fim is null or inicio is null or fim >= inicio)
);

-- O mesmo número pode existir em concessionárias diferentes (CT-2024/118 da
-- MOTIVA e da MLC são contratos distintos), mas não duas vezes na mesma.
create unique index if not exists contratos_numero_idx
  on public.contratos (concessionaria_id, upper(numero));
create index if not exists contratos_concessionaria_idx
  on public.contratos (concessionaria_id);

do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    drop trigger if exists concessionarias_set_updated_at on public.concessionarias;
    create trigger concessionarias_set_updated_at before update on public.concessionarias
      for each row execute function public.set_updated_at();
    drop trigger if exists contratos_set_updated_at on public.contratos;
    create trigger contratos_set_updated_at before update on public.contratos
      for each row execute function public.set_updated_at();
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 3. A ligação com a programação
-- -----------------------------------------------------------------------------
-- on delete set null nas duas: apagar um cadastro NUNCA pode levar junto a
-- programação de uma obra que aconteceu. A obra perde o vínculo, não o
-- registro — e o texto em 'contratante' continua lá dizendo quem era.
alter table public.programacoes
  add column if not exists concessionaria_id uuid
    references public.concessionarias(id) on delete set null,
  add column if not exists contrato_id uuid
    references public.contratos(id) on delete set null;

create index if not exists programacoes_concessionaria_idx
  on public.programacoes (concessionaria_id);
create index if not exists programacoes_contrato_idx
  on public.programacoes (contrato_id);

comment on column public.programacoes.contratante is
  'Sigla da concessionária, em texto. Mantida para as exportações, para o Kartado e como registro do que foi escrito no dia.';


-- -----------------------------------------------------------------------------
-- 4. RLS
-- -----------------------------------------------------------------------------
-- Ler: quem já lê o cadastro. Um editor precisa ver a lista para escolher o
-- contratante ao montar a equipe — sem isso o campo abriria vazio para ele.
-- Escrever: só admin. Cadastro errado aqui contamina toda programação futura.
alter table public.concessionarias enable row level security;
alter table public.concessionarias force row level security;
alter table public.contratos enable row level security;
alter table public.contratos force row level security;

drop policy if exists concessionarias_select on public.concessionarias;
drop policy if exists concessionarias_escrita on public.concessionarias;
drop policy if exists contratos_select on public.contratos;
drop policy if exists contratos_escrita on public.contratos;

create policy concessionarias_select on public.concessionarias
  for select to authenticated using (public.pode_ler());
create policy concessionarias_escrita on public.concessionarias
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

create policy contratos_select on public.contratos
  for select to authenticated using (public.pode_ler());
create policy contratos_escrita on public.contratos
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

grant select on public.concessionarias, public.contratos to authenticated;
revoke all on public.concessionarias, public.contratos from anon;


-- -----------------------------------------------------------------------------
-- 5. Ponto de partida: o que já está escrito
-- -----------------------------------------------------------------------------
-- Cria uma concessionária para cada texto distinto que já existe nas
-- programações, para você não começar de uma tela vazia. Variações da mesma
-- empresa ("MOTIVA" e "Motiva") entram como UMA só — é por isso que a
-- comparação é por upper(btrim()).
--
-- Se a sua lista tiver duas empresas que só diferem por acento ou pontuação,
-- elas vão entrar separadas; junte pela tela de vínculo depois. Preferi errar
-- para o lado de criar demais: apagar duplicata é fácil, adivinhar que duas
-- siglas diferentes são a mesma empresa não é.
insert into public.concessionarias (sigla, nome)
select distinct upper(btrim(p.contratante)), upper(btrim(p.contratante))
  from public.programacoes p
 where btrim(coalesce(p.contratante, '')) <> ''
   and not exists (
     select 1 from public.concessionarias c
      where upper(c.sigla) = upper(btrim(p.contratante))
   )
on conflict do nothing;

-- Liga as programações antigas às concessionárias recém-criadas, casando pelo
-- texto. Só preenche o que está vazio: uma ligação que você já corrigiu na mão
-- não é desfeita se este arquivo rodar de novo.
update public.programacoes p
   set concessionaria_id = c.id
  from public.concessionarias c
 where p.concessionaria_id is null
   and upper(btrim(p.contratante)) = upper(c.sigla);


-- -----------------------------------------------------------------------------
-- 6. Conferência
-- -----------------------------------------------------------------------------
select * from (
  select 1 as ord, 'tabelas' as item,
    case when (select count(*) from information_schema.tables
                where table_schema='public' and table_name in ('concessionarias','contratos')) = 2
         then 'ok' else '>>> FALTANDO <<<' end as situacao
  union all
  select 2, 'colunas na programacao',
    case when (select count(*) from information_schema.columns
                where table_schema='public' and table_name='programacoes'
                  and column_name in ('concessionaria_id','contrato_id')) = 2
         then 'ok' else '>>> FALTANDO <<<' end
  union all
  select 3, 'concessionarias criadas',
    (select count(*)::text || ' a partir do que ja estava escrito'
       from public.concessionarias)
  union all
  select 4, 'programacoes ligadas',
    (select count(*) filter (where concessionaria_id is not null)::text
            || ' de ' || count(*)::text
       from public.programacoes)
  union all
  select 5, 'sobrou sem ligar',
    coalesce((select string_agg(distinct coalesce(contratante,'(vazio)'), ', ')
                from public.programacoes where concessionaria_id is null),
             'nenhuma — todas ligadas')
  union all
  select 6, 'escrita so por admin',
    case when (select count(*) from pg_policies
                where schemaname='public' and tablename in ('concessionarias','contratos')
                  and cmd='ALL' and qual like '%eh_admin%') = 2
         then 'ok' else '>>> POLICY DE ESCRITA ABERTA DEMAIS <<<' end
) t order by ord;


-- =============================================================================
-- CONFERIR DEPOIS, quando os contratos estiverem cadastrados:
--
--   select c.sigla, k.numero, count(p.id) as obras
--     from public.concessionarias c
--     left join public.contratos k on k.concessionaria_id = c.id
--     left join public.programacoes p on p.contrato_id = k.id
--    group by c.sigla, k.numero order by c.sigla, k.numero;
-- =============================================================================
