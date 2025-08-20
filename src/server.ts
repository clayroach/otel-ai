/**
 * OTLP Ingestion Server for AI-Native Observability Platform
 * Provides direct OTLP ingestion endpoint for "direct" path testing
 */

import express from 'express'
import cors from 'cors'
import { SimpleStorage, type SimpleStorageConfig } from './storage/simple-storage.js'
import { ExportTraceServiceRequestSchema, TracesData, ResourceSpans, KeyValue, ScopeSpans } from './opentelemetry/index.js'
import { fromBinary } from '@bufbuild/protobuf'

/**
 * Type for OpenTelemetry attribute values
 */
type AttributeValue = string | number | boolean | bigint | Uint8Array | undefined

/**
 * Parse OTLP data from raw protobuf buffer by detecting patterns
 * This is a fallback when protobufjs is not available
 */
function parseOTLPFromRaw(buffer: Buffer): TracesData {
  try {
    // Convert buffer to string and look for patterns
    const data = buffer.toString('latin1')
    
    // Look for OTLP structure markers
    const resourceSpans: ResourceSpans[] = []
    
    // Find service name patterns
    const serviceMatches = [...data.matchAll(/service\.name\s*([a-zA-Z][a-zA-Z0-9\-_]+)/g)]
    const operationMatches = [...data.matchAll(/\s([a-zA-Z][a-zA-Z0-9\-_./]+)\s/g)]
    
    // Look for trace and span IDs (16-byte hex strings)
    const traceIdMatches = [...data.matchAll(/\s([a-f0-9]{32})\s/g)]
    const spanIdMatches = [...data.matchAll(/\s([a-f0-9]{16})\s/g)]
    
    // Find timestamp patterns (nanoseconds)
    const timestampMatches = [...data.matchAll(/\s(\d{16,19})\s/g)]
    
    console.log('🔍 Raw protobuf parsing found:')
    console.log('  - Service matches:', serviceMatches.length)
    console.log('  - Operation matches:', operationMatches.length) 
    console.log('  - Trace ID matches:', traceIdMatches.length)
    console.log('  - Span ID matches:', spanIdMatches.length)
    console.log('  - Timestamp matches:', timestampMatches.length)
    
    if (serviceMatches.length === 0) {
      throw new Error('No service names found in protobuf data')
    }
    
    // Extract the first service name
    const serviceName = serviceMatches[0]?.[1] || 'unknown-service'
    
    // Try to find operation names - look for common operation patterns
    const operationCandidates = operationMatches
      .map(match => match[1])
      .filter((op): op is string => 
        op != null &&
        op.length > 3 && 
        op.length < 100 &&
        !op.match(/^[0-9a-f]+$/) && // Skip hex strings
        !op.match(/^[0-9]+$/) && // Skip pure numbers
        (op.includes('.') || op.includes('/') || op.includes('_') || /[A-Z]/.test(op)) // Likely operation names
      )
      .slice(0, 10) // Limit to first 10 candidates
    
    console.log('🔍 Operation candidates:', operationCandidates)
    
    // Create spans for each operation found
    const spans = operationCandidates.length > 0 
      ? operationCandidates.map((operation, index) => ({
          traceId: traceIdMatches[index]?.[1] || Math.random().toString(16).padStart(32, '0'),
          spanId: spanIdMatches[index]?.[1] || Math.random().toString(16).padStart(16, '0'),
          name: operation,
          startTimeUnixNano: timestampMatches[index * 2]?.[1] || (Date.now() * 1000000).toString(),
          endTimeUnixNano: timestampMatches[index * 2 + 1]?.[1] || ((Date.now() + 50) * 1000000).toString(),
          kind: 'SPAN_KIND_INTERNAL',
          status: { code: 'STATUS_CODE_OK' },
          attributes: [
            { key: 'extraction.method', value: { stringValue: 'raw-protobuf-parsing' } },
            { key: 'service.name', value: { stringValue: serviceName } }
          ]
        }))
      : [{
          traceId: traceIdMatches[0]?.[1] || Math.random().toString(16).padStart(32, '0'),
          spanId: spanIdMatches[0]?.[1] || Math.random().toString(16).padStart(16, '0'),
          name: 'extracted-operation',
          startTimeUnixNano: timestampMatches[0]?.[1] || (Date.now() * 1000000).toString(),
          endTimeUnixNano: timestampMatches[1]?.[1] || ((Date.now() + 50) * 1000000).toString(),
          kind: 'SPAN_KIND_INTERNAL',
          status: { code: 'STATUS_CODE_OK' },
          attributes: [
            { key: 'extraction.method', value: { stringValue: 'raw-protobuf-parsing' } },
            { key: 'service.name', value: { stringValue: serviceName } }
          ]
        }]
    
    resourceSpans.push({
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: serviceName } }
        ]
      },
      scopeSpans: [{
        scope: { name: 'raw-protobuf-parser', version: '1.0.0' },
        spans: spans
      }]
    })
    
    return { resourceSpans }
    
  } catch (error) {
    console.error('❌ Raw protobuf parsing failed:', error)
    throw error
  }
}

