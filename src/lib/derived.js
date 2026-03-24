import { getTeamLabel } from './helpers';

export function buildMaps(db) {
  return {
    colaboradores: Object.fromEntries(db.colaboradores.map((item) => [item.id, item])),
    veiculos: Object.fromEntries(db.veiculos.map((item) => [item.id, item])),
  };
}

export function getProgramacoesDoDia(programacoes, selectedDate) {
  return programacoes
    .filter((item) => item.data === selectedDate)
    .sort((a, b) => getTeamLabel(a).localeCompare(getTeamLabel(b), 'pt-BR'));
}

export function getColaboradoresComStats(db) {
  return db.colaboradores.map((colaborador) => {
    const escalas = db.programacoes.filter((item) => item.membroIds.includes(colaborador.id));
    const faltas = db.faltas.filter((item) => item.colaboradorId === colaborador.id);
    return {
      ...colaborador,
      escalas: escalas.length,
      faltas: faltas.length,
      cidades: new Set(escalas.map((item) => item.cidade)).size,
      ultimaEscala: [...escalas].sort((a, b) => b.data.localeCompare(a.data))[0] || null,
    };
  });
}

export function getVeiculosComStats(db) {
  return db.veiculos.map((veiculo) => {
    const historico = db.programacoes.filter((item) => item.veiculoIds.includes(veiculo.id));
    return {
      ...veiculo,
      usos: historico.length,
      cidades: new Set(historico.map((item) => item.cidade)).size,
      historico,
    };
  });
}

export function filterColaboradores(items, search) {
  const term = search.toLowerCase();
  return items.filter((item) => item.nome.toLowerCase().includes(term) || item.funcao.toLowerCase().includes(term));
}

export function filterVeiculos(items, search) {
  const term = search.toLowerCase();
  return items.filter((item) => item.placa.toLowerCase().includes(term) || item.modelo.toLowerCase().includes(term));
}

export function filterHistory(items, search) {
  const term = search.toLowerCase();
  return items.filter((item) => item.nome.toLowerCase().includes(term));
}
