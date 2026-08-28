import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from './Avatar';
import { tiposDaPessoa, dataISO, dataBR, sugerirValidade } from '../lib/documentos';

/* =============================================================================
   Importação em massa
   -----------------------------------------------------------------------------
   Isto existe para uma tarde só: transportar a agenda de papel para dentro do
   sistema. Depois dela, a manutenção é de uma linha por vez, pela ficha da
   pessoa.

   A decisão que faz a tela funcionar: registrar QUE O DOCUMENTO EXISTE e QUANDO
   VENCE não depende de ter o PDF. O alarme só precisa da data. Se exigisse o
   arquivo, você teria que digitalizar 47 pastas antes de o sistema avisar
   qualquer coisa — e ele começaria a servir daqui a um mês, não amanhã.

   Por isso o gesto aqui é o mesmo da agenda: descer a lista marcando. Cada
   marcação salva sozinha; dá para parar no meio do café e voltar depois.
   ============================================================================= */

const TECLA_AJUDA = [
  ['S', 'tem'], ['N', 'não tem'], ['↑ ↓', 'anda na lista'], ['Enter', 'próxima pessoa'],
];

export function ImportacaoEmMassa({
  colaboradores, tipos, documentos, onSalvar, onRemover, onSair,
}) {
  const [iP, setIP] = useState(0);
  const [foco, setFoco] = useState(0);
  const [rascunho, setRascunho] = useState({});   // tipo_id -> 'dd/mm/aaaa' em edição
  const [salvando, setSalvando] = useState({});   // tipo_id -> true
  /* "não tem" precisa ser uma escolha visível, e não o estado inicial de tudo:
     sem isto a tela já abriria com 13 "não" acesos e ninguém saberia o que
     tinha sido conferido e o que só não tinha sido tocado ainda. */
  const [negados, setNegados] = useState({});     // tipo_id -> true
  const [erro, setErro] = useState('');
  const listaRef = useRef(null);

  const pessoa = colaboradores[iP] || null;
  const linhas = useMemo(
    () => (pessoa ? tiposDaPessoa(tipos, pessoa) : []),
    [tipos, pessoa]
  );

  /* O que já está no banco para esta pessoa. É a fonte da verdade: se você
     recarregar a página no meio, a tela volta exatamente onde estava. */
  const jaTem = useMemo(() => {
    const m = {};
    (documentos || []).forEach((d) => {
      if (pessoa && d.colaboradorId === pessoa.id && d.tipo_id) m[d.tipo_id] = d;
    });
    return m;
  }, [documentos, pessoa]);

  const feitos = linhas.filter((t) => jaTem[t.id]).length;

  /* Quantas pessoas já estão inteiras — a barra mede a empresa, não a tela. */
  const totalGeral = useMemo(() => {
    let ok = 0;
    const porPessoa = {};
    (documentos || []).forEach((d) => {
      if (!d.tipo_id) return;
      (porPessoa[d.colaboradorId] ||= new Set()).add(d.tipo_id);
    });
    colaboradores.forEach((c) => {
      const precisa = tiposDaPessoa(tipos, c);
      const tem = porPessoa[c.id];
      if (precisa.length && tem && precisa.every((t) => tem.has(t.id))) ok += 1;
    });
    return ok;
  }, [colaboradores, tipos, documentos]);

  useEffect(() => { setFoco(0); setRascunho({}); setNegados({}); setErro(''); }, [iP]);

  async function marca(i, valor) {
    const tipo = linhas[i];
    if (!tipo || !pessoa) return;
    setErro('');
    setFoco(Math.min(i + 1, linhas.length - 1));

    if (valor === 'n') {
      setNegados((n) => ({ ...n, [tipo.id]: true }));
      // "não tem" é a ausência de linha, igual ao "-" da agenda. Se havia um
      // registro, some — foi correção de quem está conferindo.
      const atual = jaTem[tipo.id];
      if (atual) {
        setSalvando((s) => ({ ...s, [tipo.id]: true }));
        const ok = await onRemover(atual);
        setSalvando((s) => ({ ...s, [tipo.id]: false }));
        if (!ok) setErro('Não consegui apagar esse registro. Tente de novo.');
      }
      setRascunho((r) => ({ ...r, [tipo.id]: '' }));
      return;
    }

    // "tem": se o tipo vence, já vai com uma sugestão preenchida em vez de um
    // campo vazio. Corrigir uma data é mais rápido do que digitar uma.
    const sugerida = rascunho[tipo.id]
      || dataBR(jaTem[tipo.id]?.valido_ate)
      || sugerirValidade(tipo);
    setNegados((n) => ({ ...n, [tipo.id]: false }));
    setRascunho((r) => ({ ...r, [tipo.id]: sugerida }));
    await salvar(tipo, sugerida);
  }

  async function salvar(tipo, textoData) {
    if (!pessoa) return;
    const iso = tipo.vence ? dataISO(textoData) : '';
    if (tipo.vence && textoData && !iso) {
      setErro(`Data inválida em ${tipo.nome}. Use dd/mm/aaaa.`);
      return;
    }
    setSalvando((s) => ({ ...s, [tipo.id]: true }));
    const ok = await onSalvar({
      colaborador: pessoa,
      tipo,
      valido_ate: iso || null,
      existente: jaTem[tipo.id] || null,
    });
    setSalvando((s) => ({ ...s, [tipo.id]: false }));
    if (!ok) setErro('Não consegui salvar. Confira a conexão e tente de novo.');
  }

  function proxima(passo = 1) {
    if (!colaboradores.length) return;
    setIP((v) => (v + passo + colaboradores.length) % colaboradores.length);
    listaRef.current?.scrollTo({ top: 0 });
  }

  /* O atalho de teclado é registrado UMA vez e lê a versão atual pelo ref.
     Com um listener recriado a cada render, cada tecla marcava DUAS vezes: o
     `await` do salvamento devolve o controle ao navegador no meio do caminho do
     evento, a tela re-renderiza, e o listener novo — já pendurado no document —
     ainda pega o mesmo keydown na subida. Dois registros por tecla, sem
     nenhum erro aparecer na tela. */
  const teclaRef = useRef(null);
  teclaRef.current = (ev) => {
    if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA') return;
    const k = ev.key.toLowerCase();
    if (k === 's' || k === 'n') { marca(foco, k); ev.preventDefault(); }
    else if (ev.key === 'ArrowDown') { setFoco((f) => Math.min(f + 1, linhas.length - 1)); ev.preventDefault(); }
    else if (ev.key === 'ArrowUp') { setFoco((f) => Math.max(f - 1, 0)); ev.preventDefault(); }
    else if (ev.key === 'Enter') { proxima(1); ev.preventDefault(); }
  };

  useEffect(() => {
    const onKey = (ev) => teclaRef.current?.(ev);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (!pessoa) {
    return <div className="empty-card">Nenhum colaborador ativo para conferir.</div>;
  }

  return (
    <div className="mut">
      <div className="mut-topo">
        <Avatar nome={pessoa.nome} url={pessoa.fotoUrl} tamanho="big" />
        <span className="mut-nome">
          <b>{pessoa.nome}</b>
          <i>{pessoa.funcao}</i>
        </span>
        <span className="mut-contador">
          <b>{iP + 1} / {colaboradores.length}</b>
          <i>{totalGeral} completos</i>
        </span>
        <button type="button" className="ghost-btn" onClick={onSair}>Sair</button>
      </div>

      <div className="mut-prog">
        <i style={{ width: `${((iP + feitos / Math.max(1, linhas.length)) / colaboradores.length) * 100}%` }} />
      </div>

      <div className="mut-lista" ref={listaRef}>
        {linhas.map((t, i) => {
          const doc = jaTem[t.id];
          const marcado = doc ? 's' : (negados[t.id] ? 'n' : null);
          const valor = rascunho[t.id] ?? dataBR(doc?.valido_ate) ?? '';
          return (
            <div
              key={t.id}
              className={`mlinha${i === foco ? ' foco' : ''}${salvando[t.id] ? ' salvando' : ''}`}
              onClick={() => setFoco(i)}
            >
              <span className="mnome">
                {t.nome}
                {t.vence && <i>vence a cada {t.meses_validade} meses</i>}
              </span>

              <span className="sn">
                <button
                  type="button"
                  className={`bt sim${marcado === 's' ? ' on' : ''}`}
                  onClick={(e) => { e.stopPropagation(); marca(i, 's'); }}
                >tem</button>
                <button
                  type="button"
                  className={`bt nao${marcado === 'n' ? ' on' : ''}`}
                  onClick={(e) => { e.stopPropagation(); marca(i, 'n'); }}
                >não</button>
              </span>

              <input
                className="dt"
                type="text"
                inputMode="numeric"
                placeholder={t.vence ? 'dd/mm/aaaa' : '—'}
                value={valor}
                disabled={!t.vence || !doc}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setRascunho((r) => ({ ...r, [t.id]: e.target.value }))}
                onBlur={(e) => { if (doc) salvar(t, e.target.value); }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              />
            </div>
          );
        })}
      </div>

      {erro && <div className="mut-erro">{erro}</div>}

      <div className="mut-pe">
        <span className="teclas">
          {TECLA_AJUDA.map(([k, r]) => (
            <span key={k}><kbd>{k}</kbd> {r}</span>
          ))}
        </span>
        <span className="mut-acoes">
          <button type="button" className="ghost-btn" onClick={() => proxima(-1)}>← Anterior</button>
          <button type="button" className="primary-btn" onClick={() => proxima(1)}>Próxima pessoa →</button>
        </span>
      </div>
    </div>
  );
}
