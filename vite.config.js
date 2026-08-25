import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Sem este plugin o JSX até compila (esbuild), mas você perde o Fast Refresh
  // no `npm run dev` — cada alteração recarregava a página inteira e apagava o
  // estado da tela.
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
