/**
 * Tudo que se deriva de "o dia X": quem está escalado, quem sobrou, quem
 * faltou, quem ficou no pátio.
 *
 * Vive aqui porque DOIS lugares precisam disso: a fita do cabeçalho, que
 * mostra os contadores, e o quadro, que mostra as listas. Se cada um fizesse
 * a própria conta, um dia a fita diria "47 livres" e a lista mostraria 45 —
 * e ninguém saberia qual está certa.
 */
export function derivarDia(db, data) {
  const equipes = (db.programacoes || []).filter((p) => p.data === data);

  const faltosos = new Set();
  (db.faltas || []).forEach((f) => {
    if (f.data === data) faltosos.add(f.colaboradorId);
  });

  const noPatio = new Set();
  (db.patio || []).forEach((p) => {
    if (p.data === data) noPatio.add(p.colaboradorId);
  });

  const equipesDaPessoa = {};
  const equipesDoVeiculo = {};
  equipes.forEach((eq) => {
    new Set([eq.encarregadoId, ...(eq.membroIds || [])].filter(Boolean)).forEach((id) => {
      (equipesDaPessoa[id] = equipesDaPessoa[id] || []).push(eq);
    });
    (eq.veiculoIds || []).forEach((id) => {
      (equipesDoVeiculo[id] = equipesDoVeiculo[id] || []).push(eq);
    });
  });

  // Livre = ativo, sem equipe hoje, sem falta e fora do pátio. Quem está no
  // pátio veio trabalhar, mas já tem destino — não conta como disponível.
  const pessoasLivres = (db.colaboradores || []).filter(
    (c) => c.status !== 'inativo'
      && !equipesDaPessoa[c.id]
      && !noPatio.has(c.id)
      && !faltosos.has(c.id)
  );

  const veiculosLivres = (db.veiculos || []).filter(
    (v) => v.status !== 'Inativo' && !equipesDoVeiculo[v.id]
  );

  const pessoasEscaladas = Object.keys(equipesDaPessoa).length;

  return {
    equipes,
    faltosos,
    noPatio,
    equipesDaPessoa,
    equipesDoVeiculo,
    pessoasLivres,
    veiculosLivres,
    pessoasEscaladas,
  };
}
