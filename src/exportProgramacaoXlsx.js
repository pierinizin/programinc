
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDateBR(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString('pt-BR');
}

function row(cells) {
  return `<Row>${cells
    .map((c) => {
      const style = c.style ? ` ss:StyleID="${c.style}"` : '';
      const mergeAcross = Number.isInteger(c.mergeAcross)
        ? ` ss:MergeAcross="${c.mergeAcross}"`
        : '';
      const type = c.type || 'String';
      return `<Cell${style}${mergeAcross}><Data ss:Type="${type}">${esc(
        c.value ?? ''
      )}</Data></Cell>`;
    })
    .join('')}</Row>`;
}

function stylesXml() {
  return `
  <Styles>
    <Style ss:ID="title">
      <Font ss:Bold="1" ss:Size="16"/>
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Interior ss:Color="#F4B400" ss:Pattern="Solid"/>
    </Style>

    <Style ss:ID="header">
      <Font ss:Bold="1"/>
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Interior ss:Color="#FFD966" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
      </Borders>
    </Style>

    <Style ss:ID="label">
      <Font ss:Bold="1"/>
      <Interior ss:Color="#FFF2CC" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
      </Borders>
    </Style>

    <Style ss:ID="value">
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
      </Borders>
    </Style>

    <Style ss:ID="cell">
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
      </Borders>
    </Style>

    <Style ss:ID="cellCenter">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
      </Borders>
    </Style>

    <Style ss:ID="empty">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:Italic="1"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
      </Borders>
    </Style>
  </Styles>`;
}

