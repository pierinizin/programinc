import { useEffect, useRef, useState } from 'react';

/**
 * Checkbox de seleção + menu de três pontos no canto da ficha.
 *
 * Está separado porque colaborador e veículo usam exatamente os mesmos
 * controles com itens diferentes. Duplicar isso significaria duplicar também o
 * fechar-ao-clicar-fora e o Escape — e um dos dois acabaria ficando para trás.
 *
 * `itens` é uma lista de { rotulo, onClick, perigo, separadorAntes }.
 */
export function AcoesFicha({ mostrarCheck, selecionado, onSelecionar, rotuloItem, itens }) {
  const [aberto, setAberto] = useState(false);
  const caixaRef = useRef(null);

  useEffect(() => {
    if (!aberto) return undefined;
    const fechar = (ev) => {
      if (!caixaRef.current?.contains(ev.target)) setAberto(false);
    };
    const tecla = (ev) => { if (ev.key === 'Escape') setAberto(false); };
    document.addEventListener('pointerdown', fechar);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fechar);
      document.removeEventListener('keydown', tecla);
    };
  }, [aberto]);

  const visiveis = itens.filter(Boolean);

  return (
    <>
      {mostrarCheck && (
        <button
          type="button"
          className="fc-check"
          role="checkbox"
          aria-checked={selecionado}
          aria-label={`Selecionar ${rotuloItem}`}
          onClick={onSelecionar}
        >
          {selecionado ? '✓' : ''}
        </button>
      )}

      <span className="fc-menu" ref={caixaRef}>
        <button
          type="button"
          className="fc-kebab"
          aria-haspopup="menu"
          aria-expanded={aberto}
          aria-label={`Ações de ${rotuloItem}`}
          onClick={() => setAberto((v) => !v)}
        >
          ⋯
        </button>

        {aberto && (
          <span className="fc-lista" role="menu">
            {visiveis.map((it) => (
              <span key={it.rotulo}>
                {it.separadorAntes && <span className="fc-divisor" />}
                <button
                  type="button"
                  role="menuitem"
                  className={`selo-opc${it.perigo ? ' perigo' : ''}`}
                  onClick={() => { setAberto(false); it.onClick(); }}
                >
                  {it.rotulo}
                </button>
              </span>
            ))}
          </span>
        )}
      </span>
    </>
  );
}
