/* =============================================================================
   Sincronia com o banco — contas puras (sem React, sem Supabase)
   -----------------------------------------------------------------------------
   Antes, quase toda gravação (e todo aviso do tempo real) fazia o app baixar
   de novo a tabela inteira — ou as 13. Com o servidor levando 1–3 s por
   pedido, isso empilhava o dia todo. Agora:

   • o aviso do tempo real já traz a linha que mudou: aplicarEvento() encaixa
     só ela na lista que está na tela;
   • a abertura vem num pedido só (carga_inicial, 26-carga-unica.sql) e
     separarCarga() distribui o resultado.
   ============================================================================= */

/**
 * Encaixa um aviso do tempo real ({ eventType, new, old }) numa lista.
 * INSERT/UPDATE: entra ou substitui pela id. DELETE: sai pela id.
 * `manter(antiga, nova)` deixa preservar campos que só existem na tela
 * (ex.: a URL assinada da foto do colaborador).
 * Devolve a MESMA lista quando nada muda — o React não redesenha à toa.
 */
export function aplicarEvento(lista, payload, manter = null) {
  const atual = Array.isArray(lista) ? lista : [];
  const tipo = payload?.eventType;
  if (tipo === 'DELETE') {
    const id = payload.old?.id;
    if (id == null || !atual.some((r) => r.id === id)) return atual;
    return atual.filter((r) => r.id !== id);
  }
  const nova = payload?.new;
  if (!nova || nova.id == null) return atual;
  const i = atual.findIndex((r) => r.id === nova.id);
  if (i === -1) return [...atual, nova];
  const linha = manter ? manter(atual[i], nova) : nova;
  const copia = atual.slice();
  copia[i] = linha;
  return copia;
}

/** O aviso trouxe o que precisa para ser aplicado direto? (Senão, recarrega a tabela.) */
export function eventoAplicavel(payload) {
  if (!payload || payload.errors?.length) return false;
  if (payload.eventType === 'DELETE') return payload.old?.id != null;
  return payload.new?.id != null;
}

/** Pendências na ordem do painel: urgência, prazo, nome. */
export function ordenarPendencias(lista) {
  return (lista || []).slice().sort((a, b) => (
    (a.urgencia - b.urgencia)
    || ((a.dias_restantes ?? 9999) - (b.dias_restantes ?? 9999))
    || String(a.colaborador).localeCompare(String(b.colaborador), 'pt-BR')
  ));
}

/** Tabelas que o tempo real acompanha quando o banco não informa (antes do 26). */
export const TEMPO_REAL_PADRAO = [
  'colaboradores', 'veiculos', 'programacoes', 'faltas', 'perfis', 'patio',
  'grupos_integracao', 'grupos_integracao_contratos', 'integracoes',
];
