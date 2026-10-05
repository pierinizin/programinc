-- =============================================================================
-- 19 · Integrações: guardar por qual EMPRESA a pessoa foi integrada num grupo
-- -----------------------------------------------------------------------------
-- Um grupo de integração junta contratos do mesmo canteiro em contratantes
-- diferentes (ex.: "EPR - V.CAFÉ" da FIRCON e da GARCIA). A integração vale
-- para o grupo inteiro, mas é útil saber QUEM integrou cada pessoa.
--
--   via_contrato_id — o contrato (dentro do grupo) pelo qual a pessoa foi
--                     integrada. Só faz sentido em linha de grupo; em linha
--                     de contrato solto fica nulo. Se o contrato for apagado,
--                     a integração continua valendo e só perde essa marca.
--
-- Pode rodar mais de uma vez sem problema.
-- =============================================================================

alter table public.integracoes
  add column if not exists via_contrato_id uuid
    references public.contratos(id) on delete set null;

comment on column public.integracoes.via_contrato_id is
  'Em integração de grupo: o contrato (empresa) pelo qual a pessoa foi integrada.';

-- Faz o Supabase enxergar a coluna nova na hora (sem esperar o cache).
notify pgrst, 'reload schema';
