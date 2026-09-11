/* =============================================================================
   Integrações — regras compartilhadas entre a tela e o App
   -----------------------------------------------------------------------------
   Uma integração vale para um contrato solto OU para um grupo de contratos
   (grupos_integracao). Fora da tela de Integrações ninguém enxerga o grupo —
   Programação, Relatórios e o cadastro de Contratantes continuam vendo cada
   contrato separado. O grupo existe só para juntar a LISTA DE INTEGRADOS de
   contratos do mesmo canteiro em contratantes diferentes (ex.: "VIAS DO CAFÉ"
   tem contrato na EPR e na MOTIVA, e quem integra lá vale para os dois).
   ============================================================================= */

export const DIAS_VENCENDO = 30;

/** 'valido' | 'vencendo' | 'vencido', a partir da data de validade (ISO). */
export function statusValidade(validadeIso, agora = new Date()) {
  if (!validadeIso) return 'vencido';
  const dias = Math.round((new Date(`${validadeIso}T12:00:00`) - agora) / 86400000);
  if (dias < 0) return 'vencido';
  if (dias <= DIAS_VENCENDO) return 'vencendo';
  return 'valido';
}

/** Validade padrão pra quem acabou de ser integrado: um ano a partir de hoje. */
export function validadePadrao(hoje = new Date()) {
  const d = new Date(hoje);
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Monta as "unidades" que aparecem na tela: um card por grupo e um card por
 * contrato que ainda não está em nenhum grupo. Cada unidade já vem com os
 * contratos que ela representa e a lista de integrados resolvida — a tela não
 * precisa saber a diferença entre grupo e contrato solto pra desenhar o card.
 */
export function montarUnidades({
  contratos, concessionarias, gruposIntegracao, gruposIntegracaoContratos, integracoes,
}) {
  const contratoPorId = Object.fromEntries((contratos || []).map((k) => [k.id, k]));
  const concPorId = Object.fromEntries((concessionarias || []).map((c) => [c.id, c]));
  const contratoIdsEmGrupo = new Set((gruposIntegracaoContratos || []).map((v) => v.contrato_id));

  const integracoesPorContrato = {};
  const integracoesPorGrupo = {};
  (integracoes || []).forEach((i) => {
    if (i.contrato_id) (integracoesPorContrato[i.contrato_id] ||= []).push(i);
    else if (i.grupo_id) (integracoesPorGrupo[i.grupo_id] ||= []).push(i);
  });

  function comContratante(k) {
    const c = k ? concPorId[k.concessionaria_id] : null;
    return { ...k, sigla: c?.sigla || '?', cor: c?.cor || '#FFC72C' };
  }

  const grupos = (gruposIntegracao || [])
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .map((g) => {
      const contratosDoGrupo = (gruposIntegracaoContratos || [])
        .filter((v) => v.grupo_id === g.id)
        .map((v) => contratoPorId[v.contrato_id])
        .filter(Boolean)
        .map(comContratante);
      return {
        tipo: 'grupo',
        id: g.id,
        titulo: g.nome,
        contratos: contratosDoGrupo,
        integrados: integracoesPorGrupo[g.id] || [],
      };
    });

  const soltos = (contratos || [])
    .filter((k) => !contratoIdsEmGrupo.has(k.id))
    .map(comContratante)
    .sort((a, b) => a.sigla.localeCompare(b.sigla, 'pt-BR') || a.numero.localeCompare(b.numero, 'pt-BR'))
    .map((k) => ({
      tipo: 'contrato',
      id: k.id,
      titulo: k.numero,
      contratos: [k],
      integrados: integracoesPorContrato[k.id] || [],
    }));

  return [...grupos, ...soltos];
}

/**
 * Junta listas de integrados de contratos diferentes numa só, mantendo a
 * validade MAIS LONGA quando a mesma pessoa aparece em mais de uma lista —
 * ninguém perde tempo de integração por causa de como o cadastro estava
 * organizado antes de virar grupo.
 */
export function mesclarIntegrados(listasDeIntegrados) {
  const porPessoa = new Map();
  listasDeIntegrados.flat().forEach((i) => {
    const atual = porPessoa.get(i.colaborador_id);
    if (!atual || String(i.validade) > String(atual.validade)) porPessoa.set(i.colaborador_id, i);
  });
  return Array.from(porPessoa.values());
}
