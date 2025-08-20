const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
const PORT = 3001;

// Enable CORS for all routes
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Proxy ClickHouse requests
app.use('/api/clickhouse', createProxyMiddleware({
  target: 'http://localhost:8123/otel',
  changeOrigin: true,
  pathRewrite: {
    '^/api/clickhouse': ''
  },
  onProxyReq: (proxyReq, req, res) => {
    // Remove any existing authorization headers
    proxyReq.removeHeader('Authorization');
    
    // Add ClickHouse basic auth
    const auth = Buffer.from('otel:otel123').toString('base64');
    proxyReq.setHeader('Authorization', `Basic ${auth}`);
    
    console.log(`Proxying: ${req.method} ${req.url} -> http://localhost:8123/otel${proxyReq.path}`);
    console.log('Final Headers:', proxyReq.getHeaders());
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log(`Response: ${proxyRes.statusCode} for ${req.method} ${req.url}`);
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Proxy error', details: err.message });
  }
}));

app.listen(PORT, () => {
  console.log(`CORS proxy server running on http://localhost:${PORT}`);
  console.log('Proxying ClickHouse requests from /api/clickhouse to http://localhost:8123');
});