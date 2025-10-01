import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      // All API requests go through the backend (including ClickHouse queries)
      '/api': {
        target: `http://${process.env.VITE_BACKEND_HOST || 'localhost'}:4319`,
        changeOrigin: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.error('Proxy error:', err)
          })
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log(
              `API Proxy: ${req.method} ${req.url} -> ${process.env.VITE_BACKEND_HOST || 'localhost'}:4319`
            )
          })
        }
      }
    }
  },
  build: {
    outDir: 'dist/web',
    emptyOutDir: true
  },
  base: './'
})
