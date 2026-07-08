import { defineConfig } from 'vite';
import fs from 'fs';

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  plugins: [],
  define: {
    __CORTEX_VERSION__: JSON.stringify(pkg.version),
    CURRENT_VERSION: JSON.stringify(pkg.version)
  },
  server: {
    proxy: {
      // In dev locale instrada /api/gemini verso il Functions emulator
      // (avvia con: cd functions && npm run serve), così si usa la stessa
      // GEMINI_KEY condivisa di produzione senza che nessuno debba inserire
      // una chiave personale nel browser.
      '/api/gemini': {
        target: 'http://127.0.0.1:5001/cortex-74a4e/us-central1/callGeminiHttp',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/gemini$/, ''),
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      }
    },
    rollupOptions: {
      input: {
        main: './index.html',
        app: './app.html'
      }
    }
  }
});
