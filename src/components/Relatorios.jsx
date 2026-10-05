import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from './Avatar';
import { MOTIVOS_FORA_DA_CONTA, rotuloMotivo } from '../lib/motivos';
import { duracaoTexto, resumoParcial } from '../lib/faltaParcial';
import { baixarControle, montarLinhasControle, opcoesControle } from '../lib/controleContratante';
import {
  ST, calendariosDoMes, hojeISO, letraMotivo, mesesNoIntervalo, semanasDoMes,
} from '../lib/statusContrato';
import {
  atribuirFaixas,
  contratantesConhecidos,
  encarregadosComProgramacao,
  filtrarFaltas,
  intervaloTotal,
  periodosDoEncarregado,
  periodosPorContrato,
} from '../lib/relatorios';

const ALTURA_FAIXA = 26;   // px — mesma altura usada hoje para uma raia só
const LARG_MIN_PX = 22;    // px — mesmo piso do min-width em .rel-tl-bloco (styles.css)
const GAP_MIN_PX = 10;     // px — respiro mínimo visível entre dois blocos vizinhos

// Cor padrão de fábrica de um contratante (VAZIO_CONC em Contratos.jsx) — sinal
// de "ninguém escolheu uma cor ainda", não uma cor de verdade pra série.
const COR_CONTRATANTE_PADRAO = '#FFC72C';

/* =============================================================================
   Relatórios
   -----------------------------------------------------------------------------
   Três abas que NÃO se misturam, de propósito: "Equipes" olha uma equipe por
   vez (linha do tempo), "Contratos" olha todas de uma vez (tabela, por
   contratante e contrato), "Faltas" só olha registros de ausência. São
   perguntas diferentes, e somar os números de abas diferentes na mesma conta
   já confundiu gente em planilha.

   Todo gráfico é uma porta: clicar abre o painel da direita com os nomes e as
   datas exatas por trás daquele número. Um gráfico que não deixa chegar em
   "quem e quando" não resolve nada no dia seguinte.

   Cor: contratante e motivo são IDENTIDADE, não gravidade — por isso usam uma
   paleta própria (--serie-N), separada das cores de estado do app. Vermelho
   aqui continua querendo dizer "impedimento", não "contratante nº 6". A ordem
   das cores é alfabética e fixa, então filtrar a tela não repinta ninguém.

   A linha do tempo não escreve nome em lugar nenhum — nem por linha, nem
   por bloco. A cor já é única por contratante; a legenda abaixo do gráfico
   é a única fonte de texto (hover/clique continuam entregando o resto).
   ============================================================================= */

const SERIES = ['var(--serie-1)', 'var(--serie-2)', 'var(--serie-3)',
                'var(--serie-4)', 'var(--serie-5)', 'var(--serie-6)', 'var(--serie-7)'];

const COR_MOTIVO = {
  atestado_medico: 'var(--serie-1)',
  falta_injustificada: 'var(--serie-2)',
  falta_justificada: 'var(--serie-3)',
  licenca: 'var(--serie-4)',
  acidente_trabalho: 'var(--serie-5)',
  ferias: 'var(--serie-6)',
  folga: 'var(--serie-7)',
};
const corMotivo = (m) => COR_MOTIVO[m] || 'var(--serie-outros)';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const curta = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '');
const longa = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '');
const rotuloMes = (chave) => MESES[Number(chave.slice(5, 7)) - 1] + '/' + chave.slice(2, 4);
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mesLongo = (chave) => {
  const m = MESES_LONGOS[Number(chave.slice(5, 7)) - 1];
  return `${m.charAt(0).toUpperCase()}${m.slice(1)} de ${chave.slice(0, 4)}`;
};
const SEMANA_CURTA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const SEMANA_NOME = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const diaSemana = (iso) => SEMANA_NOME[new Date(`${iso}T12:00:00`).getDay()];

/* ---------------------------------------------------------------------------
   Balão de leitura dos gráficos. Fixo na viewport (não absoluto) porque a
   página rola: ancorado no elemento, ele seria cortado pelo primeiro pai com
   overflow. Mesma solução do balão de férias no quadro.
   --------------------------------------------------------------------------- */
function useDica() {
  const [dica, setDica] = useState(null);
  const alvo = useRef(null);

  const liga = (conteudo) => ({
    onMouseEnter: (e) => { alvo.current = e.currentTarget; setDica({ conteudo, x: e.clientX, y: e.clientY }); },
    onMouseMove: (e) => setDica((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d)),
    onMouseLeave: () => setDica(null),
  });

  const balao = dica ? (
    <div
      className="rel-dica"
      style={{ left: Math.min(dica.x + 14, window.innerWidth - 220), top: Math.max(dica.y - 12, 8) }}
      role="presentation"
    >
      {dica.conteudo}
    </div>
  ) : null;

  return { liga, balao };
}

function LinhaDica({ k, v }) {
  return <div className="rel-dica-l"><span>{k}</span><b>{v}</b></div>;
}

/* ---------------------------------------------------------------------------
   Painel de detalhe — desliza da direita, por cima. Não é uma coluna fixa
   porque, sem nada selecionado, uma coluna fixa é só um buraco na tela.
   --------------------------------------------------------------------------- */
