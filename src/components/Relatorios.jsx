import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from './Avatar';
import { rotuloMotivo } from '../lib/motivos';
import {
  atribuirFaixas,
  contratantesConhecidos,
  encarregadosComProgramacao,
  filtrarFaltas,
  intervaloTotal,
  periodosDoEncarregado,
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
   Duas abas que NÃO se misturam, de propósito: "Equipes" só olha programações,
   "Faltas" só olha registros de ausência. São duas perguntas diferentes, e
   somar os dois números na mesma conta já confundiu gente em planilha.

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
};
const corMotivo = (m) => COR_MOTIVO[m] || 'var(--serie-outros)';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const curta = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '');
const longa = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '');
const rotuloMes = (chave) => MESES[Number(chave.slice(5, 7)) - 1] + '/' + chave.slice(2, 4);

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
function Painel({ dados, aoFechar }) {
  useEffect(() => {
    if (!dados) return undefined;
    const esc = (e) => { if (e.key === 'Escape') aoFechar(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [dados, aoFechar]);

  if (!dados) return null;
  return (
    <>
      <div className="rel-fundo" onClick={aoFechar} role="presentation" />
      <aside className="rel-painel" role="dialog" aria-label={dados.titulo}>
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

export function Relatorios({ colaboradores = [], programacoes = [], faltas = [], concessionarias = [] }) {
  const [aba, setAba] = useState('equipes');
  const [faixa, setFaixa] = useState(null);        // null = todo o histórico
  const [encId, setEncId] = useState('');
  const [incluirFerias, setIncluirFerias] = useState(false);
  const [detalhe, setDetalhe] = useState(null);
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

  const faltasFiltradas = useMemo(
    () => filtrarFaltas(faltas, { de, ate, incluirFerias }),
    [faltas, de, ate, incluirFerias],
  );

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

  const diasEmCampo = periodos.reduce((s, p) => s + p.dias, 0);
  const faltasDoEnc = encAtual
    ? faltas.filter((f) => f.colaboradorId === encAtual.id && f.motivo !== 'ferias'
        && f.data >= de && f.data <= ate).length
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
        <input type="date" value={de} onChange={(e) => setFaixa({ de: e.target.value, ate })} />
      </label>
      <label className="rel-campo">
        <span>Até</span>
        <input type="date" value={ate} onChange={(e) => setFaixa({ de, ate: e.target.value })} />
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
          title="Férias entram no banco como falta. Contadas junto, viram o motivo mais comum e inflam o absenteísmo."
        >
          <span className="rel-tr" /> Incluir férias na contagem
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
                      <LinhaDica k="Participação" v={`${Math.round((v / diasEmCampo) * 100)}%`} />
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

      {/* ================= FALTAS ================= */}
      {aba === 'faltas' && !faltasFiltradas.length && (
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
              {!incluirFerias && ' Férias estão fora desta conta.'}
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

      <Painel dados={detalhe} aoFechar={fechar} />
      {balao}
    </div>
  );
}