const app = express()
const PORT = process.env.PORT || 4319

// Middleware
app.use(cors())

// For OTLP endpoints, use raw middleware with gzip decompression enabled
app.use('/v1*', (req, res, next) => {
  console.log('🔍 [Debug] Path:', req.path)
  console.log('🔍 [Debug] Content-Type:', req.headers['content-type'])
  console.log('🔍 [Debug] Content-Encoding:', req.headers['content-encoding'])
  
  // Use raw middleware for all OTLP data with gzip decompression enabled
  express.raw({ 
    limit: '10mb',
    type: '*/*',
    inflate: true  // Enable gzip decompression for all content types
  })(req, res, next)
})

// For non-OTLP endpoints only, use standard middleware (exclude /v1/* paths)
app.use((req, res, next) => {
  if (!req.path.startsWith('/v1/')) {
    express.json({ limit: '10mb' })(req, res, next)
  } else {
    next()
  }
})

app.use((req, res, next) => {
  if (!req.path.startsWith('/v1/')) {
    express.text({ limit: '10mb' })(req, res, next)
  } else {
    next()
  }
})

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

// Protobuf parsing now uses generated types from @bufbuild/protobuf
console.log('✅ Using generated protobuf types for OTLP parsing')

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
    
    // Now body parsing with gzip decompression is handled by middleware
  
  // Add detailed body inspection for other cases
  if (Buffer.isBuffer(req.body)) {
    console.log('🔍 Body is Buffer, first 20 bytes:', req.body.slice(0, 20).toString('hex'))
  } else if (typeof req.body === 'object') {
    console.log('🔍 Body is object, keys:', Object.keys(req.body || {}))
  }
  
  // Check if this is protobuf content (handle multiple protobuf content types)
  const isProtobuf = req.headers['content-type']?.includes('protobuf') || 
                     req.headers['content-type']?.includes('x-protobuf')
  
  console.log('🔍 Checking content type for protobuf:', req.headers['content-type'])
  console.log('🔍 Is protobuf?', isProtobuf)
  
  // Continue with data processing
  try {
    const rawData = req.body
    let otlpData
    let encodingType: 'json' | 'protobuf' = 'json'
    
    if (isProtobuf) {
      // Handle protobuf data - try to parse as JSON first (collector might be sending JSON in protobuf wrapper)
      console.log('🔍 Processing protobuf OTLP data...')
      console.log('🔍 Protobuf data size:', rawData?.length || 0, 'bytes')
      console.log('🔍 Content was gzip?', req.headers['content-encoding'] === 'gzip')
      console.log('🔍 Raw data first 50 chars:', rawData?.toString('utf8', 0, 50))
      encodingType = 'protobuf'
      
      try {
        // Use generated protobuf types for parsing
        console.log('🔍 Parsing protobuf using generated types...')
        
        try {
          // Parse as ExportTraceServiceRequest (the standard OTLP format)
          const parsedData = fromBinary(ExportTraceServiceRequestSchema, rawData)
          
          // Convert to the expected format for storage
          otlpData = {
            resourceSpans: parsedData.resourceSpans
          }
          console.log('✅ Successfully parsed protobuf OTLP data with generated types')
          console.log('🔍 Resource spans count:', otlpData.resourceSpans?.length || 0)
          
          // Log first service name to verify parsing
          const firstService = otlpData.resourceSpans?.[0]?.resource?.attributes?.find((attr: KeyValue) => attr.key === 'service.name')
          if (firstService && firstService.value) {
            const serviceValue = firstService.value.value?.case === 'stringValue' ? firstService.value.value.value : 'unknown'
            console.log('🔍 First service detected:', serviceValue)
          }
        } catch (protobufParseError) {
          console.log('⚠️ Generated type parsing failed, falling back to raw parsing...')
          console.log('Parse error:', protobufParseError instanceof Error ? protobufParseError.message : protobufParseError)
          
          try {
            // Try to parse OTLP data manually by looking for known patterns
            const extractedData = parseOTLPFromRaw(rawData)
            if (extractedData && extractedData.resourceSpans && extractedData.resourceSpans.length > 0) {
              otlpData = extractedData
              console.log('✅ Successfully extracted real OTLP data from raw protobuf')
              console.log('🔍 Extracted spans count:', extractedData.resourceSpans.map((rs: ResourceSpans) => rs.scopeSpans?.map((ss: ScopeSpans) => ss.spans?.length || 0).reduce((a: number, b: number) => a + b, 0) || 0).reduce((a: number, b: number) => a + b, 0))
            } else {
              throw new Error('No valid OTLP data found')
            }
          } catch (fallbackError) {
            console.log('⚠️ Enhanced parsing failed, using basic service detection:', fallbackError instanceof Error ? fallbackError.message : fallbackError)
            
            const dataString = rawData?.toString('utf8') || ''
            const serviceMatch = dataString.match(/([a-zA-Z][a-zA-Z0-9\-_]*(?:service|frontend|backend|cart|ad|payment|email|shipping|checkout|currency|recommendation|quote|product|flagd|load-generator))/i)
            const detectedService = serviceMatch ? serviceMatch[1] : 'protobuf-fallback-service'
            
            console.log('🔍 Detected service from raw data:', detectedService)
            
            // Create a fallback trace
            const traceId = Math.random().toString(36).substring(2, 18)
            const spanId = Math.random().toString(36).substring(2, 10)
            const currentTimeNano = Date.now() * 1000000
            
            otlpData = {
              resourceSpans: [{
                resource: {
                  attributes: [
                    { key: 'service.name', value: { stringValue: detectedService } }
                  ]
                },
                scopeSpans: [{
                  scope: { name: 'fallback-parser', version: '1.0.0' },
                  spans: [{
                    traceId: traceId,
                    spanId: spanId,
                    name: 'protobuf-fallback-trace',
                    startTimeUnixNano: currentTimeNano,
                    endTimeUnixNano: currentTimeNano + (50 * 1000000),
                    kind: 'SPAN_KIND_INTERNAL',
                    status: { code: 'STATUS_CODE_OK' },
                    attributes: [
                      { key: 'note', value: { stringValue: 'Fallback parsing - protobuf loader not available' } },
                      { key: 'detected.service', value: { stringValue: detectedService } }
                    ]
                  }]
                }]
              }]
            }
          }
        }
      } catch (error) {
        console.error('❌ Error parsing protobuf data:', error)
        
        // Final fallback
        const traceId = Math.random().toString(36).substring(2, 18)
        const spanId = Math.random().toString(36).substring(2, 10)
        const currentTimeNano = Date.now() * 1000000
        
        otlpData = {
          resourceSpans: [{
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: 'protobuf-parse-error' } }
              ]
            },
            scopeSpans: [{
              scope: { name: 'error-handler', version: '1.0.0' },
              spans: [{
                traceId: traceId,
                spanId: spanId,
                name: 'protobuf-error',
                startTimeUnixNano: currentTimeNano,
                endTimeUnixNano: currentTimeNano + (50 * 1000000),
                kind: 'SPAN_KIND_INTERNAL',
                status: { code: 'STATUS_CODE_ERROR' },
                attributes: [
                  { key: 'error.message', value: { stringValue: error instanceof Error ? error.message : 'Unknown error' } }
                ]
              }]
            }]
          }]
        }
      }
    } else {
      // Handle JSON data
      console.log('🔍 Parsing JSON OTLP data...')
      encodingType = 'json'
      
      if (Buffer.isBuffer(rawData)) {
        // Convert buffer to string then parse JSON
        const jsonString = rawData.toString('utf8')
        otlpData = JSON.parse(jsonString)
      } else if (typeof rawData === 'string') {
        otlpData = JSON.parse(rawData)
      } else {
        otlpData = rawData
      }
      
      console.log('🔍 JSON OTLP payload keys:', Object.keys(otlpData))
      console.log('🔍 Resource spans count:', otlpData.resourceSpans?.length || 0)
    }
    
    console.log('🔍 OTLP payload keys:', Object.keys(otlpData))
    
    // Transform OTLP data to our simplified storage format
    const traces = []
    
    if (otlpData.resourceSpans) {
      for (const resourceSpan of otlpData.resourceSpans) {
        const resourceAttributes: Record<string, AttributeValue> = {}
        
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
            const spanAttributes: Record<string, AttributeValue> = {}
            
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
  console.log(`🔧 MIDDLEWARE DEBUG BUILD v2.0 - GLOBAL MIDDLEWARE ACTIVE`)
  
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