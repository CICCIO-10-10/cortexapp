// vite.config.js
import { defineConfig } from "file:///sessions/focused-nifty-thompson/mnt/cortex/node_modules/vite/dist/node/index.js";
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvc2Vzc2lvbnMvZm9jdXNlZC1uaWZ0eS10aG9tcHNvbi9tbnQvY29ydGV4XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvc2Vzc2lvbnMvZm9jdXNlZC1uaWZ0eS10aG9tcHNvbi9tbnQvY29ydGV4L3ZpdGUuY29uZmlnLmpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9zZXNzaW9ucy9mb2N1c2VkLW5pZnR5LXRob21wc29uL21udC9jb3J0ZXgvdml0ZS5jb25maWcuanNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCBmcyBmcm9tICdmcyc7XG5cbmNvbnN0IHBrZyA9IEpTT04ucGFyc2UoZnMucmVhZEZpbGVTeW5jKCcuL3BhY2thZ2UuanNvbicsICd1dGYtOCcpKTtcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW10sXG4gIGRlZmluZToge1xuICAgIF9fQ09SVEVYX1ZFUlNJT05fXzogSlNPTi5zdHJpbmdpZnkocGtnLnZlcnNpb24pLFxuICAgIENVUlJFTlRfVkVSU0lPTjogSlNPTi5zdHJpbmdpZnkocGtnLnZlcnNpb24pXG4gIH0sXG4gIGJ1aWxkOiB7XG4gICAgb3V0RGlyOiAnZGlzdCcsXG4gICAgZW1wdHlPdXREaXI6IGZhbHNlLFxuICAgIHNvdXJjZW1hcDogZmFsc2UsXG4gICAgbWluaWZ5OiAndGVyc2VyJyxcbiAgICB0ZXJzZXJPcHRpb25zOiB7XG4gICAgICBjb21wcmVzczoge1xuICAgICAgICBkcm9wX2NvbnNvbGU6IHRydWUsXG4gICAgICAgIGRyb3BfZGVidWdnZXI6IHRydWUsXG4gICAgICB9XG4gICAgfSxcbiAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICBpbnB1dDoge1xuICAgICAgICBtYWluOiAnLi9pbmRleC5odG1sJyxcbiAgICAgICAgYXBwOiAnLi9hcHAuaHRtbCdcbiAgICAgIH1cbiAgICB9XG4gIH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFtVCxTQUFTLG9CQUFvQjtBQUNoVixPQUFPLFFBQVE7QUFFZixJQUFNLE1BQU0sS0FBSyxNQUFNLEdBQUcsYUFBYSxrQkFBa0IsT0FBTyxDQUFDO0FBRWpFLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVMsQ0FBQztBQUFBLEVBQ1YsUUFBUTtBQUFBLElBQ04sb0JBQW9CLEtBQUssVUFBVSxJQUFJLE9BQU87QUFBQSxJQUM5QyxpQkFBaUIsS0FBSyxVQUFVLElBQUksT0FBTztBQUFBLEVBQzdDO0FBQUEsRUFDQSxPQUFPO0FBQUEsSUFDTCxRQUFRO0FBQUEsSUFDUixhQUFhO0FBQUEsSUFDYixXQUFXO0FBQUEsSUFDWCxRQUFRO0FBQUEsSUFDUixlQUFlO0FBQUEsTUFDYixVQUFVO0FBQUEsUUFDUixjQUFjO0FBQUEsUUFDZCxlQUFlO0FBQUEsTUFDakI7QUFBQSxJQUNGO0FBQUEsSUFDQSxlQUFlO0FBQUEsTUFDYixPQUFPO0FBQUEsUUFDTCxNQUFNO0FBQUEsUUFDTixLQUFLO0FBQUEsTUFDUDtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
