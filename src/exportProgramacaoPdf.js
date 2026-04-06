function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateLabel(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  const weekday = d.toLocaleDateString('pt-BR', { weekday: 'long' });
  const full = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  return `${weekday} • ${full}`;
}

function currentProgramacoes(db, dateStr) {
  return (db.programacoes || [])
    .filter((item) => item.data === dateStr)
    .sort((a, b) => (a.tipoEquipe || a.nomeEquipe || '').localeCompare((b.tipoEquipe || b.nomeEquipe || ''), 'pt-BR'));
}

function getMaps(db) {
  return {
    colaboradores: Object.fromEntries((db.colaboradores || []).map((x) => [x.id, x])),
    veiculos: Object.fromEntries((db.veiculos || []).map((x) => [x.id, x])),
  };
}

function createCardHtml(item, maps) {
  const members = (item.membroIds || [])
    .map((id) => {
      const p = maps.colaboradores[id];
      return p ? (p.apelido && p.apelido.trim() !== '' ? p.apelido : p.nome) : null;
    })
    .filter(Boolean)
    .join(' • ');

  const vehicles = (item.veiculoIds || [])
    .map((id) => maps.veiculos[id]?.placa)
    .filter(Boolean);

  const statusTone = item.statusExecucao === 'CONCLUÍDO'
    ? 'status-done'
    : item.statusExecucao === 'NÃO FOI POSSÍVEL REALIZAR'
      ? 'status-blocked'
      : 'status-running';

  return `
    <article class="pdf-card">
      <div class="pdf-card-head">
        <h3>${esc(item.tipoEquipe || item.nomeEquipe || '')}</h3>
        <span class="status ${statusTone}">${esc(item.statusExecucao || '')}</span>
      </div>

      <div class="meta-line">📍 ${esc((item.cidade || '').toUpperCase())} • 🏢 ${esc(item.contratante || '')}</div>

      <div class="label">ENGENHEIRO</div>
      <div class="value engineer-line">${esc(item.engenheiro || 'Não informado')}</div>

      <div class="label">MEMBROS</div>
      <div class="value members-box">${esc(members || 'Sem membros')}</div>

      <div class="label">VEÍCULOS</div>
      <div class="value vehicles-box">
        <div class="tags">
          ${vehicles.length ? vehicles.map((plate) => `<span class="tag">${esc(plate)}</span>`).join('') : '<span class="muted">Sem veículo</span>'}
        </div>
      </div>

      <div class="label">TIPO DE SERVIÇO</div>
      <div class="value service-box">${esc(item.tipoServico || '-')}</div>
    </article>
  `;
}

