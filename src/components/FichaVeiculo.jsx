import { AcoesFicha } from './AcoesFicha';

/**
 * Ficha do veículo — mesmos controles da ficha do colaborador.
 *
 * Diferença que importa: veículo não é liga-desliga. O status tem quatro
 * valores (Disponível, Em uso, Manutenção, Inativo), então "inativar" aqui
 * significa mandar para 'Inativo', e reativar devolve para 'Disponível' —
 * nunca para 'Em uso', que é um estado que só a programação do dia deveria
 * atribuir.
 */
export function FichaVeiculo({
  item,
  ehAdmin,
  selecionado,
  onSelecionar,
  onVer,
  onEditar,
  onAlternarAtivo,
  onExcluir,
  classeStatus,
  classeTag,
  icone,
}) {
  const inativo = item.status === 'Inativo';

  return (
    <div
      className={`card ficha ${classeStatus}${selecionado ? ' marcada' : ''}${inativo ? ' inativa' : ''}`}
    >
      <AcoesFicha
        mostrarCheck={ehAdmin}
        selecionado={selecionado}
        onSelecionar={() => onSelecionar(item.id)}
        rotuloItem={item.placa}
        itens={[
          { rotulo: 'Ver ficha completa', onClick: () => onVer(item) },
          ehAdmin && { rotulo: 'Editar', onClick: () => onEditar(item) },
          ehAdmin && {
            rotulo: inativo ? 'Reativar' : 'Inativar',
            onClick: () => onAlternarAtivo(item),
          },
          ehAdmin && {
            rotulo: 'Excluir', perigo: true, separadorAntes: true,
            onClick: () => onExcluir(item),
          },
        ]}
      />

      <div className="ficha-topo">
        <span className="veic-icone" aria-hidden="true">{icone}</span>
        <div className="ficha-nome">
          <b>{item.modelo}</b>
          <span>{item.tipo} · {item.ano || 'ano não informado'}</span>
        </div>
      </div>

      <div className="ficha-corpo">
        <span className="placa-veic">{item.placa}</span>
        <span className={`tag ${classeTag}`}>{item.status}</span>
      </div>

      <div className="ficha-rodape">
        <div><b>{item.usos}</b><span>Saídas</span></div>
        <div><b>{item.cidades}</b><span>Cidades</span></div>
        <div>
          <b>{item.ano ? new Date().getFullYear() - item.ano : '—'}</b>
          <span>Anos de uso</span>
        </div>
      </div>
    </div>
  );
}
