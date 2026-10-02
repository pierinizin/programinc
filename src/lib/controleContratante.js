/* =============================================================================
   Controle por contrato — exportação em Excel
   -----------------------------------------------------------------------------
   Modelo do Gabriel ("CONTROLE GARCIA SETEMBRO 26.xlsx"): uma linha por
   PESSOA por PERÍODO contínuo na mesma cidade e no mesmo contrato, com data
   inicial, data final e quantidade de dias. Agrupado por concessão
   (contrato), com uma linha em branco entre um contrato e outro.

   Quem escolhe o que entra é a lista de CONTRATOS da tela (agrupada por
   contratante): marca os contratos que quer e exporta. Programação gravada
   sem contrato aparece na lista como "sem contrato" do contratante dela.

   Uma tabela só. A primeira versão repetia a tabela ao lado (contratante x
   dono do contrato) e, como na prática os dois são a mesma empresa, o
   arquivo saía duplicado.

   Dias contados = dias em que a pessoa estava na equipe (encarregado ou
   membro). Dia com falta de DIA INTEIRO não conta — ela não trabalhou. Falta
   de meio período conta: ela foi pra obra.

   A parte que monta as linhas é pura (dá pra testar sem navegador); só
   baixarControle() depende do DOM.
   ============================================================================= */

const FOLGA_DIAS = 3;   // mesmo buraco tolerado nos Relatórios (lib/relatorios.js)
const MS_DIA = 86400000;
const MESES = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO',
  'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/\s+/g, ' ').trim();
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / MS_DIA);
const noPeriodo = (p, de, ate) => !((de && p.data < de) || (ate && p.data > ate));

/* Quem é o contratante de uma programação e a que "item" da lista ela
   pertence: o contrato dela, ou o "sem contrato" do contratante dela. */
function identificar(p, siglaDe, contratoDe) {
  const contrato = p.contrato_id ? contratoDe.get(p.contrato_id) : null;
  const contratante = (p.concessionaria_id && siglaDe.get(p.concessionaria_id))
    || String(p.contratante || '').trim()
    || (contrato && siglaDe.get(contrato.concessionaria_id))
    || 'SEM CONTRATANTE';
  if (contrato) {
    return {
      chave: `k:${contrato.id}`,
      contratante: String(siglaDe.get(contrato.concessionaria_id) || contratante).toUpperCase(),
      empresa: contratante.toUpperCase(),
      concessao: String(contrato.numero || '').trim().toUpperCase(),
    };
  }
  return {
    chave: `s:${norm(contratante)}`,
    contratante: contratante.toUpperCase(),
    empresa: contratante.toUpperCase(),
    concessao: '',
  };
}

/**
 * Lista pra tela: TODOS os contratos ativos, agrupados por contratante, com
 * em quantos dias do período cada um teve equipe — 0 quando não teve
 * nenhuma. Contrato inativo só aparece se teve programação no período.
 * [{ contratante, itens: [{ chave, rotulo, dias }] }]
 */
