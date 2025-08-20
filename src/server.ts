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
        span_kind
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
        AVG(duration_ms) as avg_duration_ms,
        MAX(duration_ms) as max_duration_ms,
        SUM(is_error) as error_count,
        COUNT(DISTINCT trace_id) as unique_traces,
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

// OTLP Traces ingestion endpoint (unified path for all telemetry)
app.post('/v1/traces', async (req, res) => {
  try {
    console.log('📍 OTLP traces received (unified ingestion)')
    
    const otlpData = req.body
    
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
              start_time: new Date(startTimeNs / 1000000).toISOString(),
              end_time: new Date(endTimeNs / 1000000).toISOString(),
              duration_ns: durationNs,
              service_name: (resourceAttributes['service.name'] as string) || 'unknown-service',
              operation_name: span.name,
              span_kind: span.kind || 'SPAN_KIND_INTERNAL',
              status_code: span.status?.code || 'STATUS_CODE_UNSET',
              status_message: span.status?.message || '',
              trace_state: span.traceState || '',
              scope_name: scopeName,
              scope_version: scopeVersion,
              span_attributes: JSON.stringify(spanAttributes),
              resource_attributes: JSON.stringify(resourceAttributes),
              events: JSON.stringify(span.events || []),
              links: JSON.stringify(span.links || [])
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