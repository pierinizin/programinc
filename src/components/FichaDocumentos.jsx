import { useMemo, useRef, useState } from 'react';
import { Avatar } from './Avatar';
import {
  tiposDaPessoa, dataISO, dataBR, sugerirValidade, situacaoDoc as situacaoDe,
} from '../lib/documentos';
import {
  enviarArquivo, abrirArquivo, removerArquivo, validarArquivo, marcarDispensado,
} from '../lib/arquivosDoc';
import { confirmar } from '../lib/dialogos';

/* =============================================================================
   A pasta de uma pessoa
   -----------------------------------------------------------------------------
   A Importação em massa responde "o que existe e quando vence". Esta tela
   responde a outra pergunta, a que aparece quando o fiscal está na sua frente:
   "cadê o papel do Fulano?".

   Por isso ela é por pessoa e não por documento — é assim que a cobrança chega.
   E por isso o anexo mora aqui, e não no mutirão: parar a conferência para
   abrir a janela de arquivos a cada linha destruiria o ritmo do teclado, que é
   o que faz 47 pessoas caberem numa tarde.
   ============================================================================= */

export function FichaDocumentos({
  colaborador, tipos, documentos, quem, onRecarregar, onSalvarValidade, onVoltar,
}) {
  const [ocupado, setOcupado] = useState(null);   // tipo_id em operação
  const [erro, setErro] = useState('');
  const [rascunho, setRascunho] = useState({});
  const [arrastando, setArrastando] = useState(null);   // tipo_id sob o arquivo
  const inputs = useRef({});
  const contadorArrasto = useRef({});   // dragenter/dragleave disparam nos filhos também
  const hoje = new Date().toISOString().slice(0, 10);

  const linhas = useMemo(
    () => tiposDaPessoa(tipos, colaborador),
    [tipos, colaborador]
  );

  const docs = useMemo(() => {
    const m = {};
    (documentos || []).forEach((d) => {
      if (d.colaboradorId === colaborador.id && d.tipo_id) m[d.tipo_id] = d;
    });
    return m;
  }, [documentos, colaborador.id]);

  const comArquivo = linhas.filter((t) => docs[t.id]?.caminho).length;
  const dispensados = linhas.filter((t) => docs[t.id]?.dispensado).length;
  const resolvidos = comArquivo + dispensados;

  async function anexar(tipo, arquivo) {
    const problema = validarArquivo(arquivo);
    if (problema) { setErro(problema); return; }
    setErro('');
    setOcupado(tipo.id);
    try {
      // Um documento que vence e chega sem data entraria como alarme mudo:
      // fica no sistema, mas nunca avisa. Sugere, e a pessoa corrige na linha.
      const doc = docs[tipo.id];
      const validoAte = doc?.valido_ate
        || (tipo.vence ? dataISO(sugerirValidade(tipo)) : null);
      await enviarArquivo({
        arquivo, colaborador, tipo, existente: doc, validoAte, quem,
      });
      await onRecarregar();
    } catch (e) {
      setErro(e.message || 'Não consegui enviar o arquivo.');
    }
    setOcupado(null);
  }

  /* Arrastar substitui o clique em "Anexar"/"Trocar", nunca o exige: quem
     prefere abrir a janela de arquivos continua podendo. dragenter/dragleave
     disparam de novo a cada filho sobrevoado (span, botão, input) — um
     contador por linha evita que a tarja pisque enquanto o mouse passeia
     por dentro dela. */
  function aoEntrarArrasto(id) {
    contadorArrasto.current[id] = (contadorArrasto.current[id] || 0) + 1;
    setArrastando(id);
  }
  function aoSairArrasto(id) {
    contadorArrasto.current[id] = Math.max(0, (contadorArrasto.current[id] || 0) - 1);
    if (contadorArrasto.current[id] === 0) {
      setArrastando((atual) => (atual === id ? null : atual));
    }
  }
  function aoSoltarArquivo(e, tipo, emUso) {
    e.preventDefault();
    contadorArrasto.current[tipo.id] = 0;
    setArrastando((atual) => (atual === tipo.id ? null : atual));
    if (emUso) return;
    const arquivo = e.dataTransfer.files?.[0];
    if (arquivo) anexar(tipo, arquivo);
  }

  async function abrir(tipo) {
    setErro('');
    try {
      await abrirArquivo(docs[tipo.id], quem);
    } catch (e) {
      setErro(e.message || 'Não consegui abrir o arquivo.');
    }
  }

  /* A chavinha: "esta pessoa não precisa deste documento". Sem ela, quem não
     tem CNH categoria E, por exemplo, nunca chega a "Finalizado" — a pasta
     fica marcada como falta para sempre, mesmo em dia com tudo que de fato
     se aplica. Ligar não pede motivo (decisão já tomada): quem marcou está
     na tela e assina o próprio clique. */
  async function alternarDispensado(tipo, doc, ligar) {
    setErro('');
    setOcupado(tipo.id);
    try {
      await marcarDispensado({
        colaborador, tipo, existente: doc, dispensado: ligar, quem,
      });
      await onRecarregar();
    } catch (e) {
      setErro(e.message || 'Não consegui salvar essa marcação.');
    }
    setOcupado(null);
  }

  async function desanexar(tipo) {
    const doc = docs[tipo.id];
    if (!doc?.caminho) return;
    if (!(await confirmar({
      titulo: `Tirar o arquivo de "${tipo.nome}"?`,
      mensagem: 'A validade continua registrada — só o PDF sai.',
      textoConfirmar: 'Tirar',
      variante: 'atencao',
    }))) return;
    setErro('');
    setOcupado(tipo.id);
    try {
      await removerArquivo(doc, quem);
      await onRecarregar();
    } catch (e) {
      setErro(e.message || 'Não consegui desanexar.');
    }
    setOcupado(null);
  }

  return (
    <div className="pasta">
      <div className="pasta-topo">
        <Avatar nome={colaborador.nome} url={colaborador.fotoUrl} tamanho="big" />
        <span className="mut-nome">
          <b>{colaborador.nome}</b>
          <i>{colaborador.funcao}</i>
        </span>
        <span className="mut-contador">
          <b>{resolvidos} / {linhas.length}</b>
          <i>
            resolvidos
            {dispensados ? ` · ${dispensados} não ${dispensados === 1 ? 'se aplica' : 'se aplicam'}` : ''}
          </i>
        </span>
        <button type="button" className="ghost-btn" onClick={onVoltar}>Voltar</button>
      </div>

      {erro && <div className="mut-erro">{erro}</div>}

      <div
        className="pasta-lista"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => e.preventDefault()}
      >
        {linhas.map((t) => {
          const doc = docs[t.id];
          const [classe, texto] = situacaoDe(t, doc, hoje);
          const emUso = ocupado === t.id;
          const sobre = arrastando === t.id;
          const dispensadoAtivo = !!doc?.dispensado;
          const valor = rascunho[t.id] ?? dataBR(doc?.valido_ate) ?? '';

          return (
            <div
              key={t.id}
              className={`plinha s-${classe}${emUso ? ' salvando' : ''}${sobre ? ' sobre' : ''}`}
              onDragEnter={(e) => { e.preventDefault(); aoEntrarArrasto(t.id); }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={() => aoSairArrasto(t.id)}
              onDrop={(e) => aoSoltarArquivo(e, t, emUso)}
            >
              <span className="pnome">
                {sobre ? 'Solte para anexar' : t.nome}
                <i className={`psit s-${classe}`}>{texto}</i>
              </span>

              <input
                className="dt"
                type="text"
                inputMode="numeric"
                placeholder={t.vence ? 'dd/mm/aaaa' : '—'}
                value={valor}
                disabled={!t.vence || !doc}
                onChange={(e) => setRascunho((r) => ({ ...r, [t.id]: e.target.value }))}
                onBlur={(e) => {
                  if (!doc) return;
                  const iso = dataISO(e.target.value);
                  if (e.target.value && !iso) { setErro(`Data inválida em ${t.nome}.`); return; }
                  if ((doc.valido_ate || '') === (iso || '')) return;
                  onSalvarValidade(doc, iso || null);
                }}
              />

              <span className="pacoes">
                {doc?.caminho ? (
                  <>
                    <button
                      type="button" className="chip-btn"
                      onClick={() => abrir(t)}
                      title={doc.nome_arquivo || 'Abrir arquivo'}
                    >
                      Abrir
                    </button>
                    <button
                      type="button" className="chip-btn"
                      disabled={emUso}
                      onClick={() => inputs.current[t.id]?.click()}
                    >
                      Trocar
                    </button>
                    <button
                      type="button" className="chip-btn perigo"
                      disabled={emUso}
                      onClick={() => desanexar(t)}
                    >
                      Tirar
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      /* Botão neutro de propósito: numa pasta recém-aberta são
                         doze "Anexar" na tela, e doze botões amarelos viram um
                         muro em que nada se destaca. A cor de estado está na
                         tarja da linha, que é o que se lê primeiro. */
                      type="button" className="chip-btn"
                      disabled={emUso}
                      onClick={() => inputs.current[t.id]?.click()}
                    >
                      {emUso ? 'Enviando…' : 'Anexar'}
                    </button>
                    <label
                      className={`chavinha${dispensadoAtivo ? ' on' : ''}`}
                      title="Este colaborador não precisa deste documento"
                    >
                      <input
                        type="checkbox"
                        checked={dispensadoAtivo}
                        disabled={emUso}
                        onChange={(e) => alternarDispensado(t, doc, e.target.checked)}
                      />
                      <span className="trilho"><span className="bolinha" /></span>
                      <span className="chavinha-rotulo">Não se aplica</span>
                    </label>
                  </>
                )}

                <input
                  ref={(el) => { inputs.current[t.id] = el; }}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';   // permite reenviar o mesmo arquivo
                    if (f) anexar(t, f);
                  }}
                />
              </span>
            </div>
          );
        })}
      </div>

      <div className="pasta-pe">
        Arquivos abrem por um link temporário de 60 segundos e todo acesso fica
        registrado — exigência de LGPD para RG, ASO e atestado.
      </div>
    </div>
  );
}
