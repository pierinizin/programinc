-- =============================================================================
-- 24 · Desempenho: as regras de permissão perguntam o cargo UMA vez
-- -----------------------------------------------------------------------------
-- Por que o app demorava ~4 s para abrir: cada regra de permissão (RLS) chamava
-- pode_ler(), eh_admin() etc. — que leem o cargo na tabela perfis — PARA CADA
-- LINHA de cada consulta. 1.231 programações = 1.231 vezes "qual é o cargo?",
-- e o app abre fazendo 15 consultas ao mesmo tempo.
--
-- A correção recomendada pelo Supabase: escrever a chamada como
-- (select pode_ler()). Aí o Postgres calcula o resultado uma vez por consulta e
-- reaproveita. Num banco de teste com o mesmo volume: 34 ms → 1,4 ms.
--
-- NÃO muda nenhuma permissão: a regra continua dizendo exatamente a mesma
-- coisa, só é calculada uma vez. Vale para todas as regras que existem hoje
-- (tabelas e arquivos) e para as telas de pendência de documentos.
--
-- Como funciona: em vez de reescrever regra por regra (e arriscar esquecer
-- uma), o bloco abaixo lê todas as regras do banco e troca, dentro de cada
-- uma, pode_ler() por (select pode_ler()) — o mesmo para pode_escrever(),
-- eh_admin(), eh_rh(), pode_documentos() e auth.uid(). O resto do texto da
-- regra fica igual. Pode rodar mais de uma vez: o que já foi trocado não é
-- trocado de novo.
-- =============================================================================


-- 1. Regras das tabelas e dos arquivos -----------------------------------------
do $$
declare
  p record;
  -- chamadas que não dependem da linha (ainda não envolvidas em "select")
  padrao constant text :=
    '(?<!SELECT )(?<!select )(?<!SELECT auth\.)(?<!select auth\.)(?<!SELECT public\.)(?<!select public\.)(public\.|auth\.)?\m(pode_ler|pode_escrever|eh_admin|eh_rh|pode_documentos|uid)\(\)';
  novo_using text;
  novo_check text;
  trocadas int := 0;
  puladas int := 0;
  sql text;
begin
  for p in
    select schemaname, tablename, policyname, cmd, qual, with_check
      from pg_policies
     where schemaname in ('public', 'storage')
       -- perfis fica como está: é minúscula (uma linha por usuário) e a regra
       -- de edição dela consulta a própria tabela — calculada antes, ela entra
       -- em laço com a regra de leitura. Não vale o risco.
       and not (schemaname = 'public' and tablename = 'perfis')
  loop
    novo_using := p.qual;
    novo_check := p.with_check;

    if novo_using is not null then
      novo_using := regexp_replace(novo_using, padrao,
        '(select ' || 'XXESQUEMA\2())', 'g');
    end if;
    if novo_check is not null then
      novo_check := regexp_replace(novo_check, padrao,
        '(select ' || 'XXESQUEMA\2())', 'g');
    end if;
    -- uid() é do esquema auth; os outros, do public
    novo_using := replace(replace(novo_using, 'XXESQUEMAuid()', 'auth.uid()'), 'XXESQUEMA', 'public.');
    novo_check := replace(replace(novo_check, 'XXESQUEMAuid()', 'auth.uid()'), 'XXESQUEMA', 'public.');

    if novo_using is not distinct from p.qual and novo_check is not distinct from p.with_check then
      continue;   -- nada a trocar (ou já trocado numa rodada anterior)
    end if;

    sql := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if p.qual is not null then sql := sql || format(' using (%s)', novo_using); end if;
    if p.with_check is not null then sql := sql || format(' with check (%s)', novo_check); end if;

    begin
      execute sql;
      trocadas := trocadas + 1;
    exception when others then
      -- Ex.: sem permissão de dono numa regra de arquivos. Não para o resto.
      raise notice 'Não consegui ajustar % em %.%: %', p.policyname, p.schemaname, p.tablename, sqlerrm;
      puladas := puladas + 1;
    end;
  end loop;
  raise notice '% regra(s) ajustada(s), % pulada(s)', trocadas, puladas;
end
$$;


-- 2. As telas de pendência de documentos ---------------------------------------
-- Mesmas definições do 22/23; só o filtro de quem vê passa a ser calculado
-- uma vez: (select public.pode_documentos()).
create or replace view public.documentos_pendencias
with (security_invoker = true) as
select
  c.id                as colaborador_id,
  c.nome              as colaborador,
  c.funcao,
  t.codigo            as tipo,
  t.nome              as documento,
  t.categoria,
  t.obrigatorio,
  d.id                as documento_id,
  d.valido_ate,
  (d.caminho is not null) as tem_arquivo,
  coalesce(d.dispensado, false) as dispensado,
  case
    when d.id is null                                   then 'faltando'
    when d.dispensado                                   then 'dispensado'
    when t.vence and d.valido_ate is null               then 'sem data de validade'
    when t.vence and d.valido_ate < current_date        then 'vencido'
    when t.vence and d.valido_ate < current_date + (t.alerta_dias || ' days')::interval
                                                        then 'vence em breve'
    when d.caminho is null                              then 'sem o PDF'
    else 'ok'
  end                 as situacao,
  case when d.valido_ate is not null
       then (d.valido_ate - current_date) end as dias_restantes
