/* =============================================================================
   Exportar o calendário de status (Relatórios › Status) em Excel
   -----------------------------------------------------------------------------
   Pra levar pra medição / justificar com o contratante: por contrato, como
   ficou cada dia do mês — concluído, não realizado (e por quê) ou sem baixa.

   Um arquivo com:
     • aba "Resumo": uma linha por contrato, com os totais e os motivos;
     • uma aba por contrato: o calendário do mês (igual ao da tela) e, embaixo,
       a lista dia a dia com a equipe, a cidade, o status e o motivo.

   Excel não divide uma célula em faixas como a tela faz. Dia com equipes de
   status diferentes pinta com o status "mais sério" (não realizado > sem
   baixa > em campo > concluído) e escreve a conta por extenso na célula.

   Recebe os cartões prontos de calendariosDoMes() (lib/statusContrato.js),
   então os números do arquivo são os mesmos da tela.
   ============================================================================= */
import { ST, semanasDoMes } from './statusContrato';

const MESES = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO',
  'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
const SEMANA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const MOTIVOS = ['CHUVA', 'MANUTENÇÃO', 'VIAGEM', 'INTEGRAÇÃO', 'OUTROS'];

// cores claras (fundo) e escuras (texto) — as mesmas do tema claro do app
const COR = {
  ok:    { fundo: 'FFDDF3E7', texto: 'FF10693F', forte: 'FF35C07B' },
  campo: { fundo: 'FFDDEAFC', texto: 'FF14508F', forte: 'FF2F81F7' },
  pend:  { fundo: 'FFFFF3D0', texto: 'FF7A5600', forte: 'FFFFC72C' },
  erro:  { fundo: 'FFFDE3E4', texto: 'FFB0181D', forte: 'FFF0575C' },
};
const GRAVIDADE = { ok: 0, campo: 1, pend: 2, erro: 3 };
const ABREV = { ok: 'concl.', campo: 'em campo', pend: 'sem baixa' };