function Painel({ dados, aoFechar, aoVoltar, anterior }) {
  const asideRef = useRef(null);
  // Voltando pra um painel, devolve a rolagem de onde ele estava.
  useLayoutEffect(() => {
    if (asideRef.current) asideRef.current.scrollTop = dados?.rolagem || 0;
  }, [dados]);
  useEffect(() => {
    if (!dados) return undefined;
    // Esc volta um passo quando dá pra voltar; no primeiro painel, fecha.
    const esc = (e) => { if (e.key === 'Escape') (aoVoltar || aoFechar)(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [dados, aoFechar, aoVoltar]);

  if (!dados) return null;
  return (
    <>
      <div className="rel-fundo" onClick={aoFechar} role="presentation" />
      <aside className="rel-painel" role="dialog" aria-label={dados.titulo} ref={asideRef}>
        {/* Voltar pro painel de onde você veio (ex.: da obra de volta pra
            lista do contratante) sem ter que fechar e refazer o caminho. */}
        {aoVoltar && (
          <button type="button" className="rel-voltar" onClick={aoVoltar}>
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Voltar{anterior ? <> para <b>{anterior}</b></> : ''}</span>
          </button>
        )}
        <div className="rel-p-head">
          <div className="rel-p-ident">
            {dados.avatar}
            <div>
              <h4>{dados.titulo}</h4>
              {dados.sub && <p>{dados.sub}</p>}
            </div>
          </div>
          <button className="rel-fechar" onClick={aoFechar} aria-label="Fechar detalhe">✕</button>
        </div>
        {dados.cor && <div className="rel-faixa-cor" style={{ background: dados.cor }} />}
        <div className="rel-p-body">{dados.corpo}</div>
      </aside>
    </>
  );
}

/* ---------------------------------------------------------------------------
   Exportar o "controle" em Excel (modelo CONTROLE GARCIA SETEMBRO 26):
   lista de TODOS os contratos, agrupada por contratante — marca os que quer
   (clicar no nome do contratante marca/desmarca todos dele) e baixa usando o
   período De/Até lá de cima. A conta mora em lib/controleContratante.js.
   --------------------------------------------------------------------------- */
function ExportarControle({ programacoes, colaboradores, concessionarias, contratos, faltas, de, ate }) {
  const grupos = useMemo(
    () => opcoesControle({ programacoes, concessionarias, contratos, de, ate }),
    [programacoes, concessionarias, contratos, de, ate],
  );
  const [marcados, setMarcados] = useState([]);
  const [busca, setBusca] = useState('');
  const [gerando, setGerando] = useState(false);
  const [aviso, setAviso] = useState('');

  // Só vale o que existe na lista atual E teve equipe no período.
  const comDias = useMemo(() => new Set(
    grupos.flatMap((g) => g.itens.filter((i) => i.dias > 0).map((i) => i.chave)),
  ), [grupos]);
  const validos = marcados.filter((k) => comDias.has(k));

  const termo = busca.trim().toLowerCase();
  const visiveis = grupos
    .map((g) => (!termo || g.contratante.toLowerCase().includes(termo)
      ? g
      : { ...g, itens: g.itens.filter((i) => i.rotulo.toLowerCase().includes(termo)) }))
    .filter((g) => g.itens.length)
    // Quem trabalhou no período vem primeiro; contrato parado fica no fim.
    .map((g) => ({ ...g, itens: [...g.itens].sort((x, y) => (y.dias > 0) - (x.dias > 0)) }))
    .sort((x, y) => (y.itens.some((i) => i.dias) - x.itens.some((i) => i.dias)));

  const alternar = (chaves, ligar) => setMarcados((m) => (
    ligar ? [...new Set([...m, ...chaves])] : m.filter((k) => !chaves.includes(k))
  ));

  async function exportar() {
    setAviso('');
    const dados = montarLinhasControle({
      programacoes, colaboradores, concessionarias, contratos, faltas, chaves: validos, de, ate,
    });
    if (!dados.blocos.length) { setAviso('Nada pra exportar nesse período.'); return; }
    setGerando(true);
    try {
      await baixarControle({ dados, de, ate });
    } catch (e) {
      console.error('Exportar controle:', e);
      setAviso('Não consegui gerar o arquivo. Tente de novo.');
    } finally {
      setGerando(false);
    }
  }

  if (!grupos.length) return null;
  return (
    <section className="rel-exportar">
      <header className="rel-exportar-topo">
        <div className="rel-exportar-txt">
          <b>Controle em Excel</b>
          <span>Marque os contratos — uma linha por pessoa e período, usando o De/Até acima.</span>
        </div>
        <input
          className="rel-exportar-busca"
          type="search"
          placeholder="Buscar contrato ou contratante"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </header>

      <div className="rel-exportar-lista" role="group" aria-label="Contratos do controle">
        {visiveis.map((g) => {
          const ativos = g.itens.filter((i) => i.dias > 0).map((i) => i.chave);
          const todos = ativos.length > 0 && ativos.every((k) => validos.includes(k));
          const algum = ativos.some((k) => validos.includes(k));
          const dias = (n) => (n ? `${n} dia${n > 1 ? 's' : ''}` : 'sem programação');
          const rotulo = (i) => (
            <span className={`rel-exp-rot${i.chave.startsWith('s:') ? ' sem' : ''}`}>{i.rotulo}</span>
          );

          // Contratante com um contrato só: uma linha, sem cabeçalho à parte.
          if (g.itens.length === 1) {
            const [i] = g.itens;
            const on = validos.includes(i.chave);
            return (
              <div key={g.contratante} className="rel-exp-grupo">
                <button
                  type="button"
                  className={`rel-exp-item rel-exp-unico${on ? ' on' : ''}`}
                  disabled={!i.dias}
                  aria-pressed={on}
                  onClick={() => alternar([i.chave], !on)}
                >
                  <span className="rel-exp-caixa" aria-hidden="true" />
                  <span className="rel-exp-nome">{g.contratante}</span>
                  {rotulo(i)}
                  <span className="rel-exp-dias">{dias(i.dias)}</span>
                </button>
              </div>
            );
          }

          return (
            <div key={g.contratante} className="rel-exp-grupo">
              <button
                type="button"
                className={`rel-exp-cab${todos ? ' on' : algum ? ' meio' : ''}`}
                disabled={!ativos.length}
                aria-pressed={todos}
                onClick={() => alternar(ativos, !todos)}
                title={todos ? 'Desmarcar todos' : 'Marcar todos com programação'}
              >
                <span className="rel-exp-caixa" aria-hidden="true" />
                <span className="rel-exp-nome">{g.contratante}</span>
                <span className="rel-exp-qtd">{g.itens.length} contratos</span>
              </button>
              {g.itens.map((i) => {
                const on = validos.includes(i.chave);
                return (
                  <button
                    key={i.chave}
                    type="button"
                    className={`rel-exp-item${on ? ' on' : ''}`}
                    disabled={!i.dias}
                    aria-pressed={on}
                    onClick={() => alternar([i.chave], !on)}
                  >
                    <span className="rel-exp-caixa" aria-hidden="true" />
                    {rotulo(i)}
                    <span className="rel-exp-dias">{dias(i.dias)}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
        {!visiveis.length && <span className="rel-exp-vazio">Nenhum contrato com “{busca}”.</span>}
      </div>

      <footer className="rel-exportar-pe">
        <span className="rel-exp-conta">
          {validos.length ? `${validos.length} contrato${validos.length > 1 ? 's' : ''} marcado${validos.length > 1 ? 's' : ''}` : 'Nenhum contrato marcado'}
        </span>
        {validos.length > 0 && (
          <button type="button" className="rel-exp-limpar" onClick={() => setMarcados([])}>Limpar</button>
        )}
        {aviso && <span className="rel-exportar-aviso">{aviso}</span>}
        <button type="button" className="primary-btn" disabled={!validos.length || gerando} onClick={exportar}>
          {gerando ? 'Gerando…' : 'Exportar controle'}
        </button>
      </footer>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   Campo de data do filtro.
   O <input type="date"> controlado direto pelo filtro brigava com quem
   digita: no meio da digitação o navegador entrega '' (data incompleta) ou
   um ano pela metade ("0002", "0020", "0202"...). '' fazia o filtro cair de
   volta no "todo o histórico" e a data pulava pra outra coisa debaixo do
   dedo; o ano pela metade virava um filtro de verdade, recalculando todos os
   gráficos a cada tecla, com períodos absurdos.
   Agora o campo guarda o que está sendo digitado por conta própria e só
   repassa pro filtro quando a data está COMPLETA e é plausível (ano de 2000
   em diante). Saiu do campo com algo inválido: volta pro valor de antes.
   --------------------------------------------------------------------------- */
function dataValida(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= '2000-01-01' && v <= '2100-12-31';
}

function DataFiltro({ valor, aoMudar }) {
  const [texto, setTexto] = useState(valor);
  const [editando, setEditando] = useState(false);
  // De fora pra dentro (botões "Este mês", "90 dias"…) só quando ninguém está
  // digitando — senão o valor de fora atropelaria a digitação.
  useEffect(() => { if (!editando) setTexto(valor); }, [valor, editando]);
  return (
    <input
      type="date"
      value={texto}
      min="2000-01-01"
      max="2100-12-31"
      onFocus={() => setEditando(true)}
      onChange={(e) => {
        const v = e.target.value;
        setTexto(v);
        if (dataValida(v) && v !== valor) aoMudar(v);
      }}
      onBlur={() => {
        setEditando(false);
        if (!dataValida(texto)) setTexto(valor);
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );
}

/* Um bloco "pessoa + datas em que faltou" — a peça que se repete em todos os
   detalhes de falta. */
function BlocoPessoa({ pessoa, datas, formato = curta }) {
  return (
    <div className="rel-pbloco">
      <div className="rel-pbloco-topo">
        <Avatar nome={pessoa?.nome} url={pessoa?.fotoUrl} tamanho="small" />
        <div>
          <div className="rel-nm">{pessoa?.nome || 'Colaborador removido'}</div>
          <div className="rel-fn">{pessoa?.funcao || ''}</div>
        </div>
        <span className="rel-dr">{datas.length} {datas.length === 1 ? 'dia' : 'dias'}</span>
      </div>
      <div className="rel-datas">
        {datas.slice().sort().map((d) => <span key={d} className="rel-chip">{formato(d)}</span>)}
      </div>
    </div>
  );
}

export function Relatorios({
  colaboradores = [], programacoes = [], faltas = [], concessionarias = [], contratos = [],
}) {
  const [aba, setAba] = useState('equipes');
  const [faixa, setFaixa] = useState(null);        // null = todo o histórico
  const [encId, setEncId] = useState('');
  const [incluirFerias, setIncluirFerias] = useState(false);
  const [mesStatus, setMesStatus] = useState(null);   // aba Status: 'aaaa-mm'
  /* Painel lateral com histórico: cada clique DENTRO do painel (ex.: numa
     obra da lista do contratante) empilha um novo painel em vez de trocar o
     de antes — e a seta "Voltar" desempilha. Clique na página principal só
     acontece com o painel fechado (o fundo escuro cobre o resto), então
     abrir de lá sempre começa uma pilha nova. */
  const [pilha, setPilha] = useState([]);
  const detalhe = pilha.length ? pilha[pilha.length - 1] : null;
  // Ao empilhar, guarda onde a lista de baixo estava rolada — voltar pra
  // obra nº 40 de 60 e cair de novo no topo seria refazer o caminho do mesmo jeito.
  const setDetalhe = (d) => {
    const rolagem = document.querySelector('.rel-painel')?.scrollTop || 0;
    setPilha((p) => {
      if (!d) return [];
      if (!p.length) return [d];
      const topo = { ...p[p.length - 1], rolagem };
      return [...p.slice(0, -1), topo, d];
    });
  };
  const voltar = () => setPilha((p) => p.slice(0, -1));
  const { liga, balao } = useDica();

  /* A largura mínima do bloco (pra caber o clique) é fixada em PIXELS no CSS
     (min-width: 22px) — mas a posição de cada bloco é calculada em % do
     trilho. Se o piso e o respiro entre blocos forem um % fixo "no chute",
     eles descasam do CSS real conforme a tela é mais larga ou mais estreita
     (num trilho estreito o min-width do CSS "come" um respiro que parecia
     suficiente em %, e dois períodos vizinhos colam ou ficam por cima um do
     outro). Medindo a largura real do trilho e convertendo os pisos de pixel
     pra % com ela, o piso em JS sempre bate com o que o CSS realmente aplica. */
  const trilhoRef = useRef(null);
  const [larguraTrilho, setLarguraTrilho] = useState(720);
  useEffect(() => {
    const el = trilhoRef.current;
    if (!el) return undefined;
    const medir = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setLarguraTrilho(w);
    };
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  });

  const total = useMemo(() => intervaloTotal(programacoes, faltas), [programacoes, faltas]);
  const de = faixa?.de || total.de;
  const ate = faixa?.ate || total.ate;

  const pessoaDe = useMemo(() => {
    const m = new Map();
    for (const c of colaboradores) m.set(c.id, c);
    return m;
  }, [colaboradores]);

  const conhecidos = useMemo(() => contratantesConhecidos(programacoes), [programacoes]);

  /* O cadastro de Contratantes tem um campo `cor` próprio (editável na tela de
     Contratantes) — mas todo contratante nasce com o mesmo cinza-ouro padrão
     (#FFC72C, ver VAZIO_CONC em Contratos.jsx) até alguém escolher outra cor
     de propósito. Por isso esse valor específico conta como "não escolhida":
     tratá-lo como escolha de verdade faria TODO contratante ainda não
     customizado aparecer com essa mesma cor aqui, em vez da paleta automática
     abaixo. Quem já tem uma cor diferente do padrão usa ela — é a única forma
     de dar a um contratante além do 7º uma cor realmente distinta da de
     outro, em vez dos dois caírem juntos no cinza "outros". */
  const corManualPorSigla = useMemo(() => {
    const m = new Map();
    for (const c of concessionarias) {
      const cor = String(c.cor || '').trim();
      if (cor && cor.toUpperCase() !== COR_CONTRATANTE_PADRAO) {
        m.set(String(c.sigla || '').trim().toUpperCase(), cor);
      }
    }
    return m;
  }, [concessionarias]);

  const corContratante = (nome) => {
    const manual = corManualPorSigla.get(String(nome || '').trim().toUpperCase());
    if (manual) return manual;
    const i = conhecidos.indexOf(nome);
    return i >= 0 && i < SERIES.length ? SERIES[i] : 'var(--serie-outros)';
  };

  const encs = useMemo(
    () => encarregadosComProgramacao(programacoes, colaboradores, de, ate),
    [programacoes, colaboradores, de, ate],
  );
  const encAtual = encs.find((e) => e.id === encId) || encs[0] || null;

  const periodos = useMemo(
    () => (encAtual ? periodosDoEncarregado(programacoes, encAtual.id, de, ate) : []),
    [programacoes, encAtual, de, ate],
  );

  const periodosContrato = useMemo(
    () => periodosPorContrato(programacoes, colaboradores, contratos, de, ate),
    [programacoes, colaboradores, contratos, de, ate],
  );

  /* ---- aba Status: um calendário por contrato, um mês por vez ----
     Os meses navegáveis são os que o filtro De/Até toca. Sem escolha, abre no
     mês de hoje (se estiver no filtro) ou no último mês do filtro. */
  const hoje = hojeISO();
  const mesesStatus = useMemo(() => mesesNoIntervalo(de, ate), [de, ate]);
  const mesStatusAtual = mesesStatus.includes(mesStatus)
    ? mesStatus
    : (mesesStatus.includes(hoje.slice(0, 7)) ? hoje.slice(0, 7) : mesesStatus[mesesStatus.length - 1]);
  const idxMes = mesesStatus.indexOf(mesStatusAtual);
  const cartoesStatus = useMemo(
    () => (mesStatusAtual
      ? calendariosDoMes({ programacoes, concessionarias, contratos, mes: mesStatusAtual, de, ate, hoje })
      : []),
    [programacoes, concessionarias, contratos, mesStatusAtual, de, ate, hoje],
  );
  const totStatus = useMemo(() => {
    const t = { ok: 0, campo: 0, pend: 0, erro: 0 };
    for (const c of cartoesStatus) for (const k of Object.keys(t)) t[k] += c.cont[k];
    return { ...t, total: t.ok + t.campo + t.pend + t.erro };
  }, [cartoesStatus]);

  const resumoContratos = useMemo(() => {
    const equipes = new Set();
    const contratantesSet = new Set();
    const contratosSet = new Set();
    const calendario = new Set();
    let dias = 0;
    for (const per of periodosContrato) {
      per.datas.forEach((d) => calendario.add(d));
      equipes.add(per.encarregadoId);
      contratantesSet.add(per.contratante);
      if (per.contratoId) contratosSet.add(per.contratoId);
      dias += per.dias;
    }
    return {
      // dias: diárias de equipe (17 equipes x 60 dias = 1020) — base das barras e da participação.
      // diasCalendario: dias do calendário com pelo menos uma equipe — nunca passa do período.
      dias, diasCalendario: calendario.size,
      equipes: equipes.size, contratantes: contratantesSet.size, contratos: contratosSet.size,
    };
  }, [periodosContrato]);

  /* Mesma ordem estável de `conhecidos` (ver corContratante acima) — assim a
     cor de um contratante não muda se o filtro de datas mudar quem aparece. */
  const contratantesContrato = useMemo(() => {
    const s = [];
    for (const p of periodosContrato) if (!s.includes(p.contratante)) s.push(p.contratante);
    return s.sort((a, b) => conhecidos.indexOf(a) - conhecidos.indexOf(b));
  }, [periodosContrato, conhecidos]);

  /* Uma linha por equipe na linha do tempo — a mais atarefada no período primeiro. */
  const equipesContrato = useMemo(() => {
    const m = new Map();
    for (const p of periodosContrato) {
      if (!m.has(p.encarregadoId)) m.set(p.encarregadoId, { id: p.encarregadoId, nome: p.encarregadoNome, dias: 0 });
      m.get(p.encarregadoId).dias += p.dias;
    }
    return [...m.values()].sort((a, b) => b.dias - a.dias || a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [periodosContrato]);

  const diasPorContratanteGeral = useMemo(() => {
    const m = new Map();
    for (const p of periodosContrato) m.set(p.contratante, (m.get(p.contratante) || 0) + p.dias);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [periodosContrato]);

  /* Um contrato é a chave real (contratoId); sem vínculo, agrupa por
     contratante mesmo assim — "MOTIVA sem contrato" é uma barra só, não uma
     por período solto. */
  const diasPorContratoGeral = useMemo(() => {
    const m = new Map();
    for (const p of periodosContrato) {
      const chave = p.contratoId || `${p.contratante}__solto`;
      if (!m.has(chave)) {
        // Sem contrato_id, a cor sozinha não diferencia duas barras "sem
        // vínculo" de contratantes diferentes — o nome do contratante entra
        // no próprio rótulo pra não depender só do hover pra saber de quem é.
        m.set(chave, {
          chave,
          contratante: p.contratante,
          label: p.contratoNumero || `${p.contratante} — sem contrato`,
          dias: 0,
          obras: 0,
        });
      }
      const item = m.get(chave);
      item.dias += p.dias;
      item.obras += 1;
    }
    return [...m.values()].sort((a, b) => b.dias - a.dias);
  }, [periodosContrato]);

  function fechar() { setDetalhe(null); }

  /* ---------------- detalhes ---------------- */

  function abrirPeriodo(per) {
    const equipe = [{ id: encAtual.id, dias: per.dias, lider: true }]
      .concat([...per.presenca.entries()]
        .filter(([id]) => id !== encAtual.id)
        .sort((a, b) => b[1] - a[1])
        .map(([id, dias]) => ({ id, dias, lider: false })));

    setDetalhe({
      titulo: `${per.cidade} · ${per.contratante}`,
      sub: per.tipoEquipe ? `Equipe de ${encAtual.nome} · ${per.tipoEquipe}` : `Equipe de ${encAtual.nome}`,
      cor: corContratante(per.contratante),
      corpo: (
        <>
          <section className="rel-p-sec">
            <div className="rel-linhas">
              <div className="rel-linha"><span>Período</span><b>{longa(per.ini)} a {longa(per.fim)}</b></div>
              <div className="rel-linha"><span>Dias de programação</span><b>{per.dias}</b></div>
              {per.tipoEquipe && <div className="rel-linha"><span>Tipo de equipe</span><b>{per.tipoEquipe}</b></div>}
              <div className="rel-linha"><span>Cidade</span><b>{per.cidade}</b></div>
            </div>
          </section>

          <section className="rel-p-sec">
            <h5>Equipe no período ({equipe.length})</h5>
            {equipe.map((m) => {
              const p = pessoaDe.get(m.id);
              return (
                <div className="rel-pessoa" key={m.id}>
                  <Avatar nome={p?.nome} url={p?.fotoUrl} tamanho="small" />
                  <div>
                    <div className="rel-nm">{p?.nome || 'Colaborador removido'}</div>
                    <div className="rel-fn">{m.lider ? 'Encarregado' : (p?.funcao || '')}</div>
                  </div>
                  <span className="rel-dr">{m.dias}/{per.dias} dias</span>
                </div>
              );
            })}
          </section>

          <section className="rel-p-sec">
            <h5>Dias trabalhados ({per.datas.length})</h5>
            <div className="rel-datas">
              {per.datas.map((d) => <span key={d} className="rel-chip">{curta(d)}</span>)}
            </div>
          </section>
        </>
      ),
    });
  }

  function abrirContratante(nome) {
    const doCt = periodos.filter((p) => p.contratante === nome);
    const dias = doCt.reduce((s, p) => s + p.dias, 0);
    setDetalhe({
      titulo: nome,
      sub: `Equipe de ${encAtual.nome} · ${dias} dias em ${doCt.length} ${doCt.length === 1 ? 'obra' : 'obras'}`,
      cor: corContratante(nome),
      corpo: (
        <section className="rel-p-sec">
          <h5>Obras atendidas</h5>
          {doCt.slice().reverse().map((p) => (
            <button className="rel-pbloco rel-pbloco-btn" key={p.id} onClick={() => abrirPeriodo(p)}>
              <div className="rel-pbloco-topo">
                <div>
                  <div className="rel-nm">{p.cidade}</div>
                  <div className="rel-fn">{longa(p.ini)} a {longa(p.fim)}</div>
                </div>
                <span className="rel-dr">{p.dias} dias</span>
              </div>
            </button>
          ))}
        </section>
      ),
    });
  }

  /* ---- aba Contratos: mesmos painéis de abrirPeriodo/abrirContratante,
     mas sem um `encAtual` fixo — cada período já carrega sua própria equipe
     (per.encarregadoNome), porque aqui várias equipes aparecem juntas. ---- */
  function abrirPeriodoContrato(per) {
    const equipe = [{ id: per.encarregadoId, dias: per.dias, lider: true }]
      .concat([...per.presenca.entries()]
        .filter(([id]) => id !== per.encarregadoId)
        .sort((a, b) => b[1] - a[1])
        .map(([id, dias]) => ({ id, dias, lider: false })));

    setDetalhe({
      titulo: `${per.cidade} · ${per.contratante}`,
      sub: `Equipe de ${per.encarregadoNome}${per.contratoNumero ? ` · Contrato ${per.contratoNumero}` : ''}`,
      cor: corContratante(per.contratante),
      corpo: (
        <>
          <section className="rel-p-sec">
            <div className="rel-linhas">
              <div className="rel-linha"><span>Período</span><b>{longa(per.ini)} a {longa(per.fim)}</b></div>
              <div className="rel-linha"><span>Dias de programação</span><b>{per.dias}</b></div>
              <div className="rel-linha"><span>Contrato</span><b>{per.contratoNumero || 'Não vinculado'}</b></div>
              <div className="rel-linha"><span>Cidade</span><b>{per.cidade}</b></div>
            </div>
          </section>

          <section className="rel-p-sec">
            <h5>Equipe no período ({equipe.length})</h5>
            {equipe.map((m) => {
              const p = pessoaDe.get(m.id);
              return (
                <div className="rel-pessoa" key={m.id}>
                  <Avatar nome={p?.nome} url={p?.fotoUrl} tamanho="small" />
                  <div>
                    <div className="rel-nm">{p?.nome || 'Colaborador removido'}</div>
                    <div className="rel-fn">{m.lider ? 'Encarregado' : (p?.funcao || '')}</div>
                  </div>
                  <span className="rel-dr">{m.dias}/{per.dias} dias</span>
                </div>
              );
            })}
          </section>
        </>
      ),
    });
  }

  /* Aba Status: clicar num dia abre as equipes daquele contrato naquele dia. */
  function abrirDiaStatus(cartao, iso, lista) {
    setDetalhe({
      titulo: `${cartao.contrato} · ${diaSemana(iso)} ${longa(iso)}`,
      sub: `${cartao.contratante} · ${lista.length} ${lista.length === 1 ? 'equipe' : 'equipes'}`,
      cor: corContratante(cartao.contratante),
      corpo: (
        <section className="rel-p-sec">
          <h5>Equipes no dia</h5>
          {lista.map(({ p, st, motivo }) => {
            const enc = pessoaDe.get(p.encarregadoId);
            const membros = [...new Set(p.membroIds || [])].filter((id) => id !== p.encarregadoId);
            return (
              <div className="rel-pbloco" key={p.id}>
                <div className="rel-pbloco-topo">
                  <Avatar nome={enc?.nome} url={enc?.fotoUrl} tamanho="small" />
                  <div>
                    <div className="rel-nm">{enc?.nome || 'Sem encarregado'}</div>
                    <div className="rel-fn">
                      {[p.tipoEquipe, p.cidade].filter(Boolean).join(' · ')}
                      {membros.length ? ` · +${membros.length} na equipe` : ''}
                    </div>
                    <span className={`rs-chip rs-${st}`}>
                      {ST[st]}{motivo ? ` · ${String(motivo).toLowerCase()}` : ''}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          {lista.some((x) => x.st === 'pend') && (
            <p className="rel-sub" style={{ margin: '4px 0 0' }}>
              "Sem baixa": o dia já passou e a equipe continua como Em campo. Marque Concluído ou
              Não realizado no quadro daquele dia.
            </p>
          )}
        </section>
      ),
    });
  }

  /* Lista de períodos num painel — usado tanto por barra de contratante
     quanto por barra de contrato, já que as duas só diferem no filtro. */
  function abrirGrupoPeriodos({ titulo, sub, cor, periodos: lista }) {
    setDetalhe({
      titulo, sub, cor,
      corpo: (
        <section className="rel-p-sec">
          <h5>Obras ({lista.length})</h5>
          {lista.slice().reverse().map((p) => (
            <button className="rel-pbloco rel-pbloco-btn" key={p.id} onClick={() => abrirPeriodoContrato(p)}>
              <div className="rel-pbloco-topo">
                <div>
                  <div className="rel-nm">{p.cidade} · {p.encarregadoNome}</div>
                  <div className="rel-fn">
                    {longa(p.ini)} a {longa(p.fim)}{p.contratoNumero ? ` · ${p.contratoNumero}` : ''}
                  </div>
                </div>
                <span className="rel-dr">{p.dias} dias</span>
              </div>
            </button>
          ))}
        </section>
      ),
    });
  }

  function abrirContratanteGeral(nome) {
    const doCt = periodosContrato.filter((p) => p.contratante === nome);
    const dias = doCt.reduce((s, p) => s + p.dias, 0);
    abrirGrupoPeriodos({
      titulo: nome,
      sub: `${dias} dias em ${doCt.length} ${doCt.length === 1 ? 'obra' : 'obras'}`,
      cor: corContratante(nome),
      periodos: doCt,
    });
  }

  function abrirContratoGeral(item) {
    const doContrato = periodosContrato.filter((p) => (
      item.chave === (p.contratoId || `${p.contratante}__solto`)
    ));
    abrirGrupoPeriodos({
      titulo: item.label,
      sub: `${item.contratante} · ${item.dias} dias em ${doContrato.length} ${doContrato.length === 1 ? 'obra' : 'obras'}`,
      cor: corContratante(item.contratante),
      periodos: doContrato,
    });
  }

  function abrirGrupoFaltas({ titulo, sub, cor, registros, avatar }) {
    const porPessoa = new Map();
    for (const f of registros) {
      if (!porPessoa.has(f.colaboradorId)) porPessoa.set(f.colaboradorId, []);
      porPessoa.get(f.colaboradorId).push(f.data);
    }
    const lista = [...porPessoa.entries()].sort((a, b) => b[1].length - a[1].length);
    setDetalhe({
      titulo, sub, cor, avatar,
      corpo: (
        <section className="rel-p-sec">
          <h5>Quem faltou e quando</h5>
          {lista.map(([id, datas]) => (
            <BlocoPessoa key={id} pessoa={pessoaDe.get(id)} datas={datas} />
          ))}
        </section>
      ),
    });
  }

  function abrirPessoaParcial(id, registros, minutos) {
    const p = pessoaDe.get(id);
    setDetalhe({
      titulo: p?.nome || 'Colaborador removido',
      sub: `${duracaoTexto(minutos)} em ${registros.length} ${registros.length === 1 ? 'falta' : 'faltas'} de meio período`,
      avatar: <Avatar nome={p?.nome} url={p?.fotoUrl} tamanho="big" />,
      corpo: (
        <section className="rel-p-sec">
          <h5>Dia a dia</h5>
          <div className="rel-linhas">
            {registros.slice().sort((a, b) => b.data.localeCompare(a.data)).map((f) => (
              <div className="rel-linha" key={f.id}>
                <span>{longa(f.data)} · {rotuloMotivo(f.motivo)}</span>
                <b>faltou {f.resumo.faltouTexto} ({f.resumo.duracao})</b>
              </div>
            ))}
          </div>
        </section>
      ),
    });
  }

  function abrirPessoaFaltas(id, registros) {
    const p = pessoaDe.get(id);
    const porMotivo = new Map();
    for (const f of registros) {
      if (!porMotivo.has(f.motivo)) porMotivo.set(f.motivo, []);
      porMotivo.get(f.motivo).push(f.data);
    }
    const lista = [...porMotivo.entries()].sort((a, b) => b[1].length - a[1].length);
    setDetalhe({
      titulo: p?.nome || 'Colaborador removido',
      sub: `${p?.funcao || ''}${p?.funcao ? ' · ' : ''}${registros.length} ${registros.length === 1 ? 'ausência' : 'ausências'}`,
      avatar: <Avatar nome={p?.nome} url={p?.fotoUrl} tamanho="big" />,
      corpo: (
        <>
          {lista.map(([motivo, datas]) => (
            <section className="rel-p-sec" key={motivo}>
              <h5><i className="rel-pt" style={{ background: corMotivo(motivo) }} />{rotuloMotivo(motivo)} ({datas.length})</h5>
              <div className="rel-datas">
                {datas.slice().sort().map((d) => <span key={d} className="rel-chip">{longa(d)}</span>)}
              </div>
            </section>
          ))}
        </>
      ),
    });
  }

  /* ---------------- faltas: números ---------------- */

  /* Meio período (falta ligada a uma equipe, ver lib/faltaParcial.js) NÃO
     entra na conta de "ausências" — somar meia hora de médico como um dia
     inteiro de falta distorce tudo. Ela vai pra uma seção própria, em horas. */
  const faltasNoPeriodo = useMemo(
    () => filtrarFaltas(faltas, { de, ate, incluirFerias }),
    [faltas, de, ate, incluirFerias],
  );
  const faltasFiltradas = useMemo(
    () => faltasNoPeriodo.filter((f) => !f.programacao_id),
    [faltasNoPeriodo],
  );
  const progPorId = useMemo(() => new Map(programacoes.map((p) => [p.id, p])), [programacoes]);
  const parciaisFiltradas = useMemo(
    () => faltasNoPeriodo
      .filter((f) => f.programacao_id && progPorId.has(f.programacao_id))
      .map((f) => ({ ...f, resumo: resumoParcial(progPorId.get(f.programacao_id), f) })),
    [faltasNoPeriodo, progPorId],
  );
  const parciaisPorPessoa = useMemo(() => {
    const m = new Map();
    for (const f of parciaisFiltradas) {
      if (!m.has(f.colaboradorId)) m.set(f.colaboradorId, { regs: [], minutos: 0 });
      const item = m.get(f.colaboradorId);
      item.regs.push(f);
      item.minutos += f.resumo.minutosFaltados;
    }
    return [...m.entries()].sort((a, b) => b[1].minutos - a[1].minutos);
  }, [parciaisFiltradas]);
  const minutosParciais = parciaisFiltradas.reduce((s, f) => s + f.resumo.minutosFaltados, 0);

  const porMotivo = useMemo(() => {
    const m = new Map();
    for (const f of faltasFiltradas) {
      if (!m.has(f.motivo)) m.set(f.motivo, []);
      m.get(f.motivo).push(f);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [faltasFiltradas]);

  const porMes = useMemo(() => {
    const m = new Map();
    for (const f of faltasFiltradas) {
      const k = f.data.slice(0, 7);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(f);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [faltasFiltradas]);

  const porPessoa = useMemo(() => {
    const m = new Map();
    for (const f of faltasFiltradas) {
      if (!m.has(f.colaboradorId)) m.set(f.colaboradorId, []);
      m.get(f.colaboradorId).push(f);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [faltasFiltradas]);

  /* ---------------- eixo da linha do tempo ---------------- */

  const eixo = useMemo(() => {
    const ini = Date.parse(de + 'T00:00:00Z');
    const fim = Date.parse(ate + 'T00:00:00Z');
    const span = Math.max(fim - ini, 86400000);
    const pos = (iso) => ((Date.parse(iso + 'T00:00:00Z') - ini) / span) * 100;

    const marcos = [];
    const d = new Date(ini);
    d.setUTCDate(1);
    if (d.getTime() < ini) d.setUTCMonth(d.getUTCMonth() + 1);
    const meses = [];
    while (d.getTime() <= fim) {
      meses.push(d.toISOString().slice(0, 10));
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
    /* Com muitos meses os rótulos encavalam — mostra 1 a cada N. */
    const passo = Math.ceil(meses.length / 7) || 1;
    meses.forEach((iso, i) => { if (i % passo === 0) marcos.push(iso); });
    return { pos, marcos };
  }, [de, ate]);

  const contratantesDoEnc = useMemo(() => {
    const s = [];
    for (const p of periodos) if (!s.includes(p.contratante)) s.push(p.contratante);
    return s.sort((a, b) => conhecidos.indexOf(a) - conhecidos.indexOf(b));
  }, [periodos, conhecidos]);

  // Dias do calendário em que o encarregado esteve em obra (dois lugares no
  // mesmo dia contam um dia só). A participação por contratante usa a soma.
  const diasEmCampo = new Set(periodos.flatMap((p) => p.datas)).size;
  const somaDiasEnc = periodos.reduce((s, p) => s + p.dias, 0);
  const faltasDoEnc = encAtual
    ? faltas.filter((f) => f.colaboradorId === encAtual.id && !MOTIVOS_FORA_DA_CONTA.includes(f.motivo)
        && !f.programacao_id && f.data >= de && f.data <= ate).length
    : 0;

  const porContratante = useMemo(() => {
    const m = new Map();
    for (const p of periodos) m.set(p.contratante, (m.get(p.contratante) || 0) + p.dias);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [periodos]);

  const semDados = !programacoes.length && !faltas.length;

  /* ---------------- filtros ---------------- */

  function preset(qual) {
    if (qual === 'tudo') return setFaixa(null);
    const hoje = new Date();
    const fim = hoje.toISOString().slice(0, 10);
    if (qual === 'mes') {
      const ini = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1)).toISOString().slice(0, 10);
      return setFaixa({ de: ini, ate: fim });
    }
    const ini = new Date(hoje.getTime() - 89 * 86400000).toISOString().slice(0, 10);
    return setFaixa({ de: ini, ate: fim });
  }

  const Filtros = (
    <div className="rel-filtros">
      <label className="rel-campo">
        <span>De</span>
        <DataFiltro valor={de} aoMudar={(v) => setFaixa({ de: v, ate })} />
      </label>
      <label className="rel-campo">
        <span>Até</span>
        <DataFiltro valor={ate} aoMudar={(v) => setFaixa({ de, ate: v })} />
      </label>

      {aba === 'equipes' && (
        <label className="rel-campo">
          <span>Encarregado</span>
          <select value={encAtual?.id || ''} onChange={(e) => { setEncId(e.target.value); fechar(); }}>
            {encs.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            {!encs.length && <option value="">Nenhum encarregado no período</option>}
          </select>
        </label>
      )}

      <div className="rel-presets">
        <button className={!faixa ? 'on' : ''} onClick={() => preset('tudo')}>Todo o histórico</button>
        <button onClick={() => preset('mes')}>Este mês</button>
        <button onClick={() => preset('90')}>90 dias</button>
      </div>

      {aba === 'faltas' && (
        <button
          type="button"
          className={`rel-switch${incluirFerias ? ' on' : ''}`}
          role="switch"
          aria-checked={incluirFerias}
          onClick={() => { setIncluirFerias((v) => !v); fechar(); }}
          title="Férias e folgas entram no banco como falta. Contadas junto, viram o motivo mais comum e inflam o absenteísmo."
        >
          <span className="rel-tr" /> Incluir férias e folgas na contagem
        </button>
      )}
    </div>
  );

  if (semDados) {
    return <p className="rel-vazio">Ainda não há programações nem faltas registradas para relatar.</p>;
  }

  return (
    <div className="rel">
      <div className="rel-abas" role="tablist">
        <button role="tab" aria-selected={aba === 'equipes'} className={`rel-aba${aba === 'equipes' ? ' on' : ''}`}
          onClick={() => { setAba('equipes'); fechar(); }}>Equipes</button>
        <button role="tab" aria-selected={aba === 'contratos'} className={`rel-aba${aba === 'contratos' ? ' on' : ''}`}
          onClick={() => { setAba('contratos'); fechar(); }}>Contratos</button>
        <button role="tab" aria-selected={aba === 'status'} className={`rel-aba${aba === 'status' ? ' on' : ''}`}
          onClick={() => { setAba('status'); fechar(); }}>Status</button>
        <button role="tab" aria-selected={aba === 'faltas'} className={`rel-aba${aba === 'faltas' ? ' on' : ''}`}
          onClick={() => { setAba('faltas'); fechar(); }}>Faltas</button>
      </div>

      {Filtros}

      {/* ================= EQUIPES ================= */}
      {aba === 'equipes' && !encAtual && (
        <p className="rel-vazio">Nenhuma programação com encarregado neste período.</p>
      )}

      {aba === 'equipes' && encAtual && (
        <>
          <div className="rel-kpis">
            <div className="rel-kpi"><b>{diasEmCampo}</b><span>dias em campo</span></div>
            <div className="rel-kpi"><b>{contratantesDoEnc.length}</b><span>contratantes</span></div>
            <div className="rel-kpi"><b>{periodos.length}</b><span>obras atendidas</span></div>
            <div className="rel-kpi"><b>{faltasDoEnc}</b><span>faltas do encarregado</span></div>
          </div>

          <section className="rel-bloco">
            <h3>Onde a equipe esteve</h3>
            <p className="rel-sub">
              Cada bloco é um período contínuo na mesma obra — equipe de {encAtual.nome}.
              A cor indica o contratante.
            </p>

            <div className="rel-tl-eixo">
              {eixo.marcos.map((m) => (
                <span key={m} style={{ left: `${eixo.pos(m)}%` }}>{rotuloMes(m)}</span>
              ))}
            </div>

            {contratantesDoEnc.map((ct, indiceCt) => {
              /* Duas obras do mesmo contratante podem rodar em datas próximas
                 ou sobrepostas — cada uma ganha sua própria raia dentro da
                 linha, senão os blocos se desenhariam um em cima do outro.

                 A posição (esq/larg) é calculada ANTES de decidir a raia,
                 porque um período curto vira bloco com largura mínima pra
                 caber o clique — e esse piso pode colidir no pixel com o
                 vizinho mesmo quando as datas em si não se tocam. O piso e o
                 respiro usados aqui vêm da largura REAL do trilho (medida via
                 ResizeObserver), não de um % chutado — senão descasam do
                 min-width fixo em pixel do CSS conforme a tela muda de
                 tamanho, e o "respiro" calculado em % pode não sobrar nada em
                 pixel de verdade. Só assim a raia é decidida pela posição que
                 realmente vai aparecer na tela, e dois blocos vizinhos nunca
                 ficam grudados ou um em cima do outro. */
              const largMinPct = (LARG_MIN_PX / larguraTrilho) * 100;
              const gapMinPct = (GAP_MIN_PX / larguraTrilho) * 100;
              const comPos = periodos
                .filter((p) => p.contratante === ct)
                .map((p) => {
                  /* Um período de um dia só teria largura zero. A largura
                     mínima resolve, mas no último dia do eixo ela empurraria
                     o bloco pra fora do trilho — daí o recuo. */
                  const larg = Math.max(eixo.pos(p.fim) - eixo.pos(p.ini), largMinPct);
                  const esq = Math.min(eixo.pos(p.ini), 100 - larg);
                  return { ...p, larg, esq };
                });
              const comFaixa = atribuirFaixas(comPos, (p) => p.esq, (p) => p.esq + p.larg + gapMinPct);
              const nFaixas = comFaixa.reduce((m, p) => Math.max(m, p.faixa + 1), 1);
              return (
              <div className="rel-tl-linha" key={ct}>
                <div
                  className="rel-tl-trilho"
                  ref={indiceCt === 0 ? trilhoRef : undefined}
                  style={{ height: `${nFaixas * ALTURA_FAIXA}px` }}>
                  {comFaixa.map((p) => (
                    <button
                      key={p.id}
                      className="rel-tl-bloco"
                      aria-label={`${p.cidade} · ${p.contratante} · ${curta(p.ini)} a ${curta(p.fim)}`}
                      style={{
                        left: `${Math.max(p.esq, 0)}%`,
                        width: `${p.larg}%`,
                        top: `${2 + p.faixa * ALTURA_FAIXA}px`,
                        background: corContratante(ct),
                      }}
                      onClick={() => abrirPeriodo(p)}
                      {...liga(
                        <>
                          <div className="rel-dica-t">{p.cidade} · {p.contratante}</div>
                          <LinhaDica k="Período" v={`${curta(p.ini)} a ${curta(p.fim)}`} />
                          <LinhaDica k="Dias" v={p.dias} />
                          <LinhaDica k="Equipe" v={`${p.presenca.size + 1} pessoas`} />
                        </>,
                      )}
                    />
                  ))}
                </div>
              </div>
              );
            })}

            <div className="rel-legenda">
              {contratantesDoEnc.map((ct) => (
                <span key={ct}><i className="rel-pt" style={{ background: corContratante(ct) }} />{ct}</span>
              ))}
            </div>
            <p className="rel-dicaclique">Clique num bloco para ver a equipe daquele período, com as datas.</p>
          </section>

          <section className="rel-bloco">
            <h3>Dias por contratante</h3>
            <p className="rel-sub">Total de dias de programação no período.</p>
            <div className="rel-barras">
              {porContratante.map(([ct, v]) => (
                <button
                  key={ct}
                  className="rel-barra"
                  onClick={() => abrirContratante(ct)}
                  {...liga(
                    <>
                      <div className="rel-dica-t">{ct}</div>
                      <LinhaDica k="Dias em campo" v={v} />
                      <LinhaDica k="Obras" v={periodos.filter((p) => p.contratante === ct).length} />
                      <LinhaDica k="Participação" v={`${Math.round((v / somaDiasEnc) * 100)}%`} />
                    </>,
                  )}
                >
                  <span className="rel-barra-rot"><i className="rel-pt" style={{ background: corContratante(ct) }} />{ct}</span>
                  <span className="rel-trilho">
                    <span className="rel-fill" style={{
                      width: `${(v / porContratante[0][1]) * 100}%`, background: corContratante(ct),
                    }} />
                  </span>
                  <span className="rel-val">{v} d</span>
                </button>
              ))}
            </div>
            <p className="rel-dicaclique">Clique numa barra para ver as obras daquele contratante.</p>
          </section>

          <section className="rel-bloco">
            <h3>Obras no período</h3>
            <p className="rel-sub">Da mais recente para a mais antiga.</p>
            <div className="rel-lista">
              {periodos.slice().reverse().map((p) => (
                <button key={p.id} className="rel-item" onClick={() => abrirPeriodo(p)}>
                  <i className="rel-pt" style={{ background: corContratante(p.contratante) }} />
                  <span>
                    <span className="rel-nm">{p.cidade} · {p.contratante}</span>
                    <span className="rel-fn">{curta(p.ini)} a {curta(p.fim)}</span>
                  </span>
                  <span className="rel-val">{p.dias} d</span>
                </button>
              ))}
            </div>
            <p className="rel-dicaclique">Clique numa obra para abrir o detalhe da equipe.</p>
          </section>
        </>
      )}

      {/* ================= CONTRATOS ================= */}
      {aba === 'contratos' && (
        <ExportarControle
          programacoes={programacoes} colaboradores={colaboradores} concessionarias={concessionarias}
          contratos={contratos} faltas={faltas} de={de} ate={ate}
        />
      )}
      {aba === 'contratos' && !periodosContrato.length && (
        <p className="rel-vazio">Nenhuma programação com encarregado neste período.</p>
      )}

      {aba === 'contratos' && !!periodosContrato.length && (
        <>
          <div className="rel-kpis">
            <div className="rel-kpi" title="Dias do calendário em que pelo menos uma equipe estava em obra">
              <b>{resumoContratos.diasCalendario}</b><span>dias com equipe em campo</span>
            </div>
            <div className="rel-kpi" title="Uma diária = uma equipe trabalhando um dia. 2 equipes x 10 dias = 20 diárias">
              <b>{resumoContratos.dias}</b><span>diárias de equipe</span>
            </div>
            <div className="rel-kpi"><b>{resumoContratos.equipes}</b><span>equipes</span></div>
            <div className="rel-kpi"><b>{resumoContratos.contratantes}</b><span>contratantes</span></div>
            <div className="rel-kpi"><b>{resumoContratos.contratos}</b><span>contratos vinculados</span></div>
          </div>

          <section className="rel-bloco">
            <h3>Quando e onde cada equipe esteve</h3>
            <p className="rel-sub">
              Uma linha por equipe. Cada bloco é um período contínuo na mesma obra e no mesmo contrato —
              a cor indica o contratante.
            </p>

            <div className="rel-tl-eixo">
              {eixo.marcos.map((m) => (
                <span key={m} style={{ left: `${eixo.pos(m)}%` }}>{rotuloMes(m)}</span>
              ))}
            </div>

            {equipesContrato.map((eq, indiceEq) => {
              const largMinPct = (LARG_MIN_PX / larguraTrilho) * 100;
              const gapMinPct = (GAP_MIN_PX / larguraTrilho) * 100;
              const comPos = periodosContrato
                .filter((p) => p.encarregadoId === eq.id)
                .map((p) => {
                  const larg = Math.max(eixo.pos(p.fim) - eixo.pos(p.ini), largMinPct);
                  const esq = Math.min(eixo.pos(p.ini), 100 - larg);
                  return { ...p, larg, esq };
                });
              const comFaixa = atribuirFaixas(comPos, (p) => p.esq, (p) => p.esq + p.larg + gapMinPct);
              const nFaixas = comFaixa.reduce((m, p) => Math.max(m, p.faixa + 1), 1);
              return (
                <div className="rel-tl-linha rel-tl-linha-equipe" key={eq.id}>
                  <div className="rel-tl-rotulo" title={eq.nome}>{eq.nome}</div>
                  <div
                    className="rel-tl-trilho"
                    ref={indiceEq === 0 ? trilhoRef : undefined}
                    style={{ height: `${nFaixas * ALTURA_FAIXA}px` }}>
                    {comFaixa.map((p) => (
                      <button
                        key={p.id}
                        className="rel-tl-bloco"
                        aria-label={`${eq.nome} · ${p.cidade} · ${p.contratante} · ${curta(p.ini)} a ${curta(p.fim)}`}
                        style={{
                          left: `${Math.max(p.esq, 0)}%`,
                          width: `${p.larg}%`,
                          top: `${2 + p.faixa * ALTURA_FAIXA}px`,
                          background: corContratante(p.contratante),
                        }}
                        onClick={() => abrirPeriodoContrato(p)}
                        {...liga(
                          <>
                            <div className="rel-dica-t">{p.cidade} · {p.contratante}</div>
                            <LinhaDica k="Equipe" v={eq.nome} />
                            <LinhaDica k="Contrato" v={p.contratoNumero || 'Não vinculado'} />
                            <LinhaDica k="Período" v={`${curta(p.ini)} a ${curta(p.fim)}`} />
                            <LinhaDica k="Dias" v={p.dias} />
                          </>,
                        )}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            <div className="rel-legenda">
              {contratantesContrato.map((ct) => (
                <span key={ct}><i className="rel-pt" style={{ background: corContratante(ct) }} />{ct}</span>
              ))}
            </div>
            <p className="rel-dicaclique">Clique num bloco para ver a equipe, o contrato e as datas exatas.</p>
          </section>

          <section className="rel-bloco">
            <h3>Diárias por contratante</h3>
            <p className="rel-sub">Uma diária = uma equipe trabalhando um dia. Soma de todas as equipes no período.</p>
            <div className="rel-barras">
              {diasPorContratanteGeral.map(([ct, v]) => (
                <button
                  key={ct}
                  className="rel-barra"
                  onClick={() => abrirContratanteGeral(ct)}
                  {...liga(
                    <>
                      <div className="rel-dica-t">{ct}</div>
                      <LinhaDica k="Diárias de equipe" v={v} />
                      <LinhaDica k="Obras" v={periodosContrato.filter((p) => p.contratante === ct).length} />
                      <LinhaDica k="Participação" v={`${Math.round((v / resumoContratos.dias) * 100)}%`} />
                    </>,
                  )}
                >
                  <span className="rel-barra-rot"><i className="rel-pt" style={{ background: corContratante(ct) }} />{ct}</span>
                  <span className="rel-trilho">
                    <span className="rel-fill" style={{
                      width: `${(v / diasPorContratanteGeral[0][1]) * 100}%`, background: corContratante(ct),
                    }} />
                  </span>
                  <span className="rel-val">{v}</span>
                </button>
              ))}
            </div>
            <p className="rel-dicaclique">Clique numa barra para ver as obras daquele contratante, com a equipe de cada uma.</p>
          </section>

          <section className="rel-bloco">
            <h3>Dias por contrato</h3>
            <p className="rel-sub">
              Contratos com mais dias primeiro. Sem vínculo no cadastro entra como uma barra só por contratante.
            </p>
            <div className="rel-barras">
              {diasPorContratoGeral.map((item) => (
                <button
                  key={item.chave}
                  className="rel-barra"
                  onClick={() => abrirContratoGeral(item)}
                  {...liga(
                    <>
                      <div className="rel-dica-t">{item.label}</div>
                      <LinhaDica k="Contratante" v={item.contratante} />
                      <LinhaDica k="Dias em campo" v={item.dias} />
                      <LinhaDica k="Obras" v={item.obras} />
                    </>,
                  )}
                >
                  <span className="rel-barra-rot">
                    <i className="rel-pt" style={{ background: corContratante(item.contratante) }} />{item.label}
                  </span>
                  <span className="rel-trilho">
                    <span className="rel-fill" style={{
                      width: `${(item.dias / diasPorContratoGeral[0].dias) * 100}%`, background: corContratante(item.contratante),
                    }} />
                  </span>
                  <span className="rel-val">{item.dias} d</span>
                </button>
              ))}
            </div>
            <p className="rel-dicaclique">Clique numa barra para ver as obras daquele contrato, com a equipe de cada uma.</p>
          </section>

          <section className="rel-bloco">
            <h3>Obras no período</h3>
            <p className="rel-sub">Da mais recente para a mais antiga.</p>
            <div className="rel-lista">
              {periodosContrato.slice().reverse().map((p) => (
                <button key={p.id} className="rel-item" onClick={() => abrirPeriodoContrato(p)}>
                  <i className="rel-pt" style={{ background: corContratante(p.contratante) }} />
                  <span>
                    <span className="rel-nm">{p.cidade} · {p.contratante}{p.contratoNumero ? ` · ${p.contratoNumero}` : ''}</span>
                    <span className="rel-fn">{p.encarregadoNome} · {curta(p.ini)} a {curta(p.fim)}</span>
                  </span>
                  <span className="rel-val">{p.dias} d</span>
                </button>
              ))}
            </div>
            <p className="rel-dicaclique">Clique numa obra para abrir o detalhe da equipe.</p>
          </section>
        </>
      )}

      {/* ================= FALTAS ================= */}
      {aba === 'faltas' && !faltasFiltradas.length && !parciaisFiltradas.length && (
        <p className="rel-vazio">Nenhuma ausência registrada neste período.</p>
      )}

      {aba === 'faltas' && !!faltasFiltradas.length && (
        <>
          <div className="rel-kpis">
            <div className="rel-kpi"><b>{faltasFiltradas.length}</b><span>ausências no período</span></div>
            <div className="rel-kpi"><b>{porPessoa.length}</b><span>colaboradores afetados</span></div>
            <div className="rel-kpi"><b>{porMotivo[0][1].length}</b><span>em {rotuloMotivo(porMotivo[0][0]).toLowerCase()}</span></div>
            <div className="rel-kpi"><b>{(faltasFiltradas.length / porPessoa.length).toFixed(1)}</b><span>dias por colaborador</span></div>
          </div>

          <section className="rel-bloco">
            <h3>Faltas por motivo</h3>
            <p className="rel-sub">
              Cada ocorrência é um dia de ausência.
              {!incluirFerias && ' Férias e folgas estão fora desta conta.'}
            </p>
            <div className="rel-barras">
              {porMotivo.map(([motivo, regs]) => (
                <button
                  key={motivo}
                  className="rel-barra"
                  onClick={() => abrirGrupoFaltas({
                    titulo: rotuloMotivo(motivo),
                    sub: `${regs.length} ${regs.length === 1 ? 'ocorrência' : 'ocorrências'}`,
                    cor: corMotivo(motivo),
                    registros: regs,
                  })}
                  {...liga(
                    <>
                      <div className="rel-dica-t">{rotuloMotivo(motivo)}</div>
                      <LinhaDica k="Ocorrências" v={regs.length} />
                      <LinhaDica k="Pessoas" v={new Set(regs.map((r) => r.colaboradorId)).size} />
                      <LinhaDica k="Do total" v={`${Math.round((regs.length / faltasFiltradas.length) * 100)}%`} />
                    </>,
                  )}
                >
                  <span className="rel-barra-rot"><i className="rel-pt" style={{ background: corMotivo(motivo) }} />{rotuloMotivo(motivo)}</span>
                  <span className="rel-trilho">
                    <span className="rel-fill" style={{
                      width: `${(regs.length / porMotivo[0][1].length) * 100}%`, background: corMotivo(motivo),
                    }} />
                  </span>
                  <span className="rel-val">{regs.length}</span>
                </button>
              ))}
            </div>
            <p className="rel-dicaclique">Clique num motivo para ver quem faltou e em que dias.</p>
          </section>

          <section className="rel-bloco">
            <h3>Faltas por mês</h3>
            <p className="rel-sub">Volume total, para enxergar a tendência.</p>
            <div className="rel-colunas">
              {porMes.map(([mes, regs]) => {
                const maior = Math.max(...porMes.map(([, r]) => r.length));
                return (
                  <button
                    key={mes}
                    className="rel-col"
                    onClick={() => abrirGrupoFaltas({
                      titulo: rotuloMes(mes),
                      sub: `${regs.length} ${regs.length === 1 ? 'ausência' : 'ausências'} no mês`,
                      registros: regs,
                    })}
                    {...liga(
                      <>
                        <div className="rel-dica-t">{rotuloMes(mes)}</div>
                        <LinhaDica k="Ausências" v={regs.length} />
                      </>,
                    )}
                  >
                    <span className="rel-col-cap">{regs.length}</span>
                    <span className="rel-col-bar" style={{ height: `${Math.max((regs.length / maior) * 96, 3)}px` }} />
                    <span className="rel-col-rot">{MESES[Number(mes.slice(5, 7)) - 1]}</span>
                  </button>
                );
              })}
            </div>
            <p className="rel-dicaclique">Clique numa coluna para ver as faltas daquele mês.</p>
          </section>

          <section className="rel-bloco">
            <h3>Quem mais faltou</h3>
            <p className="rel-sub">Ordenado pelo total de ausências no período.</p>
            <div className="rel-lista">
              {porPessoa.map(([id, regs]) => {
                const p = pessoaDe.get(id);
                return (
                  <button key={id} className="rel-item rel-item-pessoa" onClick={() => abrirPessoaFaltas(id, regs)}>
                    <Avatar nome={p?.nome} url={p?.fotoUrl} tamanho="small" />
                    <span>
                      <span className="rel-nm">{p?.nome || 'Colaborador removido'}</span>
                      <span className="rel-fn">{p?.funcao || ''}</span>
                    </span>
                    <span className="rel-trilho">
                      <span className="rel-fill rel-fill-neutro" style={{
                        width: `${(regs.length / porPessoa[0][1].length) * 100}%`,
                      }} />
                    </span>
                    <span className="rel-val">{regs.length}</span>
                  </button>
                );
              })}
            </div>
            <p className="rel-dicaclique">Clique num nome para ver os dias exatos, motivo por motivo.</p>
          </section>
        </>
      )}

      {aba === 'faltas' && !!parciaisFiltradas.length && (
        <section className="rel-bloco">
          <h3>Faltas de meio período</h3>
          <p className="rel-sub">
            Foi pra obra e trabalhou só parte do dia. Contadas em horas, fora das ausências acima —
            {' '}<b>{duracaoTexto(minutosParciais)}</b> no total, em {parciaisFiltradas.length}{' '}
            {parciaisFiltradas.length === 1 ? 'ocorrência' : 'ocorrências'}.
          </p>
          <div className="rel-lista">
            {parciaisPorPessoa.map(([id, { regs, minutos }]) => {
              const p = pessoaDe.get(id);
              return (
                <button key={id} className="rel-item rel-item-pessoa" onClick={() => abrirPessoaParcial(id, regs, minutos)}>
                  <Avatar nome={p?.nome} url={p?.fotoUrl} tamanho="small" />
                  <span>
                    <span className="rel-nm">{p?.nome || 'Colaborador removido'}</span>
                    <span className="rel-fn">{regs.length} {regs.length === 1 ? 'vez' : 'vezes'}</span>
                  </span>
                  <span className="rel-trilho">
                    <span className="rel-fill" style={{
                      width: `${(minutos / parciaisPorPessoa[0][1].minutos) * 100}%`, background: 'var(--erro)',
                    }} />
                  </span>
                  <span className="rel-val">{duracaoTexto(minutos)}</span>
                </button>
              );
            })}
          </div>
          <p className="rel-dicaclique">Clique num nome para ver os dias, os horários e o motivo.</p>
        </section>
      )}

      {/* ================= STATUS ================= */}
      {aba === 'status' && mesStatusAtual && (
        <>
          <div className="rs-mes">
            <button type="button" className="rs-nav" disabled={idxMes <= 0}
              onClick={() => setMesStatus(mesesStatus[idxMes - 1])} aria-label="Mês anterior">‹</button>
            <b>{mesLongo(mesStatusAtual)}</b>
            <button type="button" className="rs-nav" disabled={idxMes >= mesesStatus.length - 1}
              onClick={() => setMesStatus(mesesStatus[idxMes + 1])} aria-label="Próximo mês">›</button>
            {mesesStatus.length > 1 && <span className="rs-mes-dica">meses do filtro De/Até</span>}
          </div>

          {!cartoesStatus.length && <p className="rel-vazio">Nenhuma programação neste mês.</p>}

          {!!cartoesStatus.length && (
            <>
              <div className="rel-kpis">
                <div className="rel-kpi" title="Uma diária = uma equipe num dia">
                  <b>{totStatus.total}</b><span>diárias no mês</span>
                </div>
                <div className="rel-kpi">
                  <b>{totStatus.ok}</b>
                  <span>concluídas ({Math.round((totStatus.ok / totStatus.total) * 100)}%)</span>
                </div>
                <div className="rel-kpi"><b>{totStatus.erro}</b><span>não realizadas</span></div>
                <div className={`rel-kpi${totStatus.pend ? ' rs-kpi-pend' : ''}`}
                  title="Dias que já passaram e continuam como Em campo">
                  <b>{totStatus.pend}</b><span>sem baixa</span>
                </div>
                <div className="rel-kpi"><b>{cartoesStatus.length}</b><span>contratos</span></div>
              </div>

              <section className="rel-bloco">
                <h3>Como ficou cada dia, por contrato</h3>
                <p className="rel-sub">
                  Dia com mais de uma equipe aparece dividido, uma faixa por equipe. Passe o mouse para ver as
                  equipes; clique para abrir o detalhe.
                </p>
                <div className="rs-legenda">
                  <span><i className="rs-q rs-ok" />Concluído</span>
                  <span><i className="rs-q rs-campo" />Em campo (hoje ou adiante)</span>
                  <span><i className="rs-q rs-erro" />Não realizado — letra: C chuva · M manutenção · V viagem · I integração · O outros</span>
                  <span><i className="rs-q rs-pend" />Sem baixa (passou e ficou Em campo)</span>
                  <span><i className="rs-q rs-vazio" />Sem equipe</span>
                </div>

                <div className="rs-cals">
                  {cartoesStatus.map((c) => (
                    <div className="rs-cal" key={c.chave}>
                      <div className="rs-cal-topo">
                        <i className="rel-pt" style={{ background: corContratante(c.contratante) }} />
                        <div>
                          <h4 className={c.semContrato ? 'sem' : ''}>{c.contrato}</h4>
                          <span>{c.contratante}</span>
                        </div>
                      </div>
                      <div className="rs-grade">
                        {SEMANA_CURTA.map((d, i) => <span key={`h${i}`} className="rs-sem">{d}</span>)}
                        {semanasDoMes(mesStatusAtual).map((iso, i) => {
                          if (!iso) return <span key={`x${i}`} />;
                          const n = Number(iso.slice(8, 10));
                          const fora = iso < de || iso > ate;
                          const lista = c.dias[iso];
                          if (!lista) {
                            const cls = fora ? 'fora' : iso > hoje ? 'futuro' : 'vazio';
                            return <span key={iso} className={`rs-dia rs-${cls}`}><b>{n}</b></span>;
                          }
                          const unico = lista.every((x) => x.st === lista[0].st) ? lista[0].st : 'misto';
                          const motivo = lista.find((x) => x.motivo)?.motivo;
                          return (
                            <button
                              type="button"
                              key={iso}
                              className={`rs-dia rs-tem rs-${unico}`}
                              onClick={() => abrirDiaStatus(c, iso, lista)}
                              {...liga(
                                <>
                                  <div className="rel-dica-t">{c.contrato} · {diaSemana(iso)} {curta(iso)}</div>
                                  {lista.map(({ p, st, motivo: m }) => (
                                    <LinhaDica
                                      key={p.id}
                                      k={pessoaDe.get(p.encarregadoId)?.nome?.split(' ')[0] || 'Equipe'}
                                      v={`${ST[st]}${m ? ` · ${String(m).toLowerCase()}` : ''}`}
                                    />
                                  ))}
                                </>,
                              )}
                            >
                              {lista.map((x) => <i key={x.p.id} className={`rs-seg rs-${x.st}`} />)}
                              <b>{n}</b>
                              {motivo && <em>{letraMotivo(motivo)}</em>}
                            </button>
                          );
                        })}
                      </div>
                      <div className="rs-tot">
                        {!!c.cont.ok && <span className="rs-chip rs-ok">{c.cont.ok} concluíd{c.cont.ok === 1 ? 'a' : 'as'}</span>}
                        {!!c.cont.erro && <span className="rs-chip rs-erro">{c.cont.erro} não realizad{c.cont.erro === 1 ? 'a' : 'as'}</span>}
                        {!!c.cont.pend && <span className="rs-chip rs-pend">{c.cont.pend} sem baixa</span>}
                        {!!c.cont.campo && <span className="rs-chip rs-campo">{c.cont.campo} em campo</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </>
      )}

      <Painel
        key={pilha.length}
        dados={detalhe}
        aoFechar={fechar}
        aoVoltar={pilha.length > 1 ? voltar : null}
        anterior={pilha.length > 1 ? pilha[pilha.length - 2].titulo : null}
      />
      {balao}
    </div>
  );
}
