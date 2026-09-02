/**
 * Leitura do export do Kartado e conciliação com as programações do Incovia.
 *
 * O parser é dirigido pelo cabeçalho e aceita os dois formatos que o Kartado
 * exporta, sem alteração:
 *   · blocos repetidos  "Serviços (Manual) 1: Km Inicial", "... 2: ..."
 *   · colunas planas    m1..m10 + Média de Leituras   (ensaios)
 *
 * As bibliotecas de planilha são pesadas (7 MB + 23 MB no node_modules), então
 * entram por import dinâmico — quem nunca abre esta aba não paga por elas.
 */

const IDENT = [
  'Serial', 'Serial Inventário Vinculado', 'Natureza', 'Status', 'Criado por',
  'Empresa', 'Equipe', 'Criado em', 'Encontrado em', 'Atualizado em',
  'Executado em', 'Cliente', 'Contrato', 'Encarregado', 'Local de Obra',
  'Fechamento de pista', 'Liberação de pista', 'Engenheiro responsável',
];

const RE_BLOCO = /^(.*?)\s(\d+):\s*(.+)$/;
const RE_LEITURA = /^m(\d+)$/i;
const RE_FOTO = /^foto\s*\d*$/i;

// Campo do bloco -> chave interna. Os nomes variam com a natureza
// ("Extensão de Pintura Manual" x "Extensão"), então casamos por prefixo.
const CAMPOS = [
  [/^km inicial/i, 'kmIni'],
  [/^km final/i, 'kmFim'],
  [/^cor/i, 'cor'],
  [/^local de apl/i, 'local'],
  [/^tipo de faixa/i, 'tipoFaixa'],
  [/^quantidade de faixas/i, 'faixas'],
  [/^extens/i, 'ext'],
  [/^largura/i, 'larg'],
  // A Kartado exporta DUAS colunas de área por serviço — uma para faixa
  // contínua, outra para seccionada — e só uma vem preenchida por vez (a
  // outra vem 0). Um único padrão "^área total" pegaria as duas iguais e
  // a que vier depois no arquivo sobrescreveria a primeira; separadas,
  // dá pra somar sem depender de casar o texto do tipo de faixa.
  [/^[áa]rea total.*seccionada/i, 'areaSeccionada'],
  [/^[áa]rea total.*cont[ií]nua/i, 'areaContinua'],
  [/^[áa]rea total/i, 'area'],
  [/^observa/i, 'obs'],
  [/^tamanho da se/i, 'secao'],
  [/^cad/i, 'cadencia'],
  [/^quantidade$/i, 'qtd'],
  [/^unidade/i, 'un'],
  [/^lado/i, 'lado'],
];
const NUMERICOS = new Set([
  'kmIni', 'kmFim', 'faixas', 'ext', 'larg', 'area', 'areaSeccionada', 'areaContinua', 'secao', 'qtd',
]);

function chaveCampo(nome) {
  const n = String(nome || '').trim();
  for (const [re, k] of CAMPOS) if (re.test(n)) return k;
  return null;
}

// O Kartado devolve vários campos com espaço sobrando ("EPR ", "Fabiano ").
export function texto(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  return String(v).trim();
}