const rotuloMes = (mes) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(2, 4)}`;
const dataExcel = (iso) => {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
};
const nomeAba = (txt, usados) => {
  // Excel: até 31 caracteres, sem : \ / ? * [ ] e sem repetir
  const base = String(txt).replace(/[:\\/?*[\]]/g, '-').slice(0, 28) || 'Contrato';
  let nome = base; let n = 2;
  while (usados.has(nome.toUpperCase())) { nome = `${base.slice(0, 26)} ${n}`; n += 1; }
  usados.add(nome.toUpperCase());
  return nome;
};

/** Motivos de um cartão: { CHUVA: n, ... } (equipes-dia). */
function motivosDo(cartao) {
  const m = Object.fromEntries(MOTIVOS.map((k) => [k, 0]));
  for (const lista of Object.values(cartao.dias)) {
    for (const x of lista) {
      if (x.st !== 'erro') continue;
      const k = MOTIVOS.includes(String(x.motivo).toUpperCase()) ? String(x.motivo).toUpperCase() : 'OUTROS';
      m[k] += 1;
    }
  }
  return m;
}

/** Texto curto do dia: "Concluído", "Chuva", ou "2 concl. · 1 chuva". */
function textoDia(lista) {
  const grupos = new Map();
  for (const x of lista) {
    const k = x.st === 'erro' ? String(x.motivo || 'outros').toLowerCase() : ABREV[x.st];
    grupos.set(k, (grupos.get(k) || 0) + 1);
  }
  if (grupos.size === 1 && lista.length === 1) {
    const x = lista[0];
    return x.st === 'erro' ? String(x.motivo || 'Não realizado').toLowerCase().replace(/^./, (c) => c.toUpperCase()) : ST[x.st];
  }
  return [...grupos.entries()].map(([k, n]) => `${n} ${k}`).join(' · ');
}

/**
 * Monta o .xlsx. `cartoes` vem de calendariosDoMes(); `nomeDe(id)` devolve o
 * nome de um colaborador. Devolve { buffer, nome }.
 */
export async function montarStatusXlsx({ cartoes, mes, nomeDe }) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Incovia';
  wb.created = new Date();
  const fonte = { name: 'Arial', size: 10 };
  const fina = { style: 'thin', color: { argb: 'FFB6BEC6' } };
  const borda = { top: fina, bottom: fina, left: fina, right: fina };
  const titulo = (ws, linha, texto, nCols, tam = 13) => {
    ws.mergeCells(linha, 1, linha, nCols);
    const c = ws.getCell(linha, 1);
    c.value = texto;
    c.font = { ...fonte, size: tam, bold: true };
    c.alignment = { vertical: 'middle' };
  };
  const cab = (cell, texto) => {
    cell.value = texto;
    cell.font = { ...fonte, bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = borda;
  };
  const pinta = (cell, st) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR[st].fundo } };
    cell.font = { ...fonte, bold: true, color: { argb: COR[st].texto } };
  };

  /* ---------------- aba Resumo ---------------- */
  const res = wb.addWorksheet('Resumo', { views: [{ state: 'frozen', ySplit: 4 }] });
  const COLS = ['CONTRATO', 'CONTRATANTE', 'DIÁRIAS', 'CONCLUÍDAS', '% CONCL.', 'NÃO REALIZ.',
    ...MOTIVOS.map((m) => m.charAt(0) + m.slice(1).toLowerCase()), 'SEM BAIXA', 'EM CAMPO'];
  titulo(res, 1, `STATUS POR CONTRATO — ${rotuloMes(mes)}`, COLS.length, 14);
  res.mergeCells(2, 1, 2, COLS.length);
  res.getCell(2, 1).value = 'Diária = uma equipe num dia. "Sem baixa" = dia que passou e ficou como Em campo.';
  res.getCell(2, 1).font = { ...fonte, italic: true, color: { argb: 'FF56616A' } };
  COLS.forEach((c, i) => cab(res.getCell(4, i + 1), c));
  res.getRow(4).height = 28;
  let r = 5;
  const soma = Array(COLS.length).fill(0);
  for (const c of cartoes) {
    const t = c.cont.ok + c.cont.campo + c.cont.pend + c.cont.erro;
    const mot = motivosDo(c);
    const vals = [c.contrato.toUpperCase(), c.contratante, t, c.cont.ok, t ? c.cont.ok / t : 0, c.cont.erro,
      ...MOTIVOS.map((m) => mot[m]), c.cont.pend, c.cont.campo];
    vals.forEach((v, i) => {
      const cell = res.getCell(r, i + 1);
      cell.value = v;
      cell.font = fonte;
      cell.border = borda;
      cell.alignment = { horizontal: i < 2 ? 'left' : 'center', vertical: 'middle', indent: i < 2 ? 1 : 0 };
      if (i === 4) cell.numFmt = '0%';
      if (typeof v === 'number' && i !== 4) soma[i] += v;
      if (i === COLS.length - 2 && v > 0) pinta(cell, 'pend');
    });
    r += 1;
  }
  // linha de total
  soma[4] = soma[2] ? soma[3] / soma[2] : 0;
  ['TOTAL', '', ...soma.slice(2)].forEach((v, i) => {
    const cell = res.getCell(r, i + 1);
    cell.value = v;
    cell.font = { ...fonte, bold: true };
    cell.border = { ...borda, top: { style: 'medium', color: { argb: 'FF14181B' } } };
    cell.alignment = { horizontal: i < 2 ? 'left' : 'center', indent: i < 2 ? 1 : 0 };
    if (i === 4) cell.numFmt = '0%';
  });
  res.columns.forEach((col, i) => { col.width = i === 0 ? 26 : i === 1 ? 22 : 13; });
  res.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };

  /* ---------------- uma aba por contrato ---------------- */
  const usados = new Set(['RESUMO']);
  for (const c of cartoes) {
    // "Sem contrato" sozinho não diz de quem é: leva o contratante no nome.
    const rotulo = c.semContrato ? `${c.contratante} (sem contrato)` : c.contrato.toUpperCase();
    const ws = wb.addWorksheet(nomeAba(rotulo, usados));
    const NC = 7;
    // colunas iguais: o calendário fica quadrado e a lista cabe nas mesmas colunas
    ws.columns = Array.from({ length: NC }, () => ({ width: 23 }));
    titulo(ws, 1, rotulo, NC, 14);
    ws.mergeCells(2, 1, 2, NC);
    ws.getCell(2, 1).value = `${c.contratante} · ${rotuloMes(mes)}`;
    ws.getCell(2, 1).font = { ...fonte, color: { argb: 'FF56616A' } };

    // legenda
    const leg = [['ok', 'Concluído'], ['erro', 'Não realizado'], ['pend', 'Sem baixa'], ['campo', 'Em campo']];
    leg.forEach(([st, txt], i) => {
      const cell = ws.getCell(3, i + 1);
      cell.value = txt;
      pinta(cell, st);
      cell.font = { ...fonte, size: 9, bold: true, color: { argb: COR[st].texto } };
      cell.alignment = { horizontal: 'center' };
    });

    // calendário
    SEMANA.forEach((d, i) => cab(ws.getCell(5, i + 1), d));
    const cels = semanasDoMes(mes);
    let lin = 6;
    for (let i = 0; i < cels.length; i += 7) {
      ws.getRow(lin).height = 34;
      for (let j = 0; j < 7; j += 1) {
        const iso = cels[i + j];
        const cell = ws.getCell(lin, j + 1);
        cell.border = borda;
        cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
        if (!iso) continue;
        const lista = c.dias[iso];
        const n = Number(iso.slice(8, 10));
        if (!lista) {
          cell.value = String(n);
          cell.font = { ...fonte, color: { argb: 'FF9AA4AD' } };
          continue;
        }
        const pior = lista.reduce((a, x) => (GRAVIDADE[x.st] > GRAVIDADE[a] ? x.st : a), 'ok');
        cell.value = `${n}\n${textoDia(lista)}`;
        pinta(cell, pior);
        cell.border = { ...borda, left: { style: 'thick', color: { argb: COR[pior].forte } } };
      }
      lin += 1;
    }

    // totais do contrato
    lin += 1;
    const t = c.cont.ok + c.cont.campo + c.cont.pend + c.cont.erro;
    const mot = motivosDo(c);
    const resumo = [
      ['Diárias', t],
      ['Concluídas', `${c.cont.ok} (${t ? Math.round((c.cont.ok / t) * 100) : 0}%)`],
      ['Não realizadas', `${c.cont.erro}${c.cont.erro ? ` — ${MOTIVOS.filter((m) => mot[m]).map((m) => `${mot[m]} ${m.toLowerCase()}`).join(', ')}` : ''}`],
      ['Sem baixa', c.cont.pend],
    ];
    for (const [k, v] of resumo) {
      ws.getCell(lin, 1).value = k;
      ws.getCell(lin, 1).font = { ...fonte, bold: true };
      ws.mergeCells(lin, 2, lin, NC);
      ws.getCell(lin, 2).value = v;
      ws.getCell(lin, 2).font = fonte;
      ws.getCell(lin, 2).alignment = { horizontal: 'left' };
      lin += 1;
    }

    // lista dia a dia
    lin += 1;
    ['DATA', 'DIA', 'ENCARREGADO', 'CIDADE', 'STATUS', 'MOTIVO', 'EQUIPE'].forEach((h, i) => cab(ws.getCell(lin, i + 1), h));
    const inicioLista = lin;
    lin += 1;
    const datas = Object.keys(c.dias).sort();
    for (const iso of datas) {
      for (const x of c.dias[iso]) {
        const vals = [
          dataExcel(iso),
          SEMANA[new Date(`${iso}T12:00:00`).getDay()],
          String(nomeDe(x.p.encarregadoId) || 'Sem encarregado').toUpperCase(),
          String(x.p.cidade || '').toUpperCase(),
          ST[x.st].toUpperCase(),
          x.st === 'erro' ? String(x.motivo || '').toUpperCase() : '',
          String(x.p.tipoEquipe || ''),
        ];
        vals.forEach((v, i) => {
          const cell = ws.getCell(lin, i + 1);
          cell.value = v;
          cell.font = fonte;
          cell.border = borda;
          cell.alignment = { horizontal: i >= 2 && i !== 4 ? 'left' : 'center', vertical: 'middle', indent: i >= 2 && i !== 4 ? 1 : 0 };
          if (i === 0) cell.numFmt = 'dd/mm/yyyy';
        });
        pinta(ws.getCell(lin, 5), x.st);
        ws.getCell(lin, 5).border = borda;
        lin += 1;
      }
    }
    ws.autoFilter = { from: { row: inicioLista, column: 1 }, to: { row: inicioLista, column: NC } };
    ws.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  }

  const nome = cartoes.length === 1
    ? `STATUS ${cartoes[0].contrato.toUpperCase()} ${rotuloMes(mes)}.xlsx`
    : `STATUS CONTRATOS ${rotuloMes(mes)}.xlsx`;
  // Sem acento no nome do arquivo: alguns navegadores trocam um nome com "É"
  // por um genérico "download" na hora de salvar.
  const limpo = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\\/:*?"<>|]/g, '-');
  return { buffer: await wb.xlsx.writeBuffer(), nome: limpo };
}

/** Monta e baixa. Única parte que depende do navegador. */
export async function baixarStatusXlsx(args) {
  const { buffer, nome } = await montarStatusXlsx(args);
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

