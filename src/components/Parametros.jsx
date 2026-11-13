import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { confirmar, notificar } from '../lib/dialogos';
import { LISTAS, REGRAS, PADRAO_REGRAS, itensDe, regra } from '../lib/parametros';

/* =============================================================================
   Parâmetros — Sistema → Parâmetros (só admin)
   -----------------------------------------------------------------------------
   À esquerda, o que dá para mudar; à direita, a edição. Listas (funções, tipos
   de serviço, motivos, tipos de veículo) e regras com número (horário padrão,
   máximo por equipe, dias do aviso de "falta dar baixa").

   Item em uso não se apaga — desativa (some das escolhas novas, quem já tem
   continua com ele). Renomear passa pelo banco (renomear_parametro), que muda
   junto em quem já usa. Tudo grava na hora e recarrega os parâmetros.
   ============================================================================= */

const SETOR_ROT = { trecho: 'Trecho', fora: 'Escritório e outros' };

/** Quantos usam cada valor, por lista. */
function usos(db) {
  const conta = (lista, campo) => {
    const m = {};
    (lista || []).forEach((x) => { const v = x[campo]; if (v) m[v] = (m[v] || 0) + 1; });
    return m;
  };
  return {
    funcao: conta(db.colaboradores, 'funcao'),
    tipo_servico: conta(db.programacoes, 'tipoEquipe'),
    motivo_nao_realizado: conta(db.programacoes, 'motivoNaoExecucao'),
    tipo_veiculo: conta(db.veiculos, 'tipo'),
  };
}

function erroOuNada(res, titulo) {
  if (res.error) {
    notificar({ titulo, mensagem: res.error.message || 'Não deu certo. Tente de novo.', variante: 'erro' });
    return true;
  }
  return false;
}

