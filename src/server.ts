/**
 * OTLP Ingestion Server for AI-Native Observability Platform
 * Provides direct OTLP ingestion endpoint for "direct" path testing
 */

import express from 'express'
import cors from 'cors'
import { SimpleStorage, type SimpleStorageConfig } from './storage/simple-storage.js'

const app = express()
const PORT = process.env.PORT || 4319

// Middleware
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.text({ limit: '10mb' }))

// Initialize storage
const storageConfig: SimpleStorageConfig = {
  clickhouse: {
    host: process.env.CLICKHOUSE_HOST || 'localhost',
    port: parseInt(process.env.CLICKHOUSE_PORT || '8123'),
    database: process.env.CLICKHOUSE_DATABASE || 'otel',
    username: process.env.CLICKHOUSE_USERNAME || 'otel',
    password: process.env.CLICKHOUSE_PASSWORD || 'otel123'
  }
}

const storage = new SimpleStorage(storageConfig)

// Create unified view after storage is initialized
async function createUnifiedView() {
  try {
    const createViewSQL = `
      CREATE OR REPLACE VIEW traces_unified_view AS
      -- Traces from OpenTelemetry Collector
      SELECT 
          TraceId as trace_id,
          ServiceName as service_name,
          SpanName as operation_name,
          Duration / 1000000 as duration_ms,
          Timestamp as timestamp,
          toString(StatusCode) as status_code,
          'collector' as ingestion_path,
          'v1.0' as schema_version,
          CASE WHEN StatusCode = 'STATUS_CODE_ERROR' THEN 1 ELSE 0 END as is_error,
          SpanKind as span_kind,
          ParentSpanId as parent_span_id,
          length(SpanAttributes) as attribute_count,
          SpanId as span_id,
          SpanAttributes as attributes,
          ResourceAttributes as resource_attributes
      FROM otel_traces
      
      UNION ALL
      
      -- Direct traces from test generator
      SELECT 
          trace_id,
          service_name,
          operation_name,
          duration / 1000000 as duration_ms,
          start_time as timestamp,
          toString(status_code) as status_code,
          'direct' as ingestion_path,
          'v1.0' as schema_version,
          CASE WHEN status_code = 2 THEN 1 ELSE 0 END as is_error,
          span_kind,
          parent_span_id,
          length(attributes) as attribute_count,
          span_id,
          attributes,
          resource_attributes
      FROM ai_traces_direct
    `
    await storage.query(createViewSQL)
    console.log('✅ Created unified view for dual ingestion paths')
  } catch (error) {
    console.log('⚠️  Unified view creation will be retried later:', error instanceof Error ? error.message : error)
  }
}

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const isHealthy = await storage.healthCheck()
    res.json({ 
      status: isHealthy ? 'healthy' : 'unhealthy',
      service: 'otel-ai-backend',
      timestamp: new Date().toISOString(),
      clickhouse: isHealthy
    })
  } catch (error) {
    res.status(503).json({ 
      status: 'error', 
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    })
  }
})

// OTLP Traces ingestion endpoint (direct path)
app.post('/v1/traces', async (req, res) => {
  try {
    console.log('📍 Direct OTLP traces received')
    console.log('📍 Headers:', req.headers)
    console.log('📍 Body type:', typeof req.body)
    
    const otlpData = req.body
    
    // Transform OTLP data to our storage format
    const traces = []
    
    if (otlpData.resourceSpans) {
      for (const resourceSpan of otlpData.resourceSpans) {
        const resourceAttributes: Record<string, any> = {}
        
        // Extract resource attributes
        if (resourceSpan.resource?.attributes) {
          for (const attr of resourceSpan.resource.attributes) {
            const value = attr.value?.stringValue || attr.value?.intValue || attr.value?.boolValue || attr.value
            resourceAttributes[attr.key] = value
          }
        }
        
        // Process spans
        for (const scopeSpan of resourceSpan.scopeSpans || []) {
          for (const span of scopeSpan.spans || []) {
            const spanAttributes: Record<string, any> = {}
            
            // Extract span attributes
            if (span.attributes) {
              for (const attr of span.attributes) {
                const value = attr.value?.stringValue || attr.value?.intValue || attr.value?.boolValue || attr.value
                spanAttributes[attr.key] = value
              }
            }
            
            const trace = {
              traceId: span.traceId,
              spanId: span.spanId,
              parentSpanId: span.parentSpanId || '',
              operationName: span.name,
              startTime: parseInt(span.startTimeUnixNano) || Date.now() * 1000000,
              endTime: parseInt(span.endTimeUnixNano) || Date.now() * 1000000,
              serviceName: (resourceAttributes['service.name'] as string) || 'unknown-service',
              statusCode: span.status?.code === 'STATUS_CODE_ERROR' ? 'STATUS_CODE_ERROR' : 'STATUS_CODE_OK',
              statusMessage: span.status?.message || '',
              spanKind: span.kind || 'SPAN_KIND_INTERNAL',
              attributes: spanAttributes,
              resourceAttributes: resourceAttributes,
              // Mark as direct ingestion
              ingestionPath: 'direct'
            }
            
            traces.push(trace)
          }
        }
      }
    }
    
    console.log(`📍 Processed ${traces.length} traces for direct ingestion`)
    
    // Store the traces using our storage layer
    if (traces.length > 0) {
      const storageData = {
        traces,
        timestamp: Date.now()
      }
      
      await storage.writeOTLP(storageData)
      console.log(`✅ Successfully stored ${traces.length} direct traces`)
    }
    
    // Return success response (OTLP format)
    res.json({ partialSuccess: {} })
    
  } catch (error) {
    console.error('❌ Error processing direct OTLP traces:', error)
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// OTLP Metrics ingestion endpoint (for completeness)
app.post('/v1/metrics', async (req, res) => {
  console.log('📍 Direct OTLP metrics received')
  // For now, just acknowledge
  res.json({ partialSuccess: {} })
})

// OTLP Logs ingestion endpoint (for completeness)  
app.post('/v1/logs', async (req, res) => {
  console.log('📍 Direct OTLP logs received')
  // For now, just acknowledge
  res.json({ partialSuccess: {} })
})

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 OTLP Ingestion Server running on port ${PORT}`)
  console.log(`📡 Direct ingestion endpoint: http://localhost:${PORT}/v1/traces`)
  console.log(`🏥 Health check: http://localhost:${PORT}/health`)
  
  // Wait a bit for OTel Collector to create tables, then create unified view
  setTimeout(async () => {
    await createUnifiedView()
  }, 10000) // Wait 10 seconds
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...')
  await storage.close()
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...')
  await storage.close()
  process.exit(0)
})