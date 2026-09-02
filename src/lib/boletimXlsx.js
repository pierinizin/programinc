/**
 * Boletim formatado em .xlsx, gerado no navegador.
 *
 * Porte do ferramentas/boletim.py. Duas abas:
 *   Boletim — um bloco por apontamento, para ler e imprimir
 *   Dados   — uma linha por SERVIÇO, com filtro, para tabela dinâmica
 *
 * A área é copiada do valor que a própria Kartado declara para o serviço —
 * sem fórmula própria. "Extensão × largura × faixas" só bate com a área real
 * numa faixa Contínua; numa Seccionada "faixas" é a quantidade de traços, não
 * um multiplicador de área, e reaplicar a conta aqui só criava divergência
 * onde não havia nenhuma.
 */
import { texto } from './kartado.js';

const TINTA = 'FF1B2027';
const FAIXA = 'FFFFC72C';
const CINZA = 'FF6B7784';
const LINHA = 'FFD7DCE1';
const CLARO = 'FFF6F7F8';
const BRANCO = 'FFFFFFFF';
const FONTE = 'Arial';

const COLS_SERV = [
  ['#', 5], ['KM INI', 9], ['KM FIM', 9], ['COR', 11], ['LOCAL DE APLICAÇÃO', 19],
  ['TIPO DE FAIXA', 15], ['CADÊNCIA', 10], ['FAIXAS', 8], ['EXTENSÃO (m)', 12],
  ['LARGURA (m)', 11], ['ÁREA (m²)', 11], ['OBSERVAÇÕES', 28],
];
const NC = COLS_SERV.length;

const COLS_DADOS = [
  ['Serial', 22], ['Data', 11], ['Hora', 8], ['Natureza', 20], ['Tipo', 13],
  ['Status', 11], ['Cliente', 11], ['Contrato', 11], ['Local de Obra', 22],
  ['Encarregado', 15], ['Engenheiro', 15], ['Criado por', 17],
  ['Serviço nº', 9], ['Km inicial', 10], ['Km final', 10], ['Cor', 11],
  ['Local de aplicação', 19], ['Tipo de faixa', 15], ['Cadência', 10], ['Faixas', 8],
  ['Extensão (m)', 12], ['Largura (m)', 11], ['Área (m²)', 11],
  ['Obs. do serviço', 26], ['Equipe (Incovia)', 20], ['Apontamento', 16],
];

function br(n, casas = 2) {
  return Number(n || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: casas, maximumFractionDigits: casas,
  });
}

function dataBR(v) {
  return v instanceof Date && !Number.isNaN(v.getTime())
    ? v.toLocaleDateString('pt-BR') : texto(v);
}

function horaBR(v) {
  return v instanceof Date && !Number.isNaN(v.getTime())
    ? v.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : texto(v);
}

function borda(...lados) {
  const fina = { style: 'thin', color: { argb: LINHA } };
  const b = {};
  lados.forEach((l) => { b[l] = fina; });
  return b;
}

function pinta(ws, r, cols, cor) {
  for (let c = 1; c <= cols; c += 1) {
    ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cor } };
  }
}

function subFaixa(ws, r, rotulo) {
  ws.mergeCells(r, 1, r, NC);
  const c = ws.getCell(r, 1);
  c.value = rotulo.toUpperCase();
  c.font = { name: FONTE, size: 8, bold: true, color: { argb: TINTA } };
  c.alignment = { vertical: 'middle', indent: 1 };
  pinta(ws, r, NC, FAIXA);
  ws.getRow(r).height = 15;
}

// O Kartado repete a natureza no nome do campo. Ela já está no cabeçalho.
function encurtar(rotulo) {
  const s = String(rotulo);
  return s.length > 26 && s.includes(' - ') ? s.split(' - ')[0] : s;
}

function par(ws, r, rotIni, rotFim, valIni, valFim, rotulo, valor) {
  ws.mergeCells(r, rotIni, r, rotFim);
  const rot = ws.getCell(r, rotIni);
  rot.value = encurtar(rotulo).toUpperCase();
  rot.font = { name: FONTE, size: 7.5, bold: true, color: { argb: CINZA } };
  rot.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };

  ws.mergeCells(r, valIni, r, valFim);
  const val = ws.getCell(r, valIni);
  val.value = texto(valor) || '—';
  val.font = { name: FONTE, size: 9.5, color: { argb: TINTA } };
  val.alignment = { vertical: 'middle', indent: 1 };

  for (let c = rotIni; c <= valFim; c += 1) ws.getCell(r, c).border = borda('bottom');
}

