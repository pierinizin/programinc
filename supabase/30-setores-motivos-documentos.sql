-- =============================================================================
-- 30 · Parâmetros, parte 3 — setores, motivos de ausência, situações do
--      veículo e documentos exigidos por setor
-- -----------------------------------------------------------------------------
-- O que ainda era fixo e passa a ser editado em Sistema → Parâmetros:
--
--   setor              Trecho, Escritório, Oficina, Outros… e os que você criar.
--                      `valor` é o código gravado em colaboradores.setor (não
--                      muda nunca); o nome que aparece, a cor e se o setor
--                      "entra na programação" ficam em `dados`.
--   motivo_falta       Os motivos de ausência (falta justificada, folga…).
--                      Mesmo esquema: código fixo, nome e cor em `dados`, mais
--                      "conta no absenteísmo".
--   situacao_veiculo   Disponível, Em uso, Manutenção, Inativo… `valor` é o
--                      texto gravado em veiculos.status (renomear muda nos
--                      veículos); `dados.comportamento` diz o que a
--                      programação faz com ele: livre / aviso / fora.
--
-- E o catálogo de documentos (tipos_documento) ganha:
--   setores  text[]   quais setores precisam entregar. Começa preenchido com
--                     a regra de hoje (vale_trecho / vale_fora_trecho).
--   ativo    boolean  desativar tira da cobrança sem apagar o que já foi
--                     entregue.
--
-- "Entra na programação" substitui o teste fixo `setor = 'trecho'` em todo o
-- banco: regras do RH, pendências de documentos.
--
-- Precisa do 28 e do 29 rodados antes. Pode rodar mais de uma vez.
-- =============================================================================


-- 1. Listas novas --------------------------------------------------------------
alter table public.parametros_itens drop constraint if exists parametros_itens_lista_check;
alter table public.parametros_itens add constraint parametros_itens_lista_check
  check (lista in ('funcao', 'tipo_servico', 'motivo_nao_realizado', 'tipo_veiculo', 'tipo_licenca',
                   'setor', 'motivo_falta', 'situacao_veiculo'));

insert into public.parametros_itens (lista, valor, ordem, dados) values
  ('setor', 'trecho',     10, '{"rotulo":"Trecho","cor":"#E8A317","campo":true,"sistema":true}'),
  ('setor', 'escritorio', 20, '{"rotulo":"Escritório","cor":"#6E56CF","campo":false}'),
  ('setor', 'oficina',    30, '{"rotulo":"Oficina","cor":"#0E9F8F","campo":false}'),
  ('setor', 'outros',     40, '{"rotulo":"Outros","cor":"#8A8F98","campo":false}'),

  ('motivo_falta', 'falta_justificada',   10, '{"rotulo":"Falta justificada","cor":"#D6A30A","conta":true}'),
  ('motivo_falta', 'falta_injustificada', 20, '{"rotulo":"Falta injustificada","cor":"#F76B15","conta":true}'),
  ('motivo_falta', 'atestado_medico',     30, '{"rotulo":"Atestado médico","cor":"#E5484D","conta":true,"sistema":true}'),
  ('motivo_falta', 'licenca',             40, '{"rotulo":"Licença","cor":"#8E5BD0","conta":true,"sistema":true}'),
  ('motivo_falta', 'acidente_trabalho',   50, '{"rotulo":"Acidente de trabalho","cor":"#C2298A","conta":true}'),
  ('motivo_falta', 'ferias',              60, '{"rotulo":"Férias","cor":"#2F81F7","conta":false,"sistema":true}'),
  ('motivo_falta', 'folga',               70, '{"rotulo":"Folga","cor":"#7C8790","conta":false}'),
  ('motivo_falta', 'outro',               80, '{"rotulo":"Outro","cor":"#12A594","conta":true}'),

  ('situacao_veiculo', 'Disponível', 10, '{"comportamento":"livre","sistema":"disponivel"}'),
  ('situacao_veiculo', 'Em uso',     20, '{"comportamento":"livre","sistema":"em_uso"}'),
  ('situacao_veiculo', 'Manutenção', 30, '{"comportamento":"aviso"}'),
  ('situacao_veiculo', 'Inativo',    40, '{"comportamento":"fora","sistema":"inativo"}')
