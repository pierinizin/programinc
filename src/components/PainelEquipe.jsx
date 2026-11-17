import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from './Avatar';
import { contratosDe, contratoAutomatico, dataBR } from '../lib/contratos';
import { foraDaVigencia } from '../lib/vigencia';
import { funcaoLidera, regra } from '../lib/parametros';
import { ehParcial } from '../lib/faltaParcial';

/* =============================================================================
   Painel da equipe — abre ao lado, por cima do quadro
   -----------------------------------------------------------------------------
   Substitui duas telas grandes que faziam a mesma coisa: o cartão gigante que
   aparecia embaixo do quadro (10 vagas, horários em blocos, status) e a janela
   "Editar Programação" (com a lista de todo mundo para marcar).

   Aqui fica o que não se resolve arrastando: obra, contratante e CONTRATO,
   horários, status, observação. Pessoas e veículos continuam no arrastar do
   quadro, mas também dá para pôr e tirar por aqui (no celular arrastar é ruim).
   Nada grava até "Salvar" — quem salva é o App (saveProgramacao), com as
   mesmas conferências de sempre.
   ============================================================================= */

const HORARIOS = [
  ['horarioInicio', 'Saída'],
  ['horarioInicioObra', 'Obra'],
  ['horarioSaidaAlmoco', 'Almoço'],
  ['horarioRetornoAlmoco', 'Volta'],
  ['horarioFimObra', 'Fim obra'],
  ['horarioSaida', 'Retorno'],
];
const STATUS = [
  ['EXECUTANDO', 'Em campo', 'campo'],
  ['CONCLUÍDO', 'Concluído', 'ok'],
  ['NÃO FOI POSSÍVEL REALIZAR', 'Não realizado', 'parado'],
];

const minutos = (h) => { const m = /^(\d{1,2}):(\d{2})/.exec(h || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const diaSemana = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '') : '');

/** A barrinha do dia: deslocamento (cinza), obra (azul), almoço (vão). */
function LinhaDoDia({ f }) {
  const t = HORARIOS.map(([k]) => minutos(f[k]));
  if (t.some((x) => x == null)) return null;
  const ini = t[0];
  const fim = Math.max(t[5], ini + 60);
  const pct = (m) => `${((Math.min(Math.max(m, ini), fim) - ini) / (fim - ini)) * 100}%`;
  const larg = (a, b) => `${(Math.max(0, Math.min(b, fim) - Math.max(a, ini)) / (fim - ini)) * 100}%`;
  return (
    <div className="pe-linha" aria-hidden="true">
      <span className="pe-seg desl" style={{ left: pct(t[0]), width: larg(t[0], t[1]) }} />
      <span className="pe-seg obra" style={{ left: pct(t[1]), width: larg(t[1], t[2]) }} />
      <span className="pe-seg obra" style={{ left: pct(t[3]), width: larg(t[3], t[4]) }} />
      <span className="pe-seg desl" style={{ left: pct(t[4]), width: larg(t[4], t[5]) }} />
    </div>
  );
}

