// vite.config.js
import { defineConfig } from "file:///sessions/confident-lucid-brahmagupta/mnt/Desktop/PROGETTI/cortex/node_modules/vite/dist/node/index.js";
import fs from "fs";
var pkg = JSON.parse(fs.readFileSync("./package.json", "utf-8"));
var vite_config_default = defineConfig({
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
      "/api/gemini": {
        target: "http://127.0.0.1:5001/cortex-74a4e/us-central1/callGeminiHttp",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/gemini$/, "")
      }
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: false,
    sourcemap: false,
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },
    rollupOptions: {
      input: {
        main: "./index.html",
        app: "./app.html"
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvc2Vzc2lvbnMvY29uZmlkZW50LWx1Y2lkLWJyYWhtYWd1cHRhL21udC9EZXNrdG9wL1BST0dFVFRJL2NvcnRleFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL3Nlc3Npb25zL2NvbmZpZGVudC1sdWNpZC1icmFobWFndXB0YS9tbnQvRGVza3RvcC9QUk9HRVRUSS9jb3J0ZXgvdml0ZS5jb25maWcuanNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL3Nlc3Npb25zL2NvbmZpZGVudC1sdWNpZC1icmFobWFndXB0YS9tbnQvRGVza3RvcC9QUk9HRVRUSS9jb3J0ZXgvdml0ZS5jb25maWcuanNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCBmcyBmcm9tICdmcyc7XG5cbmNvbnN0IHBrZyA9IEpTT04ucGFyc2UoZnMucmVhZEZpbGVTeW5jKCcuL3BhY2thZ2UuanNvbicsICd1dGYtOCcpKTtcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW10sXG4gIGRlZmluZToge1xuICAgIF9fQ09SVEVYX1ZFUlNJT05fXzogSlNPTi5zdHJpbmdpZnkocGtnLnZlcnNpb24pLFxuICAgIENVUlJFTlRfVkVSU0lPTjogSlNPTi5zdHJpbmdpZnkocGtnLnZlcnNpb24pXG4gIH0sXG4gIHNlcnZlcjoge1xuICAgIHByb3h5OiB7XG4gICAgICAvLyBJbiBkZXYgbG9jYWxlIGluc3RyYWRhIC9hcGkvZ2VtaW5pIHZlcnNvIGlsIEZ1bmN0aW9ucyBlbXVsYXRvclxuICAgICAgLy8gKGF2dmlhIGNvbjogY2QgZnVuY3Rpb25zICYmIG5wbSBydW4gc2VydmUpLCBjb3NcdTAwRUMgc2kgdXNhIGxhIHN0ZXNzYVxuICAgICAgLy8gR0VNSU5JX0tFWSBjb25kaXZpc2EgZGkgcHJvZHV6aW9uZSBzZW56YSBjaGUgbmVzc3VubyBkZWJiYSBpbnNlcmlyZVxuICAgICAgLy8gdW5hIGNoaWF2ZSBwZXJzb25hbGUgbmVsIGJyb3dzZXIuXG4gICAgICAnL2FwaS9nZW1pbmknOiB7XG4gICAgICAgIHRhcmdldDogJ2h0dHA6Ly8xMjcuMC4wLjE6NTAwMS9jb3J0ZXgtNzRhNGUvdXMtY2VudHJhbDEvY2FsbEdlbWluaUh0dHAnLFxuICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsXG4gICAgICAgIHJld3JpdGU6IChwYXRoKSA9PiBwYXRoLnJlcGxhY2UoL15cXC9hcGlcXC9nZW1pbmkkLywgJycpLFxuICAgICAgfVxuICAgIH1cbiAgfSxcbiAgYnVpbGQ6IHtcbiAgICBvdXREaXI6ICdkaXN0JyxcbiAgICBlbXB0eU91dERpcjogZmFsc2UsXG4gICAgc291cmNlbWFwOiBmYWxzZSxcbiAgICBtaW5pZnk6ICd0ZXJzZXInLFxuICAgIHRlcnNlck9wdGlvbnM6IHtcbiAgICAgIGNvbXByZXNzOiB7XG4gICAgICAgIGRyb3BfY29uc29sZTogdHJ1ZSxcbiAgICAgICAgZHJvcF9kZWJ1Z2dlcjogdHJ1ZSxcbiAgICAgIH1cbiAgICB9LFxuICAgIHJvbGx1cE9wdGlvbnM6IHtcbiAgICAgIGlucHV0OiB7XG4gICAgICAgIG1haW46ICcuL2luZGV4Lmh0bWwnLFxuICAgICAgICBhcHA6ICcuL2FwcC5odG1sJ1xuICAgICAgfVxuICAgIH1cbiAgfVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQXFYLFNBQVMsb0JBQW9CO0FBQ2xaLE9BQU8sUUFBUTtBQUVmLElBQU0sTUFBTSxLQUFLLE1BQU0sR0FBRyxhQUFhLGtCQUFrQixPQUFPLENBQUM7QUFFakUsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUyxDQUFDO0FBQUEsRUFDVixRQUFRO0FBQUEsSUFDTixvQkFBb0IsS0FBSyxVQUFVLElBQUksT0FBTztBQUFBLElBQzlDLGlCQUFpQixLQUFLLFVBQVUsSUFBSSxPQUFPO0FBQUEsRUFDN0M7QUFBQSxFQUNBLFFBQVE7QUFBQSxJQUNOLE9BQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0wsZUFBZTtBQUFBLFFBQ2IsUUFBUTtBQUFBLFFBQ1IsY0FBYztBQUFBLFFBQ2QsU0FBUyxDQUFDLFNBQVMsS0FBSyxRQUFRLG1CQUFtQixFQUFFO0FBQUEsTUFDdkQ7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUFBLEVBQ0EsT0FBTztBQUFBLElBQ0wsUUFBUTtBQUFBLElBQ1IsYUFBYTtBQUFBLElBQ2IsV0FBVztBQUFBLElBQ1gsUUFBUTtBQUFBLElBQ1IsZUFBZTtBQUFBLE1BQ2IsVUFBVTtBQUFBLFFBQ1IsY0FBYztBQUFBLFFBQ2QsZUFBZTtBQUFBLE1BQ2pCO0FBQUEsSUFDRjtBQUFBLElBQ0EsZUFBZTtBQUFBLE1BQ2IsT0FBTztBQUFBLFFBQ0wsTUFBTTtBQUFBLFFBQ04sS0FBSztBQUFBLE1BQ1A7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
