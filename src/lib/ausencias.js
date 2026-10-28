/* =============================================================================
   Ausências — faltas, atestados e férias como PERÍODOS
   -----------------------------------------------------------------------------
   No banco, falta é uma linha por dia (o atestado de 9 dias gera 9 faltas).
   Para quem cuida do pessoal, o que interessa é o afastamento: "Marciliano,
   atestado de 06/12 a 14/12, 9 dias". Aqui as linhas viram períodos:

   • faltas geradas pelo mesmo atestado (origem_documento_id) = um período;
   • faltas avulsas da mesma pessoa e do mesmo motivo, em dias seguidos, = um
     período. Sábado e domingo no meio não quebram (sexta + segunda seguidas
     de falta são o mesmo afastamento);
   • cada linha de férias já é um período. A falta com motivo "férias" que cai
     dentro de férias lançadas não aparece de novo.

   Tudo com data ISO (AAAA-MM-DD) no fuso do navegador — toISOString() usaria
   UTC e, depois das 21h no Brasil, "hoje" viraria amanhã.
   ============================================================================= */

import { rotuloMotivo } from './motivos';

export const TIPOS_AUSENCIA = [
  { valor: 'atestado', rotulo: 'Atestado', plural: 'atestados', cor: 'var(--erro)' },
  { valor: 'falta', rotulo: 'Falta', plural: 'faltas', cor: '#C98A0B' },
  { valor: 'licenca', rotulo: 'Licença', plural: 'licenças', cor: '#8E5BD0' },
  { valor: 'ferias', rotulo: 'Férias', plural: 'férias', cor: 'var(--campo)' },
  { valor: 'folga', rotulo: 'Folga', plural: 'folgas', cor: '#7C8790' },
];
export const TIPO_AUSENCIA = Object.fromEntries(TIPOS_AUSENCIA.map((t) => [t.valor, t]));

export const SITUACOES_AUSENCIA = [
  { valor: 'andamento', rotulo: 'Em andamento', cor: 'var(--erro)' },
  { valor: 'agendado', rotulo: 'Agendado', cor: 'var(--campo)' },
  { valor: 'encerrado', rotulo: 'Encerrado', cor: 'var(--borda-forte)' },
];

export function tipoDoMotivo(motivo) {
  if (motivo === 'atestado_medico') return 'atestado';
  if (motivo === 'licenca' || motivo === 'acidente_trabalho') return 'licenca';
  if (motivo === 'ferias') return 'ferias';
  if (motivo === 'folga') return 'folga';
  return 'falta';
}

/* ---------- datas ---------- */
const dois = (n) => String(n).padStart(2, '0');
export const isoLocal = (d = new Date()) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
const paraData = (iso) => { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d); };
export const somaDias = (iso, n) => { const d = paraData(iso); d.setDate(d.getDate() + n); return isoLocal(d); };
export const diasEntre = (de, ate) => Math.round((paraData(ate) - paraData(de)) / 86400000);
export const diaDaSemana = (iso) => paraData(iso).getDay();
export const fimDeSemana = (iso) => { const s = diaDaSemana(iso); return s === 0 || s === 6; };
export const curta = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');

/** Entre `de` e `ate` (exclusivos) só tem sábado e domingo? */
function soFimDeSemanaEntre(de, ate) {
  for (let d = somaDias(de, 1); d < ate; d = somaDias(d, 1)) if (!fimDeSemana(d)) return false;
  return true;
}

/**
 * Faltas + férias → lista de períodos.
 * { id, pessoaId, tipo, motivo, rotulo, inicio, fim, dias, parcial,
 *   observacao, documentoId, faltaIds, feriasId }
 */
