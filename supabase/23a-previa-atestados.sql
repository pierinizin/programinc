-- =============================================================================
-- 23a · PRÉVIA — o que o 23-atestado-unico.sql vai converter (não muda nada)
-- -----------------------------------------------------------------------------
-- Lista as faltas lançadas à mão como "Atestado médico" (sem documento),
-- juntando os dias SEGUIDOS da mesma pessoa num afastamento só. Cada linha
-- desta lista vira UM atestado, com o período de/até e sem o arquivo.
--
-- Só olha falta de dia inteiro: a de meio período (falta parcial, presa a uma
-- equipe) continua como está — ela é contada em horas, não em dias.
--
-- Rode, confira, e só depois rode o 23-atestado-unico.sql.
-- =============================================================================

with soltas as (
  select f.id, f."colaboradorId" as colaborador_id, f.data
    from public.faltas f
   where f.motivo = 'atestado_medico'
     and f.origem_documento_id is null
     and f.programacao_id is null
),
ilhas as (
  -- dias seguidos têm a mesma "âncora" (data menos a posição na fila)
  select colaborador_id, data,
         data - (row_number() over (partition by colaborador_id order by data))::int as ancora
    from soltas
)
select c.nome                                   as pessoa,
       case when c.setor = 'trecho' then 'Trecho' else 'Fora do trecho' end as onde,
       to_char(min(i.data), 'DD/MM/YYYY')        as de,
       to_char(max(i.data), 'DD/MM/YYYY')        as ate,
       count(*)                                  as dias
  from ilhas i
  join public.colaboradores c on c.id = i.colaborador_id
 group by c.nome, c.setor, i.colaborador_id, i.ancora
 order by min(i.data) desc, c.nome;
