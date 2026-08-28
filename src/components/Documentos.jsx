import { useMemo, useState } from 'react';
import { ImportacaoEmMassa } from './ImportacaoEmMassa';
import { FichaDocumentos } from './FichaDocumentos';
import {
  GRUPOS_PAINEL, ROTULO_SITUACAO, classeUrgencia, dataBR, tiposDaPessoa,
} from '../lib/documentos';

/* =============================================================================
   Documentos
   -----------------------------------------------------------------------------
   A tela mostra PROBLEMA, não cadastro. Com 47 pessoas em dia ela fica quase
   vazia — e é esse o objetivo: uma lista que cresce com o número de
   funcionários vira outra agenda para conferir na mão. Aqui, 47 ou 470, o
   tamanho da tela é o tamanho do estrago.
   ============================================================================= */

function Fila({ pendencias, onAbrirPessoa }) {
  /* Grupo grande nasce fechado. Antes da importação terminar, "Nunca
     entregue" é a empresa inteira — abrir com 600 linhas empurra para fora da
     tela justamente o treinamento vencido, que é a linha que importa. */
  const [fechados, setFechados] = useState({});
  const grande = (n) => n > 20;
  const [pessoa, setPessoa] = useState('todas');

  const pessoas = useMemo(
    () => [...new Set(pendencias.map((p) => p.colaborador))].sort(),
    [pendencias]
  );

  const visiveis = pendencias.filter((p) => pessoa === 'todas' || p.colaborador === pessoa);

  if (!pendencias.length) {
    return (
      <div className="tudo-ok">
        <b>Tudo em dia.</b>
        <span>Nenhum documento vencido, faltando ou sem data. Esta tela fica vazia de propósito.</span>
      </div>
    );
  }

  return (
    <>
      <div className="doc-filtros">
        <button
          type="button"
          className={`chip-btn${pessoa === 'todas' ? ' on' : ''}`}
          onClick={() => setPessoa('todas')}
        >Todos ({pendencias.length})</button>
        {pessoas.map((n) => (
          <button
            key={n}
            type="button"
            className={`chip-btn${pessoa === n ? ' on' : ''}`}
            onClick={() => setPessoa(n)}
          >{n}</button>
        ))}
      </div>

      {GRUPOS_PAINEL.map((g) => {
        const itens = visiveis.filter((p) => g.urgencias.includes(p.urgencia));
        if (!itens.length) return null;
        const fechado = fechados[g.chave] ?? grande(itens.length);
        return (
          <div key={g.chave} className="doc-grupo">
            <button
              type="button"
              className={`doc-grupo-topo ${classeUrgencia(g.urgencias[0])}`}
              // parte do valor que está na tela, não de undefined: senão o
              // primeiro clique num grupo fechado por padrão o fecharia de novo
              onClick={() => setFechados((f) => ({ ...f, [g.chave]: !fechado }))}
              aria-expanded={!fechado}
            >
              <b>{g.titulo}</b>
              <span className="n">{itens.length}</span>
              <span className="seta">{fechado ? '▸' : '▾'}</span>
            </button>

            {!fechado && itens.map((p, i) => (
              <button
                key={`${p.colaborador_id}-${p.assunto}-${i}`}
                type="button"
                className={`doc-item ${classeUrgencia(p.urgencia)}`}
                onClick={() => onAbrirPessoa(p.colaborador_id)}
              >
                <span className="bar" />
                <span className="doc-item-txt">
                  <h4>{p.assunto}</h4>
                  <p>
                    {p.colaborador} · {ROTULO_SITUACAO[p.situacao] || p.situacao}
                    {p.data_limite ? ` · ${dataBR(p.data_limite)}` : ''}
                  </p>
                </span>
                <span className="dias">
                  {p.dias_restantes == null ? '—' : `${p.dias_restantes}d`}
                </span>
              </button>
            ))}
          </div>
        );
      })}
    </>
  );
}

export function Documentos({
  colaboradores: todos, tipos, documentos, pendencias, quem, pessoaInicial,
  onSalvarDocumento, onRemoverDocumento, onSalvarValidade, onRecarregar,
}) {
  const [modo, setModo] = useState(pessoaInicial ? 'pessoa' : 'fila');
  const [pessoaId, setPessoaId] = useState(pessoaInicial || null);

  const ativos = useMemo(
    () => (todos || [])
      .filter((c) => c.status !== 'inativo')
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [todos]
  );

  /* Quanto falta conferir, em pessoas — não em documentos. É o número que diz
     se a importação acabou. */
  const faltamConferir = useMemo(() => {
    const porPessoa = {};
    (documentos || []).forEach((d) => {
      if (d.tipo_id) (porPessoa[d.colaboradorId] ||= new Set()).add(d.tipo_id);
    });
    return ativos.filter((c) => {
      const precisa = tiposDaPessoa(tipos, c);
      const tem = porPessoa[c.id];
      return !precisa.length || !tem || !precisa.every((t) => tem.has(t.id));
    }).length;
  }, [ativos, documentos, tipos]);

  const pessoa = pessoaId ? ativos.find((c) => c.id === pessoaId) : null;

  function abrirPessoa(id) { setPessoaId(id); setModo('pessoa'); }

  if (modo === 'pessoa' && pessoa) {
    return (
      <FichaDocumentos
        colaborador={pessoa}
        tipos={tipos || []}
        documentos={documentos || []}
        quem={quem}
        onRecarregar={onRecarregar}
        onSalvarValidade={onSalvarValidade}
        onVoltar={() => { setModo('fila'); setPessoaId(null); }}
      />
    );
  }

  if (modo === 'importacao') {
    return (
      <ImportacaoEmMassa
        colaboradores={ativos}
        tipos={tipos || []}
        documentos={documentos || []}
        onSalvar={onSalvarDocumento}
        onRemover={onRemoverDocumento}
        onSair={() => setModo('fila')}
      />
    );
  }

  return (
    <>
      {!(tipos || []).length && (
        <div className="aviso-faixa">
          O catálogo de documentos ainda não existe no banco. Rode os arquivos
          <b> 07</b>, <b>09</b>, <b>10</b> e <b>11</b> da pasta <code>supabase/</code> no SQL Editor.
        </div>
      )}

      <div className="doc-barra">
        <div className="doc-barra-txt">
          <b>{pendencias.length}</b>
          <span>{pendencias.length === 1 ? 'pendência' : 'pendências'} de prazo</span>
        </div>
        <div className="doc-barra-txt">
          <b>{faltamConferir}</b>
          <span>de {ativos.length} pessoas ainda por conferir</span>
        </div>
        <button
          type="button"
          className="primary-btn"
          onClick={() => setModo('importacao')}
          disabled={!(tipos || []).length}
        >
          Importação em massa
        </button>
      </div>

      <Fila pendencias={pendencias} onAbrirPessoa={abrirPessoa} />
    </>
  );
}
