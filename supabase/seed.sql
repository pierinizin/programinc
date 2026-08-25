-- =============================================================================
-- INCOVIA — Seed de exemplo (APENAS banco vazio de teste)
-- =============================================================================
-- NÃO RODE ISTO NO BANCO DE PRODUÇÃO.
--
-- Os ids fixos aqui ('1111...', 'aaaa...') não colidem com os ids aleatórios
-- dos seus registros reais, então o "on conflict do nothing" NÃO protege nada:
-- as 4 pessoas e 3 veículos fictícios seriam simplesmente somados aos reais, e
-- a programação de exemplo apareceria no dia de HOJE para a equipe inteira ver.
--
-- Por isso o bloco abaixo aborta tudo se encontrar qualquer dado nas tabelas.
-- Para reverter uma execução acidental, use o desfazer no fim do arquivo.
-- =============================================================================

begin;

do $$
declare
  n integer;
begin
  select (select count(*) from public.colaboradores)
       + (select count(*) from public.veiculos)
       + (select count(*) from public.programacoes)
       + (select count(*) from public.faltas)
    into n;

  if n > 0 then
    raise exception
      'ABORTADO: o banco já tem % registro(s). Este seed é só para banco vazio.', n;
  end if;
end
$$;

insert into public.colaboradores (id, nome, apelido, funcao, telefone, status) values
  ('11111111-1111-1111-1111-111111111111', 'André Souza',     'Dedé',   'Operador de máquina de pintura', '(11) 93210-9876', 'ativo'),
  ('22222222-2222-2222-2222-222222222222', 'Fernando Gomes',  'Nando',  'Ajudante de produção',           '(11) 90987-6543', 'ativo'),
  ('33333333-3333-3333-3333-333333333333', 'Lucas Ferreira',  'Lucão',  'Motorista de Veículos Médios',   '(11) 94321-0987', 'ativo'),
  ('44444444-4444-4444-4444-444444444444', 'Mário Santos',    'Marião', 'Encarregado',                    '(11) 99876-5432', 'ativo')
on conflict (id) do nothing;

insert into public.veiculos (id, placa, modelo, ano, tipo, status) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ABC-1234', 'VW Delivery 11.180', 2022, 'Caminhão',    'Disponível'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'DEF-5678', 'Ford Cargo 816',     2021, 'Caminhão',    'Disponível'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'GHI-9012', 'Toyota Hilux',       2023, 'Caminhonete', 'Disponível')
on conflict (id) do nothing;

insert into public.programacoes (
  id, "data", "tipoEquipe", cidade, contratante, engenheiro, "encarregadoId",
  "membroIds", "veiculoIds", "statusExecucao", "motivoNaoExecucao", observacoes,
  "horarioInicio", "horarioInicioObra", "horarioSaidaAlmoco",
  "horarioRetornoAlmoco", "horarioFimObra", "horarioSaida"
) values (
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  current_date,
  'Pintura - Mecânica e Manual',
  'ARAPONGAS',
  'MOTIVA',
  'Eng. Responsável',
  '44444444-4444-4444-4444-444444444444',
  array['44444444-4444-4444-4444-444444444444',
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333']::uuid[],
  array['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb']::uuid[],
  'CONCLUÍDO',
  null,
  'Trecho finalizado conforme programação.',
  '06:30', '07:30', '11:30', '13:00', '17:00', '18:00'
)
on conflict (id) do nothing;

insert into public.faltas (id, "colaboradorId", "data", motivo, observacao) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   '11111111-1111-1111-1111-111111111111',
   current_date - 1,
   'atestado_medico',
   'Repouso de 1 dia.')
on conflict (id) do nothing;

commit;


-- =============================================================================
-- DESFAZER — se este seed for rodado por engano, rode o bloco abaixo.
-- Ele remove SOMENTE os ids fixos criados aqui; nenhum dado real é tocado.
-- =============================================================================
-- delete from public.faltas        where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
-- delete from public.programacoes  where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
-- delete from public.veiculos      where id in (
--   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
--   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
--   'cccccccc-cccc-cccc-cccc-cccccccccccc');
-- delete from public.colaboradores where id in (
--   '11111111-1111-1111-1111-111111111111',
--   '22222222-2222-2222-2222-222222222222',
--   '33333333-3333-3333-3333-333333333333',
--   '44444444-4444-4444-4444-444444444444');
