import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from './Avatar';
import { FichaDocumentos } from './FichaDocumentos';
import { ImportacaoEmMassa } from './ImportacaoEmMassa';
import { BarraFiltros, FiltroMenu, FiltroSim, Segmentos } from './FiltrosAdm';
import { tiposDaPessoa, statusPasta, dataBR } from '../lib/documentos';
import { SETORES, setorDe, rotuloSetor, ehTrecho } from '../lib/setor';
import {
  agruparAusencias, cruza, foraNoDia, diaDaVolta, segundaDa, gradeDoMes, mesVizinho, DIAS_SEMANA, MESES,
  TIPOS_AUSENCIA, TIPO_AUSENCIA, isoLocal, somaDias, diasEntre, curta, fimDeSemana, diaDaSemana,
} from '../lib/ausencias';
import { FILTROS_PADRAO, lerFiltros, escreverFiltros } from '../lib/filtrosUrl';

/* =============================================================================
   Administrativo — incovia…/administrativo
   -----------------------------------------------------------------------------
   Pessoas, pasta de documentos e ausências de TODO mundo (escritório, oficina,
   outros e trecho), com layout próprio. A barra de setor no alto vale para as
   três abas; cada aba tem a sua linha de filtros. Aba, setor e filtros ficam
   no endereço (lib/filtrosUrl.js).

   Os dados e as janelas (cadastro, falta, atestado, férias, ficha) são os
   mesmos do app principal: o App passa tudo e as ações abrem as mesmas
   janelas de sempre. Faltas viram períodos em lib/ausencias.js.
   ============================================================================= */

const COR_SETOR = { escritorio: '#6E56CF', oficina: '#0E9F8F', outros: '#8A8F98', trecho: '#E8A317' };
const ROTULO_CARGO = { admin: 'Administrador', rh: 'RH', editor: 'Editor', visualizador: 'Visualizador' };
const ROTULO_CATEGORIA = {
  identificacao: 'Identificação', contrato: 'Contrato', ctps: 'CTPS', saude: 'Saúde', treinamento: 'Treinamentos', outro: 'Outros',
};

/* Situação de cada pessoa na aba Pessoas (a pasta + o que vence logo). */
const SITUACOES_PESSOA = [
  { valor: 'em-dia', rotulo: 'Em dia', cor: 'var(--ok)' },
  { valor: 'vence-breve', rotulo: 'Vence em 30 dias', cor: 'var(--faixa)' },
  { valor: 'em-andamento', rotulo: 'Faltam documentos', cor: 'var(--campo)' },
  { valor: 'vencido', rotulo: 'Documento vencido', cor: 'var(--erro)' },
  { valor: 'sem-anexos', rotulo: 'Sem anexos', cor: 'var(--obra)' },
];
const SITUACAO_PESSOA = Object.fromEntries(SITUACOES_PESSOA.map((s) => [s.valor, s]));

/* Pendência de documento → 3 grupos, na ordem de urgência da tela. */
const CATEGORIAS_DOC = [
  { valor: 'vencido', rotulo: 'Vencido', cor: 'var(--erro)', classe: 'v' },
  { valor: 'vence', rotulo: 'Vence em breve', cor: 'var(--faixa)', classe: 'a' },
  { valor: 'faltando', rotulo: 'Não entregue', cor: 'var(--borda-forte)', classe: 'f' },
];
const CATEGORIA_DOC = Object.fromEntries(CATEGORIAS_DOC.map((c) => [c.valor, c]));
const ORDEM_CAT = { vencido: 0, vence: 1, faltando: 2 };
const catDaPendencia = (p) => (p.urgencia === 1 ? 'vencido' : p.urgencia === 2 ? 'faltando' : 'vence');
const tipoDaPendencia = (p) => (p.origem === 'atestado' ? 'Atestado' : p.assunto);

/* ------------------------------------------------------------------ ícones */
const Ico = {
  pessoas: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2" /><path d="M3 19c.8-3.2 3.2-5 6-5s5.2 1.8 6 5" /><circle cx="17" cy="9" r="2.4" /><path d="M15.5 14.2c2.3.2 4.1 1.7 4.8 4.3" /></svg>,
  docs: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></svg>,
  aus: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>,
  busca: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></svg>,
  pasta: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h6l2 2h10v10H3z" /></svg>,
  ficha: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /></svg>,
  lapis: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></svg>,
};

/* ------------------------------------------------------------- pedacinhos */
function Anel({ pct, cor, tamanho = 46 }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <svg className="adm-anel" viewBox="0 0 46 46" width={tamanho} height={tamanho} aria-hidden="true">
      <circle cx="23" cy="23" r={r} fill="none" stroke="var(--superficie-2)" strokeWidth="5" />
      <circle cx="23" cy="23" r={r} fill="none" stroke={cor} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={`${(c * pct) / 100} ${c}`} transform="rotate(-90 23 23)" />
      <text x="23" y="26.5" textAnchor="middle">{pct}%</text>
    </svg>
  );
}

function MiniAnel({ feitos, total, cor }) {
  const pct = total ? feitos / total : 1;
  const r = 8;
  const c = 2 * Math.PI * r;
  return (
    <span className="adm-mini" title={`${feitos} de ${total} documentos resolvidos (com arquivo ou dispensados)`}>
      <svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true">
        <circle cx="11" cy="11" r={r} fill="none" stroke="var(--superficie-2)" strokeWidth="3.5" />
        <circle cx="11" cy="11" r={r} fill="none" stroke={cor} strokeWidth="3.5" strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 11 11)" />
      </svg>
      <span>{feitos}/{total}</span>
    </span>
  );
}

function PilulaSetor({ pessoa, compacta = false }) {
  const s = setorDe(pessoa);
  return (
    <span className={`adm-pill${compacta ? ' mini' : ''}`}>
      <span className="ponto" style={{ background: COR_SETOR[s] || COR_SETOR.outros }} />{rotuloSetor(s)}
    </span>
  );
}

function Ponto({ cor, children }) {
  return <span className="adm-st"><span className="ponto" style={{ background: cor }} />{children}</span>;
}

