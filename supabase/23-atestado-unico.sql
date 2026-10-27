-- =============================================================================
-- 23 · Atestado de um jeito só
-- -----------------------------------------------------------------------------
-- Antes havia dois caminhos:
--   (1) "Registrar atestado": período + arquivo, que gera a falta de cada dia;
--   (2) falta avulsa com motivo "Atestado médico": um dia, sem documento.
-- O certo é o (1). Este arquivo:
--
--   1. CONVERTE as faltas do jeito (2) em atestados do jeito (1): dias seguidos
--      da mesma pessoa viram um atestado só, com o período, sem o arquivo. As
--      faltas continuam as mesmas (mesmos dias, mesmo motivo), só passam a
--      pertencer ao atestado. Rode antes o 23a para ver a lista.
--   2. FECHA o jeito (2): falta de dia inteiro com motivo "Atestado médico" só
--      existe se veio de um atestado. (Meio período continua livre — é falta
--      parcial, contada em horas.)
--   3. Cria a pendência "Atestado sem o arquivo", para o RH anexar depois.
--
-- Atestado continua sendo só de admin e RH (LGPD). Precisa do 22 rodado antes.
-- Pode rodar mais de uma vez: na segunda não converte nada de novo.
-- =============================================================================


-- 1. Converter -----------------------------------------------------------------
drop table if exists _atestados_convertidos;
create temp table _atestados_convertidos (
  documento_id uuid, colaborador_id uuid, de date, ate date, dias int
);

do $$
declare
  r record;
  tipo record;
  novo uuid;
begin
  select id, nome, categoria into tipo from public.tipos_documento where codigo = 'atestado';
  if tipo.id is null then
    raise exception 'Não achei o tipo "atestado" — rode o 10-atestados.sql antes.';
  end if;

  for r in
    with soltas as (
      select f.id, f."colaboradorId" as colaborador_id, f.data
        from public.faltas f
       where f.motivo = 'atestado_medico'
         and f.origem_documento_id is null
         and f.programacao_id is null
    ),
    ilhas as (
      select id, colaborador_id, data,
             data - (row_number() over (partition by colaborador_id order by data))::int as ancora
        from soltas
    )
    select colaborador_id, min(data) as de, max(data) as ate, count(*)::int as dias,
           array_agg(id) as faltas
      from ilhas
     group by colaborador_id, ancora
  loop
    insert into public.documentos
      ("colaboradorId", tipo_id, categoria, titulo, emitido_em, valido_ate, repetivel, observacao)
    values
      (r.colaborador_id, tipo.id, tipo.categoria, tipo.nome, r.de, r.ate, true,
       'Convertido das faltas lançadas como "Atestado médico" (23-atestado-unico.sql)')
    returning id into novo;
    -- O gatilho do atestado só cria falta em dia vazio — aqui todos os dias já
    -- têm a falta, então ele não cria nada; elas só passam a pertencer ao atestado.
    update public.faltas set origem_documento_id = novo where id = any(r.faltas);
    insert into _atestados_convertidos values (novo, r.colaborador_id, r.de, r.ate, r.dias);
  end loop;
end
$$;


-- 2. Fechar o caminho antigo ---------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'faltas_atestado_vem_do_documento') then
    alter table public.faltas
      add constraint faltas_atestado_vem_do_documento
      check (motivo <> 'atestado_medico' or origem_documento_id is not null or programacao_id is not null);
  end if;
end
$$;


-- 3. Pendência "atestado sem o arquivo" ----------------------------------------
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
where public.pode_documentos()
  and t.codigo = 'atestado'
  and d.caminho is null
  and c.status <> 'inativo';

grant select on public.atestados_sem_arquivo to authenticated;
revoke all on public.atestados_sem_arquivo from anon;

-- Mesmas colunas do painel do 14 — só ganhou a 4ª origem no fim.
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
where p.situacao not in ('ok', 'sem o PDF', 'dispensado')

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
from public.atestados_sem_falta s

union all

select
  x.colaborador_id, x.colaborador,
  'Atestado de ' || to_char(x.emitido_em, 'DD/MM') || ' a ' || to_char(x.valido_ate, 'DD/MM/YYYY') || ' sem o arquivo',
  'atestado sem arquivo',
  x.valido_ate, null::int, 2, 'atestado'
from public.atestados_sem_arquivo x;

grant select on public.painel_prazos to authenticated;
revoke all on public.painel_prazos from anon;

notify pgrst, 'reload schema';


-- 4. O que foi convertido agora (vazio = nada a converter) --------------------
select c.nome                          as pessoa,
       to_char(a.de, 'DD/MM/YYYY')     as de,
       to_char(a.ate, 'DD/MM/YYYY')    as ate,
       a.dias,
       'virou atestado, sem o arquivo' as situacao
  from _atestados_convertidos a
  join public.colaboradores c on c.id = a.colaborador_id
 order by a.de desc, c.nome;
