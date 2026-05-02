import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('/three/examples/')) return 'vendor-three-extras'
          if (id.includes('/three/')) return 'vendor-three'
          if (id.includes('/@arco-design/')) return 'vendor-arco'
          if (id.includes('/markdown-it-katex/')) return 'vendor-markdown-katex-plugin'
          if (id.includes('/markdown-it/')) return 'vendor-markdown'
          if (id.includes('/highlight.js/')) return 'vendor-highlight'
          if (id.includes('/katex/')) return 'vendor-katex'
          if (id.includes('/socket.io-client/') || id.includes('/engine.io-client/')) {
            return 'vendor-realtime'
          }
          if (id.includes('/vue/') || id.includes('/vue-router/') || id.includes('/pinia/')) {
            return 'vendor-vue'
          }
          return 'vendor'
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 3002,
    strictPort: false,
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
