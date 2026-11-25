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

import { itensDe, itemMotivo, rotuloItem } from './parametros';

/* A lista mora em Parâmetros → Motivos de ausência (lista 'motivo_falta'):
   o código (`valor`) é o que fica gravado em faltas.motivo e nunca muda; nome,
   cor e "conta no absenteísmo" ficam em `dados`. Sem o 30 rodado, vale o
   padrão de parametros.js — exatamente a lista que existia aqui.

   Alguns códigos o app usa sozinho e não podem sumir: atestado_medico e
   licenca (gerados pelo documento), ferias (arrastar quem está de férias).
   Por isso esses vêm marcados como `sistema`. */

/** [[codigo, rotulo], ...] dos motivos ativos, na ordem de Parâmetros. */
export function motivosFalta() {
  return itensDe('motivo_falta').map((x) => [x.valor, rotuloItem(x)]);
}

/** O motivo entra na conta de absenteísmo? Férias e folga, por padrão, não. */
export function contaNoAbsenteismo(valor) {
  const i = itemMotivo(valor);
  if (i) return i.dados?.conta !== false;
  return valor !== 'ferias' && valor !== 'folga';
}

/* Rótulo legível de um motivo. Motivo fora da lista (base antiga, ou digitado
   direto no banco) ainda mostra alguma coisa legível, só sem a tradução. */
export function rotuloMotivo(valor) {
  const i = itemMotivo(valor);
  return i ? rotuloItem(i) : String(valor || '').replace(/_/g, ' ');
}

/* Cor de cada motivo — o contorno da pessoa na zona de Ausências do quadro. */
export const corMotivo = (valor) => itemMotivo(valor)?.dados?.cor || itemMotivo('outro')?.dados?.cor || '#12A594';
