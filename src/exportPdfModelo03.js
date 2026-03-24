export function exportPdfModelo03(db, dateStr) {
  const programacoes = (db.programacoes || []).filter((item) => item.data === dateStr);

  const colaboradoresMap = Object.fromEntries((db.colaboradores || []).map((x) => [x.id, x]));
  const veiculosMap = Object.fromEntries((db.veiculos || []).map((x) => [x.id, x]));

  const totalEquipes = programacoes.length;
  const totalPessoas = programacoes.reduce(
    (acc, item) => acc + (item.membroIds || []).length,
    0
  );

  const dataFormatada = new Date(`${dateStr}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const cardsHtml = programacoes
    .map((item) => {
      const membros = (item.membroIds || [])
        .map((id) => colaboradoresMap[id]?.nome)
        .filter(Boolean)
        .join(" · ");

      const veiculos = (item.veiculoIds || [])
        .map((id) => veiculosMap[id]?.placa)
        .filter(Boolean)
        .join(" · ");

      return `
        <div class="card">
          <div class="card-top">
            <div class="titulo">${escapeHtml(item.nomeEquipe || "")}</div>
            <div class="status">${escapeHtml(item.statusExecucao || "")}</div>
          </div>

          <div class="linha">
            <span>${escapeHtml(item.cidade || "")}</span>
            <span>•</span>
            <span>${escapeHtml(item.contratante || "")}</span>
          </div>

          <div class="bloco">
            <div class="rotulo">MEMBROS</div>
            <div class="valor">${escapeHtml(membros || "-")}</div>
          </div>

          <div class="bloco">
            <div class="rotulo">VEÍCULOS</div>
            <div class="tag">${escapeHtml(veiculos || "-")}</div>
          </div>

          <div class="bloco">
            <div class="rotulo">TIPO DE SERVIÇO</div>
            <div class="valor">Tipo de serviço: ${escapeHtml(item.tipoServico || "-")}</div>
          </div>
        </div>
      `;
    })
    .join("");

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>PDF Modelo 03</title>
        <style>
          @page {
            size: A4 landscape;
            margin: 12mm;
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            font-family: Arial, sans-serif;
            color: #111827;
          }

          .topo {
            margin-bottom: 16px;
            border-bottom: 2px solid #e5c96b;
            padding-bottom: 10px;
          }

          .empresa {
            font-size: 24px;
            font-weight: 700;
          }

          .sub {
            margin-top: 6px;
            font-size: 14px;
          }

          .resumo {
            display: flex;
            gap: 24px;
            margin-top: 8px;
            font-size: 14px;
          }

          .grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 14px;
          }

          .card {
            border: 1px solid #e5c96b;
            border-radius: 18px;
            padding: 14px;
            break-inside: avoid;
          }

          .card-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 12px;
            margin-bottom: 8px;
          }

          .titulo {
            font-size: 22px;
            font-weight: 800;
          }

          .status {
            border: 1px solid #d7b748;
            background: #fff4c7;
            color: #8a6b00;
            border-radius: 999px;
            padding: 6px 10px;
            font-size: 12px;
            font-weight: 700;
            white-space: nowrap;
          }

          .linha {
            font-size: 13px;
            color: #4b5563;
            display: flex;
            gap: 8px;
            margin-bottom: 14px;
          }

          .bloco {
            margin-bottom: 12px;
          }

          .rotulo {
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 0.12em;
            color: #374151;
            margin-bottom: 4px;
          }

          .valor {
            font-size: 16px;
            font-weight: 600;
            line-height: 1.4;
          }

          .tag {
            display: inline-block;
            background: #eef2f7;
            border-radius: 12px;
            padding: 8px 12px;
            font-size: 16px;
            font-weight: 700;
          }
        </style>
      </head>
      <body>
        <div class="topo">
          <div class="empresa">INCOVIA</div>
          <div class="sub">Programação Diária - PDF Modelo 03</div>
          <div class="resumo">
            <div><strong>Data:</strong> ${escapeHtml(dataFormatada)}</div>
            <div><strong>Equipes:</strong> ${totalEquipes}</div>
            <div><strong>Pessoas:</strong> ${totalPessoas}</div>
          </div>
        </div>

        <div class="grid">
          ${cardsHtml || "<div>Nenhuma programação encontrada para esta data.</div>"}
        </div>
      </body>
    </html>
  `;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.visibility = "hidden";

  iframe.onload = () => {
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();

      setTimeout(() => {
        iframe.remove();
      }, 1500);
    }, 300);
  };

  document.body.appendChild(iframe);
  iframe.srcdoc = html;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
