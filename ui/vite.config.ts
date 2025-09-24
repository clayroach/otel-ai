import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api/clickhouse': {
        target: `http://${process.env.CLICKHOUSE_HOST || 'localhost'}:${process.env.CLICKHOUSE_PORT || '8123'}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/clickhouse/, ''),
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            // Add ClickHouse authentication
            const auth = Buffer.from('otel:otel123').toString('base64')
            proxyReq.setHeader('Authorization', `Basic ${auth}`)
            const targetHost = process.env.CLICKHOUSE_HOST || 'localhost'
            const targetPort = process.env.CLICKHOUSE_PORT || '8123'
            console.log(`Proxying: ${req.method} ${req.url} -> http://${targetHost}:${targetPort}`)
          })
        }
      },
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