function letra(n) {
  let s = '';
  let x = n;
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - m) / 26);
  }
  return s;
}

/* ---------------------------------------------------------------- */
export async function montarBoletim(aps, nomeArquivoOrigem, conciliacoes = {}) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Incovia';
  wb.created = new Date();

  /* ================== aba Boletim ================== */
  const ws = wb.addWorksheet('Boletim', {
    views: [{ showGridLines: false }],
    pageSetup: {
      orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  });
  ws.columns = COLS_SERV.map(([, w]) => ({ width: w }));

  let r = 1;
  ws.mergeCells(r, 1, r, NC);
  const t = ws.getCell(r, 1);
  t.value = 'BOLETIM DE APONTAMENTOS';
  t.font = { name: FONTE, size: 15, bold: true, color: { argb: BRANCO } };
  t.alignment = { vertical: 'middle', indent: 1 };
  pinta(ws, r, NC, TINTA);
  ws.getRow(r).height = 28;
  r += 1;

  const area = aps.reduce((s, a) => s + a.area, 0);
  const ext = aps.reduce((s, a) => s + a.ext, 0);
  const datas = aps.map((a) => a.data).filter(Boolean).sort();
  const periodo = datas.length
    ? `${datas[0].split('-').reverse().join('/')} a ${datas[datas.length - 1].split('-').reverse().join('/')}`
    : '—';
  ws.mergeCells(r, 1, r, NC);
  const s = ws.getCell(r, 1);
  s.value = `${aps.length} apontamento(s) · ${br(area)} m² · ${br(ext, 1)} m · `
    + `período ${periodo} · origem: ${nomeArquivoOrigem} · `
    + `emitido em ${new Date().toLocaleString('pt-BR')}`;
  s.font = { name: FONTE, size: 8.5, color: { argb: 'FF3F4A55' } };
  s.alignment = { vertical: 'middle', indent: 1 };
  pinta(ws, r, NC, FAIXA);
  ws.getRow(r).height = 15;
  r += 2;

  aps.forEach((ap) => {
    const i = ap.ident;

    ws.mergeCells(r, 1, r, Math.floor(NC / 2));
    const c1 = ws.getCell(r, 1);
    c1.value = ap.serial;
    c1.font = { name: FONTE, size: 11, bold: true, color: { argb: BRANCO } };
    c1.alignment = { vertical: 'middle', indent: 1 };
    ws.mergeCells(r, Math.floor(NC / 2) + 1, r, NC);
    const c2 = ws.getCell(r, Math.floor(NC / 2) + 1);
    c2.value = `${ap.natureza}${ap.tipo ? ' · ' + ap.tipo : ''}`
      + `   |   ${dataBR(i['Executado em'])}   |   ${ap.status}`;
    c2.font = { name: FONTE, size: 9, color: { argb: 'FFD9DEE4' } };
    c2.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
    pinta(ws, r, NC, TINTA);
    ws.getRow(r).height = 20;
    r += 1;

    const fp = i['Fechamento de pista'];
    const lp = i['Liberação de pista'];
    const interdicao = fp instanceof Date && lp instanceof Date
      ? `${Math.round((lp - fp) / 60000)} min` : '—';

    const conc = conciliacoes[ap.serial];
    const pares = [
      ['Cliente', ap.cliente],
      ['Contrato', ap.contrato],
      ['Local de obra', ap.localObra],
      ['Encarregado', ap.encarregado],
      // dataBR() corta a hora: texto() de um Date acrescentaria ", 00:00",
      // que aqui é ruído — o Kartado grava a execução sem hora.
      ['Executado em', dataBR(i['Executado em'])],
      ['Encontrado em', texto(i['Encontrado em'])],
      ['Fechamento de pista', horaBR(fp)],
      ['Liberação de pista', horaBR(lp)],
      ['Tempo de interdição', interdicao],
      ['Engenheiro responsável', texto(i['Engenheiro responsável'])],
      ['Criado por', `${ap.criadoPor || '—'} · ${texto(i['Criado em'])}`],
      ['Equipe (Incovia)', typeof conc === 'string' ? conc || '—' : '—'],
    ];
    subFaixa(ws, r, 'Identificação');
    r += 1;
    for (let k = 0; k < pares.length; k += 2) {
      ws.getRow(r).height = 14;
      // rótulo em 3 colunas: "ENGENHEIRO RESPONSÁVEL" tem 22 caracteres e o
      // Excel corta texto alinhado à direita sem avisar.
      par(ws, r, 1, 3, 4, 6, ...pares[k]);
      if (pares[k + 1]) par(ws, r, 7, 9, 10, NC, ...pares[k + 1]);
      r += 1;
    }
    r += 1;

    /* ---- serviços ---- */
    if (ap.servicos.length) {
      subFaixa(ws, r, `Serviços executados (${ap.servicos.length})`);
      r += 1;
      COLS_SERV.forEach(([titulo], n) => {
        const c = ws.getCell(r, n + 1);
        c.value = titulo;
        c.font = { name: FONTE, size: 7.5, bold: true, color: { argb: CINZA } };
        c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CLARO } };
        c.border = borda('top', 'bottom', 'left', 'right');
      });
      ws.getRow(r).height = 22;
      r += 1;

      const ini = r;
      ap.servicos.forEach((sv) => {
        // Cada linha é uma caixa fechada nas 4 bordas — inclusive a célula
        // da área, escrita fora deste laço — pra não "encavalar" com a de
        // baixo mesmo quando alguma coluna fica vazia.
        const vals = [sv.n, sv.kmIni, sv.kmFim, sv.cor, sv.local, sv.tipoFaixa,
          sv.cadencia, sv.faixas, sv.ext, sv.larg, null, sv.obs];
        vals.forEach((v, n) => {
          const col = n + 1;
          const c = ws.getCell(r, col);
          c.value = v === null || v === undefined ? '—' : v;
          c.font = { name: FONTE, size: 9, color: { argb: TINTA } };
          c.border = borda('top', 'bottom', 'left', 'right');
          if ([1, 2, 3, 7, 8].includes(col)) {
            c.alignment = { horizontal: 'center' };
          } else if ([9, 10].includes(col)) {
            c.alignment = { horizontal: 'right', indent: 1 };
            c.numFmt = '#,##0.00';
          } else {
            c.alignment = { horizontal: 'left', indent: 1, wrapText: col === 12 };
          }
        });

        // Área copiada direto do que a Kartado declarou pro serviço — sem
        // fórmula própria, pra não divergir do dado de origem.
        const cArea = ws.getCell(r, 11);
        cArea.value = sv.area != null ? sv.area : 0;
        cArea.numFmt = '#,##0.00';
        cArea.font = { name: FONTE, size: 9, bold: true, color: { argb: TINTA } };
        cArea.alignment = { horizontal: 'right', indent: 1 };
        cArea.border = borda('top', 'bottom', 'left', 'right');
        ws.getRow(r).height = 14;
        r += 1;
      });

      for (let n = 1; n <= NC; n += 1) {
        const c = ws.getCell(r, n);
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CLARO } };
        c.border = borda('top', 'bottom', 'left', 'right');
      }
      const cT = ws.getCell(r, 8);
      cT.value = 'TOTAL';
      cT.font = { name: FONTE, size: 8, bold: true, color: { argb: CINZA } };
      cT.alignment = { horizontal: 'right', indent: 1 };
      // Soma pura de células que já são cópia da Kartado — não deriva nada
      // novo, então não reintroduz o risco de divergência.
      [[9, '#,##0.0'], [11, '#,##0.00']].forEach(([col, fmt]) => {
        const L = letra(col);
        const c = ws.getCell(r, col);
        c.value = { formula: `SUM(${L}${ini}:${L}${r - 1})` };
        c.font = { name: FONTE, size: 9.5, bold: true, color: { argb: TINTA } };
        c.numFmt = fmt;
        c.alignment = { horizontal: 'right', indent: 1 };
        c.border = borda('top', 'bottom', 'left', 'right');
      });
      ws.getRow(r).height = 16;
      r += 2;
    }

    /* ---- leituras (ensaios) ---- */
    if (ap.leituras.length) {
      subFaixa(ws, r, `Leituras (${ap.leituras.length})`);
      r += 1;
      ap.leituras.forEach(([idx], n) => {
        const c = ws.getCell(r, n + 1);
        c.value = `m${idx}`;
        c.font = { name: FONTE, size: 8, bold: true, color: { argb: CINZA } };
        c.alignment = { horizontal: 'center' };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CLARO } };
        c.border = borda('top', 'bottom', 'left', 'right');
      });
      const colMed = ap.leituras.length + 1;
      const cm = ws.getCell(r, colMed);
      cm.value = 'MÉDIA';
      cm.font = { name: FONTE, size: 8, bold: true, color: { argb: TINTA } };
      cm.alignment = { horizontal: 'center' };
      cm.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FAIXA } };
      cm.border = borda('top', 'bottom', 'left', 'right');
      r += 1;
      ap.leituras.forEach(([, valor], n) => {
        const c = ws.getCell(r, n + 1);
        c.value = valor;
        c.font = { name: FONTE, size: 10, color: { argb: TINTA } };
        c.alignment = { horizontal: 'center' };
        c.border = borda('top', 'bottom', 'left', 'right');
      });
      const cMed = ws.getCell(r, colMed);
      cMed.value = { formula: `ROUND(AVERAGE(A${r}:${letra(ap.leituras.length)}${r}),1)` };
      cMed.font = { name: FONTE, size: 10, bold: true, color: { argb: TINTA } };
      cMed.numFmt = '0.0';
      cMed.alignment = { horizontal: 'center' };
      cMed.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CLARO } };
      cMed.border = borda('top', 'bottom', 'left', 'right');
      r += 2;
    }

    /* ---- observações ---- */
    const obs = texto(ap.extras['Observações']);
    if (obs) {
      subFaixa(ws, r, 'Observações do apontamento');
      r += 1;
      ws.mergeCells(r, 1, r, NC);
      const c = ws.getCell(r, 1);
      c.value = obs;
      c.font = { name: FONTE, size: 9.5, color: { argb: TINTA } };
      c.alignment = { vertical: 'top', wrapText: true, indent: 1 };
      ws.getRow(r).height = 26;
      r += 1;
    }

    ws.mergeCells(r, 1, r, NC);
    const cf = ws.getCell(r, 1);
    cf.value = `${ap.fotos} foto(s) anexada(s)`;
    cf.font = { name: FONTE, size: 8, italic: true, color: { argb: CINZA } };
    cf.alignment = { vertical: 'middle', indent: 1 };
    r += 3;
  });

  /* ================== aba Dados ================== */
  const wd = wb.addWorksheet('Dados', { views: [{ showGridLines: false, state: 'frozen', ySplit: 1 }] });
  wd.columns = COLS_DADOS.map(([, w]) => ({ width: w }));
  COLS_DADOS.forEach(([titulo], n) => {
    const c = wd.getCell(1, n + 1);
    c.value = titulo;
    c.font = { name: FONTE, size: 8.5, bold: true, color: { argb: BRANCO } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TINTA } };
    c.alignment = { vertical: 'middle', indent: 1, wrapText: true };
  });
  wd.getRow(1).height = 26;

  let rd = 2;
  aps.forEach((ap) => {
    const i = ap.ident;
    // hora só quando existe de verdade: "Executado em" costuma vir sem hora e
    // uma coluna cheia de 00:00 atrapalha o filtro.
    const hExec = horaBR(i['Executado em']);
    const base = [ap.serial, dataBR(i['Executado em']), hExec === '00:00' ? '' : hExec,
      ap.natureza, ap.tipo, ap.status, ap.cliente, ap.contrato, ap.localObra,
      ap.encarregado, texto(i['Engenheiro responsável']), ap.criadoPor];
    // apontamento sem serviços (ensaio) ainda vira uma linha, para não sumir
    (ap.servicos.length ? ap.servicos : [{}]).forEach((sv) => {
      const vals = [...base, sv.n ?? '', sv.kmIni, sv.kmFim, sv.cor, sv.local,
        sv.tipoFaixa, sv.cadencia, sv.faixas, sv.ext, sv.larg, sv.area, sv.obs,
        conciliacoes[ap.serial] || '', conciliacoes[ap.serial] ? 'Lançado' : 'Pendente'];
      vals.forEach((v, n) => {
        const c = wd.getCell(rd, n + 1);
        c.value = v === null || v === undefined ? '' : v;
        c.font = { name: FONTE, size: 9.5, color: { argb: TINTA } };
        c.border = borda('bottom');
        if (typeof v === 'number') {
          c.numFmt = Number.isInteger(v) ? '#,##0' : '#,##0.00';
          c.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
        } else {
          c.alignment = { vertical: 'middle', indent: 1 };
        }
      });
      wd.getRow(rd).height = 15;
      rd += 1;
    });
  });
  wd.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rd - 1), column: COLS_DADOS.length } };

  const carimbo = new Date().toISOString().slice(0, 10);
  return {
    buffer: await wb.xlsx.writeBuffer(),
    nome: aps.length === 1
      ? `boletim-${aps[0].serial}.xlsx`
      : `boletim-${aps.length}-apontamentos-${carimbo}.xlsx`,
  };
}

/**
 * Monta e entrega o arquivo. Separado de montarBoletim() porque só esta metade
 * depende do navegador — a montagem roda em teste sem DOM.
 */
export async function exportarBoletim(aps, nomeArquivoOrigem, conciliacoes = {}) {
  const { buffer, nome } = await montarBoletim(aps, nomeArquivoOrigem, conciliacoes);
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