function Kpi({ n, titulo, sub, cor, corN, onClick, ativo, children }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} className={`adm-kpi${cor ? ' barra' : ''}${ativo ? ' ativo' : ''}`} style={cor ? { '--c': cor } : undefined} onClick={onClick}>
      {children || <span className="n" style={corN ? { color: corN } : undefined}>{n}</span>}
      <span className="t"><b>{titulo}</b>{sub}</span>
    </Tag>
  );
}

function Vazio({ titulo, texto }) {
  return <div className="adm-vazio"><b>{titulo}</b>{texto && <span>{texto}</span>}</div>;
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

function relativo(iso, hoje) {
  const d = diasEntre(hoje, iso);
  if (d === 0) return 'hoje';
  if (d === 1) return 'amanhã';
  if (d === -1) return 'venceu ontem';
  return d < 0 ? `venceu há ${-d} dias` : `em ${d} dias`;
}

/** Resumo da pasta: resolvidos de quantos, status e o próximo vencimento. */
function resumoPasta(tipos, pessoa, docsPessoa) {
  const aplicaveis = tiposDaPessoa(tipos, pessoa);
  let feitos = 0;
  let proximo = null;
  aplicaveis.forEach((t) => {
    const doc = docsPessoa[t.id];
    if (doc?.caminho || doc?.dispensado) feitos += 1;
    if (t.vence && doc?.valido_ate && !doc.dispensado && (!proximo || doc.valido_ate < proximo.data)) {
      proximo = { data: doc.valido_ate, tipo: t.nome };
    }
  });
  return { feitos, total: aplicaveis.length, status: statusPasta(tipos, pessoa, docsPessoa), proximo };
}

function situacaoDaPessoa(r, hoje) {
  if (r.status === 'vencido') return 'vencido';
  if (r.status === 'sem-anexos') return 'sem-anexos';
  if (r.proximo && diasEntre(hoje, r.proximo.data) <= 30) return 'vence-breve';
  if (r.status === 'em-andamento') return 'em-andamento';
  return 'em-dia';
}

function contar(lista, chave) {
  const m = {};
  lista.forEach((x) => { const k = chave(x); if (k != null) m[k] = (m[k] || 0) + 1; });
  return m;
}

/* ===================================================================== Pessoas */
function AbaPessoas({ pessoas, resumos, situacoes, ausenciaDe, pendencias, f, mudar, hoje, podeEditar, onNova, onAbrirPasta, onVerFicha, onEditar, setor }) {
  const ativos = pessoas.filter((p) => p.status !== 'inativo');
  const porStatus = f.st === 'todos' ? pessoas : f.st === 'inativos' ? pessoas.filter((p) => p.status === 'inativo') : ativos;

  // KPIs: sempre sobre os ativos do setor (não mudam com os filtros da lista).
  const idsAtivos = new Set(ativos.map((p) => p.id));
  const emDia = ativos.filter((p) => situacoes[p.id] === 'em-dia').length;
  const pctEmDia = ativos.length ? Math.round((emDia / ativos.length) * 100) : 0;
  const pendAtivos = pendencias.filter((p) => idsAtivos.has(p.colaborador_id) && p.origem !== 'atestado');
  const vencidos = pendAtivos.filter((p) => p.urgencia === 1);
  const vencendo = pendAtivos.filter((p) => p.urgencia === 3);
  const prazo = (p) => (p.dias_restantes != null ? p.dias_restantes : p.data_limite ? diasEntre(hoje, p.data_limite) : null);
  const proximoVence = vencendo.reduce((m, p) => { const d = prazo(p); return d != null && (m == null || d < m) ? d : m; }, null);
  const ausentesHoje = ativos.filter((p) => ausenciaDe[p.id]?.agora);
  const tiposHoje = contar(ausentesHoje, (p) => ausenciaDe[p.id].periodo.tipo);

  // Filtros da lista
  const termo = f.q.trim().toLowerCase();
  const funcoes = contar(porStatus, (p) => p.funcao || null);
  const sits = contar(porStatus, (p) => situacoes[p.id]);
  const visiveis = porStatus.filter((p) => (
    (!termo || p.nome.toLowerCase().includes(termo) || (p.funcao || '').toLowerCase().includes(termo))
    && (!f.sit.length || f.sit.includes(situacoes[p.id]))
    && (!f.fun.length || f.fun.includes(p.funcao))
    && (!f.aus || ausenciaDe[p.id]?.agora)
  ));
  const temFiltro = Boolean(termo || f.sit.length || f.fun.length || f.aus || f.st !== 'ativos');
  const limpar = () => mudar({ q: '', sit: [], fun: [], aus: false, st: 'ativos' });

  return (
    <>
      <div className="adm-cab">
        <div>
          <h1>Pessoas</h1>
          <p>{plural(ativos.length, 'ativo', 'ativos')} · documentos, situação e ausências de cada um num lugar só</p>
        </div>
        {podeEditar && setor !== 'trecho' && (
          <div className="acoes"><button type="button" className="primary-btn" onClick={onNova}>+ Nova pessoa</button></div>
        )}
      </div>

      <div className="adm-kpis">
        <Kpi titulo="Pastas em dia" sub={`${emDia} de ${plural(ativos.length, 'pessoa', 'pessoas')}`} onClick={() => mudar({ sit: ['em-dia'] })} ativo={f.sit.length === 1 && f.sit[0] === 'em-dia'}>
          <Anel pct={pctEmDia} cor="var(--ok)" />
        </Kpi>
        <Kpi n={vencidos.length} titulo={vencidos.length === 1 ? 'Documento vencido' : 'Documentos vencidos'} cor="var(--erro)" corN="var(--erro-texto)"
          sub={vencidos.length ? vencidos.slice(0, 2).map((p) => `${p.colaborador.split(' ')[0]} (${p.assunto})`).join(' · ') + (vencidos.length > 2 ? '…' : '') : 'nada vencido'}
          onClick={() => mudar({ sit: ['vencido'] })} ativo={f.sit.length === 1 && f.sit[0] === 'vencido'} />
        <Kpi n={vencendo.length} titulo="Vencem em 30 dias" cor="var(--faixa)" corN="var(--faixa-texto)"
          sub={proximoVence == null ? 'nada vencendo' : proximoVence <= 0 ? 'o próximo vence hoje' : `o próximo em ${plural(proximoVence, 'dia', 'dias')}`}
          onClick={() => mudar({ sit: ['vence-breve'] })} ativo={f.sit.length === 1 && f.sit[0] === 'vence-breve'} />
        <Kpi n={ausentesHoje.length} titulo="Ausentes hoje" cor="var(--campo)" corN="var(--campo-texto)"
          sub={ausentesHoje.length ? TIPOS_AUSENCIA.filter((t) => tiposHoje[t.valor]).map((t) => `${tiposHoje[t.valor]} ${tiposHoje[t.valor] === 1 ? t.rotulo.toLowerCase() : t.plural}`).join(' · ') : 'todo mundo trabalhando'}
          onClick={() => mudar({ aus: !f.aus })} ativo={f.aus} />
      </div>

      <BarraFiltros
        busca={f.q}
        onBusca={(q) => mudar({ q })}
        placeholder="Filtrar por nome ou função…"
        resumo={`${visiveis.length} de ${plural(porStatus.length, 'pessoa', 'pessoas')}`}
        temFiltro={temFiltro}
        onLimpar={limpar}
      >
        <Segmentos
          valor={f.st}
          onMudar={(st) => mudar({ st })}
          opcoes={[{ valor: 'ativos', rotulo: 'Ativos' }, { valor: 'inativos', rotulo: 'Inativos' }, { valor: 'todos', rotulo: 'Todos' }]}
        />
        <FiltroMenu rotulo="Situação" valor={f.sit} onMudar={(sit) => mudar({ sit })}
          opcoes={SITUACOES_PESSOA.map((s) => ({ ...s, n: sits[s.valor] || 0 }))} />
        <FiltroMenu rotulo="Função" valor={f.fun} onMudar={(fun) => mudar({ fun })} buscavel
          opcoes={Object.keys(funcoes).sort((a, b) => a.localeCompare(b, 'pt-BR')).map((x) => ({ valor: x, rotulo: x, n: funcoes[x] }))} />
        <FiltroSim rotulo="Ausente hoje" ativo={f.aus} onMudar={(aus) => mudar({ aus })} />
      </BarraFiltros>

      {!pessoas.length ? (
        <Vazio titulo="Ninguém cadastrado neste setor." texto="Use “+ Nova pessoa” para cadastrar quem é do escritório, da oficina ou de outro setor." />
      ) : !visiveis.length ? (
        <Vazio titulo="Ninguém com esses filtros." texto="Tire algum filtro ou use “Limpar filtros”." />
      ) : (
        <div className="adm-cartao adm-rola">
          <table className="adm-tab">
            <thead>
              <tr><th>Nome</th><th>Setor</th><th>Pasta</th><th>Situação</th><th>Próximo vencimento</th><th>Ausência</th><th aria-label="Ações" /></tr>
            </thead>
            <tbody>
              {visiveis.map((p) => {
                const r = resumos[p.id];
                const sit = SITUACAO_PESSOA[situacoes[p.id]];
                const dias = r.proximo ? diasEntre(hoje, r.proximo.data) : null;
                const aus = ausenciaDe[p.id];
                return (
                  <tr key={p.id} className={`${p.status === 'inativo' ? 'inativo' : ''}${situacoes[p.id] === 'vencido' ? ' alerta' : ''}`}>
                    <td>
                      <button type="button" className="adm-nome" onClick={() => onVerFicha(p)} title="Ver ficha (faltas, atestados e férias)">
                        <Avatar nome={p.nome} url={p.fotoUrl} />
                        <span><b>{p.nome}</b><small>{p.funcao || '—'}{p.status === 'inativo' ? ' · inativo' : ''}</small></span>
                      </button>
                    </td>
                    <td><PilulaSetor pessoa={p} /></td>
                    <td><MiniAnel feitos={r.feitos} total={r.total} cor={sit.cor} /></td>
                    <td><Ponto cor={sit.cor}>{sit.rotulo}</Ponto></td>
                    <td>
                      {!r.proximo ? <span className="fraca">—</span> : (
                        <div className="adm-venc">
                          <span className={dias < 0 ? 'erro' : dias <= 30 ? 'at' : ''}>{relativo(r.proximo.data, hoje)}</span>
                          <small>{r.proximo.tipo} · {dataBR(r.proximo.data)}</small>
                        </div>
                      )}
                    </td>
                    <td>
                      {!aus ? <span className="fraca">—</span> : (
                        <button type="button" className={`adm-aus t-${aus.periodo.tipo}${aus.agora ? '' : ' futura'}`} onClick={() => onVerFicha(p)}
                          title={`${aus.periodo.rotulo} · ${dataBR(aus.periodo.inicio)} → ${dataBR(aus.periodo.fim)}`}>
                          {TIPO_AUSENCIA[aus.periodo.tipo].rotulo} · {aus.agora ? `até ${curta(aus.periodo.fim)}` : `${curta(aus.periodo.inicio)} → ${curta(aus.periodo.fim)}`}
                        </button>
                      )}
                    </td>
                    <td className="adm-acoes">
                      {podeEditar && !ehTrecho(p) && (
                        <button type="button" className="adm-ib" onClick={() => onEditar(p)} title="Editar cadastro" aria-label={`Editar cadastro de ${p.nome}`}>{Ico.lapis}</button>
                      )}
                      <button type="button" className="adm-ib" onClick={() => onAbrirPasta(p.id)} title="Abrir pasta de documentos" aria-label={`Abrir pasta de ${p.nome}`}>{Ico.pasta}</button>
                      <button type="button" className="adm-ib" onClick={() => onVerFicha(p)} title="Ficha: faltas, atestados e férias" aria-label={`Ficha de ${p.nome}`}>{Ico.ficha}</button>
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

/* ================================================================== Documentos */
const POR_PAGINA_DOCS = 30;

function AbaDocumentos({ pessoas, pessoasPorId, resumos, pendencias, tipos, f, mudar, podeImportar, onImportar, onAbrirPasta, onVerFicha }) {
  const [quantos, setQuantos] = useState(POR_PAGINA_DOCS);
  const ativos = useMemo(() => new Set(pessoas.filter((p) => p.status !== 'inativo').map((p) => p.id)), [pessoas]);
  const categoriaDoTipo = useMemo(() => Object.fromEntries((tipos || []).map((t) => [t.nome, t.categoria])), [tipos]);

  // Todas as pendências dos ativos do setor, já com tipo e grupo.
  const itens = useMemo(() => pendencias
    .filter((p) => ativos.has(p.colaborador_id))
    .map((p) => ({ ...p, tipo: tipoDaPendencia(p), cat: catDaPendencia(p) })), [pendencias, ativos]);

  const nCat = contar(itens, (i) => i.cat);
  const total = itens.length || 1;

  const termo = f.dq.trim().toLowerCase();
  const casa = (i) => (!f.tipo.length || f.tipo.includes(i.tipo)) && (!f.dsit.length || f.dsit.includes(i.cat));
  const porPessoa = new Map();
  itens.forEach((i) => {
    if (!porPessoa.has(i.colaborador_id)) porPessoa.set(i.colaborador_id, []);
    porPessoa.get(i.colaborador_id).push(i);
  });
  const linhas = [];
  porPessoa.forEach((lista, id) => {
    const pessoa = pessoasPorId[id];
    if (!pessoa) return;
    if (f.pes.length && !f.pes.includes(id)) return;
    const nomeCasa = !termo || pessoa.nome.toLowerCase().includes(termo);
    const marcados = lista.map((i) => ({ ...i, dentro: casa(i) && (nomeCasa || i.assunto.toLowerCase().includes(termo)) }));
    if (!marcados.some((i) => i.dentro)) return;
    marcados.sort((a, b) => (ORDEM_CAT[a.cat] - ORDEM_CAT[b.cat]) || ((a.dias_restantes ?? 9999) - (b.dias_restantes ?? 9999)));
    linhas.push({ pessoa, itens: marcados, pior: ORDEM_CAT[marcados[0].cat], prazo: marcados[0].dias_restantes ?? 9999 });
  });
  linhas.sort((a, b) => (a.pior - b.pior) || (a.prazo - b.prazo) || a.pessoa.nome.localeCompare(b.pessoa.nome, 'pt-BR'));
  const nDentro = linhas.reduce((s, l) => s + l.itens.filter((i) => i.dentro).length, 0);

  // Opções dos menus (contadas sobre o setor inteiro)
  const nTipo = contar(itens, (i) => i.tipo);
  const opTipos = Object.keys(nTipo)
    .map((t) => ({ valor: t, rotulo: t, n: nTipo[t], grupo: t === 'Atestado' ? 'Atestados' : ROTULO_CATEGORIA[categoriaDoTipo[t]] || 'Outros' }))
    .sort((a, b) => a.grupo.localeCompare(b.grupo, 'pt-BR') || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
  const nPessoa = contar(itens, (i) => i.colaborador_id);
  const opPessoas = Object.keys(nPessoa).filter((id) => pessoasPorId[id])
    .map((id) => ({ valor: id, rotulo: pessoasPorId[id].nome, n: nPessoa[id] }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));

  const temFiltro = Boolean(termo || f.tipo.length || f.dsit.length || f.pes.length);
  const limpar = () => mudar({ dq: '', tipo: [], dsit: [], pes: [] });
  const abrir = (i, pessoa) => (i.origem === 'atestado' ? onVerFicha(pessoa) : onAbrirPasta(pessoa.id));

  return (
    <>
      <div className="adm-cab">
        <div>
          <h1>Documentos</h1>
          <p>Uma linha por pessoa, com tudo que falta dela — do mais urgente para o menos</p>
        </div>
        {podeImportar && (
          <div className="acoes"><button type="button" className="ghost-btn" onClick={onImportar}>Importação em massa</button></div>
        )}
      </div>

      <div className="adm-resumo-doc">
        <div className="adm-leg">
          {CATEGORIAS_DOC.map((c) => (
            <button key={c.valor} type="button" className={f.dsit.length === 1 && f.dsit[0] === c.valor ? 'on' : ''}
              onClick={() => mudar({ dsit: f.dsit.length === 1 && f.dsit[0] === c.valor ? [] : [c.valor] })}>
              <i style={{ background: c.cor }} /><b>{nCat[c.valor] || 0}</b> {c.valor === 'vencido' ? 'vencidos' : c.valor === 'vence' ? 'vencem em breve' : 'não entregues'}
            </button>
          ))}
        </div>
        <div className="adm-empilhada" aria-hidden="true">
          {CATEGORIAS_DOC.map((c) => (nCat[c.valor] ? <span key={c.valor} style={{ width: `${(nCat[c.valor] / total) * 100}%`, background: c.cor }} /> : null))}
        </div>
        <span className="mono fraca">{plural(itens.length, 'pendência', 'pendências')} · {plural(porPessoa.size, 'pessoa', 'pessoas')}</span>
      </div>

      <BarraFiltros
        busca={f.dq}
        onBusca={(dq) => mudar({ dq })}
        placeholder="Filtrar por pessoa ou documento…"
        resumo={temFiltro ? `${plural(nDentro, 'pendência', 'pendências')} · ${plural(linhas.length, 'pessoa', 'pessoas')}` : ''}
        temFiltro={temFiltro}
        onLimpar={limpar}
      >
        <FiltroMenu rotulo="Tipo" valor={f.tipo} onMudar={(tipo) => mudar({ tipo })} opcoes={opTipos} buscavel />
        <FiltroMenu rotulo="Situação" valor={f.dsit} onMudar={(dsit) => mudar({ dsit })}
          opcoes={CATEGORIAS_DOC.map((c) => ({ valor: c.valor, rotulo: c.rotulo, cor: c.cor, n: nCat[c.valor] || 0 }))} />
        <FiltroMenu rotulo="Pessoa" valor={f.pes} onMudar={(pes) => mudar({ pes })} opcoes={opPessoas} buscavel />
      </BarraFiltros>

      {!itens.length ? (
        <Vazio titulo="Nenhuma pendência neste setor." texto="Todas as pastas estão em dia." />
      ) : !linhas.length ? (
        <Vazio titulo="Nada com esses filtros." texto="Tire algum filtro ou use “Limpar filtros”." />
      ) : (
        <div className="adm-cartao">
          {linhas.slice(0, quantos).map(({ pessoa, itens: lista }) => {
            const r = resumos[pessoa.id];
            const cor = CATEGORIA_DOC[lista[0].cat].cor;
            return (
              <div key={pessoa.id} className="adm-pdoc">
                <button type="button" className="adm-nome" onClick={() => onVerFicha(pessoa)}>
                  <Avatar nome={pessoa.nome} url={pessoa.fotoUrl} />
                  <span><b>{pessoa.nome}</b><PilulaSetor pessoa={pessoa} compacta /></span>
                </button>
                <div className="adm-chips">
                  {lista.map((i, k) => (
                    <button key={`${i.assunto}-${k}`} type="button" className={`adm-chip ${CATEGORIA_DOC[i.cat].classe}${i.dentro ? '' : ' fora'}`}
                      title={i.assunto} onClick={() => abrir(i, pessoa)}>
                      {i.tipo}
                      {i.data_limite && (i.cat !== 'faltando' || i.origem === 'atestado') && (
                        <small>{i.cat === 'vencido' ? (i.origem === 'atestado' ? 'falta ' : 'venceu ') : i.cat === 'vence' ? 'vence ' : 'até '}{curta(i.data_limite)}</small>
                      )}
                    </button>
                  ))}
                </div>
                {r ? (
                  <div className="adm-prog" title={`${r.feitos} de ${r.total} documentos resolvidos`}>
                    <div className="tr"><i style={{ width: `${r.total ? (r.feitos / r.total) * 100 : 100}%`, background: cor }} /></div>
                    <span>{r.feitos}/{r.total}</span>
                  </div>
                ) : <span />}
                <div className="adm-dir"><button type="button" className="adm-btn" onClick={() => onAbrirPasta(pessoa.id)}>Abrir pasta</button></div>
              </div>
            );
          })}
          {linhas.length > quantos && (
            <button type="button" className="adm-mais" onClick={() => setQuantos((q) => q + POR_PAGINA_DOCS)}>
              Mostrar mais ({linhas.length - quantos} pessoas)
            </button>
          )}
        </div>
      )}
    </>
  );
}

/* =================================================================== Ausências */
/* Calendário: cada dia mostra as fotos de quem está fora (uma por cima da
   outra, até 4) e a cor do contorno diz o tipo. Ao lado, o dia escolhido. */
const MAX_FOTOS = 4;

function FotoAus({ pessoa, tipo, z }) {
  return (
    <span className="adm-cal-av" style={{ '--c': TIPO_AUSENCIA[tipo].cor, zIndex: z }}>
      <Avatar nome={pessoa.nome} url={pessoa.fotoUrl} tamanho="small" titulo={`${pessoa.nome} · ${TIPO_AUSENCIA[tipo].rotulo}`} />
    </span>
  );
}

function Pilha({ itens }) {
  const n = itens.length;
  const mostra = n <= MAX_FOTOS ? itens : itens.slice(0, MAX_FOTOS - 1);
  return (
    <span className="adm-cal-pilha">
      {mostra.map((x, i) => <FotoAus key={x.p.id} pessoa={x.pessoa} tipo={x.p.tipo} z={10 - i} />)}
      {n > mostra.length && <em>+{n - mostra.length}</em>}
    </span>
  );
}

const nomeDoDia = (iso) => {
  const [a, m, d] = iso.split('-').map(Number);
  const s = new Date(a, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long' });
  return `${s.charAt(0).toUpperCase()}${s.slice(1).replace('-feira', '')}, ${d} de ${MESES[m - 1]}`;
};

function AbaAusencias({ pessoas, pessoasPorId, periodos, f, mudar, hoje, podeLancarFalta, podeLancarAtestado, onRegistrarFalta, onRegistrarAtestado, onVerFicha }) {
  const ids = useMemo(() => new Set(pessoas.map((p) => p.id)), [pessoas]);
  const doSetor = useMemo(() => periodos.filter((p) => ids.has(p.pessoaId)), [periodos, ids]);

  // Frase do topo — setor inteiro, sem os filtros.
  const agora = doSetor.filter((p) => foraNoDia(p, hoje));
  const pessoasAgora = new Set(agora.map((p) => p.pessoaId));
  const tiposAgora = contar(agora, (p) => p.tipo);
  const proxSegunda = somaDias(segundaDa(hoje), 7);
  const voltam = new Set(agora.filter((p) => p.tipo !== 'falta' && diaDaVolta(p.fim) <= proxSegunda).map((p) => p.pessoaId)).size;
  const marcados = doSetor.filter((p) => p.inicio > hoje).length;

  // Filtros
  const termo = f.aq.trim().toLowerCase();
  const visiveis = doSetor.filter((p) => {
    const pessoa = pessoasPorId[p.pessoaId];
    return pessoa
      && (!termo || pessoa.nome.toLowerCase().includes(termo))
      && (!f.atipo.length || f.atipo.includes(p.tipo));
  });
  const nTipo = contar(doSetor, (p) => p.tipo);
  const temFiltro = Boolean(termo || f.atipo.length);

  // Mês, semana e dia escolhidos
  const dia = f.dia || hoje;
  const mes = f.mes || dia.slice(0, 7);
  const semana = f.vis === 'semana';
  const dias = useMemo(
    () => (semana ? Array.from({ length: 7 }, (_, k) => somaDias(segundaDa(dia), k)) : gradeDoMes(mes)),
    [semana, dia, mes]
  );
  const de = dias[0];
  const ate = dias[dias.length - 1];
  const naJanela = visiveis.filter((p) => cruza(p, de, ate));
  const foraEm = (d) => naJanela
    .filter((p) => foraNoDia(p, d))
    .map((p) => ({ p, pessoa: pessoasPorId[p.pessoaId] }))
    .sort((a, b) => a.p.inicio.localeCompare(b.p.inicio));
  const doDia = visiveis.filter((p) => foraNoDia(p, dia))
    .map((p) => ({ p, pessoa: pessoasPorId[p.pessoaId] }))
    .sort((a, b) => a.p.fim.localeCompare(b.p.fim));
  const maior = Math.max(1, ...dias.map((d) => foraEm(d).length));

  const escolher = (d) => mudar({ dia: d === hoje ? '' : d, mes: d.slice(0, 7) === hoje.slice(0, 7) ? '' : d.slice(0, 7) });
  const andar = (n) => {
    if (semana) { escolher(somaDias(dia, 7 * n)); return; }
    const novo = mesVizinho(mes, n);
    mudar({ mes: novo === hoje.slice(0, 7) ? '' : novo, dia: novo === hoje.slice(0, 7) ? '' : `${novo}-01` });
  };
  const [ano, m] = mes.split('-').map(Number);
  const titulo = semana
    ? `${curta(de)} → ${curta(ate)}`
    : `${MESES[m - 1].charAt(0).toUpperCase()}${MESES[m - 1].slice(1)} ${ano}`;
  const tom = (n) => (n ? { background: `color-mix(in srgb, var(--erro) ${Math.round(12 + (n / maior) * 40)}%, var(--superficie))` } : undefined);

  return (
    <>
      <div className="adm-cab">
        <div><h1>Ausências</h1></div>
        {(podeLancarFalta || podeLancarAtestado) && (
          <div className="acoes">
            {podeLancarFalta && <button type="button" className="ghost-btn" onClick={onRegistrarFalta}>Registrar falta</button>}
            {podeLancarAtestado && <button type="button" className="primary-btn" onClick={onRegistrarAtestado}>Registrar atestado</button>}
          </div>
        )}
      </div>

      <p className="adm-frase">
        {pessoasAgora.size
          ? (
            <>
              <b>{plural(pessoasAgora.size, 'pessoa fora hoje', 'pessoas fora hoje')}</b>
              {' — '}{TIPOS_AUSENCIA.filter((t) => tiposAgora[t.valor]).map((t) => `${tiposAgora[t.valor]} ${tiposAgora[t.valor] === 1 ? t.rotulo.toLowerCase() : t.plural}`).join(', ')}
            </>
          )
          : <b>Ninguém fora hoje</b>}
        {voltam > 0 && <><span className="sep">/</span><b>{voltam} {voltam === 1 ? 'volta' : 'voltam'}</b> até {DIAS_SEMANA[diaDaSemana(proxSegunda)]} {curta(proxSegunda)}</>}
        <span className="sep">/</span>
        {marcados ? <><b>{plural(marcados, 'afastamento', 'afastamentos')}</b> {marcados === 1 ? 'marcado' : 'marcados'}</> : 'nada marcado pela frente'}
      </p>

      <BarraFiltros busca={f.aq} onBusca={(aq) => mudar({ aq })} placeholder="Buscar pessoa…" temFiltro={temFiltro} onLimpar={() => mudar({ aq: '', atipo: [] })}>
        <FiltroMenu rotulo="Tipo" valor={f.atipo} onMudar={(atipo) => mudar({ atipo })}
          opcoes={TIPOS_AUSENCIA.map((t) => ({ ...t, n: nTipo[t.valor] || 0 }))} />
      </BarraFiltros>

      <div className="adm-cal-wrap">
        <div className="adm-cal">
          <div className="adm-cal-cab">
            <button type="button" className="nav" onClick={() => andar(-1)} aria-label={semana ? 'Semana anterior' : 'Mês anterior'}>‹</button>
            <b>{titulo}</b>
            <button type="button" className="nav" onClick={() => andar(1)} aria-label={semana ? 'Próxima semana' : 'Próximo mês'}>›</button>
            {(dia !== hoje || f.mes) && <button type="button" className="adm-cal-hoje" onClick={() => mudar({ dia: '', mes: '' })}>Hoje</button>}
            <span className="adm-cal-escala" aria-hidden="true">pessoas fora no dia <i style={tom(maior * 0.25)} /><i style={tom(maior * 0.6)} /><i style={tom(maior)} /></span>
            <Segmentos valor={f.vis} onMudar={(vis) => mudar({ vis })}
              opcoes={[{ valor: 'mes', rotulo: 'Mês' }, { valor: 'semana', rotulo: 'Semana' }]} />
          </div>
          <div className="adm-cal-sem">
            {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((s) => (
              <span key={s}>{s}</span>
            ))}
          </div>
          <div className={`adm-cal-grade${semana ? ' semana' : ''}`}>
            {dias.map((d) => {
              const fx = foraEm(d);
              const cls = [
                'adm-cal-dia',
                !semana && d.slice(0, 7) !== mes ? 'fora-mes' : '',
                fimDeSemana(d) ? 'fds' : '',
                d === hoje ? 'hoje' : '',
                d === dia ? 'sel' : '',
              ].filter(Boolean).join(' ');
              return (
                <button key={d} type="button" className={cls} onClick={() => escolher(d)}
                  aria-label={`${nomeDoDia(d)}: ${plural(fx.length, 'pessoa fora', 'pessoas fora')}`} aria-pressed={d === dia}>
                  <span className="n"><b>{semana ? `${DIAS_SEMANA[diaDaSemana(d)]} ${curta(d)}` : Number(d.slice(8))}</b>{fx.length > 0 && <span className="q" style={tom(fx.length)}>{fx.length}</span>}</span>
                  {semana ? (
                    <span className="adm-cal-nomes">
                      {fx.map((x) => (
                        <span key={x.p.id} className="adm-cal-nome">
                          <FotoAus pessoa={x.pessoa} tipo={x.p.tipo} />
                          <span>{x.pessoa.nome.split(' ')[0]}<small>{TIPO_AUSENCIA[x.p.tipo].rotulo}</small></span>
                        </span>
                      ))}
                    </span>
                  ) : fx.length > 0 && <Pilha itens={fx} />}
                </button>
              );
            })}
          </div>
          <div className="adm-cal-rod">
            <div className="adm-leg estatica">
              {TIPOS_AUSENCIA.map((t) => <span key={t.valor}><i style={{ background: t.cor }} />{t.rotulo}</span>)}
            </div>
            <span>a cor do contorno mostra o tipo</span>
          </div>
        </div>

        <aside className="adm-cal-lado">
          <h3>{nomeDoDia(dia)}</h3>
          <p>{doDia.length ? plural(doDia.length, 'pessoa fora', 'pessoas fora') : 'Ninguém fora neste dia'} · clique num dia para ver quem</p>
          {doDia.map(({ p, pessoa }) => (
            <button key={p.id} type="button" className="adm-cal-it" onClick={() => onVerFicha(pessoa)}
              title={p.observacao || undefined}>
              <Avatar nome={pessoa.nome} url={pessoa.fotoUrl} />
              <span className="tx">
                <b>{pessoa.nome}</b>
                <span className="adm-tp"><i style={{ background: TIPO_AUSENCIA[p.tipo].cor }} />{p.tipo === 'falta' || p.tipo === 'licenca' ? p.rotulo : TIPO_AUSENCIA[p.tipo].rotulo}{p.parcial ? ' · meio período' : ''}</span>
              </span>
              <span className="vt">
                {p.inicio === p.fim ? curta(p.inicio) : `${curta(p.inicio)} → ${curta(p.fim)}`}
                <small>{p.inicio === p.fim ? (p.inicio === hoje ? 'hoje' : `${p.dias} dia`) : p.fim < hoje ? `${p.dias} dias` : `volta ${curta(diaDaVolta(p.fim))}`}</small>
              </span>
            </button>
          ))}
        </aside>
      </div>
    </>
  );
}

/* ================================================================ Busca Ctrl K */
function BuscaGlobal({ pessoas, onEscolher }) {
  const [termo, setTermo] = useState('');
  const [aberta, setAberta] = useState(false);
  const [sel, setSel] = useState(0);
  const ref = useRef(null);
  const campo = useRef(null);

  useEffect(() => {
    const tecla = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); campo.current?.focus(); setAberta(true); }
    };
    const clique = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberta(false); };
    document.addEventListener('keydown', tecla);
    document.addEventListener('mousedown', clique);
    return () => { document.removeEventListener('keydown', tecla); document.removeEventListener('mousedown', clique); };
  }, []);

  const t = termo.trim().toLowerCase();
  const achados = t ? pessoas.filter((p) => p.nome.toLowerCase().includes(t) || (p.funcao || '').toLowerCase().includes(t)).slice(0, 8) : [];
  const escolher = (p) => { onEscolher(p); setTermo(''); setAberta(false); campo.current?.blur(); };

  return (
    <div className="adm-busca" ref={ref}>
      {Ico.busca}
      <input
        ref={campo}
        value={termo}
        placeholder="Buscar pessoa…"
        onChange={(e) => { setTermo(e.target.value); setSel(0); setAberta(true); }}
        onFocus={() => setAberta(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, achados.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
          if (e.key === 'Enter' && achados[sel]) escolher(achados[sel]);
          if (e.key === 'Escape') { setAberta(false); e.currentTarget.blur(); }
        }}
      />
      <kbd>Ctrl K</kbd>
      {aberta && t && (
        <div className="adm-busca-res">
          {!achados.length && <div className="adm-pop-vazio">Ninguém com “{termo}”.</div>}
          {achados.map((p, k) => (
            <button key={p.id} type="button" className={k === sel ? 'sel' : ''} onMouseEnter={() => setSel(k)} onClick={() => escolher(p)}>
              <Avatar nome={p.nome} url={p.fotoUrl} tamanho="small" />
              <span><b>{p.nome}</b><small>{p.funcao || '—'} · {rotuloSetor(setorDe(p))}{p.status === 'inativo' ? ' · inativo' : ''}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================== A área inteira */
export function Administrativo({
  pessoas, pessoasTrecho = [], tipos, documentos, pendencias, faltas, ferias, quem, nomeUsuario, cargo,
  podeVerApp, podeEditar, gaveta, gavetaAberta,
  onNovaPessoa, onEditar, onVerFicha, onRegistrarFalta, onRegistrarAtestado,
  onSalvarDocumento, onRemoverDocumento, onSalvarValidade, onRecarregar,
  onVoltarAoApp, onSair,
}) {
  const [f, setF] = useState(() => lerFiltros());
  const [pastaDe, setPastaDe] = useState(null);
  const [importando, setImportando] = useState(false);
  const hoje = isoLocal();

  // Filtros → endereço (replaceState: não enche o "voltar" do navegador).
  useEffect(() => {
    const novo = `${window.location.pathname}${escreverFiltros(f)}`;
    if (novo !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(window.history.state, '', novo);
  }, [f]);
  const mudar = useCallback((patch) => setF((atual) => ({ ...atual, ...patch })), []);

  const todas = useMemo(() => [...pessoas, ...pessoasTrecho].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), [pessoas, pessoasTrecho]);
  const todasPorId = useMemo(() => Object.fromEntries(todas.map((p) => [p.id, p])), [todas]);
  const noSetor = useMemo(() => (f.setor ? todas.filter((p) => setorDe(p) === f.setor) : todas), [todas, f.setor]);
  const noSetorPorId = useMemo(() => Object.fromEntries(noSetor.map((p) => [p.id, p])), [noSetor]);

  const contagem = useMemo(() => {
    const m = { '': 0 };
    todas.filter((p) => p.status !== 'inativo').forEach((p) => { m[''] += 1; m[setorDe(p)] = (m[setorDe(p)] || 0) + 1; });
    return m;
  }, [todas]);

  const resumos = useMemo(() => {
    const docsPorPessoa = {};
    (documentos || []).forEach((d) => {
      if (d.tipo_id && todasPorId[d.colaboradorId]) (docsPorPessoa[d.colaboradorId] ||= {})[d.tipo_id] = d;
    });
    return Object.fromEntries(todas.map((p) => [p.id, resumoPasta(tipos, p, docsPorPessoa[p.id] || {})]));
  }, [todas, todasPorId, documentos, tipos]);
  const situacoes = useMemo(
    () => Object.fromEntries(todas.map((p) => [p.id, situacaoDaPessoa(resumos[p.id], hoje)])),
    [todas, resumos, hoje]
  );

  const periodos = useMemo(
    () => agruparAusencias(faltas || [], ferias || []).filter((p) => todasPorId[p.pessoaId]),
    [faltas, ferias, todasPorId]
  );
  // Ausência que aparece na aba Pessoas: a de agora, ou a próxima nos 30 dias.
  const ausenciaDe = useMemo(() => {
    const m = {};
    const limite = somaDias(hoje, 30);
    periodos.forEach((p) => {
      const agora = foraNoDia(p, hoje);
      const breve = p.inicio > hoje && p.inicio <= limite;
      if (!agora && !breve) return;
      const atual = m[p.pessoaId];
      if (!atual || (agora && !atual.agora) || (agora === atual.agora && p.inicio < atual.periodo.inicio)) m[p.pessoaId] = { periodo: p, agora };
    });
    return m;
  }, [periodos, hoje]);

  const nUrgentes = pendencias.filter((p) => p.urgencia <= 2 && todasPorId[p.colaborador_id]
    && todasPorId[p.colaborador_id].status !== 'inativo').length;
  const nAusentes = new Set(periodos.filter((p) => foraNoDia(p, hoje)).map((p) => p.pessoaId)).size;
  const pessoaDaPasta = pastaDe ? todasPorId[pastaDe] : null;

  function irPara(aba) { mudar({ aba }); setPastaDe(null); setImportando(false); }
  function irParaSetor(setor) { mudar({ setor }); setPastaDe(null); setImportando(false); }

  const setores = [{ valor: '', rotulo: 'Todos' }, ...SETORES.filter((s) => s.valor !== 'trecho'), SETORES.find((s) => s.valor === 'trecho')]
    .filter((s) => s.valor === '' || contagem[s.valor] || f.setor === s.valor);

  let corpo;
  if (pessoaDaPasta) {
    corpo = (
      <FichaDocumentos colaborador={pessoaDaPasta} tipos={tipos} documentos={documentos} quem={quem}
        onRecarregar={onRecarregar} onSalvarValidade={onSalvarValidade} onVoltar={() => setPastaDe(null)} />
    );
  } else if (importando) {
    corpo = (
      <ImportacaoEmMassa colaboradores={noSetor.filter((p) => p.status !== 'inativo')} tipos={tipos} documentos={documentos}
        onSalvar={onSalvarDocumento} onRemover={onRemoverDocumento} onSair={() => setImportando(false)} />
    );
  } else if (f.aba === 'documentos') {
    corpo = (
      <AbaDocumentos pessoas={noSetor} pessoasPorId={noSetorPorId} resumos={resumos} pendencias={pendencias} tipos={tipos}
        f={f} mudar={mudar} podeImportar={podeEditar && tipos.length > 0} onImportar={() => setImportando(true)}
        onAbrirPasta={setPastaDe} onVerFicha={onVerFicha} />
    );
  } else if (f.aba === 'ausencias') {
    corpo = (
      <AbaAusencias pessoas={noSetor} pessoasPorId={noSetorPorId} periodos={periodos} f={f} mudar={mudar} hoje={hoje}
        podeLancarFalta={podeEditar && f.setor !== 'trecho'} podeLancarAtestado={podeEditar && Boolean(onRegistrarAtestado)}
        onRegistrarFalta={onRegistrarFalta} onRegistrarAtestado={onRegistrarAtestado} onVerFicha={onVerFicha} />
    );
  } else {
    corpo = (
      <AbaPessoas pessoas={noSetor} resumos={resumos} situacoes={situacoes} ausenciaDe={ausenciaDe} pendencias={pendencias}
        f={f} mudar={mudar} hoje={hoje} podeEditar={podeEditar} setor={f.setor}
        onNova={onNovaPessoa} onAbrirPasta={setPastaDe} onVerFicha={onVerFicha} onEditar={onEditar} />
    );
  }

  const nomeCurto = (nomeUsuario || '').split(/[\s@]/)[0];

  return (
    <div className="adm-shell">
      <header className="adm-top">
        <div className="adm-marca">
          <img src="/icon-192.png" alt="" className="logo" />
          <b>Incovia</b>
          <span>Administrativo</span>
        </div>
        <nav className="adm-abas">
          <button type="button" className={f.aba === 'pessoas' ? 'on' : ''} onClick={() => irPara('pessoas')}>
            {Ico.pessoas}Pessoas<em>{contagem['']}</em>
          </button>
          <button type="button" className={f.aba === 'documentos' ? 'on' : ''} onClick={() => irPara('documentos')}>
            {Ico.docs}Documentos{nUrgentes > 0 && <i>{nUrgentes}</i>}
          </button>
          <button type="button" className={f.aba === 'ausencias' ? 'on' : ''} onClick={() => irPara('ausencias')}>
            {Ico.aus}Ausências{nAusentes > 0 && <em>{nAusentes} hoje</em>}
          </button>
        </nav>
        <BuscaGlobal pessoas={todas} onEscolher={onVerFicha} />
        <div className="adm-user">
          {nomeCurto && (
            <span className="eu">
              <Avatar nome={nomeUsuario.replace(/\(.*?\)/g, '')} tamanho="small" />
              <span><b>{nomeCurto}</b>{ROTULO_CARGO[cargo] && <small>{ROTULO_CARGO[cargo]}</small>}</span>
            </span>
          )}
          {podeVerApp && <button type="button" onClick={onVoltarAoApp}>App do trecho</button>}
          <button type="button" onClick={onSair}>Sair</button>
        </div>
      </header>

      <div className="adm-contexto">
        <div className="adm-setores" role="tablist" aria-label="Setor">
          {setores.map((s) => (
            <button key={s.valor || 'todos'} type="button" role="tab" aria-selected={f.setor === s.valor}
              className={f.setor === s.valor ? 'on' : ''} onClick={() => irParaSetor(s.valor)}>
              {s.valor && <span className="ponto" style={{ background: COR_SETOR[s.valor] }} />}
              {s.rotulo}<b>{contagem[s.valor] || 0}</b>
            </button>
          ))}
        </div>
        {(f.setor || JSON.stringify({ ...f, aba: FILTROS_PADRAO.aba }) !== JSON.stringify(FILTROS_PADRAO)) && (
          <button type="button" className="adm-reset" onClick={() => { setF({ ...FILTROS_PADRAO, aba: f.aba }); setPastaDe(null); setImportando(false); }}>
            Tirar todos os filtros
          </button>
        )}
      </div>

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
