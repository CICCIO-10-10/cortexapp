// vite.config.js
import { defineConfig } from "file:///sessions/brave-adoring-archimedes/mnt/Desktop/PROGETTI/cortex/node_modules/vite/dist/node/index.js";
import fs from "fs";
var pkg = JSON.parse(fs.readFileSync("./package.json", "utf-8"));
var vite_config_default = defineConfig({
  plugins: [],
  define: {
    __CORTEX_VERSION__: JSON.stringify(pkg.version),
    CURRENT_VERSION: JSON.stringify(pkg.version)
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvc2Vzc2lvbnMvYnJhdmUtYWRvcmluZy1hcmNoaW1lZGVzL21udC9EZXNrdG9wL1BST0dFVFRJL2NvcnRleFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL3Nlc3Npb25zL2JyYXZlLWFkb3JpbmctYXJjaGltZWRlcy9tbnQvRGVza3RvcC9QUk9HRVRUSS9jb3J0ZXgvdml0ZS5jb25maWcuanNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL3Nlc3Npb25zL2JyYXZlLWFkb3JpbmctYXJjaGltZWRlcy9tbnQvRGVza3RvcC9QUk9HRVRUSS9jb3J0ZXgvdml0ZS5jb25maWcuanNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCBmcyBmcm9tICdmcyc7XG5cbmNvbnN0IHBrZyA9IEpTT04ucGFyc2UoZnMucmVhZEZpbGVTeW5jKCcuL3BhY2thZ2UuanNvbicsICd1dGYtOCcpKTtcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW10sXG4gIGRlZmluZToge1xuICAgIF9fQ09SVEVYX1ZFUlNJT05fXzogSlNPTi5zdHJpbmdpZnkocGtnLnZlcnNpb24pLFxuICAgIENVUlJFTlRfVkVSU0lPTjogSlNPTi5zdHJpbmdpZnkocGtnLnZlcnNpb24pXG4gIH0sXG4gIGJ1aWxkOiB7XG4gICAgb3V0RGlyOiAnZGlzdCcsXG4gICAgZW1wdHlPdXREaXI6IGZhbHNlLFxuICAgIHNvdXJjZW1hcDogZmFsc2UsXG4gICAgbWluaWZ5OiAndGVyc2VyJyxcbiAgICB0ZXJzZXJPcHRpb25zOiB7XG4gICAgICBjb21wcmVzczoge1xuICAgICAgICBkcm9wX2NvbnNvbGU6IHRydWUsXG4gICAgICAgIGRyb3BfZGVidWdnZXI6IHRydWUsXG4gICAgICB9XG4gICAgfSxcbiAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICBpbnB1dDoge1xuICAgICAgICBtYWluOiAnLi9pbmRleC5odG1sJyxcbiAgICAgICAgYXBwOiAnLi9hcHAuaHRtbCdcbiAgICAgIH1cbiAgICB9XG4gIH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUE0VyxTQUFTLG9CQUFvQjtBQUN6WSxPQUFPLFFBQVE7QUFFZixJQUFNLE1BQU0sS0FBSyxNQUFNLEdBQUcsYUFBYSxrQkFBa0IsT0FBTyxDQUFDO0FBRWpFLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVMsQ0FBQztBQUFBLEVBQ1YsUUFBUTtBQUFBLElBQ04sb0JBQW9CLEtBQUssVUFBVSxJQUFJLE9BQU87QUFBQSxJQUM5QyxpQkFBaUIsS0FBSyxVQUFVLElBQUksT0FBTztBQUFBLEVBQzdDO0FBQUEsRUFDQSxPQUFPO0FBQUEsSUFDTCxRQUFRO0FBQUEsSUFDUixhQUFhO0FBQUEsSUFDYixXQUFXO0FBQUEsSUFDWCxRQUFRO0FBQUEsSUFDUixlQUFlO0FBQUEsTUFDYixVQUFVO0FBQUEsUUFDUixjQUFjO0FBQUEsUUFDZCxlQUFlO0FBQUEsTUFDakI7QUFBQSxJQUNGO0FBQUEsSUFDQSxlQUFlO0FBQUEsTUFDYixPQUFPO0FBQUEsUUFDTCxNQUFNO0FBQUEsUUFDTixLQUFLO0FBQUEsTUFDUDtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
