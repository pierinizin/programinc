/* =============================================================================
   Relatórios — agregação
   -----------------------------------------------------------------------------
   Funções puras. A tela só desenha; toda a conta mora aqui, onde dá pra ler e
   conferir sem abrir o navegador.

   Duas decisões de modelagem que valem o comentário:

   1) "Equipe" é o ENCARREGADO. A tabela `programacoes` não tem id de equipe —
      cada linha é um dia solto com tipoEquipe (Pintura/Tachas/Defensa, que é
      categoria de serviço, não turma), cidade e contratante. O que dá
      continuidade a um grupo de pessoas ao longo das semanas é quem lidera.
      Então o relatório agrupa por `encarregadoId`.

   2) "Período em tal obra" é reconstruído, não existe no banco. Linhas
      seguidas do mesmo encarregado, na mesma cidade e no mesmo contratante,
      viram um período contínuo. Um buraco de até FOLGA_DIAS dias (fim de
      semana, chuva, feriado) não quebra o período; acima disso, é ida e volta
      e vira outro período.

   Ressalva conhecida: `cidade` é texto livre. "Bauru", "bauru" e "Bauru-SP"
   contam como obras diferentes. Normalizamos maiúsculas/acentos/espaços aqui
   pra reduzir o estrago, mas variação de escrita real continua separando.
   ============================================================================= */

const FOLGA_DIAS = 3;

const MS_DIA = 86400000;

export function diasEntre(isoA, isoB) {
  return Math.round((Date.parse(isoB + 'T00:00:00Z') - Date.parse(isoA + 'T00:00:00Z')) / MS_DIA);
}

/* Chave de comparação de obra: o que a gente considera "o mesmo lugar".
   Só pra agrupar — o texto exibido continua sendo o original. */
function chaveObra(p) {
  const norm = (s) => String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
  return norm(p.cidade) + '|' + norm(p.contratante);
}

/* Ordena por data e quebra em períodos contínuos por obra.

   Uma equipe pode alternar entre duas obras em dias próximos (uma semana
   numa, outra semana noutra, e volta) — mais comum ainda dentro do mesmo
   contratante, com cidades diferentes. Por isso o corte não pode olhar só
   "qual foi o último período visto": precisa de UM acumulador aberto POR
   OBRA (cidade+contratante), cada um fechando pelo seu próprio buraco de
   FOLGA_DIAS — senão um dia intercalado em outra obra fecha o período errado
   e fragmenta uma obra contínua em vários pedaços soltos. */
export function periodosDoEncarregado(programacoes, encarregadoId, de, ate) {
  const linhas = programacoes
    .filter((p) => p.encarregadoId === encarregadoId)
    .filter((p) => (!de || p.data >= de) && (!ate || p.data <= ate))
    .slice()
    .sort((a, b) => a.data.localeCompare(b.data));

  const periodos = [];
  const abertos = new Map();   // chave da obra -> acumulador em andamento

  for (const p of linhas) {
    const chave = chaveObra(p);
    const acumulador = abertos.get(chave);

    if (acumulador && diasEntre(acumulador.fim, p.data) <= FOLGA_DIAS) {
      acumulador.fim = p.data;
      acumulador.linhas.push(p);
      continue;
    }
    /* Buraco grande demais nesta obra específica (ou é a primeira vez que
       aparece): fecha o que estava aberto com essa chave e abre outro. */
    if (acumulador) periodos.push(acumulador);
    abertos.set(chave, {
      chave,
      cidade: p.cidade || 'Sem cidade',
      contratante: p.contratante || 'Sem contratante',
      tipoEquipe: p.tipoEquipe || '',
      ini: p.data,
      fim: p.data,
      linhas: [p],
    });
  }
  for (const acumulador of abertos.values()) periodos.push(acumulador);
  periodos.sort((a, b) => a.ini.localeCompare(b.ini));

  /* Fecha cada período com o que a tela precisa: dias, datas e quem esteve. */
  return periodos.map((per) => {
    const datas = per.linhas.map((l) => l.data);
    const presenca = new Map();   // colaboradorId -> nº de dias
    for (const l of per.linhas) {
      for (const id of l.membroIds || []) {
        presenca.set(id, (presenca.get(id) || 0) + 1);
      }
    }
    /* Tipo de equipe: o mais frequente do período. Uma linha digitada errado
       no meio de doze não deve renomear a obra inteira. */
    const tipos = {};
    for (const l of per.linhas) tipos[l.tipoEquipe || ''] = (tipos[l.tipoEquipe || ''] || 0) + 1;
    const tipoEquipe = Object.keys(tipos).sort((a, b) => tipos[b] - tipos[a])[0] || '';

    return {
      id: encarregadoId + '|' + per.ini + '|' + per.chave,
      cidade: per.cidade,
      contratante: per.contratante,
      tipoEquipe,
      ini: per.ini,
      fim: per.fim,
      dias: per.linhas.length,
      datas,
      presenca,
      programacaoIds: per.linhas.map((l) => l.id),
    };
  });
}