export function agruparAusencias(faltas = [], ferias = []) {
  const periodos = [];

  const feriasPorPessoa = {};
  ferias.forEach((f) => {
    if (!f?.data_inicio || !f?.data_fim) return;
    (feriasPorPessoa[f.colaboradorId] ||= []).push(f);
    periodos.push({
      id: `v:${f.id}`, pessoaId: f.colaboradorId, tipo: 'ferias', motivo: 'ferias', rotulo: 'Férias',
      inicio: f.data_inicio, fim: f.data_fim, dias: diasEntre(f.data_inicio, f.data_fim) + 1,
      parcial: false, observacao: f.observacao || '', documentoId: null, faltaIds: [], feriasId: f.id,
    });
  });
  const dentroDeFerias = (pessoaId, dia) => (feriasPorPessoa[pessoaId] || [])
    .some((f) => f.data_inicio <= dia && dia <= f.data_fim);

  const ordenadas = faltas
    .filter((f) => f?.data && f.colaboradorId)
    .filter((f) => !(f.motivo === 'ferias' && dentroDeFerias(f.colaboradorId, f.data)))
    .slice()
    .sort((a, b) => (a.colaboradorId === b.colaboradorId
      ? a.data.localeCompare(b.data)
      : String(a.colaboradorId).localeCompare(String(b.colaboradorId))));

  let atual = null;
  const fechar = () => { if (atual) periodos.push(atual); atual = null; };
  ordenadas.forEach((f) => {
    const doc = f.origem_documento_id || null;
    const chave = doc ? `doc:${doc}` : `m:${f.motivo}`;
    const continua = atual
      && atual.pessoaId === f.colaboradorId
      && atual.chave === chave
      && (doc || f.data === atual.fim || soFimDeSemanaEntre(atual.fim, f.data));
    if (continua) {
      if (f.data > atual.fim) atual.fim = f.data;
      if (f.data !== atual.ultimoDia) atual.dias += 1;
      atual.ultimoDia = f.data;
      atual.faltaIds.push(f.id);
      atual.parcial ||= Boolean(f.trabalhou_de);
      if (!atual.observacao && f.observacao) atual.observacao = f.observacao;
      return;
    }
    fechar();
    atual = {
      id: `f:${f.id}`, chave, pessoaId: f.colaboradorId, tipo: tipoDoMotivo(f.motivo), motivo: f.motivo,
      rotulo: rotuloMotivo(f.motivo), inicio: f.data, fim: f.data, ultimoDia: f.data, dias: 1,
      parcial: Boolean(f.trabalhou_de), observacao: f.observacao || '', documentoId: doc,
      faltaIds: [f.id], feriasId: null,
    };
  });
  fechar();

  periodos.forEach((p) => { delete p.chave; delete p.ultimoDia; });
  return periodos;
}

export function situacaoAusencia(p, hoje) {
  if (p.inicio > hoje) return 'agendado';
  if (p.fim < hoje) return 'encerrado';
  return 'andamento';
}

/** O período cruza a janela [de, ate]? */
export const cruza = (p, de, ate) => p.inicio <= ate && p.fim >= de;

/* ---------- período escolhido no filtro ---------- */
export const ATALHOS_PERIODO = [
  { valor: 'mes', rotulo: 'Este mês' },
  { valor: 'mes-passado', rotulo: 'Mês passado' },
  { valor: 'proximos-30', rotulo: 'Próximos 30 dias' },
  { valor: 'ultimos-90', rotulo: 'Últimos 90 dias' },
  { valor: 'padrao', rotulo: 'Últimas 6 semanas e próximas 4' },
];
export const PERIODO_PADRAO = 'padrao';

/** valor do filtro ('mes', 'padrao', '2026-10-01_2026-10-31'…) → { de, ate, rotulo } */
export function intervaloDoPeriodo(valor, hoje = isoLocal()) {
  const [a, m] = hoje.split('-').map(Number);
  const primeiro = (ano, mes) => isoLocal(new Date(ano, mes - 1, 1));
  const ultimo = (ano, mes) => isoLocal(new Date(ano, mes, 0));
  const personalizado = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(valor || '');
  if (personalizado && personalizado[1] <= personalizado[2]) {
    return { de: personalizado[1], ate: personalizado[2], rotulo: `${curta(personalizado[1])} → ${curta(personalizado[2])}` };
  }
  switch (valor) {
    case 'mes': return { de: primeiro(a, m), ate: ultimo(a, m), rotulo: 'Este mês' };
    case 'mes-passado': return { de: primeiro(a, m - 1), ate: ultimo(a, m - 1), rotulo: 'Mês passado' };
    case 'proximos-30': return { de: hoje, ate: somaDias(hoje, 30), rotulo: 'Próximos 30 dias' };
    case 'ultimos-90': return { de: somaDias(hoje, -90), ate: hoje, rotulo: 'Últimos 90 dias' };
    default: {
      const de = somaDias(hoje, -42);
      const ate = somaDias(hoje, 28);
      return { de, ate, rotulo: `${curta(de)} → ${curta(ate)}` };
    }
  }
}