export function exportProgramacaoPdfModelo03(db, dateStr) {
  const programacoes = currentProgramacoes(db, dateStr);
  const maps = getMaps(db);
  const totalPessoas = programacoes.reduce((sum, item) => sum + (item.membroIds || []).length, 0);

  // 1. FATIANDO AS EQUIPES DE 6 EM 6 (3 colunas x 2 linhas)
  const pages = [];
  for (let i = 0; i < programacoes.length; i += 6) {
    pages.push(programacoes.slice(i, i + 6));
  }

  // 2. CONSTRUINDO AS PÁGINAS ISOLADAS
  const pagesHtml = pages.map((pageItems, pageIndex) => {
    
    const cardsHtml = pageItems.map(item => createCardHtml(item, maps)).join('');
    const pageBreakClass = pageIndex < pages.length - 1 ? 'page-break' : '';

    return `
      <div class="pdf-page ${pageBreakClass}">
        
        <div class="header-container">
          <div class="brand">
            <div class="brand-box">I</div>
            <div class="brand-text">
              <small>PAINEL OPERACIONAL</small>
              <strong>Incovia</strong>
              <span>Programação Diária • PDF Modelo 03</span>
            </div>
          </div>

          <div class="stats">
            <div class="stat">
              <strong style="text-transform: capitalize;">${esc(formatDateLabel(dateStr))}</strong>
              <span>Data da programação</span>
            </div>
            <div class="stat">
              <strong>${programacoes.length}</strong>
              <span>Total de equipes</span>
            </div>
            <div class="stat">
              <strong>${totalPessoas}</strong>
              <span>Total de pessoas</span>
            </div>
          </div>
        </div>

        <div class="pdf-grid">
          ${cardsHtml}
        </div>
        
        <div class="footer">
           Página ${pageIndex + 1} de ${pages.length} • INCOVIA • Gerado em ${esc(new Date().toLocaleString('pt-BR'))}
        </div>
      </div>
    `;
  }).join('');

  const html = `
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>INCOVIA - PDF Modelo 03</title>
        <style>
          @page {
            size: A4 landscape;
            margin: 0;
          }

          * { box-sizing: border-box; }
          html, body {
            margin: 0;
            padding: 0;
            font-family: Arial, Helvetica, sans-serif;
            color: #0f2344;
            background: #fff;
          }

          /* --- CONTROLE DE FOLHA A4 --- */
          .pdf-page {
            width: 297mm;  /* Largura exata do A4 deitado */
            height: 210mm; /* Altura exata do A4 deitado */
            padding: 10mm; /* Margem interna confortável */
            display: flex;
            flex-direction: column;
            overflow: hidden;
          }

          /* --- FORÇA A QUEBRA DE PÁGINA NA IMPRESSORA --- */
          .page-break {
            page-break-after: always;
            break-after: page;
          }

          /* --- ESTILO DO CABEÇALHO --- */
          .header-container {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 16px;
            border-bottom: 2px solid #f0d58a;
            padding-bottom: 12px;
            margin-bottom: 16px;
            flex-shrink: 0; 
          }

          .brand { display: flex; align-items: center; gap: 12px; }
          .brand-box { width: 42px; height: 42px; border-radius: 10px; background: #f4c21a; display: grid; place-items: center; font-weight: 800; font-size: 22px; }
          .brand-text small { display: block; font-size: 11px; letter-spacing: 0.18em; color: #9d7a00; margin-bottom: 2px; }
          .brand-text strong { display: block; font-size: 26px; margin-bottom: 2px; }
          .brand-text span { font-size: 13px; color: #5f6f8c; }

          .stats { display: flex; gap: 10px; }
          .stat { border: 1px solid #ead18b; border-radius: 12px; padding: 10px 14px; background: #fffaf0; min-width: 140px; }
          .stat strong { display: block; font-size: 20px; margin-bottom: 2px; }
          .stat span { font-size: 11px; color: #6d7a93; }

          /* --- GRADE PERFEITA DE 3 COLUNAS x 2 LINHAS --- */
          .pdf-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr); 
            grid-template-rows: repeat(2, 1fr);    /* Agora são 2 linhas para dar respiro! */
            gap: 12px;
            flex-grow: 1; 
            min-height: 0;
          }

          /* --- PADRONIZAÇÃO DOS CARTÕES --- */
          .pdf-card {
            border: 1px solid #ead18b;
            border-radius: 12px;
            padding: 14px 16px;
            background: #fff;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            height: 100%;
          }

          .pdf-card-head {
            display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;
            min-height: 40px; 
            margin-bottom: 8px;
          }
          .pdf-card-head h3 { margin: 0; font-size: 16px; line-height: 1.2; }

          .status { white-space: nowrap; font-size: 10px; font-weight: 800; border-radius: 999px; padding: 5px 8px; }
          .status-running { background: #fff4cb; border: 1px solid #e2bf4d; color: #8a6b00; }
          .status-done { background: #dff8e8; border: 1px solid #98d3ac; color: #1f7a42; }
          .status-blocked { background: #fde7e7; border: 1px solid #e9b1b1; color: #b42318; }

          .meta-line { font-size: 11px; color: #5f6f8c; margin-bottom: 12px; font-weight: bold; }
          .label { font-size: 10px; font-weight: 800; letter-spacing: 0.12em; color: #8c98a4; margin-bottom: 4px; }
          .value { font-size: 12px; font-weight: 600; margin-bottom: 12px; line-height: 1.4; }

          /* TRAVAS DE ALTURA PARA ALINHAMENTO COM MAIS ESPAÇO */
          .engineer-line { color: #1a365d; min-height: 16px; }
          .members-box { min-height: 60px; max-height: 75px; overflow: hidden; } /* Agora cabem ~4 linhas completas de nomes */
          .vehicles-box { min-height: 35px; } /* Cabe folgadamente os veículos */
          .service-box { min-height: 16px; margin-bottom: 0; }

          .tags { display: flex; flex-wrap: wrap; gap: 6px; }
          .tag { background: #eef2f7; color: #0f2344; border-radius: 8px; padding: 5px 8px; font-size: 11px; font-weight: 700; }
          .muted { color: #7c8aa4; font-size: 11px; }

          .no-data { text-align: center; padding: 40px; color: #6d7a93; font-style: italic; }
          
          /* RODAPÉ E PAGINAÇÃO */
          .footer { 
            margin-top: 12px; 
            text-align: right; 
            font-size: 10px; 
            color: #6d7a93; 
            flex-shrink: 0; 
            border-top: 1px solid #eee;
            padding-top: 6px;
          }
        </style>
      </head>
      <body>
        ${programacoes.length === 0 ? '<div class="no-data">Nenhuma programação para a data selecionada.</div>' : pagesHtml}
      </body>
    </html>
  `;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';

  iframe.onload = () => {
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => iframe.remove(), 1500);
    }, 300);
  };

  document.body.appendChild(iframe);
  iframe.srcdoc = html;
}

export default exportProgramacaoPdfModelo03;