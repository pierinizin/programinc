import { useMemo, useState } from 'react';
import { equipesRepetidas, obrasSemContrato } from '../lib/conferencia';

/* =============================================================================
   Conferência de dados
   -----------------------------------------------------------------------------
   O que parece fora do lugar no histórico, cada item com o botão pra resolver.
   Toda ação que muda dado passa por uma confirmação no App (que diz exatamente
   o que vai mudar) — aqui só se escolhe.
   ============================================================================= */

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const br = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const comDia = (iso) => `${SEMANA[new Date(`${iso}T12:00:00`).getDay()]} ${br(iso)}`;
const pessoasDe = (p) => new Set([p.encarregadoId, ...(p.membroIds || [])].filter(Boolean)).size;

export function Conferencia({ db, onAbrirDia, onExcluirCopias, onLigarContrato }) {
  const [filtro, setFiltro] = useState('tudo');
  const [aberto, setAberto] = useState(null);           // conc id com a lista de obras aberta
  const [escolha, setEscolha] = useState({});           // conc id -> contrato escolhido
  const [ocupado, setOcupado] = useState(null);

  const nomeDe = useMemo(
    () => new Map((db.colaboradores || []).map((c) => [c.id, c.nome])),
    [db.colaboradores],
  );
  const repetidas = useMemo(() => equipesRepetidas(db.programacoes, db.faltas), [db.programacoes, db.faltas]);
  const semContrato = useMemo(
    () => obrasSemContrato(db.programacoes, db.concessionarias, db.contratos),
    [db.programacoes, db.concessionarias, db.contratos],
  );
  const nSemCtr = semContrato.reduce((s, g) => s + g.obras.length, 0);

  const executar = async (chave, fn) => {
    setOcupado(chave);
    try { await fn(); } finally { setOcupado(null); }
  };

  const mostra = (q) => filtro === 'tudo' || filtro === q;

  return (
    <div className="conf">
      <div className="conf-resumo" role="tablist">
        <button type="button" className={filtro === 'tudo' ? 'on' : ''} onClick={() => setFiltro('tudo')}>Tudo</button>
        <button type="button" className={`alto${filtro === 'repetida' ? ' on' : ''}`} onClick={() => setFiltro('repetida')}>
          Equipe repetida <b>{repetidas.length}</b>
        </button>
        <button type="button" className={`medio${filtro === 'semctr' ? ' on' : ''}`} onClick={() => setFiltro('semctr')}>
          Sem contrato <b>{nSemCtr}</b>
        </button>
      </div>

      {mostra('repetida') && (
        <section className="conf-bloco">
          <header>
            <span className={`conf-ico ${repetidas.length ? 'alto' : 'ok'}`} aria-hidden="true">{repetidas.length ? '=' : '✓'}</span>
            <div>
              <h3>Equipe repetida</h3>
              <p>
                Duas equipes iguais no mesmo dia: mesmo encarregado, tipo, cidade e contratante. Quase sempre é
                cópia duplicada sem querer, e conta dobrado no Controle, no Status e nos Relatórios.
              </p>
            </div>
            <span className="conf-n">{repetidas.length}</span>
          </header>
          {!repetidas.length && <div className="conf-vazio">Nenhuma equipe repetida.</div>}
          {repetidas.map((g) => (
            <div className="conf-linha" key={g.chave}>
              <div className="conf-txt">
                <div className="conf-t">{comDia(g.data)} · Encarregado {nomeDe.get(g.encarregadoId) || '—'}</div>
                <div className="conf-d">
                  <span className="conf-tag">{g.tipo}</span>
                  <span className="conf-tag">{g.cidade}</span>
                  {g.contratante && <span className="conf-tag">{g.contratante}</span>}
                  {g.sobram.length + 1} cópias · fica a com {pessoasDe(g.fica)} {pessoasDe(g.fica) === 1 ? 'pessoa' : 'pessoas'}
                  {g.sobram.length === 1 ? `, sai a com ${pessoasDe(g.sobram[0])}` : ''}
                  {g.bloqueado && <em> · mais de uma tem falta de meio período: confira no dia</em>}
                </div>
              </div>
              <div className="conf-acoes">
                <button type="button" className="ghost-btn" onClick={() => onAbrirDia(g.data)}>Abrir o dia</button>
                {!g.bloqueado && (
                  <button
                    type="button"
                    className="conf-perigo"
                    disabled={!!ocupado}
                    onClick={() => executar(g.chave, () => onExcluirCopias(g))}
                  >
                    {ocupado === g.chave ? 'Excluindo…' : g.sobram.length === 1 ? 'Excluir a cópia' : `Excluir ${g.sobram.length} cópias`}
                  </button>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {mostra('semctr') && (
        <section className="conf-bloco">
          <header>
            <span className={`conf-ico ${semContrato.length ? 'medio' : 'ok'}`} aria-hidden="true">{semContrato.length ? '?' : '✓'}</span>
            <div>
              <h3>Obras sem contrato</h3>
              <p>
                Obras de contratantes que <b>têm</b> contrato cadastrado, mas ficaram sem nenhum ligado. Saem como
                "sem contrato" no Controle e no Status.
              </p>
            </div>
            <span className="conf-n">{nSemCtr}</span>
          </header>
          {!semContrato.length && <div className="conf-vazio">Nenhuma obra sem contrato.</div>}
          {semContrato.map((g) => {
            const unico = g.contratos.length === 1 ? g.contratos[0] : null;
            const escolhido = unico || g.contratos.find((k) => k.id === escolha[g.conc.id]);
            return (
              <div key={g.conc.id}>
                <div className="conf-linha">
                  <div className="conf-txt">
                    <div className="conf-t">
                      {g.conc.sigla} · {g.obras.length} {g.obras.length === 1 ? 'obra' : 'obras'} sem contrato
                    </div>
                    <div className="conf-d">
                      de <i>{br(g.de)}</i> a <i>{br(g.ate)}</i> ·{' '}
                      {unico ? <>contrato cadastrado: <b>{unico.numero}</b></> : `${g.contratos.length} contratos cadastrados`}
                    </div>
                  </div>
                  <div className="conf-acoes">
                    <button type="button" className="ghost-btn" onClick={() => setAberto((a) => (a === g.conc.id ? null : g.conc.id))}>
                      {aberto === g.conc.id ? 'Esconder obras' : 'Ver obras'}
                    </button>
                    {!unico && (
                      <select
                        className="conf-sel"
                        value={escolha[g.conc.id] || ''}
                        onChange={(e) => setEscolha((s) => ({ ...s, [g.conc.id]: e.target.value }))}
                        aria-label={`Contrato para ${g.conc.sigla}`}
                      >
                        <option value="">Escolha o contrato…</option>
                        {g.contratos.map((k) => (
                          <option key={k.id} value={k.id}>{k.numero}{k.ativo ? '' : ' (encerrado)'}</option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      className="primary-btn"
                      disabled={!escolhido || !!ocupado}
                      onClick={() => executar(g.conc.id, () => onLigarContrato(g.conc, escolhido, g.obras.length))}
                    >
                      {ocupado === g.conc.id ? 'Ligando…' : escolhido ? `Ligar ao ${escolhido.numero}` : 'Ligar'}
                    </button>
                  </div>
                </div>
                {aberto === g.conc.id && (
                  <div className="conf-obras">
                    {g.obras.slice(0, 60).map((p) => (
                      <button type="button" key={p.id} className="conf-obra" onClick={() => onAbrirDia(p.data)} title="Abrir o dia">
                        <i>{br(p.data)}</i>
                        <span>{p.tipoEquipe || 'Sem tipo'} · {p.cidade || 'sem cidade'}</span>
                        <span className="conf-fraco">{nomeDe.get(p.encarregadoId) || 'sem encarregado'}</span>
                      </button>
                    ))}
                    {g.obras.length > 60 && <div className="conf-fraco conf-mais">e mais {g.obras.length - 60}…</div>}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
