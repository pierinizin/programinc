import { useMemo, useState } from 'react';
import { ImportacaoEmMassa } from './ImportacaoEmMassa';
import { FichaDocumentos } from './FichaDocumentos';
import { Avatar } from './Avatar';
import { ROTULO_STATUS_PASTA, tiposDaPessoa, statusPasta } from '../lib/documentos';

/* =============================================================================
   Documentos
   -----------------------------------------------------------------------------
   Uma tela só, por colaborador — "como está a pasta do Fulano?" — em vez da
   fila antiga de chips por nome empilhada com um painel de pendências por
   prazo. As duas perguntas ("de quem falta?" e "o que está vencido?") viraram
   uma: o selo do cartão já diz as duas coisas, e o filtro "Vencidos" é a
   porta de entrada de quem chegou aqui atrás de um alarme (o sino do menu, a
   faixa da Programação) — abre com ele já selecionado quando existe alguém
   vencido, senão abre em "Todos".
   ============================================================================= */

const SELO_POR_STATUS = {
  vencido: 'vencido', 'sem-anexos': 'obra', 'em-andamento': 'atencao', finalizado: 'ok',
};

function StatusAbas({ contagem, status, onStatus }) {
  const OPCOES = [
    ['todos', 'Todos', null],
    ['finalizado', 'Finalizado', 'ok'],
    ['em-andamento', 'Em andamento', 'atencao'],
    ['vencido', 'Vencidos', 'vencido'],
    ['sem-anexos', 'Sem anexos', 'obra'],
  ];
  return (
    <div className="status-abas">
      {OPCOES.map(([chave, rotulo, cor]) => (
        <button
          key={chave}
          type="button"
          className={`status-chip${cor ? ` c-${cor}` : ' c-neutro'}${status === chave ? ' on' : ''}`}
          onClick={() => onStatus(chave)}
        >
          {rotulo} <i>{contagem[chave] ?? 0}</i>
        </button>
      ))}
    </div>
  );
}

function GradeColaboradores({
  colaboradores, tipos, documentos, onAbrirPessoa,
}) {
  const [busca, setBusca] = useState('');
  const [statusEscolhido, setStatusEscolhido] = useState(null);   // null = ainda não escolheu

  /* Mesmo mapa que FichaDocumentos monta pra uma pessoa só, aqui pra todas —
     statusPasta usa o mesmo formato (tipo_id -> documento). */
  const docsPorPessoa = useMemo(() => {
    const m = {};
    (documentos || []).forEach((d) => {
      if (!d.tipo_id) return;
      (m[d.colaboradorId] ||= {})[d.tipo_id] = d;
    });
    return m;
  }, [documentos]);

  const comStatus = useMemo(
    () => colaboradores.map((pessoa) => ({
      pessoa,
      status: statusPasta(tipos, pessoa, docsPorPessoa[pessoa.id] || {}),
    })),
    [colaboradores, tipos, docsPorPessoa]
  );

  const contagem = useMemo(() => {
    const c = {
      todos: comStatus.length, finalizado: 0, vencido: 0, 'em-andamento': 0, 'sem-anexos': 0,
    };
    comStatus.forEach((x) => { c[x.status] += 1; });
    return c;
  }, [comStatus]);

  /* Sem escolha do usuário, a tela já abre em cima do que é urgente — é o
     mesmo motivo pelo qual o sino do menu e a faixa da Programação apontam
     pra cá: documento vencido não deveria depender de alguém lembrar de
     filtrar. Uma vez que a pessoa clica em qualquer aba (mesmo "Todos"),
     essa escolha vale até ela sair da tela. */
  const status = statusEscolhido ?? (contagem.vencido > 0 ? 'vencido' : 'todos');

  const termo = busca.trim().toLowerCase();
  const visiveis = comStatus.filter(({ pessoa, status: s }) => (
    (status === 'todos' || status === s)
    && (!termo || pessoa.nome.toLowerCase().includes(termo))
  ));

  return (
    <>
      <div className="doc-busca-linha">
        <input
          className="ct-busca"
          placeholder="Buscar colaborador pelo nome…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      <StatusAbas contagem={contagem} status={status} onStatus={setStatusEscolhido} />

      {!visiveis.length ? (
        <div className="tudo-ok">
          <b>Ninguém encontrado.</b>
          <span>Tente outro nome, ou outro filtro de status.</span>
        </div>
      ) : (
        <div className="pes-grade">
          {visiveis.map(({ pessoa, status: s }) => (
            <button
              key={pessoa.id}
              type="button"
              className="pes-card"
              onClick={() => onAbrirPessoa(pessoa.id)}
            >
              <Avatar nome={pessoa.nome} url={pessoa.fotoUrl} />
              <span className="pes-card-txt">
                <b>{pessoa.nome}</b>
                <i>{pessoa.funcao}</i>
              </span>
              <span className={`selo selo-${SELO_POR_STATUS[s]}`}>
                {ROTULO_STATUS_PASTA[s]}
              </span>
            </button>
          ))}
        </div>
      )}
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

      <GradeColaboradores
        colaboradores={ativos}
        tipos={tipos || []}
        documentos={documentos || []}
        onAbrirPessoa={abrirPessoa}
      />
    </>
  );
}
