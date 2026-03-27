
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

export function exportProgramacaoModeloAntigo(db, dateStr) {
  const { colaboradoresMap, veiculosMap } = buildMaps(db);

  const teams = currentProgramacoes(db, dateStr).sort((a, b) =>
    (a.cidade || '').localeCompare(b.cidade || '', 'pt-BR')
  );

  const faltasSet = new Set(
    (db.faltas || [])
      .filter((f) => f.data === dateStr)
      .map((f) => f.colaboradorId)
  );

  const maxMembros = Math.max(9, ...teams.map((t) => (t.membroIds || []).length));
  const maxVeiculos = Math.max(2, ...teams.map((t) => (t.veiculoIds || []).length));

  const weekday = new Date(`${dateStr}T12:00:00`)
    .toLocaleDateString('pt-BR', { weekday: 'long' })
    .toUpperCase();

  const tituloData = `DIA - ${formatDateBR(dateStr).replace(/\//g, '-')} - ${weekday}`;

  const cellStyle = 'border:1px solid #000;padding:4px 6px;font-family:Arial;font-size:12pt;vertical-align:middle;';
  const cellCenterStyle = `${cellStyle}text-align:center;`;
  const cellBoldCenterStyle = `${cellCenterStyle}font-weight:bold;`;
  const cellRedStyle = `${cellStyle}color:#c00000;font-weight:bold;`;

  const td = (value, style = cellStyle, extra = '') => `<td ${extra} style="${style}">${esc(value ?? '')}</td>`;

  const rows = [];

  rows.push(`
    <tr>
      <td colspan="${Math.max(teams.length, 1)}" style="${cellBoldCenterStyle}font-size:16pt;">
        PROGRAMAÇÃO DIÁRIA DE TRABALHOS
      </td>
    </tr>
  `);

  rows.push(`
    <tr>
      <td colspan="${Math.max(teams.length, 1)}" style="${cellRedStyle}font-size:14pt;">
        ${esc(tituloData)}
      </td>
    </tr>
  `);

  rows.push(`<tr>${teams.map((item) => td((item.cidade || '').toUpperCase(), cellBoldCenterStyle)).join('')}</tr>`);
  rows.push(`<tr>${teams.map((item) => td((item.contratante || '').toUpperCase(), cellBoldCenterStyle)).join('')}</tr>`);
  rows.push(`<tr>${teams.map(() => td('')).join('')}</tr>`);

  for (let i = 0; i < maxMembros; i += 1) {
    rows.push(`
      <tr>
        ${teams.map((item) => {
          const membroId = (item.membroIds || [])[i];
          const nome = membroId ? (colaboradoresMap[membroId]?.nome || '').toUpperCase() : '';
          return td(nome, membroId && faltasSet.has(membroId) ? cellRedStyle : cellStyle);
        }).join('')}
      </tr>
    `);
  }

  rows.push(`<tr>${teams.map(() => td('')).join('')}</tr>`);
  rows.push(`<tr>${teams.map(() => td('')).join('')}</tr>`);
  rows.push(`<tr>${teams.map((item) => td((item.membroIds || []).length, cellBoldCenterStyle)).join('')}</tr>`);

  for (let i = 0; i < maxVeiculos; i += 1) {
    rows.push(`
      <tr>
        ${teams.map((item) => {
          const veiculoId = (item.veiculoIds || [])[i];
          const placa = veiculoId ? (veiculosMap[veiculoId]?.placa || '').toUpperCase() : '';
          return td(placa, cellBoldCenterStyle);
        }).join('')}
      </tr>
    `);
  }

  rows.push(`<tr>${teams.map(() => td('')).join('')}</tr>`);
  rows.push(`<tr>${teams.map((item) => td((item.tipoServico || '').toUpperCase(), cellBoldCenterStyle)).join('')}</tr>`);
  rows.push(`<tr>${teams.map((item, idx) => td(idx === 0 ? item.horarioInicio || '07:30' : '', cellBoldCenterStyle)).join('')}</tr>`);
  rows.push(`<tr>${teams.map((item, idx) => td(idx === 0 ? item.horarioSaidaAlmoco || '11:30' : '', cellBoldCenterStyle)).join('')}</tr>`);
  rows.push(`<tr>${teams.map((item, idx) => td(idx === 0 ? item.horarioRetornoAlmoco || '13:00' : '', cellBoldCenterStyle)).join('')}</tr>`);
  rows.push(`<tr>${teams.map((item, idx) => td(idx === 0 ? item.horarioSaida || '17:48' : '', cellBoldCenterStyle)).join('')}</tr>`);
  rows.push(`<tr>${teams.map(() => td('')).join('')}</tr>`);
  rows.push(`
    <tr>
      <td colspan="${Math.max(teams.length, 1)}" style="${cellBoldCenterStyle}text-align:right;">
        INCOVIA - SOLUÇÕES EM SINALIZAÇÃO VIÁRIA LTDA
      </td>
    </tr>
  `);

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8" />
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
      </head>
      <body>
        <table border="1" cellspacing="0" cellpadding="0" style="border-collapse:collapse;table-layout:fixed;">
          ${rows.join('')}
        </table>
      </body>
    </html>
  `;

  const blob = new Blob([html], {
    type: 'application/vnd.ms-excel;charset=utf-8;',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `programacao-modelo-antigo-${formatDateBR(dateStr).replace(/\//g, '-')}.xls`;
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
