/* =============================================================================
   Setor do colaborador — quem é do TRECHO e quem não é
   -----------------------------------------------------------------------------
   O Incovia nasceu para o trecho: equipe, programação, integração, relatório.
   O pessoal do escritório, da oficina etc. também tem pasta de documentos,
   falta, atestado e férias — mas não entra em equipe nenhuma. Se aparecesse
   no quadro do dia, viraria um "livre" eterno e bagunçaria os contadores.

   Regra única: setor que "entra na programação" (o trecho, ou vazio, de antes
   da coluna existir) = campo. Qualquer outro = cadastro, documentos, faltas e férias; nada de Programação,
   Integrações, Calendário, Relatórios e exports da programação.
   ============================================================================= */

import { setorEhCampo } from './parametros';

/* Os setores moram em Parâmetros (lista 'setor'). Cada um diz se "entra na
   programação" — o Trecho sempre entra; um setor novo pode entrar também
   (ex.: um segundo trecho) ou ser só administrativo, como o Escritório.
   O nome continua `ehTrecho` porque é a palavra que o app inteiro usa para
   "vai a campo". */
export { listaSetores, rotuloDoSetor as rotuloSetor, corDoSetor as corSetor, setorEhCampo } from './parametros';

export const setorDe = (c) => c?.setor || 'trecho';
export const ehTrecho = (c) => setorEhCampo(setorDe(c));

/**
 * O mesmo `db`, só com o pessoal do trecho (e as faltas, pátio, férias,
 * histórico e integrações deles). É o que a Programação, o Calendário, os
 * Relatórios e os exports da programação enxergam. Programações e veículos
 * passam inteiros: ninguém de fora do trecho está em equipe.
 */
export function soTrecho(db) {
  const fora = new Set((db.colaboradores || []).filter((c) => !ehTrecho(c)).map((c) => c.id));
  if (!fora.size) return db;
  const dele = (lista, campo = 'colaboradorId') => (lista || []).filter((x) => !fora.has(x[campo]));
  return {
    ...db,
    colaboradores: (db.colaboradores || []).filter((c) => !fora.has(c.id)),
    faltas: dele(db.faltas),
    patio: dele(db.patio),
    ferias: dele(db.ferias),
    historicoStatus: dele(db.historicoStatus),
    integracoes: dele(db.integracoes, 'colaborador_id'),
  };
}