/* Lista de encarregados que realmente aparecem em programação, com o total de
   dias — serve pro seletor e pra ordenar quem mais trabalhou primeiro. */
export function encarregadosComProgramacao(programacoes, colaboradores, de, ate) {
  const conta = new Map();
  for (const p of programacoes) {
    if (!p.encarregadoId) continue;
    if (de && p.data < de) continue;
    if (ate && p.data > ate) continue;
    conta.set(p.encarregadoId, (conta.get(p.encarregadoId) || 0) + 1);
  }
  return [...conta.entries()]
    .map(([id, dias]) => {
      const c = colaboradores.find((x) => x.id === id);
      return { id, dias, nome: c?.nome || 'Encarregado removido', fotoUrl: c?.fotoUrl || null };
    })
    .sort((a, b) => b.dias - a.dias || a.nome.localeCompare(b.nome));
}

/* Distribui itens em "raias" pra linha do tempo: uma raia é uma faixa
   horizontal onde nenhum item cobre o outro. Um contratante pode ter mais de
   uma obra rodando em datas próximas ou sobrepostas — sem isso, os blocos
   ficariam desenhados um em cima do outro na mesma linha.

   Por padrão compara `ini`/`fim` do próprio item (datas ISO, comparáveis como
   texto). A tela de linha do tempo passa `inicioDe`/`fimDe` calculando a
   posição JÁ desenhada (em % do eixo, incluindo o piso de largura mínima do
   bloco e um respiro) — porque um período bem curto vira um bloco com largura
   mínima pra caber o clique e o rótulo, e esse piso pode colidir no pixel com
   o vizinho mesmo quando as datas em si não se cruzam. Decidir a raia pela
   posição renderizada, não pela data crua, é o que evita dois blocos vizinhos
   "grudando" um no outro.

   Ganancioso e determinístico: ordena por início e encaixa cada item na
   primeira raia livre (cuja última posição termina antes deste começar); se
   nenhuma serve, abre raia nova. Devolve os MESMOS objetos com um campo
   `faixa` (índice da raia, começando em 0) adicionado. */
export function atribuirFaixas(itens, inicioDe = (i) => i.ini, fimDe = (i) => i.fim) {
  const registros = itens.map((item, i) => ({ item, i, ini: inicioDe(item), fim: fimDe(item) }));
  registros.sort((a, b) => (a.ini < b.ini ? -1 : a.ini > b.ini ? 1 : a.i - b.i));

  const fimPorFaixa = [];   // último limite ocupado em cada raia
  for (const r of registros) {
    let faixa = fimPorFaixa.findIndex((fim) => fim < r.ini);
    if (faixa === -1) { faixa = fimPorFaixa.length; fimPorFaixa.push(r.fim); }
    else fimPorFaixa[faixa] = r.fim;
    r.faixa = faixa;
  }

  const porIndice = new Array(itens.length);
  for (const r of registros) porIndice[r.i] = r.faixa;
  return itens.map((item, i) => ({ ...item, faixa: porIndice[i] }));
}

/* Todos os contratantes que já apareceram, em ordem estável (alfabética).
   A ordem não pode depender do filtro: se a cor de um contratante mudasse
   quando outro sai da tela, o gráfico estaria mentindo sobre identidade. */
export function contratantesConhecidos(programacoes) {
  const set = new Set();
  for (const p of programacoes) if (p.contratante) set.add(p.contratante);
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/* ---------------------------------------------------------------------------
   Faltas
   --------------------------------------------------------------------------- */

/* Férias viram falta no banco (o app grava assim quando a pessoa é arrastada
   pra zona de Faltas). Contadas junto, viram o "motivo mais comum" e inflam
   qualquer leitura de absenteísmo — então ficam de fora por padrão, com
   interruptor pra incluir. */
export function filtrarFaltas(faltas, { de, ate, incluirFerias }) {
  return faltas.filter((f) => {
    if (de && f.data < de) return false;
    if (ate && f.data > ate) return false;
    if (!incluirFerias && f.motivo === 'ferias') return false;
    return true;
  });
}

export function agruparPor(lista, chave) {
  const m = new Map();
  for (const item of lista) {
    const k = chave(item);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(item);
  }
  return m;
}

/* Ordena um Map de agrupamento pelo tamanho do grupo, maior primeiro. */
export function ordenadoPorTamanho(mapa) {
  return [...mapa.entries()].sort((a, b) => b[1].length - a[1].length);
}

/* Intervalo completo do histórico — o padrão da tela é "tudo". */
export function intervaloTotal(programacoes, faltas) {
  const datas = [];
  for (const p of programacoes) if (p.data) datas.push(p.data);
  for (const f of faltas) if (f.data) datas.push(f.data);
  if (!datas.length) {
    const hoje = new Date().toISOString().slice(0, 10);
    return { de: hoje, ate: hoje };
  }
  datas.sort();
  return { de: datas[0], ate: datas[datas.length - 1] };
}
