-- =============================================================================
-- INCOVIA — Atestado bloqueia, férias avisa
-- =============================================================================
-- Rode DEPOIS do 07, 09, 10 e 11. Pode rodar mais de uma vez. Não apaga nada.
--
-- ATESTADO. O 10-atestados.sql já guarda o período (emitido_em/valido_ate) na
-- tabela 'documentos', tipo 'atestado' — só que até aqui ninguém cruzava isso
-- com a Programação: o encarregado podia escalar alguém de atestado do mesmo
-- jeito, e só um relatório de auditoria (rodado à parte) apontava o furo.
--
-- Este arquivo fecha esse buraco: quando um atestado é salvo com período, um
-- GATILHO gera sozinho uma falta (motivo 'atestado_medico') para cada dia
-- coberto, marcada com de qual atestado ela veio. A partir daí:
--   - a pessoa aparece em Faltas (e em tudo que já lê a tabela de faltas —
--     exportação, contagem, o quadro do dia) sem eu precisar tocar em cada
--     lugar separado;
--   - a Programação, que já sabia avisar "com falta hoje", passa a BLOQUEAR
--     de verdade quando o motivo é atestado — e ela decide isso olhando só a
--     falta, nunca abrindo o documento, então funciona para editor e
--     visualizador também, não só para admin (documentos é admin-only por
--     LGPD; a falta em si já era visível a todo mundo antes disto).
-- Encurtar o período ou apagar o atestado desfaz automaticamente os dias que
-- ele tinha gerado. Uma falta lançada à mão nunca é tocada pelo gatilho: ele
-- só entra em dias que ainda não têm falta nenhuma.
--
-- FÉRIAS. Ao contrário de atestado, quem está de férias continua podendo ser
-- escalado — é só um aviso (anel amarelo no card, já que amarelo é "atenção"
-- no resto do sistema). Por isso férias NÃO gera falta e não é dado de saúde:
-- ganha uma tabela própria, visível a todo mundo que já lê falta hoje. O
-- anexo é opcional e, esse sim, só admin abre — pode ter dado pessoal mesmo
-- não sendo de saúde.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. De qual atestado uma falta veio
-- -----------------------------------------------------------------------------
-- NULL = falta lançada à mão, do jeito que já era. Preenchido = o gatilho
-- abaixo que criou esta linha, e ela mostra o mesmo período do documento.
--
-- ON DELETE CASCADE de propósito: esta falta só existe PORQUE o atestado
-- existe. Apagar o atestado sem apagar a falta sintética deixaria um dia
-- marcado como ausência sem nenhum documento por trás — o mesmo furo que o
-- 10-atestados.sql foi feito para detectar.
alter table public.faltas
  add column if not exists origem_documento_id uuid
    references public.documentos(id) on delete cascade;

create index if not exists faltas_origem_documento_idx
  on public.faltas (origem_documento_id) where origem_documento_id is not null;

comment on column public.faltas.origem_documento_id is
  'Preenchido quando esta falta foi gerada automaticamente por um atestado (documentos.id). NULL = lançada à mão.';


-- -----------------------------------------------------------------------------
-- 2. O gatilho: atestado com período gera falta em cada dia coberto
-- -----------------------------------------------------------------------------
create or replace function public.sincronizar_faltas_atestado()
returns trigger
language plpgsql as $$
declare
  eh_atestado boolean;
  d date;