export function opcoesControle({ programacoes, concessionarias, contratos, de, ate }) {
  const siglaDe = new Map((concessionarias || []).map((c) => [c.id, String(c.sigla || '').trim()]));
  const contratoDe = new Map((contratos || []).map((k) => [k.id, k]));
  const grupos = new Map();
  const item = (contratante, chave, rotulo) => {
    if (!grupos.has(contratante)) grupos.set(contratante, new Map());
    const itens = grupos.get(contratante);
    if (!itens.has(chave)) itens.set(chave, { chave, rotulo, datas: new Set() });
    return itens.get(chave);
  };
  for (const k of contratos || []) {
    if (!k.ativo) continue;
    const sigla = String(siglaDe.get(k.concessionaria_id) || 'SEM CONTRATANTE').toUpperCase();
    item(sigla, `k:${k.id}`, String(k.numero || '').trim().toUpperCase() || 'sem número');
  }
  for (const p of programacoes || []) {
    if (!noPeriodo(p, de, ate)) continue;
    const id = identificar(p, siglaDe, contratoDe);
    item(id.contratante, id.chave, id.concessao || 'sem contrato').datas.add(p.data);
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    .map(([contratante, itens]) => ({
      contratante,
      itens: [...itens.values()].map(({ datas, ...i }) => ({ ...i, dias: datas.size })).sort((a, b) => (
        (a.rotulo === 'sem contrato') - (b.rotulo === 'sem contrato') || a.rotulo.localeCompare(b.rotulo, 'pt-BR')
      )),
    }));
}

/**
 * Linhas do controle dos itens marcados (chaves de opcoesControle) no período.
 * Devolve { blocos: [{ concessao, linhas }], empresas: [...] }.
 */
export function montarLinhasControle({
  programacoes, colaboradores, concessionarias, contratos, faltas, chaves, de, ate,
}) {
  const siglaDe = new Map((concessionarias || []).map((c) => [c.id, String(c.sigla || '').trim()]));
  const contratoDe = new Map((contratos || []).map((k) => [k.id, k]));
  const nomeDe = new Map((colaboradores || []).map((c) => [c.id, c.nome]));
  const marcadas = new Set(chaves || []);

  // Falta de dia inteiro: a pessoa não trabalhou naquele dia, mesmo estando na equipe.
  const faltouDia = new Set(
    (faltas || []).filter((f) => !f.programacao_id).map((f) => `${f.colaboradorId}|${f.data}`)
  );

  // 1) Um registro por pessoa por dia.
  const porPessoa = new Map();
  const empresas = [];
  for (const p of programacoes || []) {
    if (!noPeriodo(p, de, ate)) continue;
    const id = identificar(p, siglaDe, contratoDe);
    if (!marcadas.has(id.chave)) continue;
    if (!empresas.includes(id.empresa)) empresas.push(id.empresa);

    const pessoas = new Set([p.encarregadoId, ...(p.membroIds || [])].filter(Boolean));
    for (const pid of pessoas) {
      if (faltouDia.has(`${pid}|${p.data}`)) continue;
      if (!porPessoa.has(pid)) porPessoa.set(pid, []);
      porPessoa.get(pid).push({
        data: p.data,
        cidade: String(p.cidade || '').trim().toUpperCase(),
        empresa: id.empresa,
        concessao: id.concessao,
      });
    }
  }

  // 2) Dias seguidos no mesmo lugar viram um período (mesma regra dos Relatórios).
  const linhas = [];
  for (const [pid, dias] of porPessoa) {
    // A mesma pessoa em duas equipes do mesmo lugar no mesmo dia conta um dia só.
    const unicos = new Map();
    for (const d of dias) unicos.set(`${d.data}|${d.cidade}|${d.empresa}|${d.concessao}`, d);
    const ordenados = [...unicos.values()].sort((a, b) => a.data.localeCompare(b.data));

    const abertos = new Map();
    for (const d of ordenados) {
      const chave = `${d.cidade}|${d.empresa}|${d.concessao}`;
      const atual = abertos.get(chave);
      if (atual && diasEntre(atual.fim, d.data) <= FOLGA_DIAS) {
        atual.fim = d.data;
        atual.dias += 1;
        continue;
      }
      if (atual) linhas.push(atual);
      abertos.set(chave, {
        nome: String(nomeDe.get(pid) || 'COLABORADOR REMOVIDO').toUpperCase(),
        empresa: d.empresa,
        concessao: d.concessao,
        cidade: d.cidade,
        ini: d.data,
        fim: d.data,
        dias: 1,
      });
    }
    for (const per of abertos.values()) linhas.push(per);
  }

  // 3) Um bloco por concessão (contrato), em ordem alfabética; sem contrato por último.
  const blocosMap = new Map();
  for (const l of linhas) {
    const k = l.concessao || `~${l.empresa}`;
    if (!blocosMap.has(k)) blocosMap.set(k, []);
    blocosMap.get(k).push(l);
  }
  // (o "~" não basta: o localeCompare do pt-BR põe pontuação na frente)
  const blocos = [...blocosMap.entries()]
    .sort(([a], [b]) => (a.startsWith('~') - b.startsWith('~')) || a.localeCompare(b, 'pt-BR'))
    .map(([, ls]) => ({
      concessao: ls[0].concessao,
      linhas: ls.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.ini.localeCompare(b.ini)),
    }));

  empresas.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return { blocos, empresas };
}

