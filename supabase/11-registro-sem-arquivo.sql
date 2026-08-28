-- =============================================================================
-- INCOVIA — Registrar que o documento EXISTE, antes de ter o PDF
-- =============================================================================
-- Rode DEPOIS do 07, 09 e 10. Pode rodar mais de uma vez. Não apaga nada.
--
-- POR QUE. O 07 nasceu para guardar arquivo: 'nome_arquivo' e 'caminho' são
-- obrigatórios. Só que o alarme de prazo não precisa do arquivo — precisa da
-- DATA. Se para registrar "ASO vence 12/03/2027" fosse obrigatório subir o PDF,
-- você teria que digitalizar 47 pastas antes de o sistema avisar qualquer
-- coisa, e ele só começaria a servir daqui a um mês.
--
-- Separando as duas coisas, a Importação em massa registra a empresa inteira
-- numa tarde, o aviso funciona amanhã, e o PDF vai sendo anexado depois — na
-- mesma linha, sem recadastrar nada.
--
-- Uma linha com caminho nulo significa exatamente isto: "conferi na agenda,
-- existe, vence tal dia — o papel ainda não está aqui dentro".
-- =============================================================================

alter table public.documentos alter column nome_arquivo drop not null;
alter table public.documentos alter column caminho      drop not null;

-- 'unique' em Postgres deixa passar vários nulos, então muitos registros sem
-- arquivo convivem sem brigar pela mesma chave.

comment on column public.documentos.caminho is
  'Caminho no bucket privado. NULO = registrado na conferência, PDF ainda não anexado.';


-- -----------------------------------------------------------------------------
-- Um registro por pessoa × tipo (menos atestado, que se repete)
-- -----------------------------------------------------------------------------
-- Sem isto, clicar "tem" duas vezes na mesma linha criaria dois ASOs com datas
-- diferentes e a view de pendência passaria a depender de qual veio primeiro.
-- Atestado fica de fora porque a pessoa tem vários, um por afastamento — e ele
-- se identifica pela coluna abaixo, não por uma subconsulta: índice em Postgres
-- só aceita expressão imutável, e "qual é o id do tipo atestado" não é.
alter table public.documentos
  add column if not exists repetivel boolean not null default false;

comment on column public.documentos.repetivel is
  'true só em atestado: a pessoa tem vários, um por afastamento.';

-- carimba os atestados que já existam
update public.documentos d set repetivel = true
  from public.tipos_documento t
 where t.id = d.tipo_id and t.codigo = 'atestado' and d.repetivel = false;

create unique index if not exists documentos_um_por_tipo
  on public.documentos ("colaboradorId", tipo_id)
  where tipo_id is not null and repetivel = false;


-- -----------------------------------------------------------------------------
-- A situação passa a distinguir "sem papel" de "sem documento"
-- -----------------------------------------------------------------------------
-- 'faltando'  = a pessoa não tem o documento (o "-" da agenda)
-- 'sem o PDF' = tem, está válido, mas o arquivo não foi anexado
--
-- DERRUBAR ANTES DE RECRIAR, e não 'create or replace'. O Postgres só deixa
-- ACRESCENTAR coluna no fim de uma view existente: como 'tem_arquivo' entra no
-- meio, ele leria a mudança como "renomear situacao para tem_arquivo" e recusa
-- o arquivo inteiro (ERRO 42P16). View não guarda dado, só a definição, então
-- derrubar não custa nada — mas a ordem importa: painel_prazos depende desta.
drop view if exists public.painel_prazos;
drop view if exists public.documentos_pendencias;

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
  case
    when d.id is null                                   then 'faltando'
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
where public.eh_admin()
  and c.status <> 'inativo'
  and t.codigo <> 'atestado'          -- atestado é cobrado pela falta, não pela matriz
  and (
    t.aplica_a = 'todos'
    or (t.aplica_a = 'motorista'            and c.funcao ilike '%motorista%')
    or (t.aplica_a = 'encarregado'          and c.funcao ilike '%encarregado%')
    or (t.aplica_a = 'motorista_encarregado'
        and (c.funcao ilike '%motorista%' or c.funcao ilike '%encarregado%'))
  );

grant select on public.documentos_pendencias to authenticated;
revoke all on public.documentos_pendencias from anon;


-- -----------------------------------------------------------------------------
-- O painel aprende a nova situação
-- -----------------------------------------------------------------------------
-- 'sem o PDF' NÃO entra no painel. É a diferença entre as duas views:
-- documentos_pendencias sabe que o arquivo falta (uma tela de anexo vai usar
-- isso); o painel só mostra o que compromete a conformidade. Depois da
-- Importação em massa seriam ~640 linhas de "falta o PDF" — o painel viraria
-- ruído no primeiro dia e ninguém olharia mais para o treinamento vencido.
create or replace view public.painel_prazos
with (security_invoker = true) as
select
  p.colaborador_id, p.colaborador,
  p.documento                             as assunto,
  p.situacao,
  p.valido_ate                            as data_limite,
  p.dias_restantes,
  case p.situacao
    when 'vencido'              then 1
    when 'faltando'             then 2
    when 'vence em breve'       then 3
    when 'sem data de validade' then 4
    else 9
  end                                     as urgencia,
  'documento'                             as origem
from public.documentos_pendencias p
where p.situacao not in ('ok', 'sem o PDF')

union all

select
  a.colaborador_id, a.colaborador,
  'Atestado da falta de ' || to_char(a.dia_da_falta, 'DD/MM/YYYY'),
  'atestado nao anexado',
  a.dia_da_falta, -a.dias_atras, 1, 'atestado'
from public.atestados_faltando a

union all

select
  s.colaborador_id, s.colaborador,
  'Falta não lançada (atestado de ' || to_char(s.emitido_em, 'DD/MM') || ')',
  'falta nao lancada',
  s.valido_ate, (s.valido_ate - current_date), 3, 'atestado'
from public.atestados_sem_falta s;

grant select on public.painel_prazos to authenticated;
revoke all on public.painel_prazos from anon;


-- -----------------------------------------------------------------------------
-- Conferência
-- -----------------------------------------------------------------------------
select * from (
  select 1 as ord, 'registro sem arquivo' as item,
    case when (select count(*) from information_schema.columns
                where table_schema='public' and table_name='documentos'
                  and column_name in ('caminho','nome_arquivo')
                  and is_nullable='YES') = 2
         then 'ok — dá para registrar a validade sem o PDF'
         else '>>> AINDA EXIGE ARQUIVO <<<' end
  union all
  select 2, 'um registro por pessoa x tipo',
    case when exists (select 1 from pg_indexes where schemaname='public'
                       and indexname='documentos_um_por_tipo')
         then 'ok' else '>>> FALTANDO <<<' end
  union all
  select 3, 'painel ignora falta de PDF',
    case when (select count(*) from pg_views where schemaname='public'
                and viewname='painel_prazos' and definition like '%sem o PDF%') = 1
         then 'ok — falta de arquivo nao polui o painel' else '>>> VIEW ANTIGA <<<' end
  union all
  select 4, 'painel responde',
    (select count(*)::text || ' pendencias hoje' from public.painel_prazos)
) t order by ord;
