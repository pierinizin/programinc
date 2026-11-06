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
  ['folga', 'Folga'],
  ['outro', 'Outro'],
];

/* Motivos que NÃO são ausência de verdade — combinados com antecedência.
   Ficam fora da conta de absenteísmo no relatório por padrão (o interruptor
   "Incluir férias e folgas" traz de volta). */
export const MOTIVOS_FORA_DA_CONTA = ['ferias', 'folga'];

/* Rótulo legível de um motivo. Motivo fora da lista (base antiga, ou digitado
   direto no banco) ainda mostra alguma coisa legível, só sem a tradução. */
export function rotuloMotivo(valor) {
  const achado = MOTIVOS_FALTA.find(([v]) => v === valor);
  return achado ? achado[1] : String(valor || '').replace(/_/g, ' ');
}

/* Cor de cada motivo — o contorno da pessoa na zona de Ausências do quadro.
   Atestado no vermelho de sempre; falta injustificada (a que mais pesa) em
   laranja, a justificada em dourado; férias azul, folga cinza. */
export const COR_MOTIVO = {
  atestado_medico: '#E5484D',
  falta_injustificada: '#F76B15',
  falta_justificada: '#D6A30A',
  licenca: '#8E5BD0',
  acidente_trabalho: '#C2298A',
  ferias: '#2F81F7',
  folga: '#7C8790',
  outro: '#12A594',
};
export const corMotivo = (valor) => COR_MOTIVO[valor] || COR_MOTIVO.outro;
