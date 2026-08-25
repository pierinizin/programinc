import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';

const root = ReactDOM.createRoot(document.getElementById('root'));

// Import dinâmico de propósito: se qualquer coisa estourar durante o
// carregamento do app (falta de variável de ambiente, erro de sintaxe, import
// quebrado), o React nem chega a montar e a página fica BRANCA, com o erro
// escondido no console. Aqui a falha vira uma tela legível.
function TelaDeErro({ erro }) {
  const mensagem = String(erro?.message || erro || 'Erro desconhecido');
  const faltaConfig = /Configuração ausente|supabaseUrl|supabaseKey/i.test(mensagem);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: '#f8fafc',
        fontFamily: 'Inter, system-ui, Arial, sans-serif',
        color: '#0f172a',
      }}
    >
      <div
        style={{
          maxWidth: '640px',
          width: '100%',
          background: '#fff',
          borderRadius: '16px',
          padding: '32px',
          boxShadow: '0 10px 30px rgba(15,23,42,.08)',
          border: '1px solid #e2e8f0',
        }}
      >
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚠️</div>
        <h1 style={{ fontSize: '20px', margin: '0 0 12px' }}>
          O Incovia não conseguiu iniciar
        </h1>

        {faltaConfig ? (
          <>
            <p style={{ margin: '0 0 16px', lineHeight: 1.6 }}>
              Faltam as credenciais do Supabase. Crie o arquivo{' '}
              <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                .env.local
              </code>{' '}
              na raiz do projeto com as duas linhas abaixo e reinicie o{' '}
              <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                npm run dev
              </code>
              :
            </p>
            <pre
              style={{
                background: '#0f172a',
                color: '#e2e8f0',
                padding: '16px',
                borderRadius: '10px',
                overflowX: 'auto',
                fontSize: '13px',
                lineHeight: 1.6,
              }}
            >
{`VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=cole-a-chave-aqui`}
            </pre>
            <p style={{ margin: '16px 0 0', lineHeight: 1.6, color: '#475569', fontSize: '14px' }}>
              Os dois valores estão no painel do Supabase, em{' '}
              <strong>Project Settings → API</strong>. Na Vercel, as mesmas variáveis
              ficam em <strong>Settings → Environment Variables</strong>.
            </p>
          </>
        ) : (
          <p style={{ margin: '0 0 16px', lineHeight: 1.6 }}>
            Ocorreu um erro ao carregar a aplicação. A mensagem técnica está abaixo.
          </p>
        )}

        <details style={{ marginTop: '20px' }}>
          <summary style={{ cursor: 'pointer', color: '#64748b', fontSize: '14px' }}>
            Detalhes técnicos
          </summary>
          <pre
            style={{
              background: '#f1f5f9',
              padding: '12px',
              borderRadius: '8px',
              overflowX: 'auto',
              fontSize: '12px',
              marginTop: '8px',
              whiteSpace: 'pre-wrap',
            }}
          >
            {mensagem}
          </pre>
        </details>
      </div>
    </div>
  );
}

import('./App')
  .then(({ default: App }) => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  })
  .catch((erro) => {
    console.error('Falha ao iniciar o Incovia:', erro);
    root.render(<TelaDeErro erro={erro} />);
  });