on conflict (lista, valor) do nothing;

-- O que já está gravado e não estava na lista entra também, no fim.
insert into public.parametros_itens (lista, valor, ordem, dados)
select distinct 'setor', setor, 500, jsonb_build_object('rotulo', initcap(replace(setor, '_', ' ')), 'cor', '#8A8F98', 'campo', false)
  from public.colaboradores where trim(coalesce(setor, '')) <> ''
on conflict (lista, valor) do nothing;

insert into public.parametros_itens (lista, valor, ordem, dados)
select distinct 'motivo_falta', motivo, 500, jsonb_build_object('rotulo', initcap(replace(motivo, '_', ' ')), 'cor', '#12A594', 'conta', true)
  from public.faltas where trim(coalesce(motivo, '')) <> ''
on conflict (lista, valor) do nothing;

insert into public.parametros_itens (lista, valor, ordem, dados)
select distinct 'situacao_veiculo', status, 500, '{"comportamento":"livre"}'::jsonb
  from public.veiculos where trim(coalesce(status, '')) <> ''
on conflict (lista, valor) do nothing;


-- 2. As travas antigas saem — quem manda agora é a lista ----------------------
alter table public.colaboradores drop constraint if exists colaboradores_setor_check;
alter table public.veiculos      drop constraint if exists veiculos_status_check;


-- 3. "Entra na programação" ----------------------------------------------------
-- Setor que não está na lista (não devia acontecer) segue a regra antiga:
-- só 'trecho' vai a campo.
create or replace function public.setor_eh_campo(p_setor text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select (dados->>'campo')::boolean from public.parametros_itens
      where lista = 'setor' and valor = coalesce(p_setor, 'trecho')),
    coalesce(p_setor, 'trecho') = 'trecho');
$$;
revoke execute on function public.setor_eh_campo(text) from public, anon;
grant execute on function public.setor_eh_campo(text) to authenticated;

-- Mesma assinatura do 22: as regras que já usam esta função passam a seguir
-- a marcação do setor sem precisar recriar nada.
create or replace function public.colaborador_fora_do_trecho(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select not public.setor_eh_campo(setor) from public.colaboradores where id = cid), false);
$$;

-- RH: cadastra e edita só quem é de setor que NÃO entra na programação.
drop policy if exists colaboradores_insert_rh on public.colaboradores;
create policy colaboradores_insert_rh on public.colaboradores
  for insert to authenticated
  with check (public.eh_rh() and not public.setor_eh_campo(setor));

drop policy if exists colaboradores_update_rh on public.colaboradores;
create policy colaboradores_update_rh on public.colaboradores
  for update to authenticated
  using (public.eh_rh() and not public.setor_eh_campo(setor))
  with check (public.eh_rh() and not public.setor_eh_campo(setor));

-- O trecho não pode deixar de ir a campo nem ser apagado: é o setor que o
-- app inteiro usa como padrão.
create or replace function public.proteger_setor_trecho()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.lista = 'setor' and old.valor = 'trecho' then
      raise exception 'O setor Trecho não pode ser apagado.';
    end if;
    return old;
  end if;
  if new.lista = 'setor' and new.valor = 'trecho'
     and (coalesce((new.dados->>'campo')::boolean, false) = false or new.ativo = false) then
    raise exception 'O setor Trecho sempre entra na programação.';
  end if;
  if tg_op = 'UPDATE' and old.lista = 'setor' and old.valor = 'trecho' and new.valor <> 'trecho' then
    raise exception 'O código do Trecho não muda (o nome que aparece, sim).';
  end if;
  return new;
