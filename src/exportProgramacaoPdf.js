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
    .map((id) => maps.colaboradores[id]?.nome)
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

      <div class="meta-line">📍 ${esc((item.cidade || '').toLowerCase())} • 🏢 ${esc(item.contratante || '')}</div>

      <div class="label">MEMBROS</div>
      <div class="value members">${esc(members || 'Sem membros')}</div>

      <div class="label">VEÍCULOS</div>
      <div class="tags">
        ${vehicles.length ? vehicles.map((plate) => `<span class="tag">${esc(plate)}</span>`).join('') : '<span class="muted">Sem veículo</span>'}
      </div>

      <div class="label">TIPO DE SERVIÇO</div>
      <div class="value">Tipo de serviço: ${esc(item.tipoServico || '-')}</div>
    </article>
  `;
}

export function exportProgramacaoPdfModelo03(db, dateStr) {
  const programacoes = currentProgramacoes(db, dateStr);
  const maps = getMaps(db);
  const totalPessoas = programacoes.reduce((sum, item) => sum + (item.membroIds || []).length, 0);

  const cards = programacoes.length
    ? programacoes.map((item) => createCardHtml(item, maps)).join('')
    : '<div class="empty">Nenhuma programação para a data selecionada.</div>';

  const html = `
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>INCOVIA - PDF Modelo 03</title>
        <style>
          @page {
            size: A4 landscape;
            margin: 12mm;
          }

          * { box-sizing: border-box; }
          html, body {
            margin: 0;
            padding: 0;
            font-family: Arial, Helvetica, sans-serif;
            color: #0f2344;
            background: #fff;
          }

          body { padding: 0; }
          .page { width: 100%; }

          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 16px;
            border-bottom: 2px solid #f0d58a;
            padding-bottom: 12px;
            margin-bottom: 14px;
          }

          .brand {
            display: flex;
            align-items: center;
            gap: 12px;
          }

          .brand-box {
            width: 42px;
            height: 42px;
            border-radius: 12px;
            background: #f4c21a;
            display: grid;
            place-items: center;
            font-weight: 800;
            font-size: 22px;
          }

          .brand-text small {
            display: block;
            font-size: 11px;
            letter-spacing: 0.18em;
            color: #9d7a00;
            margin-bottom: 3px;
          }

          .brand-text strong {
            display: block;
            font-size: 28px;
            margin-bottom: 4px;
          }

          .brand-text span {
            font-size: 14px;
            color: #5f6f8c;
          }

          .stats {
            display: grid;
            grid-template-columns: repeat(3, minmax(120px, 1fr));
            gap: 10px;
            min-width: 420px;
          }

          .stat {
            border: 1px solid #ead18b;
            border-radius: 16px;
            padding: 10px 12px;
            background: #fffaf0;
          }

          .stat strong {
            display: block;
            font-size: 24px;
            margin-bottom: 4px;
          }

          .stat span {
            font-size: 12px;
            color: #6d7a93;
          }

          .cards {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
          }

          .pdf-card {
            break-inside: avoid;
            border: 1px solid #ead18b;
            border-radius: 18px;
            padding: 14px;
            background: #fff;
            min-height: 180px;
          }

          .pdf-card-head {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 12px;
            margin-bottom: 8px;
          }

          .pdf-card-head h3 {
            margin: 0;
            font-size: 18px;
            line-height: 1.2;
          }

          .status {
            white-space: nowrap;
            font-size: 11px;
            font-weight: 700;
            border-radius: 999px;
            padding: 6px 10px;
          }

          .status-running {
            background: #fff4cb;
            border: 1px solid #e2bf4d;
            color: #8a6b00;
          }

          .status-done {
            background: #dff8e8;
            border: 1px solid #98d3ac;
            color: #1f7a42;
          }

          .status-blocked {
            background: #fde7e7;
            border: 1px solid #e9b1b1;
            color: #b42318;
          }

          .meta-line {
            font-size: 12px;
            color: #5f6f8c;
            margin-bottom: 12px;
          }

          .label {
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 0.14em;
            color: #33415c;
            margin-bottom: 4px;
          }

          .value {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 12px;
            line-height: 1.4;
          }

          .members {
            min-height: 42px;
          }

          .tags {
            margin-bottom: 12px;
          }

          .tag {
            display: inline-block;
            background: #eef2f7;
            color: #0f2344;
            border-radius: 12px;
            padding: 6px 10px;
            font-size: 13px;
            font-weight: 700;
            margin: 0 6px 6px 0;
          }

          .muted {
            color: #7c8aa4;
            font-size: 13px;
          }

          .empty {
            border: 1px dashed #d6bf7a;
            border-radius: 18px;
            padding: 30px;
            text-align: center;
            color: #6d7a93;
            font-size: 15px;
          }

          .footer {
            margin-top: 16px;
            text-align: right;
            font-size: 11px;
            color: #6d7a93;
          }
        </style>
      </head>
      <body>
        <main class="page">
          <section class="header">
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
                <strong>${esc(formatDateLabel(dateStr))}</strong>
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
          </section>

          <section class="cards">${cards}</section>

          <div class="footer">INCOVIA • Modelo 03 • Gerado em ${esc(new Date().toLocaleString('pt-BR'))}</div>
        </main>
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
