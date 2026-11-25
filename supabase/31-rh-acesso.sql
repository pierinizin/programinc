-- =============================================================================
-- 31 · RH com acesso ao pessoal todo (trecho incluído) e ao catálogo de
--      documentos
-- -----------------------------------------------------------------------------
-- No 22 o RH só mexia no cadastro e nas faltas de quem é de FORA do trecho.
-- Na prática o RH cuida de todo mundo, e a saída era dar cargo de admin. Agora:
--
--   O RH PASSA A PODER, de qualquer pessoa (trecho incluído):
--     • cadastrar e editar colaborador (inclusive ativar/inativar);
--     • trocar a foto;
--     • lançar, editar e apagar falta avulsa.
--   E em Parâmetros (Sistema → Parâmetros), só a parte de pessoal:
--     • Documentos exigidos (o catálogo de tipos de documento);
--     • Tipos de licença;
--     • Motivos de ausência.
--
--   CONTINUA SÓ DO ADMIN: apagar colaborador, setores, funções, regras da
--   equipe, tipos de serviço, veículos, usuários e cargos. Programação,
--   equipes e pátio continuam com admin e editor.
--
-- Precisa do 22 e do 30 rodados antes. Pode rodar mais de uma vez.
-- =============================================================================


-- 1. Cadastro de colaborador: todo mundo ----------------------------------------
drop policy if exists colaboradores_insert_rh on public.colaboradores;
create policy colaboradores_insert_rh on public.colaboradores
  for insert to authenticated
  with check (public.eh_rh());

drop policy if exists colaboradores_update_rh on public.colaboradores;
create policy colaboradores_update_rh on public.colaboradores
  for update to authenticated
  using (public.eh_rh())
  with check (public.eh_rh());

-- O histórico de ativo/inativo é gravado pelo gatilho do cadastro com o
-- usuário de quem mexeu: o RH precisa poder escrever ali, de todos.
drop policy if exists historico_status_rh on public.colaboradores_status_historico;
create policy historico_status_rh on public.colaboradores_status_historico
  for all to authenticated
  using (public.eh_rh())
  with check (public.eh_rh());


-- 2. Faltas: todas -------------------------------------------------------------
drop policy if exists faltas_insert_rh on public.faltas;
create policy faltas_insert_rh on public.faltas
  for insert to authenticated with check (public.eh_rh());

drop policy if exists faltas_update_rh on public.faltas;
create policy faltas_update_rh on public.faltas
  for update to authenticated using (public.eh_rh()) with check (public.eh_rh());

drop policy if exists faltas_delete_rh on public.faltas;
create policy faltas_delete_rh on public.faltas
  for delete to authenticated using (public.eh_rh());


-- 3. Foto: de todos ------------------------------------------------------------
drop policy if exists "fotos_enviar_rh" on storage.objects;
create policy "fotos_enviar_rh" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos' and public.eh_rh());

drop policy if exists "fotos_atualizar_rh" on storage.objects;
create policy "fotos_atualizar_rh" on storage.objects
  for update to authenticated
  using (bucket_id = 'fotos' and public.eh_rh())
  with check (bucket_id = 'fotos' and public.eh_rh());


-- 4. Catálogo de documentos ----------------------------------------------------
-- Atestado e licença são do sistema (geram falta): o RH não apaga nem troca
-- o código deles.
drop policy if exists tipos_documento_escrita_rh on public.tipos_documento;
create policy tipos_documento_escrita_rh on public.tipos_documento
  for all to authenticated
  using (public.eh_rh() and codigo not in ('atestado', 'licenca'))
  with check (public.eh_rh() and codigo not in ('atestado', 'licenca'));


-- 5. Parâmetros de pessoal -----------------------------------------------------
drop policy if exists parametros_itens_escrita_rh on public.parametros_itens;
create policy parametros_itens_escrita_rh on public.parametros_itens
  for all to authenticated
  using ((select public.eh_rh()) and lista in ('tipo_licenca', 'motivo_falta'))
  with check ((select public.eh_rh()) and lista in ('tipo_licenca', 'motivo_falta'));

-- Renomear tipo de licença (muda nas licenças já lançadas) também é do RH.
create or replace function public.renomear_parametro(p_id uuid, p_novo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  it public.parametros_itens;
  novo text := trim(p_novo);
begin
  select * into it from public.parametros_itens where id = p_id;
  if not found then raise exception 'Item não encontrado.'; end if;
  if not (public.eh_admin() or (public.eh_rh() and it.lista in ('tipo_licenca', 'motivo_falta'))) then
    raise exception 'Você não tem permissão para mudar esta lista.';
  end if;
  if novo is null or novo = '' then raise exception 'O nome não pode ficar vazio.'; end if;
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
select policyname as regra, 'ok' as situacao
  from pg_policies
 where policyname in ('colaboradores_insert_rh', 'colaboradores_update_rh', 'historico_status_rh',
                      'faltas_insert_rh', 'faltas_update_rh', 'faltas_delete_rh',
                      'fotos_enviar_rh', 'fotos_atualizar_rh',
                      'tipos_documento_escrita_rh', 'parametros_itens_escrita_rh')
 order by 1;
