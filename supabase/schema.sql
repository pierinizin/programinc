create extension if not exists pgcrypto;

create table if not exists public.colaboradores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  funcao text not null,
  telefone text,
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.veiculos (
  id uuid primary key default gen_random_uuid(),
  placa text not null unique,
  modelo text not null,
  ano integer,
  tipo text not null,
  status text not null default 'Disponível' check (status in ('Disponível', 'Em uso', 'Manutenção', 'Inativo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.programacoes (
  id uuid primary key default gen_random_uuid(),
  tipo_equipe text not null,
  data_programacao date not null,
  cidade text not null,
  contratante text not null,
  tipo_servico text not null,
  encarregado_id uuid references public.colaboradores(id) on delete restrict,
  status_execucao text not null default 'EXECUTANDO'
    check (status_execucao in ('EXECUTANDO', 'CONCLUÍDO', 'NÃO FOI POSSÍVEL REALIZAR')),
  motivo_nao_execucao text check (
    motivo_nao_execucao is null or motivo_nao_execucao in ('CHUVA', 'MANUTENÇÃO', 'OUTROS')
  ),
  observacoes text,
  horario_inicio time,
  horario_saida_almoco time,
  horario_retorno_almoco time,
  horario_saida time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.programacao_membros (
  id uuid primary key default gen_random_uuid(),
  programacao_id uuid not null references public.programacoes(id) on delete cascade,
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (programacao_id, colaborador_id)
);

create table if not exists public.programacao_veiculos (
  id uuid primary key default gen_random_uuid(),
  programacao_id uuid not null references public.programacoes(id) on delete cascade,
  veiculo_id uuid not null references public.veiculos(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (programacao_id, veiculo_id)
);

create table if not exists public.registro_faltas (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  data_falta date not null,
  motivo text not null,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
