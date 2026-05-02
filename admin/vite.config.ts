import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    // 与用户端 web 一致使用 127.0.0.1，避免 Windows 下 localhost/127.0.0.1 解析不一致导致「地址不对」
    host: '127.0.0.1',
    // 与用户端 3002 拉开差距，避免误开创作端却以为是管理后台
    port: 3003,
    strictPort: true,
    hmr: {
      protocol: 'ws',
      host: '127.0.0.1',
      port: 3003,
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        ws: true,
      },
      '/uploads': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
})
