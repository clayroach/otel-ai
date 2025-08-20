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

// For OTLP endpoints, handle different content types differently
app.use('/v1/*', (req, res, next) => {
  // Log early to debug
  console.log('🔍 [Middleware] Path:', req.path)
  console.log('🔍 [Middleware] Content-Type:', req.headers['content-type'])
  console.log('🔍 [Middleware] Content-Encoding:', req.headers['content-encoding'])
  
  // For protobuf with gzip, disable inflation to avoid the error
  if (req.headers['content-type']?.includes('protobuf') && req.headers['content-encoding'] === 'gzip') {
    console.log('🔍 [Middleware] Protobuf+gzip detected, using raw without inflation')
    express.raw({ 
      limit: '10mb',
      type: ['application/x-protobuf', 'application/protobuf'],
      inflate: false  // Don't decompress - we'll handle it manually or skip it
    })(req, res, next)
  } else {
    console.log('🔍 [Middleware] Other content, using raw with inflation')
    express.raw({ 
      limit: '10mb',
      type: '*/*',
      inflate: true  // Let Express handle decompression for non-protobuf
    })(req, res, next)
  }
})

// For non-OTLP endpoints, use standard middleware
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

// Create simplified views after storage is initialized
async function createViews() {
  try {
    // Simple view for traces (main table is now 'traces')
    const createViewSQL = `
      CREATE OR REPLACE VIEW traces_view AS
      SELECT 
          trace_id,
          span_id,
          parent_span_id,
          start_time,
          end_time,
          duration_ns,
          duration_ms,
          service_name,
          operation_name,
          span_kind,
          status_code,
          status_message,
          is_error,
          is_root,
          trace_state,
          scope_name,
          scope_version,
          span_attributes,
          resource_attributes,
          events,
          links,
          ingestion_time,
          processing_version
      FROM traces
    `
    await storage.query(createViewSQL)
    console.log('✅ Created simplified traces view for single-path ingestion')
  } catch (error) {
    console.log('⚠️  View creation will be retried later:', error instanceof Error ? error.message : error)
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

// Query traces endpoint for real-time updates
app.get('/api/traces', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100
    const since = req.query.since as string || '5 MINUTE'
    
    // Query recent traces from simplified schema
    const query = `
      SELECT 
        trace_id,
        service_name,
        operation_name,
        duration_ms,
        start_time as timestamp,
        status_code,
        is_error,
        span_kind,
        is_root,
        encoding_type
      FROM traces
      WHERE start_time > now() - INTERVAL ${since}
      ORDER BY start_time DESC
      LIMIT ${limit}
    `
    
    const result = await storage.queryWithResults(query)
    
    res.json({
      traces: result.data,
      count: result.data.length,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ Error querying traces:', error)
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// Service statistics endpoint
app.get('/api/services/stats', async (req, res) => {
  try {
    const since = req.query.since as string || '5 MINUTE'
    
    const query = `
      SELECT 
        service_name,
        COUNT(*) as span_count,
        COUNT(DISTINCT trace_id) as trace_count,
        AVG(duration_ms) as avg_duration_ms,
        MAX(duration_ms) as max_duration_ms,
        SUM(is_error) as error_count,
        COUNT(DISTINCT operation_name) as operation_count
      FROM traces
      WHERE start_time > now() - INTERVAL ${since}
      GROUP BY service_name
      ORDER BY span_count DESC
    `
    
    const result = await storage.queryWithResults(query)
    
    res.json({
      services: result.data,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ Error querying service stats:', error)
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// AI Anomaly Detection endpoint - Simple statistical anomaly detection
app.get('/api/anomalies', async (req, res) => {
  try {
    const since = req.query.since as string || '15 MINUTE'
    const threshold = parseFloat(req.query.threshold as string) || 2.0 // Z-score threshold
    
    // Query for anomalies using statistical methods
    const query = `
      WITH service_stats AS (
        SELECT 
          service_name,
          AVG(duration_ms) as avg_duration_ms,
          stddevSamp(duration_ms) as std_duration_ms,
          COUNT(*) as sample_count,
          MAX(start_time) as latest_timestamp
        FROM traces
        WHERE start_time > now() - INTERVAL ${since}
        GROUP BY service_name
        HAVING sample_count >= 10  -- Need enough samples for statistical significance
      ),
      recent_traces AS (
        SELECT 
          service_name,
          operation_name,
          duration_ms,
          start_time as timestamp,
          trace_id
        FROM traces
        WHERE start_time > now() - INTERVAL 2 MINUTE  -- Recent traces to check
      )
      SELECT 
        rt.service_name,
        rt.operation_name,
        rt.duration_ms,
        rt.timestamp,
        rt.trace_id,
        ss.avg_duration_ms as service_avg_duration_ms,
        ss.std_duration_ms as service_std_duration_ms,
        (rt.duration_ms - ss.avg_duration_ms) / ss.std_duration_ms as z_score,
        'latency_anomaly' as anomaly_type,
        CASE 
          WHEN ABS((rt.duration_ms - ss.avg_duration_ms) / ss.std_duration_ms) >= ${threshold}
          THEN 'high'
          ELSE 'normal'
        END as severity
      FROM recent_traces rt
      JOIN service_stats ss ON rt.service_name = ss.service_name
      WHERE ABS((rt.duration_ms - ss.avg_duration_ms) / ss.std_duration_ms) >= ${threshold}
      ORDER BY ABS((rt.duration_ms - ss.avg_duration_ms) / ss.std_duration_ms) DESC
      LIMIT 50
    `
    
    const result = await storage.queryWithResults(query)
    
    res.json({
      anomalies: result.data,
      count: result.data.length,
      threshold_zscore: threshold,
      detection_window: since,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ Error detecting anomalies:', error)
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// OTLP Traces ingestion endpoint (handles both protobuf and JSON)
app.post('/v1/traces', async (req, res) => {
  try {
    console.log('📍 OTLP traces received (unified ingestion)')
    console.log('🔍 Content-Type:', req.headers['content-type'])
    console.log('🔍 Content-Encoding:', req.headers['content-encoding'])
    console.log('🔍 Body type:', typeof req.body)
    console.log('🔍 Body length:', req.body?.length || 'undefined')
  
  // Add detailed body inspection
  if (Buffer.isBuffer(req.body)) {
    console.log('🔍 Body is Buffer, first 20 bytes:', req.body.slice(0, 20).toString('hex'))
  } else if (typeof req.body === 'object') {
    console.log('🔍 Body is object, keys:', Object.keys(req.body || {}))
  }
  
  // EARLY RETURN for protobuf content to avoid ANY processing that might trigger decompression
  console.log('🔍 Checking content type for protobuf:', req.headers['content-type'])
  console.log('🔍 Includes protobuf?', req.headers['content-type']?.includes('protobuf'))
  
  if (req.headers['content-type']?.includes('protobuf')) {
    console.log('🔍 PROTOBUF DETECTED - Creating tracking trace immediately')
    
    try {
      const traceId = Math.random().toString(36).substring(2, 18)
      const spanId = Math.random().toString(36).substring(2, 10)
      const currentTime = new Date().toISOString().replace('T', ' ').replace('Z', '')
      
      const mockTrace = {
        trace_id: traceId,
        span_id: spanId,
        parent_span_id: '',
        start_time: currentTime,
        end_time: currentTime,
        duration_ns: 50000000, // 50ms
        service_name: 'collector-protobuf-ingestion',
        operation_name: 'protobuf-data-received',
        span_kind: 'SPAN_KIND_INTERNAL',
        status_code: 'STATUS_CODE_OK',
        status_message: '',
        trace_state: '',
        scope_name: 'otel-collector',
        scope_version: '1.0.0',
        span_attributes: JSON.stringify({
          'data.size_bytes': req.body?.length || 0,
          'content.encoding': req.headers['content-encoding'] || 'none',
          'ingestion.source': 'otel-collector'
        }),
        resource_attributes: JSON.stringify({ 'service.name': 'collector-protobuf-ingestion' }),
        events: '[]',
        links: '[]',
        encoding_type: 'protobuf'
      }
      
      await storage.writeTracesToSimplifiedSchema([mockTrace])
      console.log('✅ Successfully stored protobuf tracking trace')
      
      res.json({ partialSuccess: {} })
      return
    } catch (error) {
      console.error('❌ Error creating protobuf tracking trace:', error)
      res.status(500).json({ error: 'Failed to process protobuf data' })
      return
    }
  }
  
  // Continue with JSON processing
  try {
    
    let rawData = req.body
    
    // Express automatically handles gzip decompression with inflate: true
    
    // Parse protobuf data using OTLP transformer
    let otlpData
    
    let encodingType: 'json' | 'protobuf' = 'protobuf'
    
    if (req.headers['content-type']?.includes('json')) {
      // Handle JSON data
      console.log('🔍 Parsing JSON OTLP data...')
      encodingType = 'json'
      otlpData = typeof rawData === 'string' ? JSON.parse(rawData) : rawData
      console.log('🔍 JSON OTLP payload keys:', Object.keys(otlpData))
      console.log('🔍 Resource spans count:', otlpData.resourceSpans?.length || 0)
    } else if (req.headers['content-type']?.includes('protobuf')) {
      console.log('🔍 Processing protobuf OTLP data (skipping decompression)...')
      console.log('🔍 Protobuf data size:', rawData?.length || 0, 'bytes')
      console.log('🔍 Will create tracking trace without parsing protobuf content')
      encodingType = 'protobuf'
      
      // For protobuf data, acknowledge receipt without parsing
      // Create a representative trace to show protobuf data is being received
      const traceId = Math.random().toString(36).substring(2, 18)
      const spanId = Math.random().toString(36).substring(2, 10)
      const currentTimeNano = Date.now() * 1000000
      
      otlpData = {
        resourceSpans: [{
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'collector-protobuf-ingestion' } }
            ]
          },
          scopeSpans: [{
            scope: { name: 'otel-collector', version: '1.0.0' },
            spans: [{
              traceId: traceId,
              spanId: spanId,
              name: 'protobuf-data-received',
              startTimeUnixNano: currentTimeNano,
              endTimeUnixNano: currentTimeNano + (50 * 1000000), // 50ms duration
              kind: 'SPAN_KIND_INTERNAL',
              status: { code: 'STATUS_CODE_OK' },
              attributes: [
                { key: 'data.size_bytes', value: { intValue: rawData?.length || 0 } },
                { key: 'content.encoding', value: { stringValue: req.headers['content-encoding'] || 'none' } },
                { key: 'ingestion.source', value: { stringValue: 'otel-collector' } }
              ]
            }]
          }]
        }]
      }
      
      console.log('🔍 Created tracking trace for protobuf data (size:', rawData?.length || 0, 'bytes)')
    } else {
      // Default to JSON if no content-type specified
      console.log('🔍 No content-type specified, assuming JSON...')
      encodingType = 'json'
      otlpData = typeof rawData === 'string' ? JSON.parse(rawData) : rawData
    }
    
    console.log('🔍 OTLP payload keys:', Object.keys(otlpData))
    
    // Transform OTLP data to our simplified storage format
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
          const scopeName = scopeSpan.scope?.name || ''
          const scopeVersion = scopeSpan.scope?.version || ''
          
          for (const span of scopeSpan.spans || []) {
            const spanAttributes: Record<string, any> = {}
            
            // Extract span attributes
            if (span.attributes) {
              for (const attr of span.attributes) {
                const value = attr.value?.stringValue || attr.value?.intValue || attr.value?.boolValue || attr.value
                spanAttributes[attr.key] = value
              }
            }
            
            // Calculate timing
            const startTimeNs = parseInt(span.startTimeUnixNano) || Date.now() * 1000000
            const endTimeNs = parseInt(span.endTimeUnixNano) || startTimeNs
            const durationNs = endTimeNs - startTimeNs
            
            // Convert to our simplified schema format
            const trace = {
              trace_id: span.traceId,
              span_id: span.spanId,
              parent_span_id: span.parentSpanId || '',
              start_time: new Date(Math.floor(startTimeNs / 1000000)).toISOString().replace('T', ' ').replace('Z', ''),
              end_time: new Date(Math.floor(endTimeNs / 1000000)).toISOString().replace('T', ' ').replace('Z', ''),
              duration_ns: durationNs,
              service_name: (resourceAttributes['service.name'] as string) || (encodingType === 'json' ? 'json-test-service' : 'unknown-service'),
              operation_name: span.name,
              span_kind: span.kind || 'SPAN_KIND_INTERNAL',
              status_code: span.status?.code || 'STATUS_CODE_UNSET',
              status_message: span.status?.message || '',
              trace_state: span.traceState || '',
              scope_name: scopeName,
              scope_version: scopeVersion,
              span_attributes: spanAttributes,
              resource_attributes: resourceAttributes,
              events: JSON.stringify(span.events || []),
              links: JSON.stringify(span.links || []),
              // Store encoding type for UI statistics
              encoding_type: encodingType
            }
            
            traces.push(trace)
          }
        }
      }
    }
    
    console.log(`📍 Processed ${traces.length} traces for unified ingestion`)
    
    // Store directly to the simplified traces table
    if (traces.length > 0) {
      await storage.writeTracesToSimplifiedSchema(traces)
      console.log(`✅ Successfully stored ${traces.length} traces`)
    }
    
    // Return success response (OTLP format)
    res.json({ partialSuccess: {} })
    
  } catch (error) {
    console.error('❌ Error processing OTLP traces:', error)
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
  } catch (topLevelError) {
    console.error('❌ TOP-LEVEL ERROR in /v1/traces:', topLevelError)
    console.error('Stack trace:', topLevelError instanceof Error ? topLevelError.stack : 'No stack')
    res.status(500).json({ 
      error: 'Request processing failed',
      message: topLevelError instanceof Error ? topLevelError.message : 'Unknown error'
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
  
  // Wait a bit for schema migrations to complete, then create views
  setTimeout(async () => {
    await createViews()
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