import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from './Avatar';
import { dataBR } from '../lib/contratos';
import { statusValidade, montarUnidades } from '../lib/integracoes';

/* =============================================================================
   Integrações
   -----------------------------------------------------------------------------
   Um card por contrato, e um card por GRUPO de contratos (o rótulo que junta
   contratos do mesmo canteiro em contratantes diferentes — ex.: "VIAS DO
   CAFÉ" na EPR e na MOTIVA). Arraste alguém do banco pra dentro de um card
   pra integrar; clique na data pra editar a validade; duplo clique no nome
   pra tirar a pessoa dali. Montar/desfazer grupo é só admin — é cadastro, e
   errado aqui embaralha a lista de integrados de contratos que não deveriam
   estar juntos.

   O arraste segue o mesmo padrão da Programação (QuadroDia): pointer events
   + um "fantasma" que segue o cursor, em vez do drag-and-drop nativo do
   navegador — mesma sensação em toda a casa.

   UMA PESSOA PODE ESTAR EM VÁRIOS CONTRATOS AO MESMO TEMPO — é o normal do
   trabalho dela, não uma exceção. Por isso o banco NUNCA esconde quem já
   está integrado em algum lugar (só mostra quantos contratos/grupos a pessoa
   já tem, pra você saber quem ainda falta arrastar). O único bloqueio é
   repetir a MESMA pessoa no MESMO card — aí sim o arraste é recusado, porque
   já existe uma linha ali.
   ============================================================================= */

function Legenda() {
  return (
    <div className="it-legenda">
      <span className="it-legenda-item"><i className="it-bola valido" /> Válido</span>
      <span className="it-legenda-item"><i className="it-bola vencendo" /> Vencendo <small>— menos de 30 dias</small></span>
      <span className="it-legenda-item"><i className="it-bola vencido" /> Vencido <small>— precisa reintegrar</small></span>
    </div>
  );
}

function Integrado({ integ, colaborador, podeEditar, editando, onIniciarEdicao, onSalvarValidade, onRemover }) {
  if (!colaborador) return null;
  const status = statusValidade(integ.validade);
  const rotulo = status === 'vencido' ? 'venceu' : 'até';

  return (
    <span
      className={`it-integrado ${status}`}
    >
      {/* O duplo clique fica só no avatar+nome, nunca sobre o botão da data —
          botão tem clique próprio (editar), e um duplo clique bem em cima dele
          vira um clique simples (abre a edição) seguido de outro no input que
          nasce no lugar, o que o navegador não reconhece mais como "duplo". */}
      <span
        className="it-integrado-alvo"
        title={podeEditar ? 'Duplo clique pra remover' : colaborador.nome}
        onDoubleClick={podeEditar ? () => onRemover(integ) : undefined}
      >
        <Avatar nome={colaborador.nome} url={colaborador.fotoUrl} tamanho="small" />
        <span className="it-integrado-nome">{colaborador.apelido || colaborador.nome}</span>
      </span>
      {editando ? (
        <input
          type="date"
          className="it-integrado-data-input"
          autoFocus
          defaultValue={integ.validade}
          onBlur={(e) => onSalvarValidade(integ, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') onIniciarEdicao(null);
          }}
        />
      ) : (
        <button
          type="button"
          className="it-integrado-data"
          disabled={!podeEditar}
          onClick={() => onIniciarEdicao(integ.id)}
        >
          {rotulo} {dataBR(integ.validade) || '?'}
        </button>
      )}
    </span>
  );
}

const norm = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();

/* Quantas fotos cabem no resumo do card fechado antes de virar "+N". */
const FOTOS_NO_RESUMO = 3;

/* Resumo do card fechado: fotos de alguns integrados empilhadas + o total.
   Vencido/vencendo aparecem como bolinha com número — fechar o card não pode
   esconder quem precisa ser reintegrado. */