/** "SETEMBRO 26" quando o período é um mês fechado; senão "01-09-26 A 15-10-26". */
export function rotuloPeriodo(de, ate) {
  const [a1, m1, d1] = de.split('-');
  const [a2, m2, d2] = ate.split('-');
  const ultimo = new Date(Date.UTC(Number(a2), Number(m2), 0)).getUTCDate();
  if (a1 === a2 && m1 === m2 && d1 === '01' && Number(d2) === ultimo) {
    return `${MESES[Number(m1) - 1]} ${a1.slice(2)}`;
  }
  return `${d1}-${m1}-${a1.slice(2)} A ${d2}-${m2}-${a2.slice(2)}`;
}

const COLUNAS = ['EMPRESA', 'CONCESSÃO', 'CIDADE', 'NOME', 'DATA INICIAL', 'DATA FINAL', 'QTD DIAS'];
const ESQUERDA = new Set([2, 3]);   // cidade e nome alinham à esquerda: leem melhor em coluna

const dataExcel = (iso) => {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
};

/** Monta o .xlsx (ExcelJS) e devolve { buffer, nome }. */
export async function montarControleXlsx({ dados, de, ate }) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Incovia';
  wb.created = new Date();
  const ws = wb.addWorksheet('Controle', { views: [{ state: 'frozen', ySplit: 2 }] });

  const NC = COLUNAS.length;
  const fina = { style: 'thin', color: { argb: 'FF000000' } };
  const media = { style: 'medium', color: { argb: 'FF000000' } };
  const fonte = { name: 'Arial', size: 10 };
  const titulo = dados.empresas.join(' / ');

  ws.mergeCells(1, 1, 1, NC);
  const t = ws.getCell(1, 1);
  t.value = titulo;
  t.font = { ...fonte, size: 11, bold: true };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  COLUNAS.forEach((rot, i) => {
    const h = ws.getCell(2, i + 1);
    h.value = rot;
    h.font = { ...fonte, bold: true };
    h.alignment = { horizontal: 'center', vertical: 'middle' };
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
  });
  ws.getRow(1).height = 18;
  ws.getRow(2).height = 16;

  // Largura de cada coluna pelo texto mais comprido dela — nada de nome
  // cortado no meio ("SSANDRO DE JESUS PRAXE").
  // Texto em CAIXA ALTA no Arial ocupa ~1,2 "caractere" de largura do Excel.
  const largura = (n) => Math.ceil(n * 1.2) + 4;
  const larguras = COLUNAS.map((c) => largura(c.length));
  let r = 3;
  dados.blocos.forEach((bloco, bi) => {
    if (bi > 0) r += 1;               // linha em branco entre contratos
    for (const l of bloco.linhas) {
      const vals = [l.empresa, l.concessao || 'SEM CONTRATO', l.cidade, l.nome,
        dataExcel(l.ini), dataExcel(l.fim), l.dias];
      vals.forEach((v, i) => {
        const c = ws.getCell(r, i + 1);
        c.value = v;
        c.font = fonte;
        c.alignment = ESQUERDA.has(i)
          ? { horizontal: 'left', vertical: 'middle', indent: 1 }
          : { horizontal: 'center', vertical: 'middle' };
        if (i === 4 || i === 5) c.numFmt = 'dd/mm/yyyy';
        const tam = v instanceof Date ? 10 : String(v).length;
        larguras[i] = Math.max(larguras[i], largura(tam));
      });
      r += 1;
    }
  });
  larguras.forEach((w, i) => { ws.getColumn(i + 1).width = Math.min(w, 60); });
  const ultima = Math.max(r - 1, 2);

  // bordas: fina em tudo, média no contorno
  for (let rr = 1; rr <= ultima; rr += 1) {
    for (let cc = 1; cc <= NC; cc += 1) {
      ws.getCell(rr, cc).border = {
        top: rr <= 2 ? media : fina,
        bottom: rr === ultima || rr <= 2 ? media : fina,
        left: cc === 1 ? media : fina,
        right: cc === NC ? media : fina,
      };
    }
  }

  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };

  const nomeEmpresas = dados.empresas.join(' - ').replace(/[\\/:*?"<>|]/g, '-');
  return {
    buffer: await wb.xlsx.writeBuffer(),
    nome: `CONTROLE ${nomeEmpresas} ${rotuloPeriodo(de, ate)}.xlsx`,
  };
}

/** Monta e baixa. Única parte que depende do navegador. */
export async function baixarControle(args) {
  const { buffer, nome } = await montarControleXlsx(args);
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