begin
  select (t.codigo = 'atestado') into eh_atestado
    from public.tipos_documento t
   where t.id = new.tipo_id;

  -- Não é (mais) um atestado com período completo: solta o que este
  -- documento tinha gerado. Cobre tanto "editaram o tipo" quanto "apagaram
  -- uma das datas" — nos dois casos o período deixou de existir.
  if not coalesce(eh_atestado, false)
     or new.emitido_em is null
     or new.valido_ate is null then
    delete from public.faltas where origem_documento_id = new.id;
    return new;
  end if;

  -- Encurtou ou moveu o período: tira os dias que ficaram de fora.
  delete from public.faltas
   where origem_documento_id = new.id
     and (data < new.emitido_em or data > new.valido_ate);

  -- Cobre cada dia do período que ainda não tem falta nenhuma. Se já existe
  -- uma falta naquele dia — lançada à mão ou de outro atestado — este dia
  -- fica de fora: o gatilho nunca duplica nem substitui o que já estava lá.
  for d in select generate_series(new.emitido_em, new.valido_ate, interval '1 day')::date
  loop
    insert into public.faltas ("colaboradorId", data, motivo, origem_documento_id)
    select new."colaboradorId", d, 'atestado_medico', new.id
     where not exists (
       select 1 from public.faltas f
        where f."colaboradorId" = new."colaboradorId" and f.data = d
     );
  end loop;

  return new;
end;
$$;

-- SEM "of <colunas>": um update que só toca observação, por exemplo, dispara
-- o gatilho à toa, mas é barato (poucos dias por atestado) e evita a armadilha
-- oposta — "UPDATE OF" só dispara quando a coluna aparece no SET da instrução,
-- então um "toque" para reprocessar em massa (linha abaixo) simplesmente não
-- acionaria o gatilho se a lista de colunas estivesse restrita.
drop trigger if exists documentos_sincroniza_faltas on public.documentos;
create trigger documentos_sincroniza_faltas
  after insert or update on public.documentos
  for each row execute function public.sincronizar_faltas_atestado();

-- Roda uma vez para quem já tinha atestado cadastrado antes deste arquivo
-- existir — sem isto, só o PRÓXIMO atestado salvo passaria a gerar falta.
update public.documentos d
   set emitido_em = d.emitido_em  -- toque real na coluna: aciona o gatilho acima
  from public.tipos_documento t
 where t.id = d.tipo_id and t.codigo = 'atestado'
   and d.emitido_em is not null and d.valido_ate is not null;


-- -----------------------------------------------------------------------------
-- 3. Férias — tabela própria, visível a quem monta equipe
-- -----------------------------------------------------------------------------
create table if not exists public.ferias (
  id uuid primary key default gen_random_uuid(),
  "colaboradorId" uuid not null references public.colaboradores(id) on delete cascade,

  data_inicio date not null,
  data_fim    date not null,
  observacao  text,

  -- Anexo opcional (aviso de férias, recibo). Nulo = só o período mesmo.
  nome_arquivo   text,
  caminho        text unique,
  mime           text,
  tamanho_bytes  bigint,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (data_fim >= data_inicio)
);

create index if not exists ferias_colaborador_idx on public.ferias ("colaboradorId");
create index if not exists ferias_periodo_idx on public.ferias (data_inicio, data_fim);

do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    drop trigger if exists ferias_set_updated_at on public.ferias;
    create trigger ferias_set_updated_at before update on public.ferias
      for each row execute function public.set_updated_at();
  end if;
end
$$;

-- Mesma régua de 'faltas': todo mundo que lê o cadastro vê quem está de
-- férias e até quando (é o que pinta o anel amarelo no card da equipe);
-- editor e admin lançam; só admin apaga.
alter table public.ferias enable row level security;
alter table public.ferias force row level security;

drop policy if exists ferias_select on public.ferias;
drop policy if exists ferias_insert on public.ferias;
drop policy if exists ferias_update on public.ferias;
drop policy if exists ferias_delete on public.ferias;

create policy ferias_select on public.ferias
  for select to authenticated using (public.pode_ler());
create policy ferias_insert on public.ferias
  for insert to authenticated with check (public.pode_escrever());
create policy ferias_update on public.ferias
  for update to authenticated using (public.pode_escrever()) with check (public.pode_escrever());
create policy ferias_delete on public.ferias
  for delete to authenticated using (public.eh_admin());

revoke all on public.ferias from anon;