function workbook(sheetName, rows) {
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 ${stylesXml()}
 <Worksheet ss:Name="${esc(sheetName)}"><Table>${rows.join('')}</Table></Worksheet>
</Workbook>`;
}

function downloadExcelXml(xml, fileName) {
  const blob = new Blob([xml], {
    type: 'application/vnd.ms-excel;charset=utf-8;',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildMaps(db) {
  return {
    colaboradoresMap: Object.fromEntries((db.colaboradores || []).map((x) => [x.id, x])),
    veiculosMap: Object.fromEntries((db.veiculos || []).map((x) => [x.id, x])),
  };
}

function getTeamLabel(item) {
  return item.tipoEquipe || item.nomeEquipe || '';
}

function currentProgramacoes(db, dateStr) {
  return (db.programacoes || [])
    .filter((item) => item.data === dateStr)
    .sort((a, b) => getTeamLabel(a).localeCompare(getTeamLabel(b), 'pt-BR'));
}

export function exportProgramacaoXlsx(db, dateStr) {
  const { colaboradoresMap, veiculosMap } = buildMaps(db);
  const teams = currentProgramacoes(db, dateStr);

  const rows = [];
  rows.push(row([{ value: 'INCOVIA - PROGRAMAÇÃO DIÁRIA', style: 'title', mergeAcross: 11 }]));
  rows.push(row([
    { value: 'Data', style: 'label' },
    { value: formatDateBR(dateStr), style: 'value', mergeAcross: 3 },
    { value: 'Exportado em', style: 'label' },
    { value: new Date().toLocaleString('pt-BR'), style: 'value', mergeAcross: 6 },
  ]));
  rows.push(row([{ value: '' }]));
  rows.push(row([
    { value: 'TIPO DE EQUIPE', style: 'header' },
    { value: 'TIPO DE SERVIÇO', style: 'header' },
    { value: 'CIDADE', style: 'header' },
    { value: 'CONTRATANTE', style: 'header' },
    { value: 'ENCARREGADO', style: 'header' },
    { value: 'MEMBROS', style: 'header' },
    { value: 'VEÍCULOS', style: 'header' },
    { value: 'STATUS', style: 'header' },
    { value: 'MOTIVO', style: 'header' },
    { value: 'INÍCIO', style: 'header' },
    { value: 'SAÍDA ALMOÇO', style: 'header' },
    { value: 'RETORNO ALMOÇO', style: 'header' },
    { value: 'SAÍDA', style: 'header' },
  ]));

  if (!teams.length) {
    rows.push(row([{ value: 'Nenhuma programação para a data selecionada.', style: 'empty', mergeAcross: 12 }]));
  }

  teams.forEach((item) => {
    const membros = (item.membroIds || []).map((id) => colaboradoresMap[id]?.nome).filter(Boolean);
    const placas = (item.veiculoIds || []).map((id) => veiculosMap[id]?.placa).filter(Boolean);
    const encarregado = colaboradoresMap[item.encarregadoId]?.nome || '';

    rows.push(row([
      { value: getTeamLabel(item), style: 'cell' },
      { value: item.tipoServico || '', style: 'cell' },
      { value: item.cidade || '', style: 'cell' },
      { value: item.contratante || '', style: 'cell' },
      { value: encarregado, style: 'cell' },
      { value: membros.join(' | '), style: 'cell' },
      { value: placas.join(' | '), style: 'cell' },
      { value: item.statusExecucao || '', style: 'cellCenter' },
      { value: item.motivoNaoExecucao || '', style: 'cell' },
      { value: item.horarioInicio || '', style: 'cellCenter' },
      { value: item.horarioSaidaAlmoco || '', style: 'cellCenter' },
      { value: item.horarioRetornoAlmoco || '', style: 'cellCenter' },
      { value: item.horarioSaida || '', style: 'cellCenter' },
    ]));

    rows.push(row([
      { value: 'Observações', style: 'label' },
      { value: item.observacoes || '', style: 'value', mergeAcross: 11 },
    ]));
  });

  const xml = workbook('Programacao', rows);
  downloadExcelXml(xml, `programacao-atual-${formatDateBR(dateStr).replace(/\//g, '-')}.xls`);
}

/** Primeiro + último nome — "Adailton José de Jesus Santos" vira "ADAILTON SANTOS". */
function primeiroUltimoNome(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 1) return (partes[0] || '').toUpperCase();
  return `${partes[0]} ${partes[partes.length - 1]}`.toUpperCase();
}

/** Apelido é curto por natureza e fica como está; sem apelido, corta o nome. */
function nomeParaModeloAntigo(pessoa) {
  if (!pessoa) return '';
  const apelido = String(pessoa.apelido || '').trim();
  return apelido ? apelido.toUpperCase() : primeiroUltimoNome(pessoa.nome);
}

// programacaoForm.tipoEquipe guarda o nome completo do cadastro ("Pintura -
// Mecânica e Manual", "Implantação de Tachas", "Implantação de Defensa").
// O modelo antigo sempre usou a palavra curta — é essa que entra na linha.
// tipoServico foi descontinuado (App.jsx apaga esse campo antes de salvar),
// por isso não pode mais ser a fonte desta linha.
function tipoEquipeCurto(tipoEquipe) {
  const t = String(tipoEquipe || '').toUpperCase();
  if (t.includes('PINTURA')) return 'PINTURA';
  if (t.includes('TACHA')) return 'TACHAS';
  if (t.includes('DEFENSA')) return 'DEFENSAS';
  return t; // tipo novo, ainda sem abreviação combinada — mostra por extenso.
}

const MA_BORDA = { style: 'thin', color: { argb: 'FF000000' } };
const MA_BOX = { top: MA_BORDA, left: MA_BORDA, right: MA_BORDA, bottom: MA_BORDA };
const MA_VERMELHO = 'FFC00000';

function maCelula(ws, r, col, value, { bold = false, red = false, size = 14, align = 'center' } = {}) {
  const c = ws.getCell(r, col);
  c.value = value ?? '';
  c.font = { name: 'Calibri', size, bold, ...(red ? { color: { argb: MA_VERMELHO } } : {}) };
  c.alignment = { horizontal: align, vertical: 'middle', wrapText: true };
  c.border = MA_BOX;
  return c;
}

/**
 * Monta o workbook do "Modelo 02" — o layout que a Incovia usava no Excel
 * antes do sistema: uma coluna por equipe, encarregado e membros embaixo da
 * cidade e do contratante, quem faltou naquele dia aparece em vermelho.
 *
 * Separado de exportProgramacaoModeloAntigo() porque só a metade que baixa o
 * arquivo depende do navegador — esta metade roda em teste sem DOM.
 */
export async function montarProgramacaoModeloAntigo(db, dateStr) {
  const { default: ExcelJS } = await import('exceljs');
  const { colaboradoresMap, veiculosMap } = buildMaps(db);

  const teams = currentProgramacoes(db, dateStr).sort((a, b) =>
    (a.cidade || '').localeCompare(b.cidade || '', 'pt-BR')
  );

  // Total de faltas do canto: conta quem tem falta registrada NESTA data —
  // o mesmo critério que já pinta o nome de vermelho na equipe, para os dois
  // números nunca se contradizerem.
  const faltasSet = new Set(
    (db.faltas || [])
      .filter((f) => f.data === dateStr)
      .map((f) => f.colaboradorId)
  );

  const maxMembros = Math.max(9, ...teams.map((t) => (t.membroIds || []).length), 0);
  const maxVeiculos = Math.max(2, ...teams.map((t) => (t.veiculoIds || []).length), 0);

  const weekday = new Date(`${dateStr}T12:00:00`)
    .toLocaleDateString('pt-BR', { weekday: 'long' })
    .toUpperCase();
  const tituloData = `DIA - ${formatDateBR(dateStr).replace(/\//g, '-')} - ${weekday}`;

  const N = Math.max(teams.length, 1);
  const COL_TOTAL = N + 1; // coluna extra à direita: total de membros e total de faltas

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Incovia';
  wb.created = new Date();

  const nomeAba = (formatDateBR(dateStr).replace(/\//g, '-').slice(0, 5)) || 'Programacao';
  const ws = wb.addWorksheet(nomeAba, {
    views: [{ showGridLines: false }],
    pageSetup: {
      orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  });

  ws.columns = [
    ...Array.from({ length: N }, () => ({ width: 19 })),
    { width: 11 },
  ];

  let r = 1;

  // Título e data, mesclados sobre as colunas das equipes (a coluna de total
  // fica de fora — só passa a existir a partir da linha de efetivo).
  ws.mergeCells(r, 1, r, N);
  maCelula(ws, r, 1, 'PROGRAMAÇÃO DIÁRIA DE TRABALHOS', { bold: true, size: 16 });
  ws.getRow(r).height = 26;
  r += 1;

  ws.mergeCells(r, 1, r, N);
  maCelula(ws, r, 1, tituloData, { bold: true, size: 14, red: true, align: 'left' });
  ws.getRow(r).height = 22;
  r += 1;

  // Cidade e contratante, uma coluna por equipe.
  teams.forEach((item, idx) => maCelula(ws, r, idx + 1, (item.cidade || '').toUpperCase(), { bold: true }));
  if (!teams.length) maCelula(ws, r, 1, '', { bold: true });
  ws.getRow(r).height = 20;
  r += 1;

  teams.forEach((item, idx) => maCelula(ws, r, idx + 1, (item.contratante || '').toUpperCase(), { bold: true }));
  if (!teams.length) maCelula(ws, r, 1, '', { bold: true });
  ws.getRow(r).height = 20;
  r += 1;

  for (let c = 1; c <= N; c += 1) maCelula(ws, r, c, '');
  r += 1;

  // Encarregado sempre na primeira linha da equipe, depois o resto do time.
  // Quem tem falta registrada nesta data aparece em vermelho e negrito.
  for (let i = 0; i < maxMembros; i += 1) {
    for (let c = 1; c <= N; c += 1) {
      const item = teams[c - 1];
      if (!item) { maCelula(ws, r, c, ''); continue; }
      const ordenados = Array.from(
        new Set([item.encarregadoId, ...(item.membroIds || [])].filter(Boolean))
      );
      const membroId = ordenados[i];
      const pessoa = membroId ? colaboradoresMap[membroId] : null;
      const emFalta = Boolean(membroId && faltasSet.has(membroId));
      maCelula(ws, r, c, nomeParaModeloAntigo(pessoa), { red: emFalta, bold: emFalta, align: 'left' });
    }
    r += 1;
  }

  for (let c = 1; c <= N; c += 1) maCelula(ws, r, c, '');
  r += 1;
  for (let c = 1; c <= N; c += 1) maCelula(ws, r, c, '');
  r += 1;

  // Efetivo por equipe, com o total geral somado na coluna extra.
  teams.forEach((item, idx) => maCelula(ws, r, idx + 1, (item.membroIds || []).length, { bold: true }));
  if (!teams.length) maCelula(ws, r, 1, 0, { bold: true });
  const cEfetivo = ws.getCell(r, COL_TOTAL);
  cEfetivo.value = { formula: `SUM(A${r}:${letraColuna(N)}${r})` };
  cEfetivo.font = { name: 'Calibri', size: 12, bold: true };
  cEfetivo.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(r).height = 20;
  r += 1;

  for (let i = 0; i < maxVeiculos; i += 1) {
    teams.forEach((item, idx) => {
      const veiculoId = (item.veiculoIds || [])[i];
      const placa = veiculoId ? (veiculosMap[veiculoId]?.placa || '').toUpperCase() : '';
      maCelula(ws, r, idx + 1, placa, { bold: true });
    });
    if (!teams.length) maCelula(ws, r, 1, '', { bold: true });
    r += 1;
  }

  for (let c = 1; c <= N; c += 1) maCelula(ws, r, c, '');
  r += 1;

  teams.forEach((item, idx) => maCelula(ws, r, idx + 1, tipoEquipeCurto(getTeamLabel(item)), { bold: true }));
  if (!teams.length) maCelula(ws, r, 1, '', { bold: true });
  r += 1;

  const horarios = [
    (item) => item.horarioInicio || '07:30',
    (item) => item.horarioSaidaAlmoco || '11:30',
    (item) => item.horarioRetornoAlmoco || '13:00',
    (item) => item.horarioSaida || '17:48',
  ];
  horarios.forEach((getHorario) => {
    teams.forEach((item, idx) => maCelula(ws, r, idx + 1, idx === 0 ? getHorario(item) : '', { bold: true }));
    if (!teams.length) maCelula(ws, r, 1, getHorario({}), { bold: true });
    r += 1;
  });

  for (let c = 1; c <= N; c += 1) maCelula(ws, r, c, '');
  r += 1;

  // Rodapé: nome da empresa mesclado sobre as equipes, total de faltas do
  // dia na coluna extra — o mesmo critério que já pinta os nomes de vermelho.
  const rodape = r;
  ws.mergeCells(rodape, 1, rodape, N);
  maCelula(ws, rodape, 1, 'INCOVIA - SOLUÇÕES EM SINALIZAÇÃO VIÁRIA LTDA', { bold: true, size: 11, align: 'right' });
  ws.getRow(rodape).height = 18;

  const cRotuloFaltas = ws.getCell(rodape, COL_TOTAL);
  cRotuloFaltas.value = 'FALTAS';
  cRotuloFaltas.font = { name: 'Calibri', size: 8, bold: true, color: { argb: 'FF6B7784' } };
  cRotuloFaltas.alignment = { horizontal: 'center', vertical: 'bottom' };

  r += 1;
  const cTotalFaltas = ws.getCell(r, COL_TOTAL);
  cTotalFaltas.value = faltasSet.size;
  cTotalFaltas.font = { name: 'Calibri', size: 14, bold: true, color: { argb: MA_VERMELHO } };
  cTotalFaltas.alignment = { horizontal: 'center', vertical: 'middle' };
  cTotalFaltas.border = MA_BOX;
  ws.getRow(r).height = 20;

  return {
    buffer: await wb.xlsx.writeBuffer(),
    nome: `programacao-modelo-antigo-${formatDateBR(dateStr).replace(/\//g, '-')}.xlsx`,
  };
}

function letraColuna(n) {
  let s = '';
  let x = n;
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - m) / 26);
  }
  return s;
}

/**
 * Monta e entrega o arquivo. Separado de montarProgramacaoModeloAntigo()
 * porque só esta metade depende do navegador.
 */
export async function exportProgramacaoModeloAntigo(db, dateStr) {
  const { buffer, nome } = await montarProgramacaoModeloAntigo(db, dateStr);
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportPessoasXlsx(db) {
 const pessoas = [...(db.colaboradores || [])].sort((a, b) =>
   (a.nome || '').localeCompare(b.nome || '', 'pt-BR')
 );

 const rows = [];
 // Aumentei o mergeAcross de 5 para 6 para cobrir a coluna nova
 rows.push(row([{ value: 'INCOVIA - CADASTRO DE PESSOAS', style: 'title', mergeAcross: 6 }]));
 rows.push(row([
   { value: 'Exportado em', style: 'label' },
   { value: new Date().toLocaleString('pt-BR'), style: 'value', mergeAcross: 5 },
 ]));
 rows.push(row([{ value: '' }]));
 rows.push(row([
   { value: 'NOME', style: 'header' },
   { value: 'FUNÇÃO', style: 'header' },
   { value: 'TELEFONE', style: 'header' },
   { value: 'STATUS', style: 'header' },
   { value: 'FALTAS', style: 'header' },
   { value: 'ESCALAS', style: 'header' },
   { value: 'DATAS DAS FALTAS', style: 'header' }, // 🔥 COLUNA NOVA ADICIONADA AQUI
 ]));

 if (!pessoas.length) {
   rows.push(row([{ value: 'Nenhuma pessoa cadastrada.', style: 'empty', mergeAcross: 6 }]));
 }

 pessoas.forEach((pessoa) => {
   const escalas = (db.programacoes || []).filter((p) => (p.membroIds || []).includes(pessoa.id)).length;
   
   // Pegamos a lista inteira de faltas do colaborador, e não só o número
   const registrosFaltas = (db.faltas || []).filter((f) => f.colaboradorId === pessoa.id);
   const qtdFaltas = registrosFaltas.length;

   // Convertendo AAAA-MM-DD para DD/MM/AAAA e juntando tudo com vírgula
   const datasFaltasFormatadas = registrosFaltas.map((f) => {
     if (!f.data) return '';
     const [ano, mes, dia] = f.data.split('-');
     return `${dia}/${mes}/${ano}`;
   }).filter(Boolean).join(', ');

   rows.push(row([
     { value: pessoa.nome || '', style: 'cell' },
     { value: pessoa.funcao || '', style: 'cell' },
     { value: pessoa.telefone || '', style: 'cell' },
     { value: pessoa.status || '', style: 'cellCenter' },
     { value: qtdFaltas, type: 'Number', style: 'cellCenter' },
     { value: escalas, type: 'Number', style: 'cellCenter' },
     { value: datasFaltasFormatadas, style: 'cell' }, // 🔥 DADO INSERIDO AQUI
   ]));
 });

 const xml = workbook('Pessoas', rows);
 downloadExcelXml(xml, 'cadastro-pessoas.xls');
}

export function exportVeiculosXlsx(db) {
  const veiculos = [...(db.veiculos || [])].sort((a, b) =>
    (a.placa || '').localeCompare(b.placa || '', 'pt-BR')
  );

  const rows = [];
  rows.push(row([{ value: 'INCOVIA - CADASTRO DE VEÍCULOS', style: 'title', mergeAcross: 5 }]));
  rows.push(row([
    { value: 'Exportado em', style: 'label' },
    { value: new Date().toLocaleString('pt-BR'), style: 'value', mergeAcross: 4 },
  ]));
  rows.push(row([{ value: '' }]));
  rows.push(row([
    { value: 'PLACA', style: 'header' },
    { value: 'MODELO', style: 'header' },
    { value: 'ANO', style: 'header' },
    { value: 'TIPO', style: 'header' },
    { value: 'STATUS', style: 'header' },
    { value: 'UTILIZAÇÕES', style: 'header' },
  ]));

  if (!veiculos.length) {
    rows.push(row([{ value: 'Nenhum veículo cadastrado.', style: 'empty', mergeAcross: 5 }]));
  }

  veiculos.forEach((veiculo) => {
    const usos = (db.programacoes || []).filter((p) => (p.veiculoIds || []).includes(veiculo.id)).length;

    rows.push(row([
      { value: veiculo.placa || '', style: 'cell' },
      { value: veiculo.modelo || '', style: 'cell' },
      { value: veiculo.ano || '', type: 'Number', style: 'cellCenter' },
      { value: veiculo.tipo || '', style: 'cell' },
      { value: veiculo.status || '', style: 'cellCenter' },
      { value: usos, type: 'Number', style: 'cellCenter' },
    ]));
  });

  const xml = workbook('Veiculos', rows);
  downloadExcelXml(xml, 'cadastro-veiculos.xls');
}

export function exportHistoricoXlsx(db) {
  const { colaboradoresMap, veiculosMap } = buildMaps(db);
  const historico = [...(db.programacoes || [])].sort((a, b) => {
    if ((a.data || '') === (b.data || '')) {
      return getTeamLabel(a).localeCompare(getTeamLabel(b), 'pt-BR');
    }
    return (b.data || '').localeCompare(a.data || '');
  });

  const rows = [];
  rows.push(row([{ value: 'INCOVIA - HISTÓRICO / LOGS', style: 'title', mergeAcross: 14 }]));
  rows.push(row([
    { value: 'Exportado em', style: 'label' },
    { value: new Date().toLocaleString('pt-BR'), style: 'value', mergeAcross: 13 },
  ]));
  rows.push(row([{ value: '' }]));
  rows.push(row([
    { value: 'DATA', style: 'header' },
    { value: 'TIPO DE EQUIPE', style: 'header' },
    { value: 'TIPO DE SERVIÇO', style: 'header' },
    { value: 'CIDADE', style: 'header' },
    { value: 'CONTRATANTE', style: 'header' },
    { value: 'ENCARREGADO', style: 'header' },
    { value: 'MEMBROS', style: 'header' },
    { value: 'VEÍCULOS', style: 'header' },
    { value: 'STATUS', style: 'header' },
    { value: 'MOTIVO', style: 'header' },
    { value: 'OBSERVAÇÕES', style: 'header' },
    { value: 'INÍCIO', style: 'header' },
    { value: 'SAÍDA ALMOÇO', style: 'header' },
    { value: 'RETORNO ALMOÇO', style: 'header' },
    { value: 'SAÍDA', style: 'header' },
  ]));

  if (!historico.length) {
    rows.push(row([{ value: 'Nenhum histórico encontrado.', style: 'empty', mergeAcross: 14 }]));
  }

  historico.forEach((item) => {
    const membros = (item.membroIds || []).map((id) => colaboradoresMap[id]?.nome).filter(Boolean).join(' | ');
    const veiculos = (item.veiculoIds || []).map((id) => veiculosMap[id]?.placa).filter(Boolean).join(' | ');
    const encarregado = colaboradoresMap[item.encarregadoId]?.nome || '';

    rows.push(row([
      { value: formatDateBR(item.data), style: 'cell' },
      { value: getTeamLabel(item), style: 'cell' },
      { value: item.engenheiro || '', style: 'cell' }, // Nova coluna
      { value: item.tipoServico || '', style: 'cell' },
      { value: (item.cidade || '').toUpperCase(), style: 'cell' },
      { value: item.tipoServico || '', style: 'cell' },
      { value: item.cidade || '', style: 'cell' },
      { value: item.contratante || '', style: 'cell' },
      { value: encarregado, style: 'cell' },
      { value: membros, style: 'cell' },
      { value: veiculos, style: 'cell' },
      { value: item.statusExecucao || '', style: 'cellCenter' },
      { value: item.motivoNaoExecucao || '', style: 'cell' },
      { value: item.observacoes || '', style: 'cell' },
      { value: item.horarioInicio || '', style: 'cellCenter' },
      { value: item.horarioSaidaAlmoco || '', style: 'cellCenter' },
      { value: item.horarioRetornoAlmoco || '', style: 'cellCenter' },
      { value: item.horarioSaida || '', style: 'cellCenter' },
    ]));
  });

  const xml = workbook('Historico', rows);
  downloadExcelXml(xml, 'historico-logs.xls');
}
