import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 8000,
    allowedHosts: true,
    // Cursor Simple Browser / port-forward 환경에서 HMR 웹소켓이 깨지면
    // 화면이 빈 채로 남는 경우가 있어 VM에서는 HMR을 끕니다.
    hmr: false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
      '/storage': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
    },
  },
})
