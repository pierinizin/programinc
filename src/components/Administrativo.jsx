import { useMemo, useState } from 'react';
import { Avatar } from './Avatar';
import { FichaDocumentos } from './FichaDocumentos';
import { ImportacaoEmMassa } from './ImportacaoEmMassa';
import { tiposDaPessoa, statusPasta, dataBR } from '../lib/documentos';
import { SETORES, rotuloSetor, ehTrecho } from '../lib/setor';
import { rotuloMotivo } from '../lib/motivos';

/* =============================================================================
   Administrativo — incovia…/administrativo
   -----------------------------------------------------------------------------
   A área de quem NÃO é do trecho (escritório, oficina, outros): cadastro,
   pasta de documentos, faltas e férias. Layout próprio, sem menu lateral nem
   nada da Programação — quem cuida do escritório não precisa ver equipe,
   contrato ou veículo, e o pessoal do trecho não aparece aqui.

   Os dados e as janelas (cadastro, falta, atestado, férias, a ficha da
   pessoa) são os mesmos do app principal: o App passa tudo já separado e as
   ações abrem as mesmas janelas de sempre.
   ============================================================================= */

const hojeISO = () => new Date().toISOString().slice(0, 10);

const SITUACAO = {
  vencido: ['selo-vencido', 'Vencido'],
  'em-andamento': ['selo-atencao', 'Em andamento'],
  'sem-anexos': ['selo-obra', 'Sem anexos'],
  finalizado: ['selo-ok', 'Em dia'],
};
const COR_BARRA = {
  vencido: 'var(--erro)', 'em-andamento': 'var(--faixa)', 'sem-anexos': 'var(--obra)', finalizado: 'var(--ok)',
};

/** Resumo da pasta de uma pessoa: quantos resolvidos de quantos, situação e
    o próximo vencimento (ou o que já venceu). Mesma régua da tela Documentos. */
function resumoPasta(tipos, pessoa, docsPessoa) {
  const aplicaveis = tiposDaPessoa(tipos, pessoa);
  let feitos = 0;
  let proximo = null;
  aplicaveis.forEach((t) => {
    const doc = docsPessoa[t.id];
    // Mesma conta da pasta (FichaDocumentos): resolvido = tem arquivo ou foi dispensado.
    if (doc?.caminho || doc?.dispensado) feitos += 1;
    if (t.vence && doc?.valido_ate && !doc.dispensado && (!proximo || doc.valido_ate < proximo.data)) {
      proximo = { data: doc.valido_ate, tipo: t.nome };
    }
  });
  return {
    feitos,
    total: aplicaveis.length,
    status: statusPasta(tipos, pessoa, docsPessoa),
    proximo,
  };
}

