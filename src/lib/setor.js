/* =============================================================================
   Setor do colaborador — quem é do TRECHO e quem não é
   -----------------------------------------------------------------------------
   O Incovia nasceu para o trecho: equipe, programação, integração, relatório.
   O pessoal do escritório, da oficina etc. também tem pasta de documentos,
   falta, atestado e férias — mas não entra em equipe nenhuma. Se aparecesse
   no quadro do dia, viraria um "livre" eterno e bagunçaria os contadores.

   Regra única: setor 'trecho' (ou vazio, de antes da coluna existir) = campo.
   Qualquer outro = cadastro, documentos, faltas e férias; nada de Programação,
   Integrações, Calendário, Relatórios e exports da programação.
   ============================================================================= */

export const SETORES = [
  { valor: 'trecho', rotulo: 'Trecho' },
  { valor: 'escritorio', rotulo: 'Escritório' },
  { valor: 'oficina', rotulo: 'Oficina' },
  { valor: 'outros', rotulo: 'Outros' },
];

const ROTULO = Object.fromEntries(SETORES.map((s) => [s.valor, s.rotulo]));

export const setorDe = (c) => c?.setor || 'trecho';
export const ehTrecho = (c) => setorDe(c) === 'trecho';
export const rotuloSetor = (valor) => ROTULO[valor || 'trecho'] || valor;

/** Funções que o trecho usa (lista fixa, como sempre foi). */
export const FUNCOES_TRECHO = [
  'Encarregado', 'Motorista de Veículos Médios', 'Ajudante de produção', 'Operador de máquina de pintura',
];

/** Sugestões para quem não é do trecho — a função é livre, isto só ajuda a digitar. */
export const FUNCOES_SUGERIDAS = [
  'Auxiliar administrativo', 'Assistente administrativo', 'Mecânico', 'Almoxarife',
  'Técnico de segurança do trabalho', 'Auxiliar de serviços gerais',
];

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