/* ------------------------------------------------------------ uma linha */
function Linha({ item, def, n, primeiro, ultimo, onSubir, onDescer, onSalvar, onApagar, onAtivo, bloqueado }) {
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState(null);
  const abrir = () => { setF({ valor: item.valor, dados: { ...(item.dados || {}) } }); setEditando(true); };
  const mudou = f && (f.valor.trim() !== item.valor || JSON.stringify(f.dados) !== JSON.stringify(item.dados || {}));
  const d = item.dados || {};
  return (
    <div className={`par-row${item.ativo === false ? ' off' : ''}${editando ? ' ed' : ''}`}>
      <span className="par-ordem">
        <button type="button" disabled={primeiro || bloqueado} onClick={onSubir} aria-label="Subir">▲</button>
        <button type="button" disabled={ultimo || bloqueado} onClick={onDescer} aria-label="Descer">▼</button>
      </span>
      <button type="button" className="par-nome" onClick={editando ? () => setEditando(false) : abrir} disabled={bloqueado}>
        <b>{item.valor}</b>
        {item.ativo === false && <small>desativado · some das escolhas novas, quem já tem continua</small>}
      </button>
      <span className="par-flags">
        {def.comSetor && <span className="par-tag">{SETOR_ROT[d.setor || 'trecho']}</span>}
        {def.comMarcas && d.lidera && <span className="par-flag lid">pode ser encarregado</span>}
        {def.comMarcas && d.dirige && <span className="par-flag dir">dirige</span>}
      </span>
      <span className="par-n" title="Quantos usam hoje">{n || 0}</span>
      <button type="button" className="par-editar" onClick={editando ? () => setEditando(false) : abrir} disabled={bloqueado}>
        {editando ? 'Fechar' : 'Editar'}
      </button>

      {editando && f && (
        <div className="par-edit">
          <label className="par-f par-full"><span>Nome</span>
            <input autoFocus value={f.valor} maxLength={80}
              onChange={(e) => setF({ ...f, valor: def.maiusculo ? e.target.value.toUpperCase() : e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Escape') setEditando(false); }} />
          </label>
          {f.valor.trim() !== item.valor && n > 0 && (
            <p className="par-aviso par-full">Muda também em {n} {def.chave === 'funcao' ? (n === 1 ? 'pessoa' : 'pessoas') : (n === 1 ? 'registro' : 'registros')} que já usa{n === 1 ? '' : 'm'} “{item.valor}”.</p>
          )}
          {def.comSetor && (
            <label className="par-f"><span>Setor</span>
              <select value={f.dados.setor || 'trecho'} onChange={(e) => setF({ ...f, dados: { ...f.dados, setor: e.target.value } })}>
                <option value="trecho">Trecho</option>
                <option value="fora">Escritório, oficina e outros</option>
              </select>
            </label>
          )}
          {def.comMarcas && (
            <div className="par-marcas">
              <label className="par-ck">
                <input type="checkbox" checked={Boolean(f.dados.lidera)} onChange={(e) => setF({ ...f, dados: { ...f.dados, lidera: e.target.checked } })} />
                <span>Pode ser encarregado<small>entra na lista de encarregados ao montar a equipe; a pasta cobra os documentos de encarregado</small></span>
              </label>
              <label className="par-ck">
                <input type="checkbox" checked={Boolean(f.dados.dirige)} onChange={(e) => setF({ ...f, dados: { ...f.dados, dirige: e.target.checked } })} />
                <span>Dirige veículo da empresa<small>a pasta passa a cobrar os documentos de motorista (CNH, Direção defensiva…)</small></span>
              </label>
            </div>
          )}
          <div className="par-acoes par-full">
            {n === 0
              ? <button type="button" className="ghost-btn par-perigo" onClick={onApagar}>Apagar</button>
              : <button type="button" className="ghost-btn" onClick={() => onAtivo(item.ativo === false)}>{item.ativo === false ? 'Reativar' : 'Desativar'}</button>}
            <span className="par-espaco" />
            <button type="button" className="ghost-btn" onClick={() => setEditando(false)}>Cancelar</button>
            <button type="button" className="primary-btn" disabled={!mudou || !f.valor.trim()}
              onClick={async () => { if (await onSalvar(f)) setEditando(false); }}>Salvar</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ uma lista */
function EditorLista({ def, linhas, contagem, bloqueado, onRecarregar, onDadosMudaram }) {
  const [novo, setNovo] = useState('');
  const [setorNovo, setSetorNovo] = useState('trecho');
  const [ocupado, setOcupado] = useState(false);
  const itens = linhas.filter((x) => x.lista === def.chave)
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.valor.localeCompare(b.valor, 'pt-BR'));
  // Sem o 28, mostra o padrão (só leitura).
  const mostrar = bloqueado ? itensDe(def.chave, { inativos: true }).map((x, i) => ({ ...x, id: `p${i}` })) : itens;
  const grupos = def.comSetor
    ? [['trecho', mostrar.filter((x) => (x.dados?.setor || 'trecho') === 'trecho')], ['fora', mostrar.filter((x) => x.dados?.setor === 'fora')]]
    : [[null, mostrar]];

  async function com(fn) {
    setOcupado(true);
    try { return await fn(); } finally { setOcupado(false); }
  }
  async function adicionar() {
    const valor = (def.maiusculo ? novo.toUpperCase() : novo).trim();
    if (!valor) return;
    if (itens.some((x) => x.valor.toLowerCase() === valor.toLowerCase())) {
      notificar({ mensagem: `“${valor}” já está na lista.`, variante: 'atencao' });
      return;
    }
    await com(async () => {
      const ordem = Math.max(0, ...itens.map((x) => x.ordem || 0)) + 10;
      const res = await supabase.from('parametros_itens')
        .insert([{ lista: def.chave, valor, ordem, dados: def.comSetor ? { setor: setorNovo } : {} }]);
      if (erroOuNada(res, 'Adicionar')) return;
      setNovo('');
      await onRecarregar();
    });
  }
  async function salvar(item, f) {
    return com(async () => {
      const valor = f.valor.trim();
      if (valor !== item.valor) {
        const r = await supabase.rpc('renomear_parametro', { p_id: item.id, p_novo: valor });
        if (erroOuNada(r, 'Renomear')) return false;
      }
      if (JSON.stringify(f.dados) !== JSON.stringify(item.dados || {})) {
        const r = await supabase.from('parametros_itens').update({ dados: f.dados, updated_at: new Date().toISOString() }).eq('id', item.id);
        if (erroOuNada(r, 'Salvar')) return false;
      }
      await onRecarregar();
      // Renomear muda registros; marcação de função muda o que a pasta cobra.
      if (valor !== item.valor || def.chave === 'funcao') onDadosMudaram();
      return true;
    });
  }
  async function apagar(item) {
    if (!(await confirmar({ titulo: `Apagar “${item.valor}”?`, textoConfirmar: 'Apagar' }))) return;
    await com(async () => {
      const r = await supabase.from('parametros_itens').delete().eq('id', item.id);
      if (!erroOuNada(r, 'Apagar')) await onRecarregar();
    });
  }
  async function ativo(item, valor) {
    await com(async () => {
      const r = await supabase.from('parametros_itens').update({ ativo: valor }).eq('id', item.id);
      if (!erroOuNada(r, 'Salvar')) await onRecarregar();
    });
  }
  async function trocar(lista, i, j) {
    if (!lista[i] || !lista[j]) return;
    // Renumera a lista visível (10, 20, 30…) com os dois trocados de lugar e
    // grava só quem mudou — assim a ordem nunca empata.
    const nova = lista.slice();
    [nova[i], nova[j]] = [nova[j], nova[i]];
    const base = Math.min(...lista.map((x) => x.ordem ?? 0));
    const mudar = nova.map((x, k) => ({ x, ordem: base + (k + 1) * 10 })).filter(({ x, ordem }) => x.ordem !== ordem);
    await com(async () => {
      const res = await Promise.all(mudar.map(({ x, ordem }) => supabase.from('parametros_itens').update({ ordem }).eq('id', x.id)));
      if (!res.some((r) => erroOuNada(r, 'Ordem'))) await onRecarregar();
    });
  }


  return (
    <div className="par-ed">
      <div className="par-cab"><h3>{def.titulo}</h3><p>{def.texto}</p></div>
      {!bloqueado && (
        <div className="par-add">
          <input value={novo} placeholder={`Nov${def.singular.startsWith('função') ? 'a' : 'o'} ${def.singular}…`} maxLength={80}
            onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') adicionar(); }} />
          {def.comSetor && (
            <select value={setorNovo} onChange={(e) => setSetorNovo(e.target.value)}>
              <option value="trecho">Trecho</option>
              <option value="fora">Escritório e outros</option>
            </select>
          )}
          <button type="button" className="primary-btn" onClick={adicionar} disabled={ocupado || !novo.trim()}>Adicionar</button>
        </div>
      )}
      {grupos.map(([g, lista]) => (
        <div key={g || 'todos'}>
          {g && <div className="par-grupo">{g === 'trecho' ? 'Trecho' : 'Escritório, oficina e outros'}</div>}
          <div className="par-th"><span /><span>Nome</span><span>{def.comMarcas ? 'Marcações' : ''}</span><span className="dir">Em uso</span><span /></div>
          {!lista.length && <div className="par-vazio">Nada aqui ainda.</div>}
          {lista.map((item, i) => (
            <Linha
              key={item.id}
              item={item}
              def={def}
              n={contagem[item.valor] || 0}
              primeiro={i === 0}
              ultimo={i === lista.length - 1}
              bloqueado={bloqueado || ocupado}
              onSubir={() => trocar(lista, i, i - 1)}
              onDescer={() => trocar(lista, i, i + 1)}
              onSalvar={(f) => salvar(item, f)}
              onApagar={() => apagar(item)}
              onAtivo={(v) => ativo(item, v)}
            />
          ))}
        </div>
      ))}
      <div className="par-rod">As setas mudam a ordem em que aparece nos menus. Item em uso não se apaga: desativa.</div>
    </div>
  );
}

/* ------------------------------------------------------------ regras */
function EditorRegras({ bloqueado, onRecarregar }) {
  const [vals, setVals] = useState(() => Object.fromEntries(REGRAS.map((r) => [r.chave, regra(r.chave)])));
  const [salvando, setSalvando] = useState(null);
  async function salvar(chave) {
    let valor = vals[chave];
    const def = REGRAS.find((r) => r.chave === chave);
    if (chave !== 'horario_padrao') {
      valor = Number(valor);
      if (!Number.isInteger(valor) || valor < def.min || valor > def.max) {
        notificar({ mensagem: `Use um número de ${def.min} a ${def.max}.`, variante: 'atencao' });
        return;
      }
    }
    setSalvando(chave);
    const r = await supabase.from('parametros_regras').upsert({ chave, valor, updated_at: new Date().toISOString() });
    setSalvando(null);
    if (!erroOuNada(r, 'Salvar')) {
      await onRecarregar();
      notificar({ mensagem: 'Salvo.', variante: 'sucesso' });
    }
  }
  const HORAS = [['horarioInicio', 'Saída'], ['horarioInicioObra', 'Obra'], ['horarioSaidaAlmoco', 'Almoço'], ['horarioRetornoAlmoco', 'Volta'], ['horarioFimObra', 'Fim obra'], ['horarioSaida', 'Retorno']];
  const igual = (chave) => JSON.stringify(vals[chave]) === JSON.stringify(regra(chave));
  return (
    <div className="par-ed">
      <div className="par-cab"><h3>Horários e regras da equipe</h3><p>Valores que a programação usa ao criar e conferir uma equipe.</p></div>
      {REGRAS.map((r) => (
        <div key={r.chave} className="par-regra">
          <div className="tx"><b>{r.titulo}</b><small>{r.texto}</small></div>
          <div className="vl">
            {r.chave === 'horario_padrao' ? (
              <span className="par-horas">
                {HORAS.map(([k, rot]) => (
                  <label key={k}><span>{rot}</span>
                    <input type="time" disabled={bloqueado} value={vals.horario_padrao?.[k] || ''}
                      onChange={(e) => setVals((v) => ({ ...v, horario_padrao: { ...v.horario_padrao, [k]: e.target.value } }))} />
                  </label>
                ))}
              </span>
            ) : (
              <>
                <input type="number" disabled={bloqueado} min={r.min} max={r.max} value={vals[r.chave]}
                  onChange={(e) => setVals((v) => ({ ...v, [r.chave]: e.target.value }))} />
                <em>{r.unidade}</em>
              </>
            )}
            {!bloqueado && (
              <button type="button" className="primary-btn" disabled={igual(r.chave) || salvando === r.chave} onClick={() => salvar(r.chave)}>
                {salvando === r.chave ? 'Salvando…' : 'Salvar'}
              </button>
            )}
          </div>
          {r.chave !== 'horario_padrao' && String(vals[r.chave]) !== String(PADRAO_REGRAS[r.chave]) && (
            <small className="par-padrao">padrão: {PADRAO_REGRAS[r.chave]} {r.unidade}</small>
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ a tela */
export function Parametros({ status, linhas, db, onRecarregar, onDadosMudaram }) {
  const [aba, setAba] = useState('funcao');
  const contagem = useMemo(() => usos(db), [db]);
  const bloqueado = status !== 'ok';
  const grupos = [...new Set(LISTAS.map((l) => l.grupo))];
  const nDe = (chave) => (bloqueado ? itensDe(chave) : (linhas.itens || []).filter((x) => x.lista === chave && x.ativo !== false)).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Parâmetros</h2>
          <p>As listas e regras que o app usa — antes fixas no código, agora você muda aqui</p>
        </div>
      </div>

      {status === 'sem-tabela' && (
        <div className="aviso-faixa">
          Falta um passo no banco: rode o arquivo <b>supabase/28-parametros.sql</b> no SQL Editor do Supabase.
          Até lá o app usa os valores de sempre e esta tela fica só para ver.
        </div>
      )}
      {status === 'erro' && (
        <div className="aviso-faixa">Não consegui ler os parâmetros agora. O app segue com os valores de sempre.
          {' '}<button type="button" className="link-btn" onClick={onRecarregar}>Tentar de novo</button></div>
      )}

      <div className="par">
        <nav className="par-lista">
          {grupos.map((g) => (
            <div key={g}>
              <h5>{g}</h5>
              {LISTAS.filter((l) => l.grupo === g).map((l) => (
                <button key={l.chave} type="button" className={`par-it${aba === l.chave ? ' on' : ''}`} onClick={() => setAba(l.chave)}>
                  <b>{l.titulo}</b><i>{nDe(l.chave)}</i>
                </button>
              ))}
              {g === 'Programação' && (
                <button type="button" className={`par-it${aba === 'regras' ? ' on' : ''}`} onClick={() => setAba('regras')}>
                  <b>Horários e regras da equipe</b><i />
                </button>
              )}
            </div>
          ))}
        </nav>

        {aba === 'regras' ? (
          <EditorRegras key={`r-${status}`} bloqueado={bloqueado} onRecarregar={onRecarregar} />
        ) : (
          <EditorLista
            key={aba}
            def={LISTAS.find((l) => l.chave === aba)}
            linhas={linhas.itens || []}
            contagem={contagem[aba] || {}}
            bloqueado={bloqueado}
            onRecarregar={onRecarregar}
            onDadosMudaram={onDadosMudaram}
          />
        )}
      </div>
    </>
  );
}