export function num(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  let s = texto(v);
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Normaliza para comparar: sem acento, sem pontuação, minúsculo, espaço único. */
export function normal(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dataISO(v) {
  if (!(v instanceof Date) || Number.isNaN(v.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
}

export function dataBR(iso) {
  if (!iso) return '—';
  const [a, m, d] = String(iso).split('-');
  return d ? `${d}/${m}/${a}` : iso;
}

/* ======================================================================
   PARSER
   ====================================================================== */
export async function lerArquivo(arquivo) {
  const XLSX = await import('xlsx');
  const buf = await arquivo.arrayBuffer();
  const wb = XLSX.read(buf, { cellDates: true });
  const aps = [];
  const avisos = [];

  wb.SheetNames.forEach((nomeAba) => {
    const linhas = XLSX.utils.sheet_to_json(wb.Sheets[nomeAba], {
      header: 1, raw: true, cellDates: true, defval: null,
    });
    if (!linhas.length) return;

    const iHead = linhas.findIndex(
      (l) => l && l.some((c) => texto(c).toLowerCase() === 'serial')
    );
    if (iHead < 0) {
      avisos.push(`Aba "${nomeAba}" ignorada: não encontrei a coluna Serial.`);
      return;
    }
    const head = linhas[iHead].map((h) => texto(h));

    // separa colunas simples das que pertencem a um bloco repetido
    const simples = [];
    const blocos = {};
    head.forEach((h, i) => {
      if (!h) return;
      const m = h.match(RE_BLOCO);
      if (m) {
        const [, grupo, idx, campo] = m;
        blocos[grupo] = blocos[grupo] || {};
        blocos[grupo][+idx] = blocos[grupo][+idx] || [];
        blocos[grupo][+idx].push({ i, campo });
      } else {
        simples.push({ i, h });
      }
    });
    const grupoServ =
      Object.keys(blocos).find((g) => /servi/i.test(g)) || Object.keys(blocos)[0];

    for (let r = iHead + 1; r < linhas.length; r += 1) {
      const L = linhas[r];
      if (!L) continue;
      const pega = (h) => {
        const c = simples.find((s) => s.h === h);
        return c ? L[c.i] : null;
      };
      const serial = texto(pega('Serial'));
      // a última linha do export do Kartado é "TOTAIS" — não é apontamento
      if (!serial || serial.toUpperCase() === 'TOTAIS') continue;

      const ident = {};
      IDENT.forEach((h) => { ident[h] = pega(h); });

      const extras = {};
      const leituras = [];
      simples.forEach(({ i, h }) => {
        if (IDENT.includes(h) || RE_FOTO.test(h)) return;
        const v = L[i];
        if (v === null || v === undefined || !texto(v)) return;
        const m = h.match(RE_LEITURA);
        if (m) leituras.push([+m[1], v]);
        else extras[h] = v;
      });

      const servicos = [];
      if (grupoServ && blocos[grupoServ]) {
        Object.keys(blocos[grupoServ]).map(Number).sort((a, b) => a - b).forEach((idx) => {
          const s = { n: idx };
          blocos[grupoServ][idx].forEach(({ i, campo }) => {
            const v = L[i];
            if (v === null || v === undefined || !texto(v)) return;
            const k = chaveCampo(campo);
            if (k) s[k] = NUMERICOS.has(k) ? num(v) : texto(v);
          });
          // A Kartado sempre deixa uma das duas colunas de área zerada —
          // somar as duas dá o valor certo sem precisar decidir qual vale.
          if (s.areaSeccionada != null || s.areaContinua != null) {
            s.area = (s.areaSeccionada || 0) + (s.areaContinua || 0);
          }
          // bloco vazio é slot não usado do formulário, não serviço
          const preenchido = ['kmIni', 'ext', 'area', 'qtd'].some(
            (k) => s[k] !== null && s[k] !== undefined
          );
          if (preenchido) servicos.push(s);
        });
      }

      const fotos = simples.filter(
        ({ i, h }) => RE_FOTO.test(h) && L[i] !== null && texto(L[i])
      ).length;

      aps.push({
        aba: nomeAba,
        serial,
        ident,
        extras,
        servicos,
        leituras: leituras.sort((a, b) => a[0] - b[0]),
        fotos,
        // Você confirmou: a data do trabalho é "Executado em".
        data: dataISO(ident['Executado em']),
        encarregado: texto(ident.Encarregado),
        criadoPor: texto(ident['Criado por']),
        localObra: texto(ident['Local de Obra']),
        cliente: texto(ident.Cliente),
        contrato: texto(ident.Contrato),
        natureza: texto(ident.Natureza),
        status: texto(ident.Status),
        tipo: texto(extras['Tipo de Pintura Manual'] || extras['Tipo de Pintura Mecânica']
          || extras['Item de Serviço'] || ''),
        area: servicos.reduce((t, s) => t + (s.area || 0), 0),
        ext: servicos.reduce((t, s) => t + (s.ext || 0), 0),
      });
    }
  });

  aps.sort((a, b) => (a.data || '').localeCompare(b.data || '') || a.serial.localeCompare(b.serial));
  return { aps, avisos };
}

/* ======================================================================
   CONCILIAÇÃO
   ----------------------------------------------------------------------
   Os dois sistemas não têm chave em comum. O casamento é deduzido de
   campos digitados por pessoas diferentes:

     data           obrigatória  — sem ela não há proposta
     encarregado    peso alto    — o Kartado grava só o primeiro nome
     local de obra  peso alto    — contém a cidade ("Maringá a Paiçandu")
     contratante    confere      — desempate

   Por isso nada é marcado sozinho: o sistema propõe com o grau de certeza
   e as provas à vista, e a confirmação é sua.
   ====================================================================== */

const CERTEZA = { alta: 'alta', media: 'media', nenhuma: 'nenhuma' };

function primeiroNome(s) {
  return normal(s).split(' ')[0] || '';
}

/**
 * Pontua o quanto uma programação combina com um apontamento.
 * Devolve { pontos, provas } — provas alimentam a explicação na tela.
 */
function pontuar(ap, prog, colaboradores) {
  const provas = [];
  let pontos = 0;

  // ---- encarregado ----
  const lider = prog.encarregadoId ? colaboradores[prog.encarregadoId] : null;
  const nomeKartado = normal(ap.encarregado);
  if (lider && nomeKartado) {
    const nomeIncovia = normal(lider.nome);
    const apelido = normal(lider.apelido);
    if (nomeIncovia === nomeKartado || apelido === nomeKartado) {
      pontos += 50;
      provas.push(['bate', 'Encarregado bate']);
    } else if (primeiroNome(nomeIncovia) === primeiroNome(nomeKartado)) {
      // O Kartado grava só o primeiro nome ("Fabiano"). Quando há mais de um
      // no cadastro, "Criado por" traz o nome completo e desempata.
      const completo = normal(ap.criadoPor);
      if (completo && completo === nomeIncovia) {
        pontos += 50;
        provas.push(['bate', 'Encarregado bate (confirmado por "Criado por")']);
      } else {
        pontos += 35;
        provas.push(['bate', `Primeiro nome bate (${texto(ap.encarregado)})`]);
      }
    } else {
      provas.push(['nao', `Encarregado difere: ${texto(ap.encarregado)} × ${lider.nome}`]);
    }
  } else if (!lider) {
    provas.push(['nao', 'Programação sem encarregado']);
  }

  // ---- cidade dentro do local de obra ----
  const local = normal(ap.localObra);
  const cidade = normal(prog.cidade);
  if (cidade && local) {
    if (local.includes(cidade)) {
      pontos += 35;
      provas.push(['bate', `${prog.cidade} aparece no local de obra`]);
    } else {
      provas.push(['nao', `Local de obra não cita ${prog.cidade}`]);
    }
  }

  // ---- contratante ----
  const contr = normal(prog.contratante);
  const cliente = normal(ap.cliente || ap.contrato);
  if (contr && cliente) {
    if (contr === cliente || cliente.includes(contr) || contr.includes(cliente)) {
      pontos += 15;
      provas.push(['bate', 'Contratante confere']);
    } else {
      provas.push(['nao', `Contratante difere: ${texto(ap.cliente)} × ${prog.contratante}`]);
    }
  }

  return { pontos, provas };
}

/**
 * Para cada apontamento, encontra a melhor programação do mesmo dia.
 * Devolve [{ ap, prog, alternativas, certeza, provas, pontos }].
 */
export function conciliar(aps, programacoes, colaboradores) {
  return aps.map((ap) => {
    const doDia = ap.data ? programacoes.filter((p) => p.data === ap.data) : [];

    if (!doDia.length) {
      return {
        ap,
        prog: null,
        alternativas: [],
        certeza: CERTEZA.nenhuma,
        pontos: 0,
        provas: [['nao', ap.data
          ? `Nenhuma programação em ${dataBR(ap.data)}`
          : 'Apontamento sem data de execução']],
      };
    }

    const notas = doDia
      .map((prog) => ({ prog, ...pontuar(ap, prog, colaboradores) }))
      .sort((a, b) => b.pontos - a.pontos);

    const melhor = notas[0];
    const segundo = notas[1];

    let certeza = CERTEZA.nenhuma;
    if (melhor.pontos >= 70) certeza = CERTEZA.alta;
    else if (melhor.pontos >= 35) certeza = CERTEZA.media;

    // Empate técnico entre duas programações rebaixa a certeza: preferimos
    // perguntar a errar em silêncio.
    if (certeza === CERTEZA.alta && segundo && melhor.pontos - segundo.pontos < 20) {
      certeza = CERTEZA.media;
      melhor.provas.push(['nao', 'Outra equipe do dia tem pontuação parecida']);
    }

    return {
      ap,
      prog: certeza === CERTEZA.nenhuma ? null : melhor.prog,
      alternativas: doDia,
      certeza,
      pontos: melhor.pontos,
      provas: melhor.provas,
    };
  });
}

/** Agrupa por encarregado do Kartado + local de obra, para o resumo. */
export function agruparResumo(aps) {
  const mapa = new Map();
  aps.forEach((ap) => {
    const chave = `${ap.encarregado || '—'}||${ap.localObra || '—'}`;
    if (!mapa.has(chave)) {
      mapa.set(chave, {
        encarregado: ap.encarregado || '—',
        local: ap.localObra || '—',
        n: 0, area: 0, ext: 0, servicos: 0, seriais: [],
      });
    }
    const g = mapa.get(chave);
    g.n += 1;
    g.area += ap.area;
    g.ext += ap.ext;
    g.servicos += ap.servicos.length;
    g.seriais.push(ap.serial);
  });
  return [...mapa.values()].sort((a, b) => b.area - a.area);
}