from public.colaboradores c
cross join public.tipos_documento t
left join lateral (
  select d2.* from public.documentos d2
   where d2."colaboradorId" = c.id and d2.tipo_id = t.id
   order by coalesce(d2.valido_ate, d2.emitido_em, d2.enviado_em::date) desc
   limit 1
) d on true
where (select public.pode_documentos())
  and c.status <> 'inativo'
  and t.codigo <> 'atestado'          -- atestado é cobrado pela falta, não pela matriz
  and (
    (c.setor <> 'trecho' and t.vale_fora_trecho)
    or (
      c.setor = 'trecho' and t.vale_trecho
      and (
        t.aplica_a = 'todos'
        or (t.aplica_a = 'motorista'            and c.funcao ilike '%motorista%')
        or (t.aplica_a = 'encarregado'          and c.funcao ilike '%encarregado%')
        or (t.aplica_a = 'motorista_encarregado'
            and (c.funcao ilike '%motorista%' or c.funcao ilike '%encarregado%'))
      )
    )
  );

create or replace view public.atestados_faltando
with (security_invoker = true) as
select
  f.id                as falta_id,
  f."colaboradorId"   as colaborador_id,
  c.nome              as colaborador,
  f.data              as dia_da_falta,
  f.motivo,
  (current_date - f.data) as dias_atras
from public.faltas f
join public.colaboradores c on c.id = f."colaboradorId"
where (select public.pode_documentos())
  and f.motivo in ('atestado_medico','acidente_trabalho')
  and not exists (
    select 1
      from public.documentos d
      join public.tipos_documento t on t.id = d.tipo_id
     where d."colaboradorId" = f."colaboradorId"
       and t.codigo = 'atestado'
       and d.emitido_em is not null
       and d.valido_ate is not null
       and f.data between d.emitido_em and d.valido_ate
  );

create or replace view public.atestados_sem_falta
with (security_invoker = true) as
select
  d.id            as documento_id,
  d."colaboradorId" as colaborador_id,
  c.nome          as colaborador,
  d.emitido_em,
  d.valido_ate,
  (d.valido_ate - d.emitido_em + 1) as dias_cobertos,
  (select count(*) from public.faltas f
    where f."colaboradorId" = d."colaboradorId"
      and f.data between d.emitido_em and d.valido_ate) as faltas_lancadas
from public.documentos d
join public.tipos_documento t on t.id = d.tipo_id
join public.colaboradores c on c.id = d."colaboradorId"
where (select public.pode_documentos())
  and t.codigo = 'atestado'
  and d.emitido_em is not null
  and d.valido_ate is not null
  and (select count(*) from public.faltas f
        where f."colaboradorId" = d."colaboradorId"
          and f.data between d.emitido_em and d.valido_ate) = 0;

create or replace view public.atestados_sem_arquivo
with (security_invoker = true) as
select
  d.id              as documento_id,
  d."colaboradorId" as colaborador_id,
  c.nome            as colaborador,
  d.emitido_em,
  d.valido_ate
from public.documentos d
join public.tipos_documento t on t.id = d.tipo_id
join public.colaboradores c on c.id = d."colaboradorId"
where (select public.pode_documentos())
  and t.codigo = 'atestado'
  and d.caminho is null
  and c.status <> 'inativo';

-- A tela de pendência procura o documento mais recente de cada pessoa × tipo:
-- este índice deixa essa busca direta.
create index if not exists documentos_colaborador_tipo_idx
  on public.documentos ("colaboradorId", tipo_id);

notify pgrst, 'reload schema';


-- 3. Conferência ---------------------------------------------------------------
select * from (
  select 1 as ord, 'regras ainda chamando o cargo por linha (esperado: 0)' as item,
    (select count(*)::text from pg_policies
      where schemaname in ('public', 'storage')
        and not (schemaname = 'public' and tablename = 'perfis')
        and (coalesce(qual, '') || ' ' || coalesce(with_check, ''))
            ~ '(?<!SELECT )(?<!select )(?<!SELECT auth\.)(?<!select auth\.)(?<!SELECT public\.)(?<!select public\.)(public\.|auth\.)?\m(pode_ler|pode_escrever|eh_admin|eh_rh|pode_documentos|uid)\(\)') as situacao
  union all
  select 2, 'regras no formato rápido',
    (select count(*)::text from pg_policies
      where schemaname in ('public', 'storage')
        and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ilike '%select %')
  union all
  select 3, 'telas de pendência no formato rápido',
    case when (select count(*) from pg_views where schemaname = 'public'
                and viewname in ('documentos_pendencias','atestados_faltando','atestados_sem_falta','atestados_sem_arquivo')
                and definition ilike '%SELECT pode_documentos()%') = 4
         then 'ok' else '>>> CONFERIR <<<' end
) t order by ord;
