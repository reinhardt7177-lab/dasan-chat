import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

// 백엔드는 127.0.0.1:8080. /api/* HTTP와 /api/ws/live WebSocket 둘 다 프록시.
// 빌드 시에는 결과를 server/src/dasan_chat/static/ 으로 떨어뜨려 FastAPI가 직접 serve.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 다른 mumuapp Vite와 충돌하지 않도록 5174로 고정. 점유 시 그냥 죽어서 알리도록 strictPort.
    port: 5174,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: resolve(__dirname, "../server/src/dasan_chat/static"),
    emptyOutDir: true,
  },
});
