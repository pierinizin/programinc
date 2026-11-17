-- =============================================================================
-- 29 · Ausência de horas (pátio e atestado de horas) e licenças
-- -----------------------------------------------------------------------------
-- 1. Falta de HORAS sem equipe — faltas.ausente_de / ausente_ate.
--    Até aqui meio período só existia dentro de uma equipe (programacao_id +
--    trabalhou_de/ate). Quem estava no PÁTIO, ou foi ao médico de manhã sem
--    estar escalado, não tinha como. Agora a falta pode guardar o intervalo em
--    que a pessoa ficou FORA. A conta das horas usa o horário padrão de
--    Parâmetros (o almoço não conta).
--
-- 2. Atestado de horas — documentos.hora_de / hora_ate.
--    Atestado de um dia só com intervalo (ex.: 07:30–11:00) gera UMA falta de
--    horas naquele dia, em vez de dia inteiro, e não bloqueia a pessoa para
--    equipes.
--
-- 3. Licença — novo tipo de documento 'licenca', com tipo (documentos.subtipo:
--    paternidade, casamento…) e período (dias ou horas), arquivo opcional,
--    igual ao atestado. Gera as faltas com motivo 'licenca'. Os tipos de
--    licença viram uma lista em Parâmetros.
--
-- Precisa do 28 (parâmetros) rodado antes. Pode rodar mais de uma vez.
-- =============================================================================


-- 1. Faltas: intervalo de ausência ------------------------------------------
alter table public.faltas add column if not exists ausente_de  time;
alter table public.faltas add column if not exists ausente_ate time;

alter table public.faltas drop constraint if exists faltas_parcial_coerente;
alter table public.faltas add constraint faltas_parcial_coerente check (
  -- dia inteiro
  (programacao_id is null and trabalhou_de is null and trabalhou_ate is null
   and ausente_de is null and ausente_ate is null)
  or
  -- meio período dentro de uma equipe (o que trabalhou)
  (programacao_id is not null and trabalhou_de is not null and trabalhou_ate is not null
   and trabalhou_de < trabalhou_ate and ausente_de is null and ausente_ate is null)
  or
  -- horas fora, sem equipe (pátio, consulta, atestado de horas)
  (programacao_id is null and trabalhou_de is null and trabalhou_ate is null
   and ausente_de is not null and ausente_ate is not null and ausente_de < ausente_ate)
);


-- 2. Documentos: horas e tipo de licença --------------------------------------
alter table public.documentos add column if not exists hora_de  time;
alter table public.documentos add column if not exists hora_ate time;
alter table public.documentos add column if not exists subtipo  text;

alter table public.documentos drop constraint if exists documentos_horas_coerentes;
alter table public.documentos add constraint documentos_horas_coerentes check (
  (hora_de is null and hora_ate is null)
  or (hora_de is not null and hora_ate is not null and hora_de < hora_ate
      and emitido_em is not null and emitido_em = valido_ate)
);


-- 3. Tipo de documento "Licença" ---------------------------------------------
-- Não entra na conferência de pasta (não é obrigatório, e a regra de
-- pendência abaixo deixa de fora como já deixava o atestado).
insert into public.tipos_documento
  (codigo, nome, categoria, aplica_a, obrigatorio, vence, meses_validade, ordem)
values ('licenca', 'Licença', 'outro', 'todos', false, false, null, 165)
on conflict (codigo) do nothing;
update public.tipos_documento set vale_trecho = false, vale_fora_trecho = false
 where codigo = 'licenca';


-- 4. Tipos de licença em Parâmetros ------------------------------------------
alter table public.parametros_itens drop constraint if exists parametros_itens_lista_check;
alter table public.parametros_itens add constraint parametros_itens_lista_check
  check (lista in ('funcao', 'tipo_servico', 'motivo_nao_realizado', 'tipo_veiculo', 'tipo_licenca'));

insert into public.parametros_itens (lista, valor, ordem) values
  ('tipo_licenca', 'Maternidade', 10),
  ('tipo_licenca', 'Paternidade', 20),
  ('tipo_licenca', 'Casamento', 30),
  ('tipo_licenca', 'Falecimento na família', 40),
  ('tipo_licenca', 'Doação de sangue', 50),
  ('tipo_licenca', 'Serviço militar / Justiça', 60),
  ('tipo_licenca', 'Outra', 70)
on conflict (lista, valor) do nothing;

