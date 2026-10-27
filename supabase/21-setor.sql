-- =============================================================================
-- 21 · Setor do colaborador: quem é do TRECHO e quem não é
-- -----------------------------------------------------------------------------
-- O pessoal do escritório, da oficina etc. passa a ter cadastro, pasta de
-- documentos, faltas, atestados e férias no Incovia — sem entrar na
-- Programação, nas Integrações, no Calendário nem nos Relatórios.
--
--   colaboradores.setor         'trecho' (padrão: todo mundo que já existe),
--                               'escritorio', 'oficina' ou 'outros'.
--   tipos_documento.vale_trecho       o documento é cobrado de quem é do trecho
--                                     (a regra por função continua valendo).
--   tipos_documento.vale_fora_trecho  o documento é cobrado de quem NÃO é.
--
-- Fora do trecho cobra só o básico: RG/CPF, Foto 3x4, Ficha de Registro,
-- e-Social, Tipagem sanguínea, ASO, CNH e a nova Carteira de vacinação.
-- NRs, Ficha de EPI, Ordem de Serviço e Direção defensiva ficam só no trecho.
-- Atestado continua como hoje: cobrado pela falta, para todo mundo.
--
-- A Carteira de vacinação entra cobrada só de quem é de fora do trecho. Para
-- cobrar do trecho também, rode depois:
--   update public.tipos_documento set vale_trecho = true where codigo = 'vacina';
--
-- Pode rodar mais de uma vez: na segunda não muda nada nem desfaz ajustes.
-- =============================================================================

-- 1. Setor no cadastro --------------------------------------------------------
alter table public.colaboradores
  add column if not exists setor text not null default 'trecho';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'colaboradores_setor_check') then
    alter table public.colaboradores
      add constraint colaboradores_setor_check
      check (setor in ('trecho', 'escritorio', 'oficina', 'outros'));
  end if;
end
$$;

comment on column public.colaboradores.setor is
  'trecho = vai a campo (Programação, Integrações, Relatórios). Os demais só têm cadastro, documentos, faltas e férias.';


-- 2. Para quem vale cada documento --------------------------------------------
-- As marcas iniciais só são gravadas na PRIMEIRA vez (quando a coluna nasce),
-- para uma segunda rodada não desfazer o que você ajustar depois.
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'tipos_documento'
                    and column_name = 'vale_fora_trecho') then
    alter table public.tipos_documento
      add column vale_trecho boolean not null default true,
      add column vale_fora_trecho boolean not null default false;

    update public.tipos_documento
       set vale_fora_trecho = true
     where codigo in ('rg_cpf', 'foto_3x4', 'ficha_registro', 'esocial', 'tipagem', 'aso', 'cnh');
  end if;
end
$$;

insert into public.tipos_documento
  (codigo, nome, categoria, aplica_a, vence, meses_validade, ordem, vale_trecho, vale_fora_trecho)
values
  ('vacina', 'Carteira de vacinação', 'saude', 'todos', false, null, 65, false, true)
on conflict (codigo) do nothing;


-- 3. A lista de pendências aprende a regra ------------------------------------
-- Mesmas colunas da versão do 14 (por isso 'create or replace' basta e o
-- painel_prazos, que depende desta, não precisa ser recriado). Só o `where`
-- mudou: fora do trecho segue vale_fora_trecho; no trecho, vale_trecho + a
-- regra por função de sempre.
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
where public.eh_admin()
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

grant select on public.documentos_pendencias to authenticated;
revoke all on public.documentos_pendencias from anon;

-- Faz o Supabase enxergar as colunas novas na hora.
notify pgrst, 'reload schema';


-- 4. Conferência ---------------------------------------------------------------
select * from (
  select 1 as ord, 'coluna setor no cadastro' as item,
    case when exists (select 1 from information_schema.columns
                       where table_schema='public' and table_name='colaboradores' and column_name='setor')
         then 'ok' else '>>> FALTANDO <<<' end as situacao
  union all
  select 2, 'colaboradores por setor',
    (select string_agg(setor || ': ' || n, ' · ' order by setor)
       from (select setor, count(*) n from public.colaboradores group by setor) x)
  union all
  select 3, 'documentos cobrados fora do trecho',
    (select string_agg(nome, ', ' order by ordem) from public.tipos_documento where vale_fora_trecho)
  union all
  select 4, 'painel de prazos responde',
    (select count(*)::text || ' pendencias hoje' from public.painel_prazos)
) t order by ord;
