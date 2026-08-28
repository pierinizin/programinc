import { useMemo, useState } from 'react';
import { contratosDe, dataBR, dataISO, textosSoltos } from '../lib/contratos';

/* =============================================================================
   Contratantes e Contratos
   -----------------------------------------------------------------------------
   Duas abas, e não uma tela só, porque são dois cadastros com ritmos
   diferentes: a empresa você cadastra uma vez e não toca mais; o contrato muda,
   vence, entra outro. Misturados na mesma lista, um sempre atrapalhava o outro.

   A lista de contratos ficou reduzida ao que identifica: número, quem é, e até
   quando vale. Objeto e trecho saíram a pedido — campo que ninguém preenche
   ocupa espaço e ensina a pular a tela.
   ============================================================================= */

const VAZIO_CONC = {
  id: '', sigla: '', nome: '', cnpj: '',
  contato_nome: '', contato_email: '', contato_telefone: '', cor: '#FFC72C',
};
const VAZIO_CTR = { id: '', concessionaria_id: '', numero: '', inicio: '', fim: '', ativo: true };

function Campo({ label, value, onChange, placeholder, largo }) {
  return (
    <label className={`ct-campo${largo ? ' largo' : ''}`}>
      <span>{label}</span>
      <input
        type="text" value={value || ''} placeholder={placeholder || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/* Mesma checkbox das fichas de colaborador e veículo: quem já sabe selecionar
   em massa lá não precisa aprender nada aqui. */
function Check({ marcado, onClick, rotulo }) {
  return (
    <button
      type="button" className="fc-check ct-check-item"
      role="checkbox" aria-checked={marcado} aria-label={`Selecionar ${rotulo}`}
      onClick={onClick}
    >
      {marcado ? '✓' : ''}
    </button>
  );
}

function BarraSel({ n, onLimpar, onExcluir, rotulo }) {
  if (!n) return null;
  return (
    <div className="barra-sel solta">
      <span>{n} {n === 1 ? `${rotulo} selecionado` : `${rotulo}s selecionados`}</span>
      <div className="chips-row tight">
        <button type="button" className="chip-btn" onClick={onLimpar}>Limpar</button>
        <button type="button" className="chip-btn perigo" onClick={onExcluir}>Excluir</button>
      </div>
    </div>
  );
}

export function Contratos({
  concessionarias, contratos, programacoes, podeEditar,
  onSalvarConcessionaria, onSalvarContrato,
  onExcluirContratos, onExcluirConcessionarias,
  onJuntarConcessionarias, onVincularTexto,
}) {
  const [aba, setAba] = useState('contratantes');
  const [busca, setBusca] = useState('');
  const [form, setForm] = useState(null);      // {tipo:'conc'|'ctr', dados}
  const [erro, setErro] = useState('');
  const [juntando, setJuntando] = useState(null);
  const [selCtr, setSelCtr] = useState({});
  const [selConc, setSelConc] = useState({});

  const porId = useMemo(
    () => Object.fromEntries((concessionarias || []).map((c) => [c.id, c])),
    [concessionarias]
  );

  const termo = busca.trim().toLowerCase();

  const linhasCtr = useMemo(() => (
    (concessionarias || [])
      .slice()
      .sort((a, b) => a.sigla.localeCompare(b.sigla, 'pt-BR'))
      .flatMap((c) => contratosDe(contratos, c.id).map((k) => ({ c, k })))
      .filter(({ c, k }) => !termo
        || [c.sigla, c.nome, k.numero].some((x) => String(x || '').toLowerCase().includes(termo)))
  ), [concessionarias, contratos, termo]);

  const listaConc = useMemo(() => (
    (concessionarias || [])
      .slice()
      .sort((a, b) => a.sigla.localeCompare(b.sigla, 'pt-BR'))
      .filter((c) => !termo
        || [c.sigla, c.nome, c.cnpj].some((x) => String(x || '').toLowerCase().includes(termo)))
  ), [concessionarias, termo]);

  const soltos = useMemo(() => textosSoltos(programacoes), [programacoes]);

  const obrasPorContrato = useMemo(() => {
    const m = {};
    (programacoes || []).forEach((p) => {
      if (p.contrato_id) m[p.contrato_id] = (m[p.contrato_id] || 0) + 1;
    });
    return m;
  }, [programacoes]);

  const obrasPorConc = useMemo(() => {
    const m = {};
    (programacoes || []).forEach((p) => {
      if (p.concessionaria_id) m[p.concessionaria_id] = (m[p.concessionaria_id] || 0) + 1;
    });
    return m;
  }, [programacoes]);

  const ctrMarcados = Object.keys(selCtr).filter((id) => selCtr[id]);
  const concMarcados = Object.keys(selConc).filter((id) => selConc[id]);

  async function salvar() {
    setErro('');
    const { tipo, dados } = form;

    if (tipo === 'conc') {
      if (!dados.sigla.trim()) { setErro('A sigla é obrigatória — é ela que aparece no card da equipe.'); return; }
      const ok = await onSalvarConcessionaria({
        ...dados,
        sigla: dados.sigla.trim().toUpperCase(),
        nome: (dados.nome || dados.sigla).trim(),
      });
      if (ok) setForm(null); else setErro('Não consegui salvar. Sigla repetida?');
      return;
    }

    if (!dados.concessionaria_id) { setErro('Escolha o contratante.'); return; }
    if (!dados.numero.trim()) { setErro('O número do contrato é obrigatório.'); return; }
    const inicio = dados.inicio ? dataISO(dados.inicio) : '';
    const fim = dados.fim ? dataISO(dados.fim) : '';
    if (dados.inicio && !inicio) { setErro('Data de início inválida. Use dd/mm/aaaa.'); return; }
    if (dados.fim && !fim) { setErro('Data de fim inválida. Use dd/mm/aaaa.'); return; }
    if (inicio && fim && fim < inicio) { setErro('O fim não pode vir antes do início.'); return; }

    const ok = await onSalvarContrato({
      ...dados, numero: dados.numero.trim().toUpperCase(),
      inicio: inicio || null, fim: fim || null,
    });
    if (ok) setForm(null); else setErro('Não consegui salvar. Número repetido neste contratante?');
  }

  function novo(tipo) {
    setErro('');
    setForm({ tipo, dados: tipo === 'conc' ? { ...VAZIO_CONC } : { ...VAZIO_CTR } });
  }

  return (
    <>
      {/* ---- textos ainda não ligados ---- */}
      {podeEditar && soltos.length > 0 && (
        <div className="aviso-faixa atencao" style={{ display: 'block' }}>
          <b>{soltos.length}</b>
          {soltos.length === 1
            ? ' contratante ainda escrito à mão nas programações'
            : ' contratantes ainda escritos à mão nas programações'}
          <div className="soltos">
            {soltos.map((s) => (
              <span key={s.chave} className="solto">
                <b>{s.texto}</b>
                <i>{s.n} programaç{s.n === 1 ? 'ão' : 'ões'}</i>
                <select
                  defaultValue=""
                  onChange={(e) => e.target.value && onVincularTexto(s, e.target.value)}
                >
                  <option value="">ligar a…</option>
                  {(concessionarias || []).map((c) => (
                    <option key={c.id} value={c.id}>{c.sigla}</option>
                  ))}
                </select>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="ct-abas">
        <button
          type="button" className={`ct-aba${aba === 'contratantes' ? ' on' : ''}`}
          onClick={() => { setAba('contratantes'); setForm(null); }}
        >
          Contratantes <i>{(concessionarias || []).length}</i>
        </button>
        <button
          type="button" className={`ct-aba${aba === 'contratos' ? ' on' : ''}`}
          onClick={() => { setAba('contratos'); setForm(null); }}
        >
          Contratos <i>{(contratos || []).length}</i>
        </button>
      </div>

      <div className="doc-barra">
        <input
          className="ct-busca"
          placeholder={aba === 'contratantes'
            ? 'Buscar por sigla, nome ou CNPJ…'
            : 'Buscar por número ou contratante…'}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {podeEditar && (
          aba === 'contratantes' ? (
            <button type="button" className="primary-btn" onClick={() => novo('conc')}>
              + Contratante
            </button>
          ) : (
            <button
              type="button" className="primary-btn"
              disabled={!(concessionarias || []).length}
              title={(concessionarias || []).length ? '' : 'Cadastre um contratante primeiro'}
              onClick={() => novo('ctr')}
            >
              + Contrato
            </button>
          )
        )}
      </div>

      {/* ---- formulário ---- */}
      {form && (
        <div className="ct-form">
          <h4>{form.tipo === 'conc'
            ? (form.dados.id ? 'Editar contratante' : 'Novo contratante')
            : (form.dados.id ? 'Editar contrato' : 'Novo contrato')}</h4>

          {form.tipo === 'conc' ? (
            <div className="ct-grade">
              <Campo label="Sigla (aparece no card)" value={form.dados.sigla} placeholder="MOTIVA"
                onChange={(v) => setForm((f) => ({ ...f, dados: { ...f.dados, sigla: v } }))} />
              <Campo label="Nome completo" value={form.dados.nome} largo
                placeholder="Motiva Infraestrutura S.A."
                onChange={(v) => setForm((f) => ({ ...f, dados: { ...f.dados, nome: v } }))} />
              <Campo label="CNPJ" value={form.dados.cnpj}
                onChange={(v) => setForm((f) => ({ ...f, dados: { ...f.dados, cnpj: v } }))} />
              <Campo label="Contato" value={form.dados.contato_nome}
                onChange={(v) => setForm((f) => ({ ...f, dados: { ...f.dados, contato_nome: v } }))} />
              <Campo label="E-mail" value={form.dados.contato_email}
                onChange={(v) => setForm((f) => ({ ...f, dados: { ...f.dados, contato_email: v } }))} />
              <Campo label="Telefone" value={form.dados.contato_telefone}
                onChange={(v) => setForm((f) => ({ ...f, dados: { ...f.dados, contato_telefone: v } }))} />
            </div>
          ) : (
            <div className="ct-grade">
              <label className="ct-campo">
                <span>Contratante</span>
                <select
                  value={form.dados.concessionaria_id}
                  onChange={(e) => setForm((f) => ({
                    ...f, dados: { ...f.dados, concessionaria_id: e.target.value },
                  }))}
                >
                  <option value="">escolha…</option>
                  {(concessionarias || []).map((c) => (
                    <option key={c.id} value={c.id}>{c.sigla}</option>
                  ))}
                </select>
              </label>
              <Campo label="Número do contrato" value={form.dados.numero} placeholder="CT-2024/118"
                onChange={(v) => setForm((f) => ({ ...f, dados: { ...f.dados, numero: v } }))} />
              <span />
              <Campo label="Início" value={form.dados.inicio} placeholder="dd/mm/aaaa"
                onChange={(v) => setForm((f) => ({ ...f, dados: { ...f.dados, inicio: v } }))} />
              <Campo label="Fim" value={form.dados.fim} placeholder="dd/mm/aaaa"
                onChange={(v) => setForm((f) => ({ ...f, dados: { ...f.dados, fim: v } }))} />
              <label className="ct-campo ct-check">
                <input
                  type="checkbox" checked={Boolean(form.dados.ativo)}
                  onChange={(e) => setForm((f) => ({ ...f, dados: { ...f.dados, ativo: e.target.checked } }))}
                />
                <span>Vigente — só os vigentes aparecem na programação</span>
              </label>
            </div>
          )}

          {erro && <div className="mut-erro">{erro}</div>}

          <div className="ct-acoes">
            <button type="button" className="ghost-btn" onClick={() => setForm(null)}>Cancelar</button>
            <button type="button" className="primary-btn" onClick={salvar}>Salvar</button>
          </div>
        </div>
      )}

      {/* ================= CONTRATANTES ================= */}
      {aba === 'contratantes' && (
        <>
          <BarraSel
            n={concMarcados.length} rotulo="contratante"
            onLimpar={() => setSelConc({})}
            onExcluir={async () => {
              const feito = await onExcluirConcessionarias(
                concMarcados.map((id) => porId[id]).filter(Boolean)
              );
              if (feito) setSelConc({});
            }}
          />

          {listaConc.length === 0 ? (
            <div className="empty-card">Nenhum contratante cadastrado ainda.</div>
          ) : (
            <div className="ct-emp-lista">
              {listaConc.map((c) => {
                const nCtr = contratosDe(contratos, c.id).length;
                return (
                  <div key={c.id} className={`ct-emp${selConc[c.id] ? ' marcada' : ''}`}>
                    {podeEditar && (
                      <Check
                        marcado={Boolean(selConc[c.id])} rotulo={c.sigla}
                        onClick={() => setSelConc((s) => ({ ...s, [c.id]: !s[c.id] }))}
                      />
                    )}
                    <i className="cor" style={{ background: c.cor || '#FFC72C' }} />
                    <span className="ct-emp-txt">
                      <b>{c.sigla}</b>
                      <i>{c.nome}{c.cnpj ? ` · ${c.cnpj}` : ''}</i>
                    </span>
                    <span className="ct-emp-n">
                      {nCtr} contrato{nCtr === 1 ? '' : 's'}
                      {obrasPorConc[c.id] ? ` · ${obrasPorConc[c.id]} obra${obrasPorConc[c.id] === 1 ? '' : 's'}` : ''}
                    </span>
                    {podeEditar && (
                      <span className="ct-btns">
                        <button
                          type="button" className="chip-btn"
                          onClick={() => { setErro(''); setForm({ tipo: 'conc', dados: { ...c } }); }}
                        >Editar</button>
                        {/* Juntar existe porque a migração cria um contratante
                            por texto distinto: "DER-PR" e "DER PR" entram
                            separados e só uma pessoa sabe que são o mesmo. */}
                        <button
                          type="button" className="chip-btn"
                          onClick={() => setJuntando(juntando === c.id ? null : c.id)}
                        >Juntar</button>
                      </span>
                    )}

                    {juntando === c.id && (
                      <span className="ct-juntar">
                        Mover tudo de <b>{c.sigla}</b> para:
                        <select
                          defaultValue=""
                          onChange={async (e) => {
                            if (!e.target.value) return;
                            await onJuntarConcessionarias(c, porId[e.target.value]);
                            setJuntando(null);
                          }}
                        >
                          <option value="">escolha…</option>
                          {(concessionarias || []).filter((o) => o.id !== c.id).map((o) => (
                            <option key={o.id} value={o.id}>{o.sigla}</option>
                          ))}
                        </select>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ================= CONTRATOS ================= */}
      {aba === 'contratos' && (
        <>
          <BarraSel
            n={ctrMarcados.length} rotulo="contrato"
            onLimpar={() => setSelCtr({})}
            onExcluir={async () => {
              const alvos = linhasCtr.map(({ k }) => k).filter((k) => selCtr[k.id]);
              const feito = await onExcluirContratos(alvos, obrasPorContrato);
              if (feito) setSelCtr({});
            }}
          />

          {linhasCtr.length === 0 ? (
            <div className="empty-card">
              {(concessionarias || []).length
                ? 'Nenhum contrato cadastrado ainda.'
                : 'Cadastre um contratante antes do contrato.'}
            </div>
          ) : (
            <div className="ct-tabela">
              <div className="ct-cab">
                {podeEditar && <span />}
                <span>Contrato</span><span>Contratante</span>
                <span>Vigência</span><span>Obras</span><span />
              </div>

              {linhasCtr.map(({ c, k }) => (
                <div
                  key={k.id}
                  className={`ct-linha${k.ativo ? '' : ' encerrado'}${selCtr[k.id] ? ' marcada' : ''}`}
                >
                  {podeEditar && (
                    <Check
                      marcado={Boolean(selCtr[k.id])} rotulo={k.numero}
                      onClick={() => setSelCtr((s) => ({ ...s, [k.id]: !s[k.id] }))}
                    />
                  )}
                  <span className="ct-num">{k.numero}</span>
                  <span className="ct-conc">
                    <i style={{ background: c.cor || '#FFC72C' }} />
                    {c.sigla}
                  </span>
                  <span className="ct-vig">
                    {k.inicio || k.fim
                      ? `${dataBR(k.inicio) || '?'} → ${dataBR(k.fim) || 'sem fim'}`
                      : '—'}
                    <i className={k.ativo ? 'sim' : 'nao'}>{k.ativo ? 'vigente' : 'encerrado'}</i>
                  </span>
                  <span className="ct-obras">{obrasPorContrato[k.id] || 0}</span>
                  <span className="ct-btns">
                    {podeEditar && (
                      <button
                        type="button" className="chip-btn"
                        onClick={() => {
                          setErro('');
                          setForm({ tipo: 'ctr', dados: {
                            ...k, inicio: dataBR(k.inicio), fim: dataBR(k.fim),
                          } });
                        }}
                      >Editar</button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
