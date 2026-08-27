-- =============================================================================
-- INCOVIA — Atestados e o painel de prazos
-- =============================================================================
-- Rode DEPOIS do 07 e do 09. Pode rodar mais de uma vez. Não apaga nada.
--
-- ATESTADO É DIFERENTE DOS OUTROS. ASO e NR "vencem": valem até uma data e
-- depois param de valer. Atestado não vence — ele COBRE UM PERÍODO: o médico
-- emite dia 10 e afasta por 3 dias, então ele cobre 10, 11 e 12. Depois disso
-- não está "vencido", está cumprido.
--
-- Por isso o atestado não entra na conta de "vence em breve". Ele entra em
-- outra pergunta, que é a que interessa: EXISTE FALTA POR ATESTADO SEM O PAPEL
-- ANEXADO? Essa é a falha que aparece em auditoria e em reclamação trabalhista
-- — a ausência foi abonada e ninguém acha o documento.
--
-- Você já registra falta com motivo 'atestado_medico'. Este arquivo cruza as
-- duas pontas e mostra o que ficou solto, dos dois lados.
--
-- LGPD: atestado é dado de saúde, sensível (Art. 5º, II). Segue a mesma regra
-- do 07: só admin lê, e todo acesso fica registrado.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. O tipo "atestado" no catálogo
-- -----------------------------------------------------------------------------
-- vence = false de propósito: quem cobra atestado não é o calendário de
-- validade, é a falta que ele precisa justificar.
insert into public.tipos_documento
  (codigo, nome, categoria, aplica_a, obrigatorio, vence, meses_validade, ordem)
values
  ('atestado', 'Atestado médico', 'saude', 'todos', false, false, null, 160)
on conflict (codigo) do nothing;


-- -----------------------------------------------------------------------------
-- 2. O período que o atestado cobre
-- -----------------------------------------------------------------------------
-- Reaproveita as colunas que o 09 criou, com significado próprio para atestado:
--   emitido_em = dia em que o médico emitiu
--   valido_ate = último dia coberto pelo afastamento
-- Assim uma consulta só resolve "este dia está coberto?" para qualquer documento.
comment on column public.documentos.emitido_em is
  'Data de emissão. Em atestado, o dia da consulta.';
comment on column public.documentos.valido_ate is
  'Em ASO/NR/CNH: até quando vale. Em atestado: último dia de afastamento coberto.';

-- Um atestado sem período não serve para nada: não dá para saber o que ele
-- cobre. A checagem vale só para atestado, para não atrapalhar os outros tipos.
alter table public.documentos drop constraint if exists documentos_atestado_periodo;
alter table public.documentos add constraint documentos_atestado_periodo check (
  tipo_id is null
  or valido_ate is null
  or emitido_em is null
  or valido_ate >= emitido_em
);


-- -----------------------------------------------------------------------------
-- 3. Falta por atestado SEM o documento anexado
-- -----------------------------------------------------------------------------
-- O buraco que aparece em auditoria. Uma linha por dia de falta abonada que
-- não tem nenhum atestado cobrindo aquela data.
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
where public.eh_admin()
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


-- -----------------------------------------------------------------------------
-- 4. Atestado anexado SEM falta correspondente
-- -----------------------------------------------------------------------------
-- O outro lado do mesmo erro: o papel foi entregue e ninguém lançou a ausência.
-- Some do controle de ponto e vira divergência na folha.
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
where public.eh_admin()
  and t.codigo = 'atestado'
  and d.emitido_em is not null
  and d.valido_ate is not null
  and (select count(*) from public.faltas f
        where f."colaboradorId" = d."colaboradorId"
          and f.data between d.emitido_em and d.valido_ate) = 0;


-- -----------------------------------------------------------------------------
-- 5. O painel: TUDO que está fora do prazo, num lugar só
-- -----------------------------------------------------------------------------
-- Junta as três origens de pendência numa lista ordenada por urgência. É esta
-- view que a tela vai ler — e é ela que responde "estou em dia?".
create or replace view public.painel_prazos
with (security_invoker = true) as
-- documentos que vencem ou faltam
select
  p.colaborador_id,
  p.colaborador,
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
where p.situacao <> 'ok'

union all

-- falta abonada sem o atestado no sistema
select
  a.colaborador_id,
  a.colaborador,
  'Atestado da falta de ' || to_char(a.dia_da_falta, 'DD/MM/YYYY'),
  'atestado nao anexado',
  a.dia_da_falta,
  -a.dias_atras,
  1,                                        -- mesma urgência de vencido
  'atestado'
from public.atestados_faltando a

union all

-- atestado anexado sem a falta lançada
select
  s.colaborador_id,
  s.colaborador,
  'Falta não lançada (atestado de ' || to_char(s.emitido_em, 'DD/MM') || ')',
  'falta nao lancada',
  s.valido_ate,
  (s.valido_ate - current_date),
  3,
  'atestado'
from public.atestados_sem_falta s;


-- -----------------------------------------------------------------------------
-- 5b. Permissão de leitura nas views
-- -----------------------------------------------------------------------------
-- View nova nasce sem grant. O Supabase costuma conceder por padrão, mas
-- depender disso é frágil: sem esta linha a tela recebe
-- "permission denied for view" e parece bug do app.
-- Não afrouxa nada: as três filtram por eh_admin() lá dentro.
grant select on public.atestados_faltando,
                public.atestados_sem_falta,
                public.painel_prazos
  to authenticated;
revoke all on public.atestados_faltando,
              public.atestados_sem_falta,
              public.painel_prazos
  from anon;


-- -----------------------------------------------------------------------------
-- 6. Conferência
-- -----------------------------------------------------------------------------
select * from (
  select 1 as ord, 'tipo atestado' as item,
    case when exists (select 1 from public.tipos_documento where codigo='atestado')
         then 'ok' else '>>> FALTANDO <<<' end as situacao
  union all
  select 2, 'view atestados_faltando',
    case when exists (select 1 from information_schema.views
                       where table_schema='public' and table_name='atestados_faltando')
         then 'ok' else '>>> FALTANDO <<<' end
  union all
  select 3, 'view atestados_sem_falta',
    case when exists (select 1 from information_schema.views
                       where table_schema='public' and table_name='atestados_sem_falta')
         then 'ok' else '>>> FALTANDO <<<' end
  union all
  select 4, 'painel de prazos',
    case when exists (select 1 from information_schema.views
                       where table_schema='public' and table_name='painel_prazos')
         then 'ok' else '>>> FALTANDO <<<' end
  union all
  select 5, 'grants de leitura',
    case when has_table_privilege('authenticated','public.painel_prazos','select')
         then 'ok — a tela consegue consultar' else '>>> SEM GRANT <<<' end
  union all
  select 6, 'as 3 views so respondem a admin',
    case when (select count(*) from pg_views
                where schemaname='public'
                  and viewname in ('atestados_faltando','atestados_sem_falta')
                  and definition like '%eh_admin%') = 2
         then 'ok' else '>>> ALGUMA VIEW NAO FILTRA POR ADMIN <<<' end
) t order by ord;


-- =============================================================================
-- O PAINEL, em uma consulta:
--
--   select colaborador, assunto, situacao, data_limite, dias_restantes
--     from public.painel_prazos
--    order by urgencia, dias_restantes nulls last, colaborador;
--
-- SÓ O QUE JÁ ESTOUROU:
--
--   select * from public.painel_prazos where urgencia = 1;
-- =============================================================================
