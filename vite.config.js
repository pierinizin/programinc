import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * O App entra por import dinâmico (main.jsx faz isso de propósito, para que uma
 * falha de carregamento vire tela de erro em vez de página branca). O preço
 * disso é uma cascata: o navegador só descobre que precisa do App.js DEPOIS de
 * baixar e executar o bundle do React. Medimos 260ms de buraco entre um e
 * outro — em produção, com a rede real, isso é uma volta inteira a cada vez que
 * alguém abre o app.
 *
 * Este plugin lê o manifesto do build e escreve um <link rel="modulepreload">
 * do arquivo do App no index.html. Aí o navegador baixa os dois em paralelo,
 * desde o primeiro instante, e a tela de erro continua existindo.
 */
function preloadDoApp() {
  let arquivoApp = null;
  return {
    name: 'incovia-preload-do-app',
    apply: 'build',
    generateBundle(_opcoes, bundle) {
      const alvo = Object.values(bundle).find(
        (c) => c.type === 'chunk' && /(^|\/)App-[\w-]+\.js$/.test(c.fileName)
      );
      arquivoApp = alvo ? alvo.fileName : null;
      if (!arquivoApp) {
        // Não quebra o build — só avisa, porque o app funciona sem o preload.
        this.warn('Chunk do App não encontrado; seguindo sem modulepreload.');
      }
    },
    transformIndexHtml(html) {
      if (!arquivoApp) return html;
      return html.replace(
        '</head>',
        `  <link rel="modulepreload" crossorigin href="/${arquivoApp}" />\n  </head>`
      );
    },
  };
}

export default defineConfig({
  // Sem este plugin o JSX até compila (esbuild), mas você perde o Fast Refresh
  // no `npm run dev` — cada alteração recarregava a página inteira e apagava o
  // estado da tela.
  plugins: [react(), preloadDoApp()],
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
