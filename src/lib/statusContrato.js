/* =============================================================================
   Status por contrato — a conta por trás da aba "Status" dos Relatórios
   -----------------------------------------------------------------------------
   Um calendário de mês por contrato: cada dia mostra como ficaram as equipes
   daquele contrato (Concluído, Em campo, Não realizado + motivo). Dia com
   várias equipes e status diferentes vira um quadradinho dividido — uma faixa
   por equipe.

   "Sem baixa": dia que JÁ PASSOU e ainda está "Em campo". Ninguém marcou
   Concluído nem Não realizado, então não dá pra contar como trabalho feito.
   Fica separado (listrado em amarelo) pra ser cobrado, em vez de se esconder
   no azul de "em campo". O dia de HOJE em campo é normal — continua azul.

   Os contratos são agrupados do mesmo jeito do export de Controle
   (identificar, em controleContratante.js): o contrato da programação, ou o
   "sem contrato" do contratante dela.

   Tudo aqui é puro (sem React), pra dar pra testar sem navegador.
   ============================================================================= */
import { identificar } from './controleContratante';

export const ST = {
  ok: 'Concluído',
  campo: 'Em campo',
  pend: 'Sem baixa',
  erro: 'Não realizado',
};
const ORDEM = { ok: 0, campo: 1, pend: 2, erro: 3 };

const LETRA_MOTIVO = { 'CHUVA': 'C', 'MANUTENÇÃO': 'M', 'VIAGEM': 'V', 'INTEGRAÇÃO': 'I', 'OUTROS': 'O' };
export const letraMotivo = (m) => LETRA_MOTIVO[String(m || '').toUpperCase()]
  || String(m || 'O').trim().charAt(0).toUpperCase() || 'O';

export const hojeISO = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Status de UMA programação no calendário: { st, motivo }. */
export function classificar(p, hoje) {
  if (p.statusExecucao === 'CONCLUÍDO') return { st: 'ok', motivo: null };
  if (p.statusExecucao === 'NÃO FOI POSSÍVEL REALIZAR') {
    return { st: 'erro', motivo: p.motivoNaoExecucao || 'OUTROS' };
  }
  // EXECUTANDO (ou vazio, que o app trata como EXECUTANDO)
  return { st: p.data < hoje ? 'pend' : 'campo', motivo: null };
}

/** Meses ('aaaa-mm') que o intervalo De/Até toca, do mais antigo pro mais novo. */
export function mesesNoIntervalo(de, ate) {
  if (!de || !ate || ate < de) return [];
  const out = [];
  let [a, m] = de.slice(0, 7).split('-').map(Number);
  const [a2, m2] = ate.slice(0, 7).split('-').map(Number);
  while (a < a2 || (a === a2 && m <= m2)) {
    out.push(`${a}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; a += 1; }
  }
  return out;
}

/** Grade do mês: semanas de domingo a sábado, com null nas pontas. */
export function semanasDoMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  const primeiro = new Date(a, m - 1, 1).getDay();
  const nDias = new Date(a, m, 0).getDate();
  const cels = Array(primeiro).fill(null);
  for (let d = 1; d <= nDias; d += 1) cels.push(`${mes}-${String(d).padStart(2, '0')}`);
  while (cels.length % 7) cels.push(null);
  return cels;
}

/**
 * Um cartão por contrato que teve programação no mês (dentro do De/Até).
 * [{ chave, contrato, contratante, semContrato, dias: { iso: [{ p, st, motivo }] }, cont }]
 * cont = quantas EQUIPES-dia em cada status (uma equipe num dia = 1).
 */
export function calendariosDoMes({ programacoes, concessionarias, contratos, mes, de, ate, hoje }) {
  const siglaDe = new Map((concessionarias || []).map((c) => [c.id, String(c.sigla || '').trim()]));
  const contratoDe = new Map((contratos || []).map((k) => [k.id, k]));
  const cartoes = new Map();

  for (const p of programacoes || []) {
    if (!p.data || p.data.slice(0, 7) !== mes) continue;
    if ((de && p.data < de) || (ate && p.data > ate)) continue;
    const id = identificar(p, siglaDe, contratoDe);
    if (!cartoes.has(id.chave)) {
      cartoes.set(id.chave, {
        chave: id.chave,
        contrato: id.concessao || 'Sem contrato',
        contratante: id.contratante,
        semContrato: !id.concessao,
        dias: {},
        cont: { ok: 0, campo: 0, pend: 0, erro: 0 },
      });
    }
    const c = cartoes.get(id.chave);
    const s = classificar(p, hoje);
    (c.dias[p.data] = c.dias[p.data] || []).push({ p, ...s });
    c.cont[s.st] += 1;
  }

  for (const c of cartoes.values()) {
    for (const lista of Object.values(c.dias)) lista.sort((x, y) => ORDEM[x.st] - ORDEM[y.st]);
  }

  return [...cartoes.values()].sort((a, b) => (
    a.contratante.localeCompare(b.contratante, 'pt-BR')
    || (a.semContrato - b.semContrato)
    || a.contrato.localeCompare(b.contrato, 'pt-BR')
  ));
}
