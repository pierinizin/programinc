import { useMemo, useRef, useState } from 'react';
import { Avatar } from './Avatar';

const MAX_EQUIPE = 10;
const AVATARES_VISIVEIS = 4;

/* Com até 12 equipes e 10 pessoas cada, mostrar todos os rostos daria uma
   centena de avatares na tela. Mostramos quatro e um contador; o encarregado
   sai da pilha porque é a chave de leitura da equipe. */

function seloDe(item) {
  if (item.statusExecucao === 'EXECUTANDO') return ['selo-obra', 'Em campo'];
  if (item.statusExecucao === 'CONCLUÍDO') return ['selo-ok', 'Concluído'];
  if (item.statusExecucao === 'NÃO FOI POSSÍVEL REALIZAR') {
    return ['selo-parado', item.motivoNaoExecucao || 'Não realizado'];
  }
  return ['selo-neutro', '—'];
}

export function QuadroDia({
  db,
  maps,
  selectedDate,
  podeEditar,
  tiposEquipe,
  onAdicionarMembro,
  onDefinirEncarregado,
  onRemoverMembro,
  onAdicionarVeiculo,
  onRemoverVeiculo,
  onCriarRapida,
  onAbrirEquipe,
  onNovaEquipe,
  onCopiar,
}) {
  const [aba, setAba] = useState('pessoas');
  const [busca, setBusca] = useState('');
  const [soLivres, setSoLivres] = useState(true);
  const [selecionadas, setSelecionadas] = useState({});
  const [dlgAberto, setDlgAberto] = useState(false);
  const [dataDestino, setDataDestino] = useState('');
  const [estrategia, setEstrategia] = useState('fila');
  const [nova, setNova] = useState({ tipoEquipe: '', cidade: '', contratante: '' });
  const [criando, setCriando] = useState(false);

  const equipes = useMemo(
    () => db.programacoes.filter((p) => p.data === selectedDate),
    [db.programacoes, selectedDate]
  );

  const faltosos = useMemo(() => {
    const s = new Set();
    db.faltas.forEach((f) => {
      if (f.data === selectedDate) s.add(f.colaboradorId);
    });
    return s;
  }, [db.faltas, selectedDate]);

  const equipesDaPessoa = useMemo(() => {
    const m = {};
    equipes.forEach((eq) => {
      new Set([eq.encarregadoId, ...(eq.membroIds || [])].filter(Boolean)).forEach((id) => {
        (m[id] = m[id] || []).push(eq);
      });
    });
    return m;
  }, [equipes]);

  const equipesDoVeiculo = useMemo(() => {
    const m = {};
    equipes.forEach((eq) => {
      (eq.veiculoIds || []).forEach((id) => {
        (m[id] = m[id] || []).push(eq);
      });
    });
    return m;
  }, [equipes]);

  const pessoasLivres = useMemo(
    () => db.colaboradores.filter((c) => c.status !== 'inativo' && !equipesDaPessoa[c.id]),
    [db.colaboradores, equipesDaPessoa]
  );
  const veiculosLivres = useMemo(
    () => db.veiculos.filter((v) => v.status !== 'Inativo' && !equipesDoVeiculo[v.id]),
    [db.veiculos, equipesDoVeiculo]
  );

  const itensVisiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (aba === 'veiculos') {
      const base = soLivres ? veiculosLivres : db.veiculos.filter((v) => v.status !== 'Inativo');
      return base
        .filter(
          (v) =>
            !termo ||
            v.placa.toLowerCase().includes(termo) ||
            (v.modelo || '').toLowerCase().includes(termo)
        )
        .sort((a, b) => (equipesDoVeiculo[a.id] ? 1 : 0) - (equipesDoVeiculo[b.id] ? 1 : 0));
    }
    const base = soLivres ? pessoasLivres : db.colaboradores.filter((c) => c.status !== 'inativo');
    return base
      .filter(
        (p) =>
          !termo ||
          p.nome.toLowerCase().includes(termo) ||
          (p.apelido || '').toLowerCase().includes(termo) ||
          (p.funcao || '').toLowerCase().includes(termo)
      )
      .sort((a, b) => (equipesDaPessoa[a.id] ? 1 : 0) - (equipesDaPessoa[b.id] ? 1 : 0));
  }, [
    aba, busca, soLivres, pessoasLivres, veiculosLivres,
    db.colaboradores, db.veiculos, equipesDaPessoa, equipesDoVeiculo,
  ]);

  /* ---------------------------------------------------------------
     Validação antes do drop. Pessoa em duas equipes é permitido com
     aviso — foi a sua escolha. Bloqueio de verdade só em equipe cheia
     ou item que já está naquela mesma equipe.
     --------------------------------------------------------------- */
  function validar(arrasto, equipe, ehNova) {
    if (!arrasto) return { ok: 'nao', msg: '' };
    const { tipo, item } = arrasto;

    if (tipo === 'veiculo') {
      if (equipe && (equipe.veiculoIds || []).includes(item.id)) {
        return { ok: 'nao', msg: 'já nesta equipe' };
      }
      const outras = equipesDoVeiculo[item.id];
      if (outras && outras.length) return { ok: 'aviso', msg: `já em ${outras[0].cidade}` };
      if (item.status === 'Manutenção') return { ok: 'aviso', msg: 'em manutenção' };
      return { ok: 'sim', msg: 'disponível' };
    }

    if (equipe) {
      const dentro = new Set([equipe.encarregadoId, ...(equipe.membroIds || [])].filter(Boolean));
      if (dentro.has(item.id)) return { ok: 'nao', msg: 'já está nesta equipe' };
      if (dentro.size >= MAX_EQUIPE) return { ok: 'nao', msg: `equipe cheia (${MAX_EQUIPE})` };
      // A primeira pessoa a entrar numa equipe sem encarregado vira o
      // encarregado. É o que evita ter que abrir formulário só para isso.
      if (!equipe.encarregadoId) return { ok: 'sim', msg: 'vira encarregado' };
    }
    if (ehNova) return { ok: 'sim', msg: 'cria equipe como encarregado' };

    const outras = equipesDaPessoa[item.id];
    if (outras && outras.length) return { ok: 'aviso', msg: `já em ${outras[0].cidade}` };
    if (faltosos.has(item.id)) return { ok: 'aviso', msg: 'com falta hoje' };
    return { ok: 'sim', msg: 'livre' };
  }

  /* ------------------------------ arraste ------------------------------ */
  const fantasmaRef = useRef(null);
  const arrasteRef = useRef({ arrasto: null, origem: null, alvo: null, ativo: false, x: 0, y: 0 });

  function pintarFantasma(v, arrasto) {
    const el = fantasmaRef.current;
    if (!el) return;
    el.dataset.ok = v.ok;
    el.querySelector('.veredito').textContent =
      v.ok === 'nao' ? '✕' : v.ok === 'aviso' ? '!' : '✓';
    el.querySelector('.fantasma-nome').textContent =
      arrasto.tipo === 'veiculo' ? arrasto.item.placa : arrasto.item.apelido || arrasto.item.nome;
    el.querySelector('.motivo').textContent = v.msg || '';
  }

  function alvoSob(x, y) {
    const el = fantasmaRef.current;
    if (el) el.style.visibility = 'hidden';
    const sob = document.elementFromPoint(x, y);
    if (el) el.style.visibility = 'visible';
    if (!sob || !sob.closest) return null;
    return sob.closest('[data-equipe]') || sob.closest('[data-nova]');
  }

  function limparAlvo() {
    const a = arrasteRef.current.alvo;
    if (a) a.classList.remove('alvo', 'alvo-nao');
    arrasteRef.current.alvo = null;
  }

  function encerrar() {
    const st = arrasteRef.current;
    if (st.origem) st.origem.classList.remove('arrastando');
    limparAlvo();
    if (fantasmaRef.current) fantasmaRef.current.style.display = 'none';
    arrasteRef.current = { arrasto: null, origem: null, alvo: null, ativo: false, x: 0, y: 0 };
  }

  function aoPressionar(ev, tipo, item) {
    if (!podeEditar || ev.button !== 0) return;
    arrasteRef.current = {
      arrasto: { tipo, item },
      origem: ev.currentTarget,
      alvo: null,
      ativo: false,
      x: ev.clientX,
      y: ev.clientY,
    };
    ev.currentTarget.setPointerCapture(ev.pointerId);
  }

  function aoMover(ev) {
    const st = arrasteRef.current;
    if (!st.arrasto) return;

    if (!st.ativo) {
      if (Math.abs(ev.clientX - st.x) + Math.abs(ev.clientY - st.y) < 6) return;
      st.ativo = true;
      st.origem.classList.add('arrastando');
      if (fantasmaRef.current) fantasmaRef.current.style.display = 'flex';
      pintarFantasma(validar(st.arrasto, null, false), st.arrasto);
    }

    const el = fantasmaRef.current;
    if (el) {
      el.style.left = `${ev.clientX}px`;
      el.style.top = `${ev.clientY}px`;
    }

    const alvo = alvoSob(ev.clientX, ev.clientY);
    if (st.alvo && st.alvo !== alvo) limparAlvo();
    if (alvo && alvo !== st.alvo) {
      st.alvo = alvo;
      const ehNova = alvo.hasAttribute('data-nova');
      const eq = ehNova ? null : equipes.find((e) => e.id === alvo.dataset.equipe);
      const v = validar(st.arrasto, eq, ehNova);
      alvo.classList.add(v.ok === 'nao' ? 'alvo-nao' : 'alvo');
      pintarFantasma(v, st.arrasto);
    }
  }

  function aoSoltar(ev) {
    const st = arrasteRef.current;
    if (!st.arrasto || !st.ativo) return encerrar();

    const alvo = alvoSob(ev.clientX, ev.clientY);
    const arrasto = st.arrasto;

    if (alvo) {
      const ehNova = alvo.hasAttribute('data-nova');
      const eq = ehNova ? null : equipes.find((e) => e.id === alvo.dataset.equipe);
      const v = validar(arrasto, eq, ehNova);

      if (v.ok !== 'nao') {
        if (ehNova && arrasto.tipo === 'pessoa') {
          encerrar();
          criarComEncarregado(arrasto.item);
          return;
        }
        if (eq && arrasto.tipo === 'veiculo') onAdicionarVeiculo(eq, arrasto.item.id);
        else if (eq && !eq.encarregadoId) onDefinirEncarregado(eq, arrasto.item.id);
        else if (eq) onAdicionarMembro(eq, arrasto.item.id);
      }
    }
    encerrar();
  }

  /* --------------------------- criação rápida --------------------------- */
  const podeCriar = nova.cidade.trim() && nova.contratante.trim() && nova.tipoEquipe;

  async function criar(encarregadoId = null) {
    if (!podeCriar) return;
    setCriando(true);
    await onCriarRapida({
      tipoEquipe: nova.tipoEquipe,
      cidade: nova.cidade.trim().toUpperCase(),
      contratante: nova.contratante.trim().toUpperCase(),
      encarregadoId,
    });
    setNova({ tipoEquipe: '', cidade: '', contratante: '' });
    setCriando(false);
  }

  function criarComEncarregado(pessoa) {
    if (!podeCriar) {
      alert('Preencha tipo, cidade e contratante antes de soltar alguém aqui.');
      return;
    }
    criar(pessoa.id);
  }

  /* ------------------------------ seleção ------------------------------ */
  const marcadas = Object.keys(selecionadas).filter((k) => selecionadas[k]);

  function abrirCopia() {
    const d = new Date(`${selectedDate}T12:00:00`);
    d.setDate(d.getDate() + 1);
    setDataDestino(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    );
    setEstrategia('fila');
    setDlgAberto(true);
  }

  async function confirmarCopia() {
    setDlgAberto(false);
    await onCopiar(equipes.filter((e) => selecionadas[e.id]), dataDestino, estrategia);
    setSelecionadas({});
  }

  return (
    <div className="quadro">
      <div className="quadro-topo">
        <div>
          <strong className="quadro-titulo">Quadro do dia</strong>
          <span className="small-muted">
            {equipes.length} {equipes.length === 1 ? 'equipe' : 'equipes'} ·{' '}
            {pessoasLivres.length} livres · {veiculosLivres.length} veículos parados
          </span>
        </div>
        {podeEditar && (
          <button className="ghost-btn" onClick={onNovaEquipe}>Formulário completo</button>
        )}
      </div>

      {marcadas.length > 0 && (
        <div className="barra-sel">
          <span>
            {marcadas.length}{' '}
            {marcadas.length === 1 ? 'programação selecionada' : 'programações selecionadas'}
          </span>
          <div className="chips-row tight">
            <button className="chip-btn" onClick={() => setSelecionadas({})}>Limpar</button>
            {podeEditar && (
              <button className="chip-btn" onClick={abrirCopia}>Copiar para outro dia</button>
            )}
          </div>
        </div>
      )}

      <div className="quadro-corpo">
        <aside className="banco">
          <div className="banco-abas">
            <button
              className="aba"
              aria-pressed={aba === 'pessoas'}
              onClick={() => { setAba('pessoas'); setBusca(''); }}
            >
              Pessoas <em>{pessoasLivres.length}</em>
            </button>
            <button
              className="aba"
              aria-pressed={aba === 'veiculos'}
              onClick={() => { setAba('veiculos'); setBusca(''); }}
            >
              Veículos <em>{veiculosLivres.length}</em>
            </button>
          </div>

          <div className="banco-topo">
            <input
              className="busca"
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={aba === 'veiculos' ? 'Buscar placa ou modelo' : 'Buscar nome ou função'}
              aria-label="Buscar"
            />
            <div className="filtros">
              <button className="chip" aria-pressed={soLivres} onClick={() => setSoLivres(true)}>
                {aba === 'veiculos' ? 'Parados' : 'Livres'}
              </button>
              <button className="chip" aria-pressed={!soLivres} onClick={() => setSoLivres(false)}>
                Todos
              </button>
            </div>
          </div>

          <div className="banco-lista">
            {itensVisiveis.length === 0 && (
              <p className="small-muted" style={{ padding: '14px' }}>
                {busca
                  ? 'Nada encontrado.'
                  : aba === 'veiculos'
                  ? 'Todos os veículos já estão em uso.'
                  : 'Todo mundo já está escalado.'}
              </p>
            )}

            {aba === 'pessoas' &&
              itensVisiveis.map((p) => {
                const alocada = equipesDaPessoa[p.id];
                const falta = faltosos.has(p.id);
                return (
                  <div
                    key={p.id}
                    className={`pessoa${alocada ? ' alocada' : ''}${falta ? ' falta' : ''}`}
                    onPointerDown={(e) => aoPressionar(e, 'pessoa', p)}
                    onPointerMove={aoMover}
                    onPointerUp={aoSoltar}
                    onPointerCancel={encerrar}
                    title={podeEditar ? 'Arraste para uma equipe' : p.nome}
                  >
                    <Avatar nome={p.nome} url={p.fotoUrl} tamanho="small" />
                    <span className="pessoa-nome">
                      <b>{p.apelido || p.nome}</b>
                      <span>{p.funcao}</span>
                    </span>
                    {falta ? (
                      <span className="marca-falta">Falta</span>
                    ) : alocada ? (
                      <span className="marca-alocada">
                        {alocada[0].cidade.slice(0, 8)}
                        {alocada.length > 1 ? ` +${alocada.length - 1}` : ''}
                      </span>
                    ) : null}
                  </div>
                );
              })}

            {aba === 'veiculos' &&
              itensVisiveis.map((v) => {
                const emUso = equipesDoVeiculo[v.id];
                const manut = v.status === 'Manutenção';
                return (
                  <div
                    key={v.id}
                    className={`pessoa veiculo${emUso ? ' alocada' : ''}${manut ? ' falta' : ''}`}
                    onPointerDown={(e) => aoPressionar(e, 'veiculo', v)}
                    onPointerMove={aoMover}
                    onPointerUp={aoSoltar}
                    onPointerCancel={encerrar}
                    title={podeEditar ? 'Arraste para uma equipe' : v.modelo}
                  >
                    <span className="veic-tipo" aria-hidden="true">
                      {v.tipo === 'Caminhão' ? '▭' : v.tipo === 'Caminhonete' ? '▱' : '▬'}
                    </span>
                    <span className="pessoa-nome">
                      <b className="mono">{v.placa}</b>
                      <span>{v.modelo}</span>
                    </span>
                    {manut ? (
                      <span className="marca-falta">Manut.</span>
                    ) : emUso ? (
                      <span className="marca-alocada">{emUso[0].cidade.slice(0, 8)}</span>
                    ) : null}
                  </div>
                );
              })}
          </div>
        </aside>

        <div className="equipes">
          {equipes.map((eq) => {
            const lider = eq.encarregadoId ? maps.colaboradores[eq.encarregadoId] : null;
            const membros = (eq.membroIds || [])
              .filter((id) => id !== eq.encarregadoId)
              .map((id) => maps.colaboradores[id])
              .filter(Boolean);
            const mostrar = membros.slice(0, AVATARES_VISIVEIS);
            const resto = membros.length - mostrar.length;
            const total = membros.length + (lider ? 1 : 0);
            const [classeSelo, textoSelo] = seloDe(eq);

            return (
              <div
                key={eq.id}
                data-equipe={eq.id}
                className={`equipe${selecionadas[eq.id] ? ' marcada' : ''} ${classeSelo.replace('selo-', 'st-')}`}
              >
                <button
                  type="button"
                  className="eq-check"
                  role="checkbox"
                  aria-checked={Boolean(selecionadas[eq.id])}
                  aria-label={`Selecionar ${eq.tipoEquipe}`}
                  onClick={() => setSelecionadas((s) => ({ ...s, [eq.id]: !s[eq.id] }))}
                >
                  {selecionadas[eq.id] ? '✓' : ''}
                </button>

                <button type="button" className="eq-ident" onClick={() => onAbrirEquipe(eq)}>
                  <span className="eq-txt">
                    <h4>{eq.tipoEquipe || 'Sem tipo'}</h4>
                    <span className="eq-meta">
                      <span className="cidade">{eq.cidade}</span>
                      <span className="sep">/</span>
                      <span>{eq.contratante}</span>
                    </span>
                  </span>
                </button>

                <span className="eq-veiculos">
                  {(eq.veiculoIds || []).length === 0 ? (
                    <span className="placa vazia">solte um veículo</span>
                  ) : (
                    (eq.veiculoIds || []).map((id) => (
                      <button
                        type="button"
                        key={id}
                        className="placa"
                        title={podeEditar ? 'Clique duplo para tirar' : ''}
                        onDoubleClick={() => podeEditar && onRemoverVeiculo(eq, id)}
                      >
                        {maps.veiculos[id]?.placa || '???'}
                      </button>
                    ))
                  )}
                </span>

                <span className="eq-equipe">
                  <span className="eq-lider">
                    {lider ? (
                      <>
                        <Avatar nome={lider.nome} url={lider.fotoUrl} />
                        <span>
                          <span className="rot">Encarregado</span>
                          <span className="nome-lider">{lider.apelido || lider.nome}</span>
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="avatar vazio" aria-hidden="true" />
                        <span className="rot rot-erro">Solte alguém aqui</span>
                      </>
                    )}
                  </span>

                  <span className="pilha">
                    {mostrar.length === 0 && <span className="vaga" title="Sem integrantes" />}
                    {mostrar.map((p) => (
                      <button
                        type="button"
                        key={p.id}
                        className="pilha-item"
                        title={podeEditar ? `${p.nome} — clique duplo para tirar` : p.nome}
                        onDoubleClick={() => podeEditar && onRemoverMembro(eq, p.id)}
                      >
                        <Avatar nome={p.nome} url={p.fotoUrl} tamanho="small" />
                      </button>
                    ))}
                    {resto > 0 && <span className="mais">+{resto}</span>}
                  </span>

                  <span className="contagem">
                    <b>{total}</b>/{MAX_EQUIPE}
                  </span>
                </span>

                <span className="eq-dir">
                  <span className="horas">
                    {eq.horarioInicio || '--:--'} → {eq.horarioSaida || '--:--'}
                  </span>
                  <span className={`selo ${classeSelo}`}>{textoSelo}</span>
                </span>
              </div>
            );
          })}

          {/* Criar equipe sem sair do quadro. Também é alvo de drop: soltar uma
              pessoa aqui cria a equipe já com ela como encarregada. */}
          {podeEditar && (
            <div className="criar-linha" data-nova="1">
              <span className="criar-rot">Nova equipe</span>
              <select
                value={nova.tipoEquipe}
                onChange={(e) => setNova({ ...nova, tipoEquipe: e.target.value })}
                aria-label="Tipo de equipe"
              >
                <option value="">Tipo de serviço…</option>
                {tiposEquipe.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <input
                value={nova.cidade}
                onChange={(e) => setNova({ ...nova, cidade: e.target.value })}
                placeholder="Cidade"
                aria-label="Cidade"
              />
              <input
                value={nova.contratante}
                onChange={(e) => setNova({ ...nova, contratante: e.target.value })}
                placeholder="Contratante"
                aria-label="Contratante"
              />
              <button
                className="primary-btn"
                disabled={!podeCriar || criando}
                onClick={() => criar(null)}
              >
                {criando ? 'Criando…' : 'Criar'}
              </button>
              <span className="criar-dica small-muted">
                {podeCriar
                  ? 'ou solte uma pessoa aqui para ela já entrar como encarregada'
                  : 'preencha os três campos'}
              </span>
            </div>
          )}

          {equipes.length === 0 && !podeEditar && (
            <div className="empty-card">
              <p>Nenhuma equipe programada para este dia.</p>
            </div>
          )}
        </div>
      </div>

      <div id="fantasma" ref={fantasmaRef}>
        <span className="veredito" />
        <span className="fantasma-nome" />
        <span className="motivo" />
      </div>

      {dlgAberto && (
        <div className="modal-backdrop" onClick={() => setDlgAberto(false)}>
          <div
            className="modal modal-copia"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Copiar programações"
          >
            <div className="card-header between">
              <div>
                <h3>Copiar programações</h3>
                <p className="small-muted" style={{ margin: 0 }}>
                  {marcadas.length} {marcadas.length === 1 ? 'equipe' : 'equipes'} de{' '}
                  {selectedDate.split('-').reverse().join('/')}
                </p>
              </div>
              <button className="icon-btn" onClick={() => setDlgAberto(false)} aria-label="Fechar">×</button>
            </div>

            <div className="form-grid" style={{ marginTop: '16px' }}>
              <label>
                <span>Copiar para</span>
                <input
                  type="date"
                  value={dataDestino}
                  onChange={(e) => setDataDestino(e.target.value)}
                />
              </label>

              <div>
                <span className="input-label">Quem estiver indisponível no dia de destino</span>
                <div className="opcoes">
                  {[
                    ['fila', 'Tirar da equipe e deixar pendente',
                      'A equipe é criada sem essa pessoa. É o comportamento útil quando alguém faltou.'],
                    ['manter', 'Copiar assim mesmo',
                      'Mantém a pessoa na equipe. Você resolve depois no quadro.'],
                    ['pular', 'Não copiar essa equipe',
                      'A equipe inteira é ignorada se qualquer integrante estiver indisponível.'],
                    ['substituir', 'Substituir o que já existir no destino',
                      'Apaga as equipes já programadas no dia de destino antes de copiar.'],
                  ].map(([valor, titulo, desc]) => (
                    <label key={valor} className={`opcao${estrategia === valor ? ' escolhida' : ''}`}>
                      <input
                        type="radio"
                        name="estrategia"
                        value={valor}
                        checked={estrategia === valor}
                        onChange={() => setEstrategia(valor)}
                      />
                      <span>
                        <b>{titulo}</b>
                        <span className="small-muted">{desc}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="modal-actions full">
                <button className="ghost-btn" onClick={() => setDlgAberto(false)}>Cancelar</button>
                <button className="primary-btn" onClick={confirmarCopia} disabled={!dataDestino}>
                  Copiar {marcadas.length} {marcadas.length === 1 ? 'equipe' : 'equipes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
