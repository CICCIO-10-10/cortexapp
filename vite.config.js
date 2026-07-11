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
    emptyOutDir: true, // prima false: dist accumulava ~50 bundle vecchi rideployati ogni volta
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
        app: './app.html',
        tolc: './simulazione-tolc.html'
      },
      output: {
        // Code splitting: spezza il monolite (~742KB) in chunk per cartella.
        // Vantaggi: cache HTTP granulare (modificare un modulo non invalida
        // tutto il bundle) e download parallelo su HTTP/2. La logica di boot
        // resta invariata: tutto e' importato staticamente, cambia solo
        // come Rollup emette i file.
        manualChunks(id) {
          // Isola solo data/ (moduli foglia, ~161KB, nessuna dipendenza in
          // uscita -> nessun chunk circolare). Cambia di rado, quindi si
          // cachea a lungo separatamente dal resto dell'app. Split piu'
          // aggressivi (core/services/modules) creano cicli tra i chunk e
          // sono stati scartati per non rischiare l'ordine di esecuzione.
          if (!id.includes('node_modules') && id.includes('/data/')) {
            return 'data';
          }
        }
      }
    }
  }
});