function ResumoIntegrados({ integrados, colaboradorPorId }) {
  const pessoas = integrados
    .map((i) => ({ integ: i, c: colaboradorPorId[i.colaborador_id] }))
    .filter((x) => x.c);
  const vencidos = integrados.filter((i) => statusValidade(i.validade) === 'vencido').length;
  const vencendo = integrados.filter((i) => statusValidade(i.validade) === 'vencendo').length;
  const n = pessoas.length;
  if (!n) return <span className="it-resumo-vazio">ninguém</span>;
  return (
    <span className="it-resumo" title={pessoas.map((x) => x.c.nome).join(', ')}>
      <span className="pilha">
        {pessoas.slice(0, FOTOS_NO_RESUMO).map(({ integ, c }) => (
          <span key={integ.id} className="pilha-item"><Avatar nome={c.nome} url={c.fotoUrl} tamanho="small" /></span>
        ))}
        {n > FOTOS_NO_RESUMO && <span className="mais">+{n - FOTOS_NO_RESUMO}</span>}
      </span>
      <b className="it-resumo-n">{n}</b>
      <span className="it-resumo-rot">{n === 1 ? 'pessoa' : 'pessoas'}</span>
      {vencidos > 0 && <span className="it-resumo-alerta vencido" title={`${vencidos} vencido(s)`}>{vencidos}</span>}
      {vencendo > 0 && <span className="it-resumo-alerta vencendo" title={`${vencendo} vencendo`}>{vencendo}</span>}
    </span>
  );
}

/* Grupo com mais de um contrato: cada pessoa fica marcada com a empresa
   (contrato) pela qual foi integrada — via_contrato_id. O rótulo é a sigla
   do contratante; se duas empresas tiverem a mesma sigla, vai o número junto. */
function empresasDoGrupo(unidade) {
  const siglas = unidade.contratos.map((k) => k.sigla);
  return unidade.contratos.map((k) => ({
    id: k.id,
    cor: k.cor,
    rotulo: siglas.filter((x) => x === k.sigla).length > 1 ? `${k.sigla} · ${k.numero}` : k.sigla,
  }));
}
const separaPorEmpresa = (u) => u.tipo === 'grupo' && u.contratos.length > 1;

