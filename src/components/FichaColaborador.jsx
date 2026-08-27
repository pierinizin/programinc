import { Avatar } from './Avatar';
import { AcoesFicha } from './AcoesFicha';

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
  const ativo = item.status === 'ativo';

  return (
    <div className={`card ficha${selecionado ? ' marcada' : ''}${ativo ? '' : ' inativa'}`}>
      <AcoesFicha
        mostrarCheck={ehAdmin}
        selecionado={selecionado}
        onSelecionar={() => onSelecionar(item.id)}
        rotuloItem={item.nome}
        itens={[
          { rotulo: 'Ver ficha completa', onClick: () => onVer(item) },
          ehAdmin && { rotulo: 'Editar', onClick: () => onEditar(item) },
          // O rótulo acompanha o estado: para quem já está inativo a opção vira
          // Reativar, em vez de um "Inativar" que não faria nada.
          ehAdmin && {
            rotulo: ativo ? 'Inativar' : 'Reativar',
            onClick: () => onAlternarAtivo(item),
          },
          ehAdmin && {
            rotulo: 'Excluir', perigo: true, separadorAntes: true,
            onClick: () => onExcluir(item),
          },
        ]}
      />

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
