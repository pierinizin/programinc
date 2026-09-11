import { useMemo, useRef, useState } from 'react';
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

function CardUnidade({
  unidade, colaboradorPorId, podeEditar, ehAdmin,
  selecionado, onSelecionar, editandoValidadeId, onIniciarEdicao,
  onSalvarValidade, onRemoverIntegracao, onDesfazerGrupo, arrastavel,
}) {
  const ehGrupo = unidade.tipo === 'grupo';

  return (
    <div className={`it-card${ehGrupo ? ' it-card-grupo' : ''}`}>
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
          {ehGrupo ? <b>CONTRATO: {unidade.titulo}</b> : <b>{unidade.titulo}</b>}
          <span className="it-card-contratantes">
            {unidade.contratos.map((k) => (
              <span key={k.id} className="it-tag-contratante">
                <i style={{ background: k.cor }} />
                {k.sigla}{ehGrupo ? ` · ${k.numero}` : ''}
              </span>
            ))}
          </span>
        </div>

        {ehGrupo && ehAdmin && (
          <button type="button" className="chip-btn" onClick={() => onDesfazerGrupo(unidade)}>
            Desfazer
          </button>
        )}
      </div>

      <div
        className={`it-zona${unidade.integrados.length ? '' : ' vazia'}`}
        data-unidade={unidade.id}
        data-tipo={unidade.tipo}
        onDragOver={(e) => arrastavel && e.preventDefault()}
      >
        {unidade.integrados.length === 0 && (
          <span className="it-zona-vazia">{podeEditar ? 'arraste alguém aqui' : 'ninguém integrado ainda'}</span>
        )}
        {unidade.integrados
          .slice()
          .sort((a, b) => String(colaboradorPorId[a.colaborador_id]?.nome || '')
            .localeCompare(String(colaboradorPorId[b.colaborador_id]?.nome || ''), 'pt-BR'))
          .map((integ) => (
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
          ))}
      </div>
    </div>
  );
}

export function Integracoes({
  colaboradores, contratos, concessionarias,
  gruposIntegracao, gruposIntegracaoContratos, integracoes,
  podeEditar, ehAdmin,
  onIntegrar, onRemoverIntegracao, onSalvarValidade, onCriarGrupo, onDesfazerGrupo,
}) {
  const [busca, setBusca] = useState('');
  const [selContratos, setSelContratos] = useState({});
  const [agruparAberto, setAgruparAberto] = useState(false);
  const [nomeGrupo, setNomeGrupo] = useState('');
  const [erro, setErro] = useState('');
  const [editandoValidadeId, setEditandoValidadeId] = useState(null);

  const colaboradorPorId = useMemo(
    () => Object.fromEntries((colaboradores || []).map((c) => [c.id, c])),
    [colaboradores]
  );

  const unidades = useMemo(() => montarUnidades({
    contratos, concessionarias, gruposIntegracao, gruposIntegracaoContratos, integracoes,
  }), [contratos, concessionarias, gruposIntegracao, gruposIntegracaoContratos, integracoes]);

  const idsIntegradosEmAlgumLugar = useMemo(() => {
    const s = new Set();
    unidades.forEach((u) => u.integrados.forEach((i) => s.add(i.colaborador_id)));
    return s;
  }, [unidades]);

  const termo = busca.trim().toLowerCase();
  const colaboradoresLivres = useMemo(() => (
    (colaboradores || [])
      .filter((c) => c.status === 'ativo' && !idsIntegradosEmAlgumLugar.has(c.id))
      .filter((c) => !termo || String(c.nome || '').toLowerCase().includes(termo)
        || String(c.apelido || '').toLowerCase().includes(termo))
      .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
  ), [colaboradores, idsIntegradosEmAlgumLugar, termo]);

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
    if (arrasteRef.current.alvo) arrasteRef.current.alvo.classList.remove('alvo');
    arrasteRef.current.alvo = null;
  }

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
      alvo.classList.add('alvo');
    }
  }

  function aoSoltar(ev) {
    const st = arrasteRef.current;
    if (!st.colaborador || !st.ativo) return encerrar();
    const alvo = alvoSob(ev.clientX, ev.clientY);
    if (alvo) {
      const unidade = unidades.find((u) => u.id === alvo.dataset.unidade && u.tipo === alvo.dataset.tipo);
      if (unidade) onIntegrar(st.colaborador.id, unidade);
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
          {colaboradoresLivres.length === 0 && (
            <p className="small-muted" style={{ padding: '14px' }}>
              {termo ? 'Ninguém encontrado.' : 'Todo mundo já está integrado em algum lugar.'}
            </p>
          )}
          {colaboradoresLivres.map((c) => (
            <div
              key={c.id}
              className="pessoa"
              onPointerDown={(e) => aoPressionar(e, c)}
              onPointerMove={aoMover}
              onPointerUp={aoSoltar}
              onPointerCancel={encerrar}
              title={podeEditar ? 'Arraste para um contrato ou grupo' : c.nome}
            >
              <Avatar nome={c.nome} url={c.fotoUrl} tamanho="small" />
              <span className="pessoa-nome">
                <b>{c.apelido || c.nome}</b>
                <span>{c.funcao}</span>
              </span>
            </div>
          ))}
        </div>
      </aside>

      <div className="it-principal">
        <div className="it-topo">
          <div className="chips-row tight">
            <span className="pastilha ok"><b>{resumo.valido}</b> válidos</span>
            <span className="pastilha destaque"><b>{resumo.vencendo}</b> vencendo</span>
            <span className="pastilha alerta"><b>{resumo.vencido}</b> vencidos</span>
          </div>
          <Legenda />
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
              />
            ))}
          </div>
        )}
      </div>

      <div id="fantasma" ref={fantasmaRef}>
        <span className="veredito" />
        <span className="fantasma-nome" />
        <span className="motivo" />
      </div>
    </div>
  );
}
