import { useEffect, useRef, useState } from 'react';
import { Avatar } from './Avatar';

/**
 * Ficha do colaborador com seleção em massa e menu de três pontos.
 *
 * A fileira antiga de botões (Ver / Editar / Excluir) saiu por dois motivos:
 * ocupava um terço do card e deixava a ação mais destrutiva como a mais
 * chamativa. Excluir apaga o colaborador E as faltas dele em cascata; quem
 * saiu da empresa quase sempre deve ser INATIVADO, que preserva o histórico.
 * Por isso inativar subiu para o menu e excluir foi para o fim, separado.
 */
export function FichaColaborador({
  item,
  ehAdmin,
  selecionado,
  onSelecionar,
  onVer,
  onEditar,
  onAlternarAtivo,
  onExcluir,
}) {
  const [menuAberto, setMenuAberto] = useState(false);
  const caixaRef = useRef(null);

  useEffect(() => {
    if (!menuAberto) return undefined;
    const fechar = (ev) => {
      if (!caixaRef.current?.contains(ev.target)) setMenuAberto(false);
    };
    const tecla = (ev) => { if (ev.key === 'Escape') setMenuAberto(false); };
    document.addEventListener('pointerdown', fechar);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fechar);
      document.removeEventListener('keydown', tecla);
    };
  }, [menuAberto]);

  const ativo = item.status === 'ativo';

  return (
    <div className={`card ficha${selecionado ? ' marcada' : ''}${ativo ? '' : ' inativa'}`}>
      {ehAdmin && (
        <button
          type="button"
          className="fc-check"
          role="checkbox"
          aria-checked={selecionado}
          aria-label={`Selecionar ${item.nome}`}
          onClick={() => onSelecionar(item.id)}
        >
          {selecionado ? '✓' : ''}
        </button>
      )}

      <span className="fc-menu" ref={caixaRef}>
        <button
          type="button"
          className="fc-kebab"
          aria-haspopup="menu"
          aria-expanded={menuAberto}
          aria-label={`Ações de ${item.nome}`}
          onClick={() => setMenuAberto((v) => !v)}
        >
          ⋯
        </button>

        {menuAberto && (
          <span className="fc-lista" role="menu">
            <button
              type="button"
              role="menuitem"
              className="selo-opc"
              onClick={() => { setMenuAberto(false); onVer(item); }}
            >
              Ver ficha completa
            </button>

            {ehAdmin && (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className="selo-opc"
                  onClick={() => { setMenuAberto(false); onEditar(item); }}
                >
                  Editar
                </button>

                {/* O rótulo acompanha o estado: para quem já está inativo a
                    opção vira Reativar, em vez de um "Inativar" sem efeito. */}
                <button
                  type="button"
                  role="menuitem"
                  className="selo-opc"
                  onClick={() => { setMenuAberto(false); onAlternarAtivo(item); }}
                >
                  {ativo ? 'Inativar' : 'Reativar'}
                </button>

                <span className="fc-divisor" />
                <button
                  type="button"
                  role="menuitem"
                  className="selo-opc perigo"
                  onClick={() => { setMenuAberto(false); onExcluir(item); }}
                >
                  Excluir
                </button>
              </>
            )}
          </span>
        )}
      </span>

      <div className="ficha-topo">
        <Avatar nome={item.nome} url={item.fotoUrl} tamanho="big" />
        <div className="ficha-nome">
          <b>{item.apelido || item.nome}</b>
          <span>{item.nome}</span>
        </div>
      </div>

      <div className="ficha-corpo">
        <span className="tag">{item.funcao}</span>
        <span className={`tag ${ativo ? 'success' : ''}`}>{item.status}</span>
      </div>

      <div className="ficha-rodape">
        <div><b>{item.escalas}</b><span>Escalas</span></div>
        <div><b>{item.faltas}</b><span>Faltas</span></div>
        <div><b>{item.cidades}</b><span>Cidades</span></div>
      </div>

      <div className="meta-row ficha-contato">☎ {item.telefone || 'sem telefone'}</div>
    </div>
  );
}
