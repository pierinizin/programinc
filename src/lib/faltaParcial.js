/* =============================================================================
   Falta parcial — a conta das horas
   -----------------------------------------------------------------------------
   Uma pessoa foi pra obra com a equipe mas trabalhou só um pedaço do dia
   (ex.: das 07:30 às 11:30, e à tarde foi ao médico). O banco guarda só o que
   ela TRABALHOU (faltas.trabalhou_de / trabalhou_ate) e em qual equipe estava
   (faltas.programacao_id). O que FALTOU é calculado aqui, comparando com a
   jornada da própria programação:

       Início obra → Saída almoço   +   Retorno almoço → Fim obra

   O almoço fica de fora das duas contas — nem é "trabalhado" nem "faltado".
   Calcular na hora (em vez de gravar) faz a conta acompanhar sozinha uma
   correção de horário feita depois na programação.

   Funções puras, sem React: dá pra conferir a conta sem abrir o navegador.
   ============================================================================= */

import { regra } from './parametros';

/** 'HH:MM' ou 'HH:MM:SS' (o Postgres devolve `time` com segundos) -> minutos. */
export function paraMinutos(hora) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hora || ''));
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** minutos -> 'HH:MM' */
export function paraHora(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 'HH:MM:SS' -> 'HH:MM', pra mostrar e pra preencher <input type="time">. */
export function horaCurta(hora) {
  const min = paraMinutos(hora);
  return min == null ? '' : paraHora(min);
}

/** 240 -> '4h' · 210 -> '3h30' · 45 -> '45min' */
export function duracaoTexto(min) {
  if (!min) return '0h';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}min`;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

/**
 * A jornada da equipe em intervalos de minutos: manhã e tarde.
 * Um intervalo com horário vazio ou invertido é descartado em vez de virar
 * conta negativa — com almoço mal preenchido, sobra a jornada que faz sentido.
 */
export function jornadaDe(eq) {
  const ini = paraMinutos(eq?.horarioInicioObra);
  const saiAlmoco = paraMinutos(eq?.horarioSaidaAlmoco);
  const voltaAlmoco = paraMinutos(eq?.horarioRetornoAlmoco);
  const fim = paraMinutos(eq?.horarioFimObra);

  const manha = [ini, saiAlmoco];
  const tarde = [voltaAlmoco, fim];
  const validos = [manha, tarde].filter(([a, b]) => a != null && b != null && a < b);
  if (validos.length) return validos;

  // Sem almoço utilizável: vale o dia corrido, do início ao fim da obra.
  if (ini != null && fim != null && ini < fim) return [[ini, fim]];
  return [];
}

export function somaMinutos(intervalos) {
  return intervalos.reduce((s, [a, b]) => s + (b - a), 0);
}

/**
 * O que ficou de fora do intervalo trabalhado [de, ate], dentro da jornada.
 * Devolve intervalos em minutos, já sem o almoço.
 */
export function intervalosFaltados(eq, de, ate) {
  const ini = paraMinutos(de);
  const fim = paraMinutos(ate);
  const jornada = jornadaDe(eq);
  if (ini == null || fim == null || ini >= fim) return jornada;

  const saida = [];
  for (const [a, b] of jornada) {
    if (ini > a) saida.push([a, Math.min(b, ini)]);      // chegou depois de começar
    if (fim < b) saida.push([Math.max(a, fim), b]);      // saiu antes de acabar
  }
  return saida.filter(([a, b]) => a < b);
}

/** Tudo que a tela precisa de uma falta parcial, calculado de uma vez. */
export function resumoParcial(eq, falta) {
  const faltou = intervalosFaltados(eq, falta.trabalhou_de, falta.trabalhou_ate);
  const minutosFaltados = somaMinutos(faltou);
  return {
    trabalhou: `${horaCurta(falta.trabalhou_de)}–${horaCurta(falta.trabalhou_ate)}`,
    faltou,
    faltouTexto: faltou.map(([a, b]) => `${paraHora(a)}–${paraHora(b)}`).join(' e '),
    minutosFaltados,
    duracao: duracaoTexto(minutosFaltados),
  };
}

/* -------------------------------------------------------------------------
   Falta de HORAS sem equipe (29-ausencia-horas-licencas.sql)
   -------------------------------------------------------------------------
   Quem está no pátio, ou foi ao médico sem estar escalado, não tem jornada
   de equipe para comparar. Aí o banco guarda o que ficou FORA
   (faltas.ausente_de / ausente_ate) e a conta usa o horário padrão de
   Parâmetros — de novo sem contar o almoço.
   ------------------------------------------------------------------------- */
export const ehHoras = (falta) => !!falta?.ausente_de && !falta?.programacao_id;

/** Meio período de qualquer tipo (na equipe ou de horas). Dia inteiro = false. */
export const ehParcial = (falta) => !!falta?.programacao_id || ehHoras(falta);

/** A "equipe" de mentira com o horário padrão — só para usar jornadaDe(). */
export const jornadaPadrao = () => ({ ...regra('horario_padrao') });

export function resumoHoras(falta) {
  const ini = paraMinutos(falta.ausente_de);
  const fim = paraMinutos(falta.ausente_ate);
  const jornada = jornadaDe(jornadaPadrao());
  const fora = ini == null || fim == null || ini >= fim ? []
    : jornada.length
      ? jornada.map(([a, b]) => [Math.max(a, ini), Math.min(b, fim)]).filter(([a, b]) => a < b)
      : [[ini, fim]];
  const minutosFaltados = somaMinutos(fora);
  return {
    trabalhou: '',
    fora: `${horaCurta(falta.ausente_de)}–${horaCurta(falta.ausente_ate)}`,
    faltou: fora,
    faltouTexto: fora.map(([a, b]) => `${paraHora(a)}–${paraHora(b)}`).join(' e '),
    minutosFaltados,
    duracao: duracaoTexto(minutosFaltados),
  };
}

/** Resumo de qualquer falta parcial; null se for dia inteiro (ou a equipe sumiu). */
export function resumoDaFalta(falta, progPorId) {
  if (ehHoras(falta)) return resumoHoras(falta);
  if (falta?.programacao_id) {
    const eq = progPorId?.get(falta.programacao_id);
    return eq ? resumoParcial(eq, falta) : null;
  }
  return null;
}