-- Renomear um tipo de licença muda também nas licenças já lançadas.
create or replace function public.renomear_parametro(p_id uuid, p_novo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  it public.parametros_itens;
  novo text := trim(p_novo);
begin
  if not public.eh_admin() then raise exception 'Só o administrador muda parâmetros.'; end if;
  if novo is null or novo = '' then raise exception 'O nome não pode ficar vazio.'; end if;
  select * into it from public.parametros_itens where id = p_id;
  if not found then raise exception 'Item não encontrado.'; end if;
  if it.valor = novo then return; end if;
  if exists (select 1 from public.parametros_itens where lista = it.lista and valor = novo) then
    raise exception 'Já existe "%" nesta lista.', novo;
  end if;

  update public.parametros_itens set valor = novo, updated_at = now() where id = p_id;
  if it.lista = 'funcao' then
    update public.colaboradores set funcao = novo where funcao = it.valor;
  elsif it.lista = 'tipo_servico' then
    update public.programacoes set "tipoEquipe" = novo where "tipoEquipe" = it.valor;
  elsif it.lista = 'motivo_nao_realizado' then
    update public.programacoes set "motivoNaoExecucao" = novo where "motivoNaoExecucao" = it.valor;
  elsif it.lista = 'tipo_veiculo' then
    update public.veiculos set tipo = novo where tipo = it.valor;
  elsif it.lista = 'tipo_licenca' then
    update public.documentos d set subtipo = novo
      from public.tipos_documento t
     where t.id = d.tipo_id and t.codigo = 'licenca' and d.subtipo = it.valor;
  end if;
end
$$;
revoke execute on function public.renomear_parametro(uuid, text) from public, anon;
grant execute on function public.renomear_parametro(uuid, text) to authenticated;


-- 5. O gatilho que gera as faltas: atestado E licença, dias OU horas ---------
-- Mantém as faltas que já existem (e o que se anotou nelas): só tira as que
-- saíram do período, ajusta as horas das que ficaram e cria as que faltam.
create or replace function public.sincronizar_faltas_atestado()
returns trigger
language plpgsql as $$
declare
  cod text;
  mot text;
  d date;
begin
  select t.codigo into cod from public.tipos_documento t where t.id = new.tipo_id;

  if cod not in ('atestado', 'licenca') or new.emitido_em is null or new.valido_ate is null then
    delete from public.faltas where origem_documento_id = new.id;
    return new;
  end if;
  mot := case cod when 'licenca' then 'licenca' else 'atestado_medico' end;

  delete from public.faltas
   where origem_documento_id = new.id
     and (data < new.emitido_em or data > new.valido_ate);

  update public.faltas
     set motivo = mot, ausente_de = new.hora_de, ausente_ate = new.hora_ate
   where origem_documento_id = new.id
     and (motivo is distinct from mot
          or ausente_de is distinct from new.hora_de
          or ausente_ate is distinct from new.hora_ate);

  for d in select generate_series(new.emitido_em, new.valido_ate, interval '1 day')::date
  loop
    insert into public.faltas ("colaboradorId", data, motivo, origem_documento_id, ausente_de, ausente_ate)
    select new."colaboradorId", d, mot, new.id, new.hora_de, new.hora_ate
     where not exists (
       select 1 from public.faltas f
        where f."colaboradorId" = new."colaboradorId" and f.data = d
     );
  end loop;

  return new;
end;
$$;

-- O gatilho (documentos_sincroniza_faltas, do 13) continua o mesmo: sem
-- "update of <colunas>", então já reage às colunas novas.


-- 6. Pendência de documentos: licença fica de fora, como atestado -------------
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
  and t.codigo not in ('atestado', 'licenca')   -- cobrados pela falta, não pela matriz
  and (
    (c.setor <> 'trecho' and t.vale_fora_trecho)
    or (
      c.setor = 'trecho' and t.vale_trecho
      and (
        t.aplica_a = 'todos'
        or (t.aplica_a = 'motorista'            and public.funcao_dirige(c.funcao))
        or (t.aplica_a = 'encarregado'          and public.funcao_lidera(c.funcao))
        or (t.aplica_a = 'motorista_encarregado'
            and (public.funcao_dirige(c.funcao) or public.funcao_lidera(c.funcao)))
      )
    )
  );

notify pgrst, 'reload schema';


-- 7. Conferência --------------------------------------------------------------
select 'faltas.ausente_de' as item,
       case when exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'faltas' and column_name = 'ausente_de')
            then 'ok' else '>>> FALTANDO <<<' end as situacao
union all
select 'documentos.hora_de',
       case when exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'documentos' and column_name = 'hora_de')
            then 'ok' else '>>> FALTANDO <<<' end
union all
select 'tipo Licença', case when exists (select 1 from public.tipos_documento where codigo = 'licenca') then 'ok' else '>>> FALTANDO <<<' end
union all
select 'tipos de licença em Parâmetros', (select count(*)::text from public.parametros_itens where lista = 'tipo_licenca');