-- -----------------------------------------------------------------------------
-- 4. Bucket do anexo de férias — privado, só admin abre
-- -----------------------------------------------------------------------------
-- O período fica visível a todo mundo (tabela acima); o ARQUIVO em si pode
-- trazer dado pessoal mesmo não sendo saúde, então segue a mesma régua do
-- bucket 'documentos': só admin envia, vê e apaga.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ferias', 'ferias', false,
  15728640,  -- 15 MB, mesmo teto do bucket de documentos
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "ferias_ver"       on storage.objects;
drop policy if exists "ferias_enviar"    on storage.objects;
drop policy if exists "ferias_atualizar" on storage.objects;
drop policy if exists "ferias_apagar"    on storage.objects;

create policy "ferias_ver" on storage.objects
  for select to authenticated
  using (bucket_id = 'ferias' and public.eh_admin());

create policy "ferias_enviar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'ferias' and public.eh_admin());

create policy "ferias_atualizar" on storage.objects
  for update to authenticated
  using (bucket_id = 'ferias' and public.eh_admin())
  with check (bucket_id = 'ferias' and public.eh_admin());

create policy "ferias_apagar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'ferias' and public.eh_admin());


-- -----------------------------------------------------------------------------
-- 5. Conferência
-- -----------------------------------------------------------------------------
select * from (
  select 1 as ord, 'coluna origem_documento_id em faltas' as item,
    case when exists (select 1 from information_schema.columns
                       where table_schema='public' and table_name='faltas'
                         and column_name='origem_documento_id')
         then 'ok' else '>>> FALTANDO <<<' end as situacao
  union all
  select 2, 'gatilho de sincronia',
    case when exists (select 1 from pg_trigger where tgname='documentos_sincroniza_faltas')
         then 'ok' else '>>> FALTANDO <<<' end
  union all
  select 3, 'faltas geradas por atestado ate agora',
    (select count(*)::text from public.faltas where origem_documento_id is not null)
  union all
  select 4, 'tabela ferias',
    case when exists (select 1 from information_schema.tables
                       where table_schema='public' and table_name='ferias')
         then 'ok' else '>>> FALTANDO <<<' end
  union all
  select 5, 'bucket de ferias',
    coalesce((select case when public then '>>> PUBLICO — CORRIJA AGORA <<<'
                          else 'ok — privado, so admin' end
                from storage.buckets where id='ferias'), '>>> NAO CRIADO <<<')
  union all
  select 6, 'policies de ferias (4 esperadas na tabela)',
    (select count(*)::text || ' de 4' || case when count(*)=4 then '  ok' else '  >>> INCOMPLETO <<<' end
       from pg_policies where schemaname='public' and tablename='ferias')
  union all
  select 7, 'policies do storage de ferias (4 esperadas)',
    (select count(*)::text || ' de 4' || case when count(*)=4 then '  ok' else '  >>> INCOMPLETO <<<' end
       from pg_policies where schemaname='storage' and tablename='objects'
        and policyname like 'ferias_%')
) t order by ord;


-- =============================================================================
-- TESTAR NA MÃO, depois de rodar:
--
--   -- lança um atestado de 3 dias e confere se as faltas nasceram sozinhas
--   insert into public.documentos ("colaboradorId", categoria, titulo, tipo_id,
--          emitido_em, valido_ate, repetivel)
--   select '<uuid do colaborador>', 'saude', 'Atestado de teste', t.id,
--          current_date, current_date + 2, true
--     from public.tipos_documento t where t.codigo = 'atestado';
--
--   select data, motivo, origem_documento_id from public.faltas
--    where "colaboradorId" = '<uuid do colaborador>'
--    order by data;   -- espera 3 linhas, motivo atestado_medico
--
--   -- apaga o atestado e confere se as 3 faltas sumiram junto
--   delete from public.documentos where titulo = 'Atestado de teste';
-- =============================================================================
