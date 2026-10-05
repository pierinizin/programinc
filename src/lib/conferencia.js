/* =============================================================================
   Conferência de dados — as contas por trás da tela "Conferência"
   -----------------------------------------------------------------------------
   Duas conferências (as que o Gabriel escolheu):

   1) Equipe repetida: duas ou mais equipes IGUAIS no mesmo dia — mesmo
      encarregado, tipo, cidade e contratante. Quase sempre é cópia duplicada
      sem querer, e conta dobrado no Controle, no Status e nos Relatórios.

      Qual fica: a que tem falta de meio período ligada (apagar a equipe
      apagaria a falta junto — on delete cascade), depois a com apontamento
      lançado, depois a com status já dado, depois a com contrato, depois a
      com mais gente e veículo. Se MAIS DE UMA cópia tem falta de meio
      período, a tela não oferece excluir: só "Abrir o dia".

   2) Obras sem contrato: contratante cadastrado que TEM contrato, mas a obra
      ficou sem nenhum ligado. Agrupado por contratante, pra ligar em lote.

   Tudo puro (sem React).
   ============================================================================= */

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/\s+/g, ' ').trim();

function pontos(p, comParcial) {
  return (comParcial.has(p.id) ? 10000 : 0)
    + (p.apontamentoLancado ? 1000 : 0)
    + (p.statusExecucao && p.statusExecucao !== 'EXECUTANDO' ? 100 : 0)
    + (p.contrato_id ? 50 : 0)
    + new Set(p.membroIds || []).size * 2
    + (p.veiculoIds || []).length;
}

/**
 * [{ chave, data, encarregadoId, tipo, cidade, contratante, fica, sobram, bloqueado }]
 * `fica` = a equipe que permanece; `sobram` = as cópias que dá pra excluir.
 * `bloqueado` = mais de uma cópia tem falta de meio período (não sugerir excluir).
 */
export function equipesRepetidas(programacoes, faltas) {
  const comParcial = new Set((faltas || []).filter((f) => f.programacao_id).map((f) => f.programacao_id));
  const grupos = new Map();
  for (const p of programacoes || []) {
    if (!p.data || !p.encarregadoId) continue;
    const contratante = p.concessionaria_id || norm(p.contratante);
    const chave = [p.data, p.encarregadoId, norm(p.tipoEquipe), norm(p.cidade), contratante].join('|');
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(p);
  }
  const out = [];
  for (const [chave, lista] of grupos) {
    if (lista.length < 2) continue;
    const ordenada = lista.slice().sort((a, b) => pontos(b, comParcial) - pontos(a, comParcial));
    const [fica, ...sobram] = ordenada;
    out.push({
      chave,
      data: fica.data,
      encarregadoId: fica.encarregadoId,
      tipo: fica.tipoEquipe || 'Sem tipo',
      cidade: fica.cidade || 'sem cidade',
      contratante: fica.contratante || '',
      fica,
      sobram,
      bloqueado: lista.filter((p) => comParcial.has(p.id)).length > 1,
    });
  }
  return out.sort((a, b) => b.data.localeCompare(a.data));
}

/**
 * Obras de contratantes que têm contrato cadastrado, mas ficaram sem nenhum.
 * [{ conc, contratos, obras, de, ate }] — contratos ativos primeiro.
 */
export function obrasSemContrato(programacoes, concessionarias, contratos) {
  const concDe = new Map((concessionarias || []).map((c) => [c.id, c]));
  const ctrsDe = new Map();
  for (const k of contratos || []) {
    if (!ctrsDe.has(k.concessionaria_id)) ctrsDe.set(k.concessionaria_id, []);
    ctrsDe.get(k.concessionaria_id).push(k);
  }
  const grupos = new Map();
  for (const p of programacoes || []) {
    if (!p.concessionaria_id || p.contrato_id) continue;
    if (!ctrsDe.has(p.concessionaria_id)) continue;
    if (!grupos.has(p.concessionaria_id)) grupos.set(p.concessionaria_id, []);
    grupos.get(p.concessionaria_id).push(p);
  }
  return [...grupos.entries()]
    .map(([id, obras]) => {
      const datas = obras.map((p) => p.data).filter(Boolean).sort();
      return {
        conc: concDe.get(id) || { id, sigla: 'Contratante removido' },
        contratos: ctrsDe.get(id).slice().sort((a, b) => (b.ativo ? 1 : 0) - (a.ativo ? 1 : 0)
          || String(a.numero).localeCompare(String(b.numero), 'pt-BR')),
        obras: obras.slice().sort((a, b) => String(b.data).localeCompare(String(a.data))),
        de: datas[0],
        ate: datas[datas.length - 1],
      };
    })
    .sort((a, b) => b.obras.length - a.obras.length);
}
