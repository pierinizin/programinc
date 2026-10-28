import { useEffect, useRef, useState } from 'react';

/* =============================================================================
   Barra de filtros do /administrativo
   -----------------------------------------------------------------------------
   Filtro desligado = botão tracejado "+ Função". Clicou, abre um menu com as
   opções e quantas tem de cada uma. Ligado, vira etiqueta amarela com o que
   foi escolhido e um ✕ para tirar. À direita, quanto sobrou e "Limpar filtros".
   ============================================================================= */

const Lupa = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></svg>
);

/** Fecha o menu ao clicar fora ou apertar Esc. */
function useFechaFora(aberto, fechar) {
  const ref = useRef(null);
  useEffect(() => {
    if (!aberto) return undefined;
    const clique = (e) => { if (ref.current && !ref.current.contains(e.target)) fechar(); };
    const tecla = (e) => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('mousedown', clique);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', clique);
      document.removeEventListener('keydown', tecla);
    };
  }, [aberto, fechar]);
  return ref;
}

export function BarraFiltros({ busca, onBusca, placeholder = 'Filtrar nesta lista…', resumo, temFiltro, onLimpar, children }) {
  return (
    <div className="adm-fbar">
      <label className="adm-fbusca">
        <Lupa />
        <input value={busca} onChange={(e) => onBusca(e.target.value)} placeholder={placeholder} />
        {busca && <button type="button" onClick={() => onBusca('')} aria-label="Limpar busca">✕</button>}
      </label>
      {children}
      <div className="adm-fdir">
        {resumo && <span>{resumo}</span>}
        {temFiltro && <button type="button" onClick={onLimpar}>Limpar filtros</button>}
      </div>
    </div>
  );
}

export function Segmentos({ opcoes, valor, onMudar }) {
  return (
    <div className="adm-fseg" role="radiogroup">
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          className={valor === o.valor ? 'on' : ''}
          onClick={() => onMudar(o.valor)}
        >
          {o.rotulo}{o.n != null && <i>{o.n}</i>}
        </button>
      ))}
    </div>
  );
}

function resumoEscolha(opcoes, valor) {
  const nomes = valor.map((v) => opcoes.find((o) => o.valor === v)?.rotulo || v);
  if (nomes.length <= 2) return nomes.join(', ');
  return `${nomes[0]} +${nomes.length - 1}`;
}

function Chip({ rotulo, escolha, aberto, onAbrir, onTirar }) {
  if (!escolha) {
    return (
      <button type="button" className={`adm-fchip${aberto ? ' aberto' : ''}`} onClick={onAbrir} aria-expanded={aberto}>
        <span className="mais">+</span>{rotulo}
      </button>
    );
  }
  return (
    <span className={`adm-fchip on${aberto ? ' aberto' : ''}`}>
      <button type="button" onClick={onAbrir} aria-expanded={aberto}>{rotulo}: <b>{escolha}</b></button>
      <button type="button" className="x" onClick={onTirar} aria-label={`Tirar o filtro ${rotulo}`}>✕</button>
    </span>
  );
}

/**
 * Filtro de escolha múltipla.
 * opcoes: [{ valor, rotulo, n?, cor?, grupo? }]
 */
export function FiltroMenu({ rotulo, opcoes, valor = [], onMudar, buscavel = false, vazio = 'Nada para escolher.' }) {
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState('');
  const fechar = () => { setAberto(false); setTermo(''); };
  const ref = useFechaFora(aberto, fechar);

  const t = termo.trim().toLowerCase();
  const visiveis = opcoes.filter((o) => !t || String(o.rotulo).toLowerCase().includes(t));
  const alternar = (v) => onMudar(valor.includes(v) ? valor.filter((x) => x !== v) : [...valor, v]);

  let grupoAnterior = null;
  return (
    <div className="adm-fwrap" ref={ref}>
      <Chip
        rotulo={rotulo}
        escolha={valor.length ? resumoEscolha(opcoes, valor) : ''}
        aberto={aberto}
        onAbrir={() => (aberto ? fechar() : setAberto(true))}
        onTirar={() => { onMudar([]); fechar(); }}
      />
      {aberto && (
        <div className="adm-pop" role="dialog" aria-label={rotulo}>
          {buscavel && (
            <label className="adm-pbusca">
              <Lupa />
              <input autoFocus value={termo} onChange={(e) => setTermo(e.target.value)} placeholder={`Buscar ${rotulo.toLowerCase()}…`} />
            </label>
          )}
          <div className="adm-pop-lista">
            {!visiveis.length && <div className="adm-pop-vazio">{opcoes.length ? 'Nada encontrado.' : vazio}</div>}
            {visiveis.map((o) => {
              const titulo = o.grupo && o.grupo !== grupoAnterior ? o.grupo : null;
              grupoAnterior = o.grupo || grupoAnterior;
              const on = valor.includes(o.valor);
              return (
                <div key={o.valor}>
                  {titulo && <div className="adm-pop-tit">{titulo}</div>}
                  <button type="button" className="adm-op" role="checkbox" aria-checked={on} onClick={() => alternar(o.valor)}>
                    <span className={`cx${on ? ' on' : ''}`}>{on ? '✓' : ''}</span>
                    {o.cor && <span className="ponto" style={{ background: o.cor }} />}
                    <span className="r">{o.rotulo}</span>
                    {o.n != null && <span className="q">{o.n}</span>}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="adm-pop-pe">
            <span>{valor.length ? `${valor.length} ${valor.length === 1 ? 'selecionado' : 'selecionados'}` : 'Nenhum selecionado'}</span>
            {valor.length > 0 && <button type="button" onClick={() => onMudar([])}>Limpar</button>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Filtro liga/desliga, sem menu ("Ausente hoje"). */
export function FiltroSim({ rotulo, ativo, onMudar }) {
  if (!ativo) {
    return (
      <button type="button" className="adm-fchip" onClick={() => onMudar(true)}>
        <span className="mais">+</span>{rotulo}
      </button>
    );
  }
  return (
    <span className="adm-fchip on">
      <button type="button" onClick={() => onMudar(false)}><b>{rotulo}</b></button>
      <button type="button" className="x" onClick={() => onMudar(false)} aria-label={`Tirar o filtro ${rotulo}`}>✕</button>
    </span>
  );
}
