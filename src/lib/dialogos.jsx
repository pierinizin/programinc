import { useEffect, useState } from 'react';

/* =============================================================================
   SUBSTITUTO DO alert()/confirm() NATIVO DO NAVEGADOR
   -----------------------------------------------------------------------------
   Dois modelos, dois trabalhos diferentes — foi o que ficou combinado depois
   de mostrar quatro opções:

   - confirmar()  → MODELO 2 ("faixa de sinalização"): trava a tela, pede um
     clique. É para decisão que muda dado — excluir, juntar, apagar. Devolve
     uma Promise<boolean>, então quem chama continua escrevendo
     "if (!(await confirmar(...))) return" exatamente como fazia com
     "if (!confirm(...)) return".

   - notificar()  → MODELO 4 ("notificação no canto"): não trava nada, some
     sozinha. É para o que hoje é só um alert() informativo — sucesso, erro
     de validação, aviso de permissão. Não devolve nada: o código já não
     olhava o retorno do alert() mesmo.

   POR QUE NÃO É CONTEXTO REACT. O App.jsx é um componente só, gigante, com
   dezenas de funções que hoje chamam alert()/confirm() de qualquer lugar —
   inclusive fora de handlers de evento, em cadeias de await. Um Context
   exigiria useContext em cada uma, ou passar as duas funções por parâmetro
   feito mais dois props artificiais. Um pequeno pub/sub por módulo (mesma
   ideia do "fetchDatabaseRef" que o app já usa) deixa confirmar()/notificar()
   chamáveis de QUALQUER função, igual ao alert() que estão substituindo —
   só precisa existir um <DialogosHost /> montado uma vez, em algum lugar da
   árvore.
   ============================================================================= */

let ouvintes = [];
let seq = 0;

function emitir(evento) {
  ouvintes.forEach((fn) => fn(evento));
}

/**
 * Pergunta e trava até responder. `variante` pinta a faixa e o ícone:
 * 'perigo' (vermelho — excluir, apagar, ações que não voltam) ou
 * 'atencao' (amarelo — confirmações que não destroem nada).
 */
export function confirmar({
  titulo, mensagem, textoConfirmar = 'Confirmar', textoCancelar = 'Cancelar', variante = 'perigo',
}) {
  return new Promise((resolve) => {
    emitir({
      tipo: 'confirmar', id: ++seq, titulo, mensagem, textoConfirmar, textoCancelar, variante, resolve,
    });
  });
}

/**
 * Avisa e some sozinha. `variante`: 'sucesso' (verde), 'erro' (vermelho) ou
 * 'atencao' (amarelo — pendência, validação de formulário).
 */
export function notificar({ titulo, mensagem, variante = 'sucesso', duracao = 5000 }) {
  emitir({
    tipo: 'notificar', id: ++seq, titulo, mensagem, variante, duracao,
  });
}

const ICONE = { perigo: '!', atencao: '!', sucesso: '✓', erro: '✕' };

export function DialogosHost() {
  const [confirmacao, setConfirmacao] = useState(null);
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const ouvinte = (evento) => {
      if (evento.tipo === 'confirmar') {
        setConfirmacao(evento);
      } else if (evento.tipo === 'notificar') {
        setToasts((atual) => [...atual, evento]);
        // duracao <= 0 deixa a notificação presa até o × — reservado para o
        // dia em que algum aviso precisar disso; nenhum uso atual passa isso.
        if (evento.duracao > 0) {
          setTimeout(() => {
            setToasts((atual) => atual.filter((t) => t.id !== evento.id));
          }, evento.duracao);
        }
      }
    };
    ouvintes.push(ouvinte);
    return () => { ouvintes = ouvintes.filter((f) => f !== ouvinte); };
  }, []);

  function responder(valor) {
    confirmacao?.resolve(valor);
    setConfirmacao(null);
  }

  function fecharToast(id) {
    setToasts((atual) => atual.filter((t) => t.id !== id));
  }

  return (
    <>
      {confirmacao && (
        <div className="dlg-overlay" onClick={() => responder(false)}>
          <div
            className={`dlg-confirmar dlg-${confirmacao.variante}`}
            role="alertdialog"
            aria-modal="true"
            aria-label={confirmacao.titulo}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dlg-faixa" />
            <div className="dlg-corpo">
              <div className="dlg-diamante">
                <span>{ICONE[confirmacao.variante]}</span>
              </div>
              <h3>{confirmacao.titulo}</h3>
              {confirmacao.mensagem && <p>{confirmacao.mensagem}</p>}
              <div className="dlg-acoes">
                <button type="button" className="ghost-btn" onClick={() => responder(false)}>
                  {confirmacao.textoCancelar}
                </button>
                <button
                  type="button"
                  className={confirmacao.variante === 'perigo' ? 'danger-btn' : 'primary-btn'}
                  onClick={() => responder(true)}
                  autoFocus
                >
                  {confirmacao.textoConfirmar}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toasts.length > 0 && (
        <div className="toast-canto" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast toast-${t.variante}`}>
              <span className="toast-icone" aria-hidden="true">{ICONE[t.variante]}</span>
              <div className="toast-txt">
                {t.titulo && <h4>{t.titulo}</h4>}
                {t.mensagem && <p>{t.mensagem}</p>}
              </div>
              <button type="button" className="toast-x" aria-label="Fechar" onClick={() => fecharToast(t.id)}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