function CardUnidade({
  unidade, colaboradorPorId, podeEditar, ehAdmin,
  selecionado, onSelecionar, editandoValidadeId, onIniciarEdicao,
  onSalvarValidade, onRemoverIntegracao, onDesfazerGrupo, arrastavel,
  aberto, onAlternar,
}) {
  const ehGrupo = unidade.tipo === 'grupo';
  /* Fechado, o card INTEIRO vira a área de soltar — dá pra continuar
     arrastando gente pra dentro sem precisar abrir. */
  const alvoProps = aberto ? {} : { 'data-unidade': unidade.id, 'data-tipo': unidade.tipo };

  const porEmpresa = separaPorEmpresa(unidade);
  const empresas = porEmpresa ? empresasDoGrupo(unidade) : [];
  const idsEmpresas = new Set(empresas.map((e) => e.id));
  const secoes = porEmpresa
    ? [
      ...empresas.map((e) => ({ ...e, itens: unidade.integrados.filter((i) => i.via_contrato_id === e.id) })),
      { id: null, cor: 'var(--borda-forte)', rotulo: null,
        itens: unidade.integrados.filter((i) => !idsEmpresas.has(i.via_contrato_id)) },
    ]
    : [];
  const divisao = porEmpresa
    ? secoes.map((sx) => ({ chave: sx.id || 'sem', cor: sx.cor, n: sx.itens.length, rotulo: sx.rotulo || 'empresa não informada' }))
    : null;

  const ordenar = (lista) => lista.slice().sort((a, b) => String(colaboradorPorId[a.colaborador_id]?.nome || '')
    .localeCompare(String(colaboradorPorId[b.colaborador_id]?.nome || ''), 'pt-BR'));
  const chip = (integ) => (
    <Integrado
      key={integ.id}
      integ={integ}
      colaborador={colaboradorPorId[integ.colaborador_id]}
      podeEditar={podeEditar}
      editando={editandoValidadeId === integ.id}
      onIniciarEdicao={onIniciarEdicao}
      onSalvarValidade={onSalvarValidade}
      onRemover={onRemoverIntegracao}
    />
  );

  return (
    <div className={`it-card${ehGrupo ? ' it-card-grupo' : ''}${aberto ? '' : ' fechado'}`} {...alvoProps}>
      <div className="it-card-cab">
        {!ehGrupo && ehAdmin && (
          <button
            type="button" className="fc-check it-check"
            role="checkbox" aria-checked={selecionado} aria-label={`Selecionar ${unidade.titulo}`}
            onClick={() => onSelecionar(unidade.id)}
          >
            {selecionado ? '✓' : ''}
          </button>
        )}

        <div className="it-card-titulo">
          <b title={ehGrupo ? `CONTRATO: ${unidade.titulo}` : unidade.titulo}>
            {ehGrupo ? `CONTRATO: ${unidade.titulo}` : unidade.titulo}
          </b>
          <span
            className="it-card-contratantes"
            title={unidade.contratos.map((k) => `${k.sigla}${ehGrupo ? ` · ${k.numero}` : ''}`).join('  |  ')}
          >
            {unidade.contratos.map((k) => (
              <span key={k.id} className="it-tag-contratante">
                <i style={{ background: k.cor }} />
                {/* No grupo, o número do contrato só aparece se for diferente do
                    nome do grupo — "FIRCON · EPR - V.CAFÉ" num card que já se
                    chama EPR - V.CAFÉ só empurrava a sigla pra fora. */}
                <span className="it-tag-txt">
                  {k.sigla}{ehGrupo && norm(k.numero) !== norm(unidade.titulo) ? ` · ${k.numero}` : ''}
                </span>
                {/* Grupo separado por empresa: quantos foram integrados por esta. */}
                {porEmpresa && (
                  <b className="it-tag-n" title={`${divisao.find((d) => d.chave === k.id)?.n || 0} integrado(s) pela ${k.sigla}`}>
                    {divisao.find((d) => d.chave === k.id)?.n || 0}
                  </b>
                )}
              </span>
            ))}
          </span>
        </div>

        {ehGrupo && ehAdmin && aberto && (
          <button type="button" className="chip-btn" onClick={() => onDesfazerGrupo(unidade)}>
            Desfazer
          </button>
        )}

        <button
          type="button"
          className="it-seta"
          aria-expanded={aberto}
          aria-label={aberto ? `Recolher ${unidade.titulo}` : `Abrir ${unidade.titulo}`}
          title={aberto ? 'Recolher' : 'Abrir'}
          onClick={onAlternar}
        >
          {aberto
            ? <span className="it-resumo-n-aberto">{unidade.integrados.length}</span>
            : <ResumoIntegrados integrados={unidade.integrados} colaboradorPorId={colaboradorPorId} />}
          <svg className="it-seta-icone" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {aberto && porEmpresa && (
        <div className="it-zona it-zona-grupo">
          {secoes.map((sx) => {
            if (!sx.id && !sx.itens.length) return null;   // "não informada" só aparece se tiver alguém
            const alvo = sx.id ? { 'data-unidade': unidade.id, 'data-tipo': unidade.tipo, 'data-via': sx.id } : {};
            return (
              <div key={sx.id || 'sem'} className={`it-secao${sx.id ? '' : ' sem-empresa'}`} {...alvo}>
                <div className="it-secao-cab">
                  <i style={{ background: sx.cor }} />
                  {sx.id ? <>Integrados pela {sx.rotulo}</> : 'Empresa não informada'}
                  <small>{sx.itens.length}</small>
                </div>
                <div className="it-secao-corpo">
                  {!sx.itens.length && (
                    <span className="it-zona-vazia">
                      {podeEditar ? `arraste alguém aqui para integrar pela ${sx.rotulo}` : 'ninguém ainda'}
                    </span>
                  )}
                  {ordenar(sx.itens).map(chip)}
                </div>
                {!sx.id && podeEditar && (
                  <p className="it-secao-dica">
                    Integrados antes desta separação. Pra marcar a empresa, arraste a pessoa da lista da
                    esquerda para a seção da empresa certa.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {aberto && !porEmpresa && (
      <div
        className={`it-zona${unidade.integrados.length ? '' : ' vazia'}`}
        data-unidade={unidade.id}
        data-tipo={unidade.tipo}
        onDragOver={(e) => arrastavel && e.preventDefault()}
      >
        {unidade.integrados.length === 0 && (
          <span className="it-zona-vazia">{podeEditar ? 'arraste alguém aqui' : 'ninguém integrado ainda'}</span>
        )}
        {ordenar(unidade.integrados).map(chip)}
      </div>
      )}
    </div>
  );
}

export function Integracoes({
  colaboradores, contratos, concessionarias,
  gruposIntegracao, gruposIntegracaoContratos, integracoes,
  podeEditar, ehAdmin,
  onIntegrar, onRemoverIntegracao, onSalvarValidade, onCriarGrupo, onDesfazerGrupo, onMudarEmpresa,
}) {
  // Soltou no card FECHADO de um grupo com várias empresas: pergunta qual.
  const [escolhaEmpresa, setEscolhaEmpresa] = useState(null);   // { colaborador, unidade, x, y }
  const [busca, setBusca] = useState('');
  const [selContratos, setSelContratos] = useState({});
  const [agruparAberto, setAgruparAberto] = useState(false);
  const [nomeGrupo, setNomeGrupo] = useState('');
  const [erro, setErro] = useState('');
  const [editandoValidadeId, setEditandoValidadeId] = useState(null);

  /* Cards abertos (os demais ficam recolhidos, mostrando só fotos + total).
     Começa tudo recolhido — com muita gente integrada os cards abertos
     tomavam a tela. Fica lembrado neste navegador. */
  const CHAVE_ABERTOS = 'incovia.integracoes.abertos';
  const [abertos, setAbertos] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(CHAVE_ABERTOS) || '[]')); } catch { return new Set(); }
  });
  useEffect(() => {
    try { localStorage.setItem(CHAVE_ABERTOS, JSON.stringify([...abertos])); } catch { /* sem storage: tudo bem */ }
  }, [abertos]);
  const chaveDe = (u) => `${u.tipo}-${u.id}`;
  function alternar(u) {
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(chaveDe(u))) novo.delete(chaveDe(u)); else novo.add(chaveDe(u));
      return novo;
    });
  }

  const colaboradorPorId = useMemo(
    () => Object.fromEntries((colaboradores || []).map((c) => [c.id, c])),
    [colaboradores]
  );

  const unidades = useMemo(() => montarUnidades({
    contratos, concessionarias, gruposIntegracao, gruposIntegracaoContratos, integracoes,
  }), [contratos, concessionarias, gruposIntegracao, gruposIntegracaoContratos, integracoes]);

  /* Quantos contratos/grupos cada pessoa já tem — vira o selo no banco. Não
     serve pra esconder ninguém, só pra avisar quem ainda está com zero. */
  const contagemPorPessoa = useMemo(() => {
    const m = {};
    unidades.forEach((u) => u.integrados.forEach((i) => { m[i.colaborador_id] = (m[i.colaborador_id] || 0) + 1; }));
    return m;
  }, [unidades]);

  const termo = busca.trim().toLowerCase();
  const colaboradoresBanco = useMemo(() => (
    (colaboradores || [])
      .filter((c) => c.status === 'ativo')
      .filter((c) => !termo || String(c.nome || '').toLowerCase().includes(termo)
        || String(c.apelido || '').toLowerCase().includes(termo))
      .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
  ), [colaboradores, termo]);

  const resumo = useMemo(() => {
    let valido = 0; let vencendo = 0; let vencido = 0;
    unidades.forEach((u) => u.integrados.forEach((i) => {
      const s = statusValidade(i.validade);
      if (s === 'valido') valido += 1; else if (s === 'vencendo') vencendo += 1; else vencido += 1;
    }));
    return { valido, vencendo, vencido };
  }, [unidades]);

  const contratosMarcados = Object.keys(selContratos).filter((id) => selContratos[id]);

  /* ------------------------------ arraste ------------------------------ */
  const fantasmaRef = useRef(null);
  const arrasteRef = useRef({ colaborador: null, origem: null, alvo: null, ativo: false, x: 0, y: 0 });

  function alvoSob(x, y) {
    const el = fantasmaRef.current;
    if (el) el.style.visibility = 'hidden';
    const sob = document.elementFromPoint(x, y);
    if (el) el.style.visibility = 'visible';
    return sob?.closest ? sob.closest('[data-unidade]') : null;
  }

  function limparAlvo() {
    if (arrasteRef.current.alvo) arrasteRef.current.alvo.classList.remove('alvo', 'alvo-nao');
    arrasteRef.current.alvo = null;
  }

  function unidadeDoAlvo(alvo) {
    if (!alvo) return null;
    return unidades.find((u) => u.id === alvo.dataset.unidade && u.tipo === alvo.dataset.tipo) || null;
  }

  /* A única coisa que bloqueia o arraste: a pessoa já estar NESTE card (na
     mesma empresa, num grupo dividido). Em qualquer outro card ela pode
     entrar — integração em vários contratos ao mesmo tempo é o normal.

     O que acontece ao soltar aqui:
       'novo'     — integra (num grupo dividido, pela empresa da seção)
       'mover'    — já está no grupo por outra empresa (ou sem empresa): troca a empresa
       'escolher' — card fechado de grupo dividido: pergunta a empresa
       'dup'      — já está aqui */
  function acaoNoAlvo(colaboradorId, unidade, via) {
    if (!unidade) return null;
    const existente = unidade.integrados.find((i) => i.colaborador_id === colaboradorId);
    if (!separaPorEmpresa(unidade)) return existente ? { tipo: 'dup' } : { tipo: 'novo' };
    const emp = via ? empresasDoGrupo(unidade).find((e) => e.id === via) : null;
    if (!via) return existente ? { tipo: 'dup' } : { tipo: 'escolher' };
    if (existente && existente.via_contrato_id === via) return { tipo: 'dup', emp };
    if (existente) return { tipo: 'mover', emp, existente };
    return { tipo: 'novo', emp };
  }
  const textoAcao = (a) => {
    if (!a) return '';
    if (a.tipo === 'dup') return 'já integrado aqui';
    if (a.tipo === 'mover') return `mudar para ${a.emp.rotulo}`;
    if (a.tipo === 'escolher') return 'integrar aqui · escolher a empresa';
    return a.emp ? `integrar pela ${a.emp.rotulo}` : 'integrar aqui';
  };

  function encerrar() {
    const st = arrasteRef.current;
    if (st.origem) st.origem.classList.remove('arrastando');
    limparAlvo();
    if (fantasmaRef.current) fantasmaRef.current.style.display = 'none';
    arrasteRef.current = { colaborador: null, origem: null, alvo: null, ativo: false, x: 0, y: 0 };
  }

  function aoPressionar(ev, colaborador) {
    if (!podeEditar || ev.button !== 0) return;
    arrasteRef.current = {
      colaborador, origem: ev.currentTarget, alvo: null, ativo: false, x: ev.clientX, y: ev.clientY,
    };
    ev.currentTarget.setPointerCapture(ev.pointerId);
  }

  function aoMover(ev) {
    const st = arrasteRef.current;
    if (!st.colaborador) return;

    if (!st.ativo) {
      if (Math.abs(ev.clientX - st.x) + Math.abs(ev.clientY - st.y) < 6) return;
      st.ativo = true;
      st.origem.classList.add('arrastando');
      if (fantasmaRef.current) {
        fantasmaRef.current.style.display = 'flex';
        fantasmaRef.current.querySelector('.fantasma-nome').textContent = st.colaborador.apelido || st.colaborador.nome;
        fantasmaRef.current.querySelector('.veredito').textContent = '✓';
        fantasmaRef.current.querySelector('.motivo').textContent = 'integrar aqui';
        fantasmaRef.current.dataset.ok = 'sim';
      }
    }

    const el = fantasmaRef.current;
    if (el) { el.style.left = `${ev.clientX}px`; el.style.top = `${ev.clientY}px`; }

    const alvo = alvoSob(ev.clientX, ev.clientY);
    if (st.alvo && st.alvo !== alvo) limparAlvo();
    if (alvo && alvo !== st.alvo) {
      st.alvo = alvo;
      const acao = acaoNoAlvo(st.colaborador.id, unidadeDoAlvo(alvo), alvo.dataset.via || null);
      const duplicado = acao?.tipo === 'dup';
      alvo.classList.add(duplicado ? 'alvo-nao' : 'alvo');
      if (fantasmaRef.current) {
        fantasmaRef.current.dataset.ok = duplicado ? 'nao' : 'sim';
        fantasmaRef.current.querySelector('.veredito').textContent = duplicado ? '✕' : '✓';
        fantasmaRef.current.querySelector('.motivo').textContent = textoAcao(acao);
      }
    }
  }

  function aoSoltar(ev) {
    const st = arrasteRef.current;
    if (!st.colaborador || !st.ativo) return encerrar();
    const alvo = alvoSob(ev.clientX, ev.clientY);
    if (alvo) {
      const unidade = unidadeDoAlvo(alvo);
      const via = alvo.dataset.via || null;
      const acao = acaoNoAlvo(st.colaborador.id, unidade, via);
      if (acao?.tipo === 'novo') onIntegrar(st.colaborador.id, unidade, via);
      else if (acao?.tipo === 'mover') onMudarEmpresa(acao.existente, via);
      else if (acao?.tipo === 'escolher') {
        setEscolhaEmpresa({ colaborador: st.colaborador, unidade, x: ev.clientX, y: ev.clientY });
      }
    }
    encerrar();
  }

  async function confirmarRemocao(integ) {
    await onRemoverIntegracao(integ);
  }

  async function confirmarValidade(integ, novaData) {
    setEditandoValidadeId(null);
    if (!novaData || novaData === integ.validade) return;
    await onSalvarValidade(integ, novaData);
  }

  async function confirmarAgrupar() {
    setErro('');
    if (!nomeGrupo.trim()) { setErro('Dê um nome pro grupo — é o que vai aparecer no card.'); return; }
    if (contratosMarcados.length < 2) { setErro('Escolha pelo menos dois contratos.'); return; }
    const ok = await onCriarGrupo(nomeGrupo.trim(), contratosMarcados);
    if (ok) { setAgruparAberto(false); setNomeGrupo(''); setSelContratos({}); } else {
      setErro('Não consegui criar o grupo. Tente de novo.');
    }
  }

  return (
    <div className="it-corpo">
      <aside className="banco">
        <div className="banco-topo">
          <input
            className="busca"
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar pessoa…"
            aria-label="Buscar pessoa"
          />
        </div>
        <div className="banco-lista">
          {colaboradoresBanco.length === 0 && (
            <p className="small-muted" style={{ padding: '14px' }}>
              {termo ? 'Ninguém encontrado.' : 'Nenhum colaborador ativo cadastrado.'}
            </p>
          )}
          {colaboradoresBanco.map((c) => {
            const n = contagemPorPessoa[c.id] || 0;
            return (
              <div
                key={c.id}
                className="pessoa"
                onPointerDown={(e) => aoPressionar(e, c)}
                onPointerMove={aoMover}
                onPointerUp={aoSoltar}
                onPointerCancel={encerrar}
                title={podeEditar
                  ? 'Arraste para um contrato ou grupo — pode integrar em mais de um'
                  : c.nome}
              >
                <Avatar nome={c.nome} url={c.fotoUrl} tamanho="small" />
                <span className="pessoa-nome">
                  <b>{c.apelido || c.nome}</b>
                  <span>{c.funcao}</span>
                </span>
                {n > 0 && (
                  <span className="marca-alocada">{n} contrato{n === 1 ? '' : 's'}</span>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      <div className="it-principal">
        <div className="it-topo">
          <div className="chips-row tight">
            <span className="pastilha ok"><b>{resumo.valido}</b> válidos</span>
            <span className="pastilha destaque"><b>{resumo.vencendo}</b> vencendo</span>
            <span className="pastilha alerta"><b>{resumo.vencido}</b> vencidos</span>
          </div>
          <div className="it-topo-dir">
            <Legenda />
            {unidades.length > 0 && (
              <span className="chips-row tight">
                <button type="button" className="chip-btn"
                  disabled={abertos.size >= unidades.length}
                  onClick={() => setAbertos(new Set(unidades.map(chaveDe)))}>
                  Abrir todos
                </button>
                <button type="button" className="chip-btn"
                  disabled={!abertos.size}
                  onClick={() => setAbertos(new Set())}>
                  Recolher todos
                </button>
              </span>
            )}
          </div>
        </div>

        {ehAdmin && (
          <div className="barra-sel solta" style={{ display: contratosMarcados.length ? 'flex' : 'none' }}>
            <span>{contratosMarcados.length} contrato{contratosMarcados.length === 1 ? '' : 's'} selecionado{contratosMarcados.length === 1 ? '' : 's'}</span>
            <div className="chips-row tight">
              <button type="button" className="chip-btn" onClick={() => setSelContratos({})}>Limpar</button>
              {contratosMarcados.length >= 2 && (
                <button type="button" className="chip-btn" onClick={() => setAgruparAberto((v) => !v)}>
                  Agrupar
                </button>
              )}
            </div>
          </div>
        )}

        {agruparAberto && (
          <div className="ct-juntar-painel">
            <span>
              Juntar {contratosMarcados.length} contratos num grupo. Quem já está integrado em
              algum deles entra no grupo com a validade mais longa entre eles.
            </span>
            <input
              type="text" className="ct-busca" placeholder="Nome do grupo (ex.: VIAS DO CAFÉ)"
              value={nomeGrupo} onChange={(e) => setNomeGrupo(e.target.value)}
            />
            <button type="button" className="ghost-btn" onClick={() => { setAgruparAberto(false); setErro(''); }}>
              Cancelar
            </button>
            <button type="button" className="primary-btn" onClick={confirmarAgrupar}>
              Criar grupo
            </button>
          </div>
        )}
        {erro && <div className="mut-erro">{erro}</div>}

        {unidades.length === 0 ? (
          <div className="empty-card">Cadastre um contrato em Contratantes pra começar.</div>
        ) : (
          <div className="it-grade">
            {unidades.map((u) => (
              <CardUnidade
                key={`${u.tipo}-${u.id}`}
                unidade={u}
                colaboradorPorId={colaboradorPorId}
                podeEditar={podeEditar}
                ehAdmin={ehAdmin}
                selecionado={Boolean(selContratos[u.id])}
                onSelecionar={(id) => setSelContratos((s) => ({ ...s, [id]: !s[id] }))}
                editandoValidadeId={editandoValidadeId}
                onIniciarEdicao={setEditandoValidadeId}
                onSalvarValidade={confirmarValidade}
                onRemoverIntegracao={confirmarRemocao}
                onDesfazerGrupo={onDesfazerGrupo}
                arrastavel={podeEditar}
                aberto={abertos.has(chaveDe(u))}
                onAlternar={() => alternar(u)}
              />
            ))}
          </div>
        )}
      </div>

      {escolhaEmpresa && (
        <>
          <div className="it-escolha-fundo" onClick={() => setEscolhaEmpresa(null)} role="presentation" />
          <div
            className="it-escolha"
            role="dialog"
            aria-label="Escolher a empresa"
            style={{
              left: Math.min(escolhaEmpresa.x, window.innerWidth - 280),
              top: Math.min(escolhaEmpresa.y + 8, window.innerHeight - 200),
            }}
            onKeyDown={(e) => { if (e.key === 'Escape') setEscolhaEmpresa(null); }}
          >
            <p>
              Integrar <b>{escolhaEmpresa.colaborador.apelido || escolhaEmpresa.colaborador.nome}</b> em{' '}
              <b>{escolhaEmpresa.unidade.titulo}</b> pela:
            </p>
            <div className="it-escolha-ops">
              {empresasDoGrupo(escolhaEmpresa.unidade).map((e, k) => (
                <button
                  type="button"
                  key={e.id}
                  autoFocus={k === 0}
                  onClick={() => {
                    onIntegrar(escolhaEmpresa.colaborador.id, escolhaEmpresa.unidade, e.id);
                    setEscolhaEmpresa(null);
                  }}
                >
                  <i style={{ background: e.cor }} />{e.rotulo}
                </button>
              ))}
            </div>
            <button type="button" className="it-escolha-cancelar" onClick={() => setEscolhaEmpresa(null)}>Cancelar</button>
          </div>
        </>
      )}

      <div id="fantasma" ref={fantasmaRef}>
        <span className="veredito" />
        <span className="fantasma-nome" />
        <span className="motivo" />
      </div>
    </div>
  );
}