function Segmentado({ opcoes, valor, onMudar }) {
  return (
    <div className="adm-seg" role="tablist">
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          className={valor === o.valor ? 'on' : ''}
          onClick={() => onMudar(o.valor)}
        >
          {o.rotulo}{o.n != null ? ` ${o.n}` : ''}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Aba Pessoas
   -------------------------------------------------------------------------- */
function AbaPessoas({ pessoas, resumos, grupo, seletor, onNova, onAbrirPasta, onVerFicha, onEditar, podeEditar }) {
  const [busca, setBusca] = useState('');
  const [verInativos, setVerInativos] = useState(false);
  const doTrecho = grupo === 'trecho';

  const ativos = pessoas.filter((p) => p.status !== 'inativo');
  const nInativos = pessoas.length - ativos.length;
  const base = verInativos ? pessoas : ativos;

  const kpi = { vencido: 0, 'em-andamento': 0, 'sem-anexos': 0, finalizado: 0 };
  ativos.forEach((p) => { kpi[resumos[p.id].status] += 1; });

  const termo = busca.trim().toLowerCase();
  const visiveis = base.filter((p) => (
    !termo || p.nome.toLowerCase().includes(termo) || (p.funcao || '').toLowerCase().includes(termo)
  ));
  const hoje = hojeISO();

  return (
    <>
      <div className="adm-cab">
        <div>
          <h1>Pessoas</h1>
          <p>
            {doTrecho
              ? 'Pessoal do trecho · aqui só a pasta de documentos; o cadastro fica no app do trecho'
              : 'Escritório, oficina e quem não vai a campo'}
            {' · '}{ativos.length} {ativos.length === 1 ? 'ativo' : 'ativos'}
          </p>
        </div>
        {podeEditar && !doTrecho && (
          <div className="acoes">
            <button type="button" className="primary-btn" onClick={onNova}>+ Nova pessoa</button>
          </div>
        )}
      </div>

      <div className="adm-kpis">
        <div className="adm-kpi erro"><span className="n">{kpi.vencido}</span><span className="t">com documento vencido</span></div>
        <div className="adm-kpi at"><span className="n">{kpi['em-andamento']}</span><span className="t">pasta em andamento</span></div>
        <div className="adm-kpi obra"><span className="n">{kpi['sem-anexos']}</span><span className="t">sem nenhum anexo</span></div>
        <div className="adm-kpi ok"><span className="n">{kpi.finalizado}</span><span className="t">pasta em dia</span></div>
      </div>

      <div className="adm-filtros">
        <input placeholder="Buscar pelo nome ou função…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        {seletor}
        {nInativos > 0 && (
          <label className="adm-check">
            <input type="checkbox" checked={verInativos} onChange={(e) => setVerInativos(e.target.checked)} />
            Mostrar inativos ({nInativos})
          </label>
        )}
      </div>

      {!pessoas.length ? (
        <div className="adm-vazio">
          <b>Ninguém cadastrado aqui ainda.</b>
          <span>Use “+ Nova pessoa” para cadastrar quem é do escritório, da oficina ou de outro setor que não vai a campo.</span>
        </div>
      ) : !visiveis.length ? (
        <div className="adm-vazio"><b>Ninguém encontrado.</b><span>Tente outro nome ou outro setor.</span></div>
      ) : (
        <div className="adm-tab-rola">
          <table className="adm-tab">
            <thead>
              <tr><th>Nome</th><th>Setor</th><th>Pasta</th><th>Situação</th><th>Próximo vencimento</th><th aria-label="Ações" /></tr>
            </thead>
            <tbody>
              {visiveis.map((p) => {
                const r = resumos[p.id];
                const [selo, rotulo] = SITUACAO[r.status];
                const venceu = r.proximo && r.proximo.data < hoje;
                return (
                  <tr key={p.id} className={p.status === 'inativo' ? 'inativo' : ''}>
                    <td>
                      <button type="button" className="adm-nome" onClick={() => onVerFicha(p)} title="Ver ficha (faltas, atestados e férias)">
                        <Avatar nome={p.nome} url={p.fotoUrl} />
                        <span><b>{p.nome}</b><small>{p.funcao}{p.status === 'inativo' ? ' · inativo' : ''}</small></span>
                      </button>
                    </td>
                    <td><span className="adm-setor">{rotuloSetor(p.setor)}</span></td>
                    <td>
                      <div className="adm-barra" title={`${r.feitos} de ${r.total} documentos resolvidos (com arquivo ou dispensados)`}>
                        <div className="trilho"><i style={{ width: `${r.total ? (r.feitos / r.total) * 100 : 100}%`, background: COR_BARRA[r.status] }} /></div>
                        <span>{r.feitos}/{r.total}</span>
                      </div>
                    </td>
                    <td><span className={`selo ${selo}`}>{rotulo}</span></td>
                    <td>
                      <span className={`adm-venc${venceu ? ' erro' : ''}`}>
                        {!r.proximo ? '—' : venceu
                          ? `${r.proximo.tipo} venceu ${dataBR(r.proximo.data)}`
                          : `${r.proximo.tipo} · ${dataBR(r.proximo.data)}`}
                      </span>
                    </td>
                    <td className="adm-acoes">
                      {/* Cadastro do trecho se edita no app do trecho (e o RH só vê). */}
                      {podeEditar && !ehTrecho(p) && <button type="button" className="adm-btn leve" onClick={() => onEditar(p)}>Editar</button>}
                      <button type="button" className="adm-btn" onClick={() => onAbrirPasta(p.id)}>Abrir pasta</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* --------------------------------------------------------------------------
   Aba Documentos — fila do que precisa de ação
   -------------------------------------------------------------------------- */
const COLUNAS = [
  { chave: 'erro', titulo: 'Vencidos', urgencias: [1], botao: 'Renovar' },
  { chave: 'at', titulo: 'Vence em 30 dias', urgencias: [3, 4], botao: 'Renovar' },
  { chave: 'cin', titulo: 'Não entregues', urgencias: [2], botao: 'Anexar' },
];
const MAX_POR_COLUNA = 8;

function AbaDocumentos({ pendencias, pessoasPorId, seletor, onAbrirPasta, onImportar, podeImportar }) {
  const [busca, setBusca] = useState('');
  const [abertas, setAbertas] = useState({});

  const termo = busca.trim().toLowerCase();
  const filtradas = pendencias.filter((p) => {
    const pessoa = pessoasPorId[p.colaborador_id];
    if (!pessoa || pessoa.status === 'inativo') return false;
    return !termo || p.colaborador.toLowerCase().includes(termo) || String(p.assunto).toLowerCase().includes(termo);
  });

  return (
    <>
      <div className="adm-cab">
        <div>
          <h1>Documentos</h1>
          <p>O que precisa de ação, do mais urgente para o menos</p>
        </div>
        {podeImportar && (
          <div className="acoes">
            <button type="button" className="ghost-btn" onClick={onImportar}>Importação em massa</button>
          </div>
        )}
      </div>

      <div className="adm-filtros">
        <input placeholder="Buscar pessoa ou documento…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        {seletor}
      </div>

      <div className="adm-fila">
        {COLUNAS.map((col) => {
          const itens = filtradas.filter((p) => col.urgencias.includes(p.urgencia));
          const mostrar = abertas[col.chave] ? itens : itens.slice(0, MAX_POR_COLUNA);
          return (
            <div key={col.chave} className={`adm-fila-col ${col.chave}`}>
              <h3>{col.titulo} <i>{itens.length}</i></h3>
              {!itens.length && <div className="adm-fila-vazio">Nada aqui.</div>}
              {mostrar.map((p, k) => {
                const pessoa = pessoasPorId[p.colaborador_id];
                return (
                  <div key={`${p.colaborador_id}-${p.assunto}-${k}`} className="adm-fila-it">
                    <Avatar nome={pessoa.nome} url={pessoa.fotoUrl} tamanho="small" />
                    <div className="txt"><b>{pessoa.nome}</b><span>{p.assunto}</span></div>
                    {p.data_limite && <span className="dt">{dataBR(p.data_limite)}</span>}
                    <button type="button" className="adm-btn" onClick={() => onAbrirPasta(pessoa.id)}>
                      {p.origem === 'atestado' ? 'Ver' : col.botao}
                    </button>
                  </div>
                );
              })}
              {itens.length > MAX_POR_COLUNA && (
                <button
                  type="button"
                  className="adm-fila-mais"
                  onClick={() => setAbertas((a) => ({ ...a, [col.chave]: !a[col.chave] }))}
                >
                  {abertas[col.chave] ? 'Mostrar menos' : `Ver todos (${itens.length})`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* --------------------------------------------------------------------------
   Aba Faltas e férias
   -------------------------------------------------------------------------- */
function AbaFaltasFerias({ pessoasPorId, seletor, faltas, ferias, onRegistrarFalta, onVerFicha, podeLancarFalta }) {
  const hoje = hojeISO();
  const limite = (() => { const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().slice(0, 10); })();
  const listaFaltas = faltas
    .filter((f) => pessoasPorId[f.colaboradorId] && f.data >= limite)
    .sort((a, b) => b.data.localeCompare(a.data));
  const listaFerias = ferias
    .filter((f) => pessoasPorId[f.colaboradorId] && f.data_fim >= hoje)
    .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio));

  return (
    <>
      <div className="adm-cab">
        <div>
          <h1>Faltas e férias</h1>
          <p>Faltas dos últimos 90 dias e férias em andamento ou marcadas. Atestado e férias se lançam pela ficha da pessoa.</p>
        </div>
        {podeLancarFalta && (
          <div className="acoes">
            <button type="button" className="primary-btn" onClick={onRegistrarFalta}>Registrar falta</button>
          </div>
        )}
      </div>

      <div className="adm-filtros">{seletor}</div>

      <div className="adm-duas">
        <div className="adm-bloco">
          <h3>Faltas <i>{listaFaltas.length}</i></h3>
          {!listaFaltas.length && <div className="adm-fila-vazio">Nenhuma falta nos últimos 90 dias.</div>}
          {listaFaltas.map((f) => {
            const pessoa = pessoasPorId[f.colaboradorId];
            return (
              <button type="button" key={f.id} className="adm-fila-it clicavel" onClick={() => onVerFicha(pessoa)}>
                <Avatar nome={pessoa.nome} url={pessoa.fotoUrl} tamanho="small" />
                <span className="txt"><b>{pessoa.nome}</b><span>{rotuloMotivo(f.motivo)}{f.observacao ? ` · ${f.observacao}` : ''}</span></span>
                <span className="dt">{dataBR(f.data)}</span>
              </button>
            );
          })}
        </div>

        <div className="adm-bloco">
          <h3>Férias <i>{listaFerias.length}</i></h3>
          {!listaFerias.length && <div className="adm-fila-vazio">Ninguém de férias nem com férias marcadas.</div>}
          {listaFerias.map((f) => {
            const pessoa = pessoasPorId[f.colaboradorId];
            const agora = f.data_inicio <= hoje;
            return (
              <button type="button" key={f.id} className="adm-fila-it clicavel" onClick={() => onVerFicha(pessoa)}>
                <Avatar nome={pessoa.nome} url={pessoa.fotoUrl} tamanho="small" />
                <span className="txt"><b>{pessoa.nome}</b><span>{agora ? 'De férias agora' : 'Marcadas'}</span></span>
                <span className="dt">{dataBR(f.data_inicio)} → {dataBR(f.data_fim)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

/* --------------------------------------------------------------------------
   A área inteira
   -------------------------------------------------------------------------- */
export function Administrativo({
  pessoas, pessoasTrecho = [], tipos, documentos, pendencias, faltas, ferias, quem, nomeUsuario,
  podeVerApp, podeEditar, gaveta, gavetaAberta,
  onNovaPessoa, onEditar, onVerFicha, onRegistrarFalta,
  onSalvarDocumento, onRemoverDocumento, onSalvarValidade, onRecarregar,
  onVoltarAoApp, onSair,
}) {
  const [aba, setAba] = useState('pessoas');
  const [pastaDe, setPastaDe] = useState(null);       // id da pessoa com a pasta aberta
  const [importando, setImportando] = useState(false);
  /* Grupo escolhido, o mesmo nas três abas. Abre em "Fora do trecho" (o
     escritório é a razão de ser desta área); "Trecho" existe para o RH cuidar
     da pasta de documentos do pessoal de campo sem sair daqui. */
  const [grupo, setGrupo] = useState('fora');

  const todas = useMemo(() => [...pessoas, ...pessoasTrecho], [pessoas, pessoasTrecho]);
  const todasPorId = useMemo(() => Object.fromEntries(todas.map((p) => [p.id, p])), [todas]);

  const contagem = useMemo(() => {
    const m = { fora: 0, trecho: 0 };
    todas.filter((p) => p.status !== 'inativo').forEach((p) => {
      if (ehTrecho(p)) m.trecho += 1;
      else { m.fora += 1; m[p.setor] = (m[p.setor] || 0) + 1; }
    });
    return m;
  }, [todas]);

  const doGrupo = useMemo(() => {
    if (grupo === 'trecho') return pessoasTrecho;
    if (grupo === 'fora') return pessoas;
    return pessoas.filter((p) => p.setor === grupo);
  }, [grupo, pessoas, pessoasTrecho]);
  const doGrupoPorId = useMemo(() => Object.fromEntries(doGrupo.map((p) => [p.id, p])), [doGrupo]);

  const resumos = useMemo(() => {
    const docsPorPessoa = {};
    (documentos || []).forEach((d) => {
      if (d.tipo_id && todasPorId[d.colaboradorId]) (docsPorPessoa[d.colaboradorId] ||= {})[d.tipo_id] = d;
    });
    return Object.fromEntries(todas.map((p) => [p.id, resumoPasta(tipos, p, docsPorPessoa[p.id] || {})]));
  }, [todas, todasPorId, documentos, tipos]);

  // O número da aba conta tudo que esta área cobre (fora e trecho).
  const nUrgentes = pendencias.filter((p) => p.urgencia <= 2 && todasPorId[p.colaborador_id]
    && todasPorId[p.colaborador_id].status !== 'inativo').length;
  const pessoaDaPasta = pastaDe ? todasPorId[pastaDe] : null;

  function irPara(novaAba) { setAba(novaAba); setPastaDe(null); setImportando(false); }

  const seletor = (
    <Segmentado
      valor={grupo}
      onMudar={setGrupo}
      opcoes={[
        { valor: 'fora', rotulo: 'Fora do trecho', n: contagem.fora },
        ...SETORES.filter((x) => x.valor !== 'trecho' && contagem[x.valor])
          .map((x) => ({ valor: x.valor, rotulo: x.rotulo, n: contagem[x.valor] })),
        ...(pessoasTrecho.length ? [{ valor: 'trecho', rotulo: 'Trecho', n: contagem.trecho }] : []),
      ]}
    />
  );

  let corpo;
  if (pessoaDaPasta) {
    corpo = (
      <FichaDocumentos
        colaborador={pessoaDaPasta}
        tipos={tipos}
        documentos={documentos}
        quem={quem}
        onRecarregar={onRecarregar}
        onSalvarValidade={onSalvarValidade}
        onVoltar={() => setPastaDe(null)}
      />
    );
  } else if (importando) {
    corpo = (
      <ImportacaoEmMassa
        colaboradores={doGrupo.filter((p) => p.status !== 'inativo')}
        tipos={tipos}
        documentos={documentos}
        onSalvar={onSalvarDocumento}
        onRemover={onRemoverDocumento}
        onSair={() => setImportando(false)}
      />
    );
  } else if (aba === 'documentos') {
    corpo = (
      <AbaDocumentos
        pendencias={pendencias}
        pessoasPorId={doGrupoPorId}
        seletor={seletor}
        onAbrirPasta={setPastaDe}
        onImportar={() => setImportando(true)}
        podeImportar={podeEditar && tipos.length > 0}
      />
    );
  } else if (aba === 'faltas') {
    corpo = (
      <AbaFaltasFerias
        pessoasPorId={doGrupoPorId}
        seletor={seletor}
        podeLancarFalta={podeEditar && grupo !== 'trecho'}
        faltas={faltas}
        ferias={ferias}
        onRegistrarFalta={onRegistrarFalta}
        onVerFicha={onVerFicha}
        podeEditar={podeEditar}
      />
    );
  } else {
    corpo = (
      <AbaPessoas
        pessoas={doGrupo}
        grupo={grupo}
        seletor={seletor}
        resumos={resumos}
        onNova={onNovaPessoa}
        onAbrirPasta={setPastaDe}
        onVerFicha={onVerFicha}
        onEditar={onEditar}
        podeEditar={podeEditar}
      />
    );
  }

  return (
    <div className="adm-shell">
      <header className="adm-top">
        <div className="adm-marca">
          <img src="/icon-192.png" alt="" className="logo" />
          <b>Incovia</b>
          <span>Administrativo</span>
        </div>
        <nav className="adm-abas">
          <button type="button" className={aba === 'pessoas' ? 'on' : ''} onClick={() => irPara('pessoas')}>Pessoas</button>
          <button type="button" className={aba === 'documentos' ? 'on' : ''} onClick={() => irPara('documentos')}>
            Documentos{nUrgentes > 0 && <i>{nUrgentes}</i>}
          </button>
          <button type="button" className={aba === 'faltas' ? 'on' : ''} onClick={() => irPara('faltas')}>Faltas e férias</button>
        </nav>
        <div className="adm-user">
          {nomeUsuario && <span>Logado como <b>{nomeUsuario}</b></span>}
          {podeVerApp && <button type="button" onClick={onVoltarAoApp}>Ir para o app do trecho</button>}
          <button type="button" onClick={onSair}>Sair</button>
        </div>
      </header>

      <div className={`adm-pg${gavetaAberta ? ' com-gaveta' : ''}`}>
        <section className="adm-conteudo">
          {/* Sem o 21-setor.sql os tipos não sabem o que cobrar de quem é de
              fora — a pasta apareceria "em dia" com zero documentos. */}
          {(!tipos.length || !tipos.some((t) => 'vale_fora_trecho' in t)) && (
            <div className="aviso-faixa">
              Falta um passo no banco: rode o arquivo <b>supabase/21-setor.sql</b> no SQL Editor do Supabase.
            </div>
          )}
          {corpo}
        </section>
        {gaveta}
      </div>
    </div>
  );
}