/** "+ adicionar" com busca — para pessoas e veículos. */
function Adicionar({ rotulo, itens, onEscolher, desabilitado, motivo }) {
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => { if (ref.current && !ref.current.contains(e.target)) { setAberto(false); setTermo(''); } };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);
  const t = termo.trim().toLowerCase();
  const achados = itens.filter((x) => !t || x.rotulo.toLowerCase().includes(t) || (x.sub || '').toLowerCase().includes(t)).slice(0, 8);
  return (
    <span className="pe-add" ref={ref}>
      <button type="button" className="pe-add-btn" disabled={desabilitado} title={desabilitado ? motivo : undefined}
        onClick={() => setAberto((v) => !v)}>+ {rotulo}</button>
      {aberto && (
        <div className="pe-add-pop">
          <input autoFocus value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Buscar…"
            onKeyDown={(e) => {
              if (e.key === 'Escape') { e.stopPropagation(); setAberto(false); setTermo(''); }
              if (e.key === 'Enter' && achados[0]) { onEscolher(achados[0].id); setTermo(''); }
            }} />
          {!achados.length && <div className="pe-add-vazio">{itens.length ? 'Nada encontrado.' : 'Ninguém disponível nesta data.'}</div>}
          {achados.map((x) => (
            <button key={x.id} type="button" onClick={() => { onEscolher(x.id); setTermo(''); }}>
              <b>{x.rotulo}</b>{x.sub && <small>{x.sub}</small>}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

export function PainelEquipe({
  form, setForm, original, db, colaboradores, veiculos, tiposEquipe, motivos, maxMembros,
  disponivel, somenteLeitura = false, podeExcluir = false,
  onSalvar, onFechar, onDuplicar, onExcluir,
}) {
  const [salvando, setSalvando] = useState(false);
  const novo = !form.id;
  const mudou = useMemo(() => JSON.stringify(form) !== JSON.stringify(original), [form, original]);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  // Esc fecha (o App pergunta antes se tiver alteração).
  useEffect(() => {
    const tecla = (e) => { if (e.key === 'Escape' && !document.querySelector('.pe-add-pop')) onFechar(mudou); };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [mudou, onFechar]);

  const conc = (db.concessionarias || []).find((c) => c.id === form.concessionaria_id) || null;
  const contratos = contratosDe(db.contratos, form.concessionaria_id)
    .filter((k) => k.ativo || k.id === form.contrato_id);
  const contrato = (db.contratos || []).find((k) => k.id === form.contrato_id) || null;
  const foraK = foraDaVigencia(contrato, form.data);

  const porId = useMemo(() => Object.fromEntries(colaboradores.map((c) => [c.id, c])), [colaboradores]);
  const vPorId = useMemo(() => Object.fromEntries(veiculos.map((v) => [v.id, v])), [veiculos]);
  const membros = form.membroIds.filter((id) => id !== form.encarregadoId).map((id) => porId[id]).filter(Boolean);
  const total = new Set([form.encarregadoId, ...form.membroIds].filter(Boolean)).size;
  const encarregados = colaboradores.filter((c) => funcaoLidera(c.funcao) && (disponivel(c) || c.id === form.encarregadoId));
  const PADRAO = regra('horario_padrao');

  // Quem já está em outra equipe neste dia, ou faltou o dia inteiro, não entra
  // na lista — o mesmo que o quadro recusa ao arrastar.
  const outras = (db.programacoes || []).filter((p) => p.data === form.data && p.id !== form.id);
  const ocupados = new Set([
    ...outras.flatMap((p) => p.membroIds || []),
    ...(db.faltas || []).filter((x) => x.data === form.data && !ehParcial(x)).map((x) => x.colaboradorId),
  ]);
  const veicOcupados = new Set(outras.flatMap((p) => p.veiculoIds || []));
  const livres = colaboradores
    .filter((c) => !form.membroIds.includes(c.id) && c.id !== form.encarregadoId && !ocupados.has(c.id) && disponivel(c))
    .map((c) => ({ id: c.id, rotulo: c.nome, sub: c.funcao }));
  const veicLivres = veiculos.filter((v) => !(form.veiculoIds || []).includes(v.id) && !veicOcupados.has(v.id))
    .map((v) => ({ id: v.id, rotulo: v.placa, sub: [v.modelo, v.ano].filter(Boolean).join(' · ') }));

  async function salvar() {
    setSalvando(true);
    try { await onSalvar(); } finally { setSalvando(false); }
  }

  const ro = somenteLeitura;
  return (
    <>
      <div className="pe-veu" onClick={() => onFechar(mudou)} />
      <aside className="pe" role="dialog" aria-label={novo ? 'Nova programação' : `Equipe ${form.tipoEquipe}`}>
        <header className="pe-cab">
          <div className="pe-cab-l1">
            <h3>{novo ? 'Nova programação' : (form.tipoEquipe || 'Equipe')}</h3>
            <button type="button" className="icon-btn" onClick={() => onFechar(mudou)} aria-label="Fechar">×</button>
          </div>
          {!novo && (
            <div className="pe-cab-l2">
              <span className="mono">{diaSemana(form.data)} {dataBR(form.data)}</span>
              {form.cidade && <><span>·</span><span>{form.cidade.toUpperCase()}</span></>}
              {form.contratante && <><span>·</span><span>{form.contratante}</span></>}
              {contrato && <span className={`ctr-etq${foraK ? ' fora' : ''}`} style={{ marginLeft: 2 }}>{contrato.numero}</span>}
            </div>
          )}
        </header>

        <div className="pe-corpo">
          <section className="pe-sec">
            <h4>Obra</h4>
            <div className="pe-g2">
              <label className="pe-f pe-full"><span>Tipo de serviço</span>
                <select disabled={ro} value={form.tipoEquipe} onChange={(e) => set({ tipoEquipe: e.target.value })}>
                  <option value="">Selecione</option>
                  {[...new Set([...tiposEquipe, form.tipoEquipe].filter(Boolean))].map((x) => <option key={x}>{x}</option>)}
                </select>
              </label>
              <label className="pe-f"><span>Data</span>
                <input disabled={ro} type="date" value={form.data} onChange={(e) => set({ data: e.target.value })} />
              </label>
              <label className="pe-f"><span>Local</span>
                <input disabled={ro} value={form.cidade} placeholder="Ex.: MARINGÁ-PR" onChange={(e) => set({ cidade: e.target.value })} />
              </label>
              <label className="pe-f pe-full"><span>Contratante</span>
                <select
                  disabled={ro}
                  value={form.concessionaria_id || ''}
                  onChange={(e) => {
                    const c = (db.concessionarias || []).find((x) => x.id === e.target.value);
                    // o texto acompanha a escolha: é ele que sai nas exportações e é por ele que o Kartado casa
                    set({ concessionaria_id: c ? c.id : null, contratante: c ? c.sigla : '', contrato_id: c ? contratoAutomatico(db.contratos, c.id) : null });
                  }}
                >
                  <option value="">{form.contratante && !conc ? `${form.contratante} (texto antigo)` : 'Selecione'}</option>
                  {(db.concessionarias || []).map((c) => <option key={c.id} value={c.id}>{c.sigla}</option>)}
                </select>
              </label>
            </div>

            {form.concessionaria_id && (
              <div className="pe-contratos">
                <span className="pe-rot">Contrato</span>
                {!contratos.length && <p className="pe-vazio">Nenhum contrato vigente para {conc?.sigla}. Cadastre em Contratantes.</p>}
                {contratos.map((k) => {
                  const fora = foraDaVigencia(k, form.data);
                  const on = k.id === form.contrato_id;
                  return (
                    <button key={k.id} type="button" disabled={ro} className={`pe-ctr${on ? ' on' : ''}`}
                      role="radio" aria-checked={on} onClick={() => set({ contrato_id: k.id })}>
                      <span className="rd" />
                      <span className="tx"><b>{k.numero}</b><small>{dataBR(k.inicio) || '—'} → {dataBR(k.fim) || 'sem fim'}{!k.ativo ? ' · encerrado' : ''}</small></span>
                      {fora && <span className="fora">{fora.lado === 'antes' ? 'ainda não vale' : 'vencido'} nesta data</span>}
                    </button>
                  );
                })}
                {contratos.length > 0 && !form.contrato_id && <p className="pe-aviso">Escolha o contrato desta obra.</p>}
              </div>
            )}

            <label className="pe-f pe-eng"><span>Engenheiro responsável</span>
              <input disabled={ro} value={form.engenheiro || ''} placeholder="opcional" onChange={(e) => set({ engenheiro: e.target.value })} />
            </label>
          </section>

          <section className="pe-sec">
            <h4>Horários
              {!ro && HORARIOS.some(([k]) => form[k] !== PADRAO[k]) && (
                <button type="button" className="pe-link" onClick={() => set(PADRAO)}>usar o padrão</button>
              )}
            </h4>
            <LinhaDoDia f={form} />
            <div className="pe-horas">
              {HORARIOS.map(([k, r]) => (
                <label key={k}><span>{r}</span>
                  <input disabled={ro} type="time" value={form[k] || ''} onChange={(e) => set({ [k]: e.target.value })} />
                </label>
              ))}
            </div>
          </section>

          <section className="pe-sec">
            <h4>Status</h4>
            <div className="pe-status" role="radiogroup">
              {STATUS.map(([v, r, c]) => (
                <button key={v} type="button" disabled={ro} role="radio" aria-checked={form.statusExecucao === v}
                  className={form.statusExecucao === v ? `on ${c}` : ''}
                  onClick={() => set({ statusExecucao: v, motivoNaoExecucao: v === 'NÃO FOI POSSÍVEL REALIZAR' ? form.motivoNaoExecucao : '' })}>
                  {r}
                </button>
              ))}
            </div>
            {form.statusExecucao === 'NÃO FOI POSSÍVEL REALIZAR' && (
              <label className="pe-f pe-motivo"><span>Motivo</span>
                <select disabled={ro} value={form.motivoNaoExecucao || ''} onChange={(e) => set({ motivoNaoExecucao: e.target.value })}>
                  <option value="">Selecione</option>
                  {[...new Set([...motivos, form.motivoNaoExecucao].filter(Boolean))].map((x) => <option key={x}>{x}</option>)}
                </select>
              </label>
            )}
          </section>

          <section className="pe-sec">
            <h4>Equipe <em>{total} de {maxMembros}</em></h4>
            <label className="pe-f"><span>Encarregado</span>
              <select disabled={ro} value={form.encarregadoId || ''} onChange={(e) => {
                const id = e.target.value || null;
                set({ encarregadoId: id, membroIds: form.membroIds.filter((x) => x !== form.encarregadoId || x === id) });
              }}>
                <option value="">Selecione</option>
                {encarregados.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
            <div className="pe-pessoas">
              {membros.map((p) => (
                <span key={p.id} className="pe-chip">
                  <Avatar nome={p.nome} url={p.fotoUrl} tamanho="small" />
                  <span>{p.nome.split(' ').slice(0, 2).join(' ')}</span>
                  {!ro && <button type="button" aria-label={`Tirar ${p.nome}`} onClick={() => set({ membroIds: form.membroIds.filter((x) => x !== p.id) })}>×</button>}
                </span>
              ))}
              {!ro && (
                <Adicionar rotulo="pessoa" itens={livres} desabilitado={total >= maxMembros} motivo={`Máximo de ${maxMembros} pessoas`}
                  onEscolher={(id) => set({ membroIds: [...form.membroIds, id] })} />
              )}
              {ro && !membros.length && <span className="pe-vazio">Só o encarregado.</span>}
            </div>
            <span className="pe-rot">Veículos</span>
            <div className="pe-pessoas">
              {(form.veiculoIds || []).map((id) => vPorId[id]).filter(Boolean).map((v) => (
                <span key={v.id} className="pe-chip placa-chip">
                  <span className="mono">{v.placa}</span>
                  {!ro && <button type="button" aria-label={`Tirar ${v.placa}`} onClick={() => set({ veiculoIds: form.veiculoIds.filter((x) => x !== v.id) })}>×</button>}
                </span>
              ))}
              {!ro && <Adicionar rotulo="veículo" itens={veicLivres} onEscolher={(id) => set({ veiculoIds: [...(form.veiculoIds || []), id] })} />}
              {ro && !(form.veiculoIds || []).length && <span className="pe-vazio">Sem veículo.</span>}
            </div>
          </section>

          <section className="pe-sec">
            <h4>Observações</h4>
            <textarea disabled={ro} className="pe-obs" rows={3} value={form.observacoes || ''} placeholder="Escreva algo sobre esta obra…"
              onChange={(e) => set({ observacoes: e.target.value })} />
          </section>
        </div>

        <footer className="pe-pe">
          <div className="esq">
            {!novo && !ro && <button type="button" className="ghost-btn" onClick={onDuplicar}>Duplicar</button>}
            {!novo && podeExcluir && <button type="button" className="ghost-btn pe-perigo" onClick={onExcluir}>Excluir</button>}
          </div>
          {ro ? (
            <button type="button" className="ghost-btn" onClick={() => onFechar(false)}>Fechar</button>
          ) : (
            <>
              <button type="button" className="ghost-btn" onClick={() => onFechar(mudou)}>Cancelar</button>
              <button type="button" className="primary-btn" disabled={salvando || (!novo && !mudou)} onClick={salvar}>
                {salvando ? 'Salvando…' : novo ? 'Criar' : 'Salvar'}
              </button>
            </>
          )}
        </footer>
      </aside>
    </>
  );
}