end
$$;
drop trigger if exists parametros_itens_proteger_trecho on public.parametros_itens;
create trigger parametros_itens_proteger_trecho
  before update or delete on public.parametros_itens
  for each row execute function public.proteger_setor_trecho();


-- 4. Documentos: por setor, e com "desativar" ----------------------------------
-- As marcações iniciais só são gravadas na PRIMEIRA vez (quando a coluna
-- nasce), para uma segunda rodada não desfazer o que você ajustar depois.
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'tipos_documento'
                    and column_name = 'setores') then
    alter table public.tipos_documento add column setores text[];

    update public.tipos_documento t
       set setores = array(
         select s.valor from public.parametros_itens s
          where s.lista = 'setor'
            and ((coalesce((s.dados->>'campo')::boolean, false) and t.vale_trecho)
              or (not coalesce((s.dados->>'campo')::boolean, false) and t.vale_fora_trecho))
          order by s.ordem);
  end if;
end
$$;
alter table public.tipos_documento add column if not exists ativo boolean not null default true;

comment on column public.tipos_documento.setores is
  'Setores (códigos de parametros_itens lista=setor) que precisam entregar. Nulo = regra antiga (vale_trecho / vale_fora_trecho).';

-- A regra, num lugar só. A marca por função (só quem dirige, só encarregado)
-- vale para quem é de setor que entra na programação — como sempre foi.
create or replace function public.documento_vale_para(t public.tipos_documento, p_setor text, p_funcao text)
returns boolean language sql stable set search_path = public as $$
  select t.ativo
     and case
           when t.setores is not null then coalesce(p_setor, 'trecho') = any (t.setores)
           when public.setor_eh_campo(p_setor) then t.vale_trecho
           else t.vale_fora_trecho
         end
     and (
       not public.setor_eh_campo(p_setor)
       or t.aplica_a = 'todos'
       or (t.aplica_a = 'motorista'   and public.funcao_dirige(p_funcao))
       or (t.aplica_a = 'encarregado' and public.funcao_lidera(p_funcao))
       or (t.aplica_a = 'motorista_encarregado'
           and (public.funcao_dirige(p_funcao) or public.funcao_lidera(p_funcao)))
     );
$$;
revoke execute on function public.documento_vale_para(public.tipos_documento, text, text) from public, anon;
grant execute on function public.documento_vale_para(public.tipos_documento, text, text) to authenticated;

-- Mesmas colunas de antes ('create or replace' basta).
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
  and public.documento_vale_para(t, c.setor, c.funcao);


-- 5. Renomear situação do veículo muda nos veículos ---------------------------
-- Setor e motivo de ausência têm código fixo: o nome muda só em `dados`,
-- direto pela tela, sem passar por aqui.
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
  if it.lista in ('setor', 'motivo_falta') then
    raise exception 'Esta lista tem código fixo: mude o nome que aparece (dados.rotulo).';
  end if;
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
  elsif it.lista = 'situacao_veiculo' then
    update public.veiculos set status = novo where status = it.valor;
  end if;
end
$$;
revoke execute on function public.renomear_parametro(uuid, text) from public, anon;
grant execute on function public.renomear_parametro(uuid, text) to authenticated;

notify pgrst, 'reload schema';


-- 6. Conferência ---------------------------------------------------------------
select 'setores' as item, (select string_agg(dados->>'rotulo', ', ' order by ordem) from public.parametros_itens where lista = 'setor') as situacao
union all
select 'motivos de ausência', (select count(*)::text from public.parametros_itens where lista = 'motivo_falta')
union all
select 'situações do veículo', (select count(*)::text from public.parametros_itens where lista = 'situacao_veiculo')
union all
select 'documentos com setores', (select count(*)::text || ' de ' || (select count(*) from public.tipos_documento) from public.tipos_documento where setores is not null)
union all
select 'trava antiga de setor', case when exists (select 1 from pg_constraint where conname = 'colaboradores_setor_check') then '>>> AINDA EXISTE <<<' else 'removida' end;
