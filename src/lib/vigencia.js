/* =============================================================================
   Vigência dos contratos
   -----------------------------------------------------------------------------
   O contrato tem início e fim, mas o app só olhava a chave "ativo". Um
   contrato vencido em setembro continuava aparecendo como "vigente", e obra
   de outubro entrava nele sem ninguém perceber. Aqui fica a regra única de
   "como está esse contrato hoje" e "essa data cai dentro dele?", para a tela
   de Contratantes, o formulário e o quadro dizerem a mesma coisa.

   Datas em 'aaaa-mm-dd' (coluna date do Postgres) — comparar texto funciona.
   ============================================================================= */

export const DIAS_AVISO_VENCIMENTO = 30;   // "vence em N dias" a partir daqui

const MS_DIA = 86400000;
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / MS_DIA);
export const dataBRcurta = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

/**
 * Situação do contrato hoje:
 *   encerrado — desmarcado como ativo (decisão de alguém, nada a avisar)
 *   vencido   — ativo, mas o fim já passou      → precisa de atenção
 *   vencendo  — ativo, fim nos próximos 30 dias  → aviso
 *   futuro    — ativo, ainda não começou
 *   vigente   — ativo e dentro do período (ou sem datas)
 */
export function situacaoContrato(k, hoje) {
  if (!k?.ativo) return { tipo: 'encerrado', texto: 'encerrado' };
  if (k.fim && k.fim < hoje) {
    const d = diasEntre(k.fim, hoje);
    return { tipo: 'vencido', dias: d, texto: `vencido há ${d} ${d === 1 ? 'dia' : 'dias'}` };
  }
  if (k.inicio && k.inicio > hoje) {
    return { tipo: 'futuro', texto: `começa em ${dataBRcurta(k.inicio)}` };
  }
  if (k.fim) {
    const d = diasEntre(hoje, k.fim);
    if (d <= DIAS_AVISO_VENCIMENTO) {
      return { tipo: 'vencendo', dias: d, texto: d === 0 ? 'vence hoje' : `vence em ${d} ${d === 1 ? 'dia' : 'dias'}` };
    }
  }
  return { tipo: 'vigente', texto: 'vigente' };
}

/** A data cai fora do período do contrato? null quando está dentro (ou sem datas). */
export function foraDaVigencia(k, data) {
  if (!k || !data) return null;
  if (k.inicio && data < k.inicio) return { lado: 'antes', texto: `antes do início do contrato (${dataBRcurta(k.inicio)})` };
  if (k.fim && data > k.fim) return { lado: 'depois', texto: `depois do fim do contrato (${dataBRcurta(k.fim)})` };
  return null;
}
