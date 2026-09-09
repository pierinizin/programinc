/* =============================================================================
   Motivos de falta — vocabulário único
   -----------------------------------------------------------------------------
   O valor gravado em faltas.motivo é texto livre no banco (sem check), então o
   que mantém tudo falando a mesma língua é esta lista. Ela alimenta o
   formulário de falta, o tooltip do quadro e o relatório de faltas. Enquanto
   estava duplicada dentro do QuadroDia, qualquer motivo novo aparecia em um
   lugar e não no outro.

   'ferias' entra aqui porque o app grava falta com esse motivo sozinho, quando
   alguém de férias é arrastado pra zona de Faltas — a pessoa continua
   disponível pra escala, então a falta é como o dia fica registrado.
   ============================================================================= */

export const MOTIVOS_FALTA = [
  ['atestado_medico', 'Atestado médico'],
  ['falta_justificada', 'Falta justificada'],
  ['falta_injustificada', 'Falta injustificada'],
  ['licenca', 'Licença'],
  ['acidente_trabalho', 'Acidente de trabalho'],
  ['ferias', 'Férias'],
  ['outro', 'Outro'],
];

/* Rótulo legível de um motivo. Motivo fora da lista (base antiga, ou digitado
   direto no banco) ainda mostra alguma coisa legível, só sem a tradução. */
export function rotuloMotivo(valor) {
  const achado = MOTIVOS_FALTA.find(([v]) => v === valor);
  return achado ? achado[1] : String(valor || '').replace(/_/g, ' ');
}
