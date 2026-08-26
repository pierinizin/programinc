import { useMemo, useRef, useState } from 'react';
import { lerArquivo, conciliar, agruparResumo, dataBR, texto } from '../lib/kartado';
import { exportarBoletim } from '../lib/boletimXlsx';

const GRAU = {
  alta: ['Certeza alta', 'grau-alta'],
  media: ['Certeza média', 'grau-media'],
  nenhuma: ['Sem correspondência', 'grau-nenhuma'],
};

function nf(n, casas = 0) {
  return Number(n || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: casas, maximumFractionDigits: casas,
  });
}

export function Apontamentos({ db, maps, podeEditar, onLancar, onDesfazer }) {
  const [arquivo, setArquivo] = useState(null);
  const [aps, setAps] = useState([]);
  const [avisos, setAvisos] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [escolhendo, setEscolhendo] = useState(null); // serial em escolha manual
  const [ignorados, setIgnorados] = useState({});
  const inputRef = useRef(null);

  const propostas = useMemo(
    () => (aps.length ? conciliar(aps, db.programacoes, maps.colaboradores) : []),
    [aps, db.programacoes, maps.colaboradores]
  );

  const resumo = useMemo(() => agruparResumo(aps), [aps]);

  // Serial -> programação que já registrou este apontamento. É a fonte da
  // verdade: vem do banco, não do estado local da tela.
  const lancados = useMemo(() => {
    const m = {};
    db.programacoes.forEach((p) => {
      (p.apontamentoSeriais || []).forEach((s) => { m[s] = p; });
    });
    return m;
  }, [db.programacoes]);

  const totais = useMemo(() => ({
    n: aps.length,
    area: aps.reduce((s, a) => s + a.area, 0),
    ext: aps.reduce((s, a) => s + a.ext, 0),
    servicos: aps.reduce((s, a) => s + a.servicos.length, 0),
    dias: new Set(aps.map((a) => a.data).filter(Boolean)).size,
    pendentes: aps.filter((a) => !lancados[a.serial] && !ignorados[a.serial]).length,
  }), [aps, lancados, ignorados]);

  async function carregar(f) {
    if (!f) return;
    setCarregando(true);
    setErro('');
    try {
      const { aps: lidos, avisos: av } = await lerArquivo(f);
      if (!lidos.length) {
        setErro('Não encontrei apontamentos neste arquivo. Confira se é o export do Kartado.');
        setAps([]);
      } else {
        setAps(lidos);
        setArquivo(f.name);
        setAvisos(av);
      }
    } catch (e) {
      console.error(e);
      setErro(`Não consegui ler o arquivo: ${e.message}`);
    }
    setCarregando(false);
  }

  async function exportar() {
    const mapa = {};
    Object.entries(lancados).forEach(([serial, prog]) => {
      mapa[serial] = `${prog.tipoEquipe} · ${prog.cidade}`;
    });
    try {
      await exportarBoletim(aps, arquivo || 'kartado.xlsx', mapa);
    } catch (e) {
      console.error(e);
      alert(`Não consegui gerar o Excel: ${e.message}`);
    }
  }

  const altasPendentes = propostas.filter(
    (p) => p.certeza === 'alta' && p.prog && !lancados[p.ap.serial] && !ignorados[p.ap.serial]
  );

  async function lancarTodas() {
    if (!altasPendentes.length) return;
    if (!confirm(`Marcar ${altasPendentes.length} apontamento(s) de certeza alta como lançados?`)) return;
    for (const p of altasPendentes) {
      // sequencial de propósito: cada um é um update, e um erro no meio
      // não deve deixar metade marcada sem você saber
      await onLancar(p.prog, p.ap);
    }
  }

  /* ------------------------------ importação ------------------------------ */
  if (!aps.length) {
    return (
      <div className="ap-vazio">
        <div className="ap-solta"
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('sobre'); }}
          onDragLeave={(e) => e.currentTarget.classList.remove('sobre')}
          onDrop={(e) => {
            e.preventDefault();
            e.currentTarget.classList.remove('sobre');
            carregar(e.dataTransfer.files?.[0]);
          }}
        >
          <strong>Arraste o arquivo do Kartado aqui</strong>
          <span className="small-muted">
            O export de apontamentos em .xlsx. Aceita Pintura Manual, Mecânica,
            Tachas e os ensaios — o formato de cada natureza é reconhecido sozinho.
          </span>
          <button
            className="primary-btn"
            disabled={carregando}
            onClick={() => inputRef.current?.click()}
          >
            {carregando ? 'Lendo…' : 'Escolher arquivo'}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={(e) => carregar(e.target.files?.[0])}
          />
          {erro && <p className="ap-erro">{erro}</p>}
        </div>
      </div>
    );
  }

  /* ------------------------------ carregado ------------------------------ */
  return (
    <div className="ap-tela">
      <div className="ap-barra">
        <div>
          <strong>{arquivo}</strong>
          <span className="small-muted">
            {totais.n} apontamento{totais.n === 1 ? '' : 's'} · {totais.servicos} serviços ·{' '}
            {totais.dias} dia{totais.dias === 1 ? '' : 's'}
            {totais.pendentes > 0 && ` · ${totais.pendentes} aguardando conciliação`}
          </span>
        </div>
        <div className="chips-row tight">
          <button className="ghost-btn" onClick={() => inputRef.current?.click()}>Trocar arquivo</button>
          <button className="primary-btn" onClick={exportar}>Exportar boletim (.xlsx)</button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: 'none' }}
          onChange={(e) => carregar(e.target.files?.[0])}
        />
      </div>

      {avisos.length > 0 && (
        <div className="ap-avisos">
          {avisos.map((a, i) => <div key={i}>{a}</div>)}
        </div>
      )}

      <div className="stats-grid three">
        <div className="stat-card">
          <strong>{nf(totais.area, 2)}</strong>
          <span>m² executados</span>
        </div>
        <div className="stat-card">
          <strong>{nf(totais.ext, 1)}</strong>
          <span>metros de faixa</span>
        </div>
        <div className="stat-card subtle">
          <strong>{totais.servicos}</strong>
          <span>Serviços</span>
        </div>
      </div>

      {/* ---------------- resumo ---------------- */}
      <div className="card ap-card">
        <div className="card-header between">
          <h3>Resumo por encarregado</h3>
          <span className="small-muted">{resumo.length} frente{resumo.length === 1 ? '' : 's'}</span>
        </div>
        <div className="ap-tabela-rolo">
          <table className="ap-tabela">
            <thead>
              <tr>
                <th>Encarregado</th>
                <th>Local de obra</th>
                <th className="num">Apont.</th>
                <th className="num">Serviços</th>
                <th className="num">m²</th>
                <th className="num">Extensão</th>
                <th>Conciliação</th>
              </tr>
            </thead>
            <tbody>
              {resumo.map((g) => {
                const feitos = g.seriais.filter((s) => lancados[s]).length;
                return (
                  <tr key={g.encarregado + g.local}>
                    <td className="forte">{g.encarregado}</td>
                    <td>{g.local}</td>
                    <td className="num">{g.n}</td>
                    <td className="num">{g.servicos}</td>
                    <td className="num">{nf(g.area, 2)}</td>
                    <td className="num">{nf(g.ext, 1)} m</td>
                    <td>
                      {feitos === g.n
                        ? <span className="tag success">{feitos} lançado{feitos === 1 ? '' : 's'}</span>
                        : <span className="tag aten">{g.n - feitos} aguardando</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------------- conciliação ---------------- */}
      <div className="card ap-card">
        <div className="card-header between">
          <div>
            <h3>Conciliação</h3>
            <p className="small-muted" style={{ margin: 0 }}>
              O sistema propõe a equipe e você confirma. Nada é marcado sozinho.
            </p>
          </div>
          {podeEditar && altasPendentes.length > 0 && (
            <button className="ghost-btn" onClick={lancarTodas}>
              Confirmar {altasPendentes.length} de certeza alta
            </button>
          )}
        </div>

        <div className="ap-lista">
          {propostas.map((p) => {
            const { ap, prog, certeza, provas, alternativas } = p;
            const jaLancado = lancados[ap.serial];
            const ignorado = ignorados[ap.serial];
            const [rotulo, classe] = GRAU[certeza];

            return (
              <div
                key={ap.serial}
                className={`ap-linha ${classe}${jaLancado || ignorado ? ' resolvida' : ''}`}
              >
                <div className="ap-linha-topo">
                  <span className="ap-serial">{ap.serial}</span>
                  <span className="ap-meta">
                    {ap.natureza}{ap.tipo ? ` · ${ap.tipo}` : ''} · {dataBR(ap.data)} ·{' '}
                    {nf(ap.area, 2)} m² · {ap.servicos.length} serviço{ap.servicos.length === 1 ? '' : 's'}
                  </span>
                  {!jaLancado && !ignorado && <span className={`selo ${classe}`}>{rotulo}</span>}
                </div>

                {jaLancado ? (
                  <div className="ap-frase">
                    Lançado na equipe <b>{jaLancado.tipoEquipe}</b> de{' '}
                    <span className="kv">{jaLancado.cidade}</span>, em{' '}
                    <span className="kv">{dataBR(jaLancado.data)}</span>.
                  </div>
                ) : (
                  <div className="ap-frase">
                    {prog ? (
                      <>
                        Identifiquei que a equipe <b>{prog.tipoEquipe}</b>, com o encarregado{' '}
                        <span className="kv">{texto(ap.encarregado)}</span>, executou este serviço em{' '}
                        <span className="kv">{prog.cidade}</span> no dia{' '}
                        <span className="kv">{dataBR(ap.data)}</span>.
                      </>
                    ) : (
                      <>
                        <b>Não encontrei</b> programação correspondente. O encarregado
                        registrado no Kartado é <span className="kv">{texto(ap.encarregado) || '—'}</span>,
                        no local <span className="kv">{texto(ap.localObra) || '—'}</span>.
                      </>
                    )}
                    <div className="ap-provas">
                      {provas.map((pr, k) => (
                        <span key={k} className={`ap-prova ${pr[0]}`}>{pr[1]}</span>
                      ))}
                    </div>
                  </div>
                )}

                {escolhendo === ap.serial ? (
                  <div className="ap-escolha">
                    <span className="input-label">Escolha a equipe deste apontamento</span>
                    <div className="ap-opcoes">
                      {alternativas.length === 0 && (
                        <span className="small-muted">
                          Não há nenhuma programação em {dataBR(ap.data)}. Crie a equipe
                          no quadro daquele dia e volte aqui.
                        </span>
                      )}
                      {alternativas.map((alt) => (
                        <button
                          key={alt.id}
                          className="ghost-btn"
                          onClick={() => { setEscolhendo(null); onLancar(alt, ap); }}
                        >
                          {alt.tipoEquipe} · {alt.cidade}
                          {alt.encarregadoId && maps.colaboradores[alt.encarregadoId]
                            ? ` · ${maps.colaboradores[alt.encarregadoId].nome}`
                            : ''}
                        </button>
                      ))}
                      <button className="chip-btn" onClick={() => setEscolhendo(null)}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div className="ap-acoes">
                    {jaLancado ? (
                      <>
                        <span className="ap-resultado ok">✓ Apontamento lançado</span>
                        {podeEditar && (
                          <button className="chip-btn" onClick={() => onDesfazer(jaLancado, ap)}>
                            Desfazer
                          </button>
                        )}
                      </>
                    ) : ignorado ? (
                      <>
                        <span className="ap-resultado neutro">— Ignorado</span>
                        <button
                          className="chip-btn"
                          onClick={() => setIgnorados((s) => ({ ...s, [ap.serial]: false }))}
                        >
                          Desfazer
                        </button>
                      </>
                    ) : podeEditar ? (
                      <>
                        {prog && (
                          <button
                            className={certeza === 'alta' ? 'primary-btn' : 'ghost-btn'}
                            onClick={() => onLancar(prog, ap)}
                          >
                            Marcar como apontamento lançado
                          </button>
                        )}
                        <button className="ghost-btn" onClick={() => setEscolhendo(ap.serial)}>
                          {prog ? 'Não é essa equipe' : 'Escolher a equipe'}
                        </button>
                        <button
                          className="chip-btn"
                          onClick={() => setIgnorados((s) => ({ ...s, [ap.serial]: true }))}
                        >
                          Ignorar
                        </button>
                      </>
                    ) : (
                      <span className="small-muted">Somente editores e administradores podem lançar.</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
