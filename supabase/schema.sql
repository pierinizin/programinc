-- =============================================================================
-- INCOVIA — Schema (estrutura de tabelas)
-- =============================================================================
-- Este arquivo reflete o que o App.jsx realmente usa hoje. A versão anterior
-- estava defasada: tinha 'registro_faltas' (o código usa 'faltas'), não tinha
-- 'perfis', usava snake_case onde o código manda camelCase, e tinha tabelas de
-- junção que foram substituídas por arrays de ids.
--
-- Ordem de execução num projeto novo:
--   1. schema.sql   (este arquivo)
--   2. security.sql (RLS, policies e RPCs — OBRIGATÓRIO)
--   3. seed.sql     (opcional, só para ambiente de teste)
--
-- IMPORTANTE sobre camelCase: o PostgREST expõe o nome exato da coluna. Como o
-- código manda "tipoEquipe", "membroIds" etc., as colunas precisam estar entre
-- aspas duplas no Postgres. Mexer nisso quebra o app.
--
-- Se o banco de produção já existe e diverge daqui, gere o schema real com
--   supabase db dump --schema public
-- e substitua este arquivo, em vez de rodar isto por cima.
-- =============================================================================

create extension if not exists pgcrypto;


-- -----------------------------------------------------------------------------
-- perfis — espelha auth.users e guarda o nível de acesso
-- -----------------------------------------------------------------------------
-- Criada também em security.sql (com o trigger de cadastro). Repetida aqui com
-- "if not exists" para que este arquivo sozinho já descreva a estrutura.

create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  email text,
  cargo text not null default 'pendente'
    check (cargo in ('pendente', 'visualizador', 'editor', 'admin')),
  created_at timestamptz not null default now()
);


-- -----------------------------------------------------------------------------
-- colaboradores
-- -----------------------------------------------------------------------------
create table if not exists public.colaboradores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  apelido text,
  funcao text not null,
  telefone text,
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists colaboradores_nome_idx on public.colaboradores (nome);


-- -----------------------------------------------------------------------------
-- veiculos
-- -----------------------------------------------------------------------------
create table if not exists public.veiculos (
  id uuid primary key default gen_random_uuid(),
  placa text not null unique,
  modelo text not null,
  ano integer,
  tipo text not null,
  status text not null default 'Disponível'
    check (status in ('Disponível', 'Em uso', 'Manutenção', 'Inativo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- -----------------------------------------------------------------------------
-- programacoes
-- -----------------------------------------------------------------------------
-- "membroIds" e "veiculoIds" são arrays de uuid, não tabelas de junção.
-- Trade-off assumido: mais simples de ler/gravar pelo app, mas o Postgres não
-- garante integridade referencial dentro do array. A limpeza de ids órfãos fica
-- por conta dos triggers no fim deste arquivo.

create table if not exists public.programacoes (
  id uuid primary key default gen_random_uuid(),
  "data" date not null,
  "tipoEquipe" text not null,
  cidade text not null,
  contratante text not null,
  engenheiro text,
  "encarregadoId" uuid references public.colaboradores(id) on delete set null,
  "membroIds" uuid[] not null default '{}',
  "veiculoIds" uuid[] not null default '{}',
  "statusExecucao" text not null default 'EXECUTANDO'
    check ("statusExecucao" in ('EXECUTANDO', 'CONCLUÍDO', 'NÃO FOI POSSÍVEL REALIZAR')),
  "motivoNaoExecucao" text
    check ("motivoNaoExecucao" is null or "motivoNaoExecucao" = ''
           or "motivoNaoExecucao" in ('CHUVA', 'MANUTENÇÃO', 'VIAGEM', 'OUTROS')),
  observacoes text,
  "horarioInicio" time,           -- saída da base
  "horarioInicioObra" time,       -- chegada na obra
  "horarioSaidaAlmoco" time,
  "horarioRetornoAlmoco" time,
  "horarioFimObra" time,          -- fim do serviço
  "horarioSaida" time,            -- chegada de volta na base
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists programacoes_data_idx on public.programacoes ("data");
create index if not exists programacoes_membros_idx on public.programacoes using gin ("membroIds");
create index if not exists programacoes_veiculos_idx on public.programacoes using gin ("veiculoIds");


-- -----------------------------------------------------------------------------
-- faltas
-- -----------------------------------------------------------------------------
create table if not exists public.faltas (
  id uuid primary key default gen_random_uuid(),
  "colaboradorId" uuid not null references public.colaboradores(id) on delete cascade,
  "data" date not null,
  motivo text not null,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists faltas_colaborador_idx on public.faltas ("colaboradorId");
create index if not exists faltas_data_idx on public.faltas ("data");


-- -----------------------------------------------------------------------------
-- updated_at automático
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ATENÇÃO: o trigger abaixo faz new.updated_at = now(). Num banco que já existe
-- e não tem essa coluna, ele quebraria TODA atualização com
--   ERROR: record "new" has no field "updated_at"
-- Por isso a coluna é garantida antes (add column if not exists é aditivo e
-- idempotente — não mexe em dado nenhum).
do $$
declare
  t text;
begin
  foreach t in array array['colaboradores', 'veiculos', 'programacoes', 'faltas']
  loop
    execute format(
      'alter table public.%I add column if not exists updated_at timestamptz not null default now()', t);
    execute format(
      'alter table public.%I add column if not exists created_at timestamptz not null default now()', t);

    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end
$$;


-- -----------------------------------------------------------------------------
-- Limpeza de ids órfãos nos arrays
-- -----------------------------------------------------------------------------
-- Como "membroIds"/"veiculoIds" são arrays, apagar um colaborador ou veículo
-- deixaria ids apontando para o nada — a interface mostraria vagas fantasma.
-- Estes triggers removem o id de todas as programações no momento da exclusão.

create or replace function public.limpar_membro_das_programacoes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.programacoes
     set "membroIds" = array_remove("membroIds", old.id)
   where old.id = any("membroIds");

  update public.programacoes
     set "encarregadoId" = null
   where "encarregadoId" = old.id;

  return old;
end;
$$;

drop trigger if exists limpar_membro on public.colaboradores;
create trigger limpar_membro
  before delete on public.colaboradores
  for each row execute function public.limpar_membro_das_programacoes();

create or replace function public.limpar_veiculo_das_programacoes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.programacoes
     set "veiculoIds" = array_remove("veiculoIds", old.id)
   where old.id = any("veiculoIds");
  return old;
end;
$$;

drop trigger if exists limpar_veiculo on public.veiculos;
create trigger limpar_veiculo
  before delete on public.veiculos
  for each row execute function public.limpar_veiculo_das_programacoes();


-- =============================================================================
-- Rode agora o security.sql. Sem ele as tabelas acima ficam abertas para
-- qualquer pessoa que tenha a anon key — que é pública, vai no bundle do site.
-- =============================================================================
