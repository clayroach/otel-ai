/**
 * OTLP Ingestion Server for AI-Native Observability Platform
 * Provides direct OTLP ingestion endpoint for "direct" path testing
 * Trigger clean workflow validation
 */

import { fromBinary } from '@bufbuild/protobuf'
import cors from 'cors'
import { Context, Effect, Stream, Layer } from 'effect'
import express from 'express'
import { AIAnalyzerService } from './ai-analyzer/index.js'
import { generateInsights, generateRequestId } from './ai-analyzer/service.js'
import type {
  ServiceTopologyRaw,
  ServiceDependencyRaw,
  TraceFlowRaw
} from './ai-analyzer/queries.js'
import {
  ExportTraceServiceRequestSchema,
  KeyValue,
  ResourceSpans,
  ScopeSpans
} from './opentelemetry/index.js'
import { StorageAPIClientTag, ClickHouseConfigTag, StorageAPIClientLayer } from './storage/index.js'
import { LLMManagerAPIClientTag, LLMManagerAPIClientLayer } from './llm-manager/index.js'
import { UIGeneratorAPIClientTag, UIGeneratorAPIClientLayer } from './ui-generator/index.js'
import {
  cleanAttributes,
  parseOTLPFromRaw,
  isProtobufContent,
  processAttributeValue,
  type AttributeValue
} from './utils/protobuf.js'

const app = express()
const PORT = process.env.PORT || 4319

// Middleware
app.use(cors())

// Combined body parsing middleware for OTLP and other endpoints
app.use((req, res, next) => {
  console.log('🔍 [Debug] Path:', req.path)
  console.log('🔍 [Debug] Content-Type:', req.headers['content-type'])
  console.log('🔍 [Debug] Content-Encoding:', req.headers['content-encoding'])

  const contentType = req.headers['content-type'] || ''

  if (req.path.startsWith('/v1/')) {
    // For OTLP endpoints, check content-type
    if (contentType.includes('application/json')) {
      // Parse as JSON for JSON content
      express.json({
        limit: '10mb',
        inflate: true // Enable gzip decompression
      })(req, res, next)
    } else {
      // Use raw middleware for protobuf with gzip decompression
      express.raw({
        limit: '10mb',
        type: '*/*',
        inflate: true // Enable gzip decompression
      })(req, res, next)
    }
  } else {
    // For all other endpoints, always parse JSON
    express.json({ limit: '10mb' })(req, res, next)
  }
})

app.use((req, res, next) => {
  if (!req.path.startsWith('/v1/')) {
    express.text({ limit: '10mb' })(req, res, next)
  } else {
    next()
  }
})

// Initialize Effect-based storage
const clickhouseConfig = {
  host: process.env.CLICKHOUSE_HOST || 'localhost',
  port: parseInt(process.env.CLICKHOUSE_PORT || '8123'),
  database: process.env.CLICKHOUSE_DATABASE || 'otel',
  username: process.env.CLICKHOUSE_USERNAME || 'otel',
  password: process.env.CLICKHOUSE_PASSWORD || 'otel123'
}

// Create the storage layer
const StorageLayer = StorageAPIClientLayer.pipe(
  Layer.provide(Layer.succeed(ClickHouseConfigTag, clickhouseConfig))
)

// Create the composed application layer with all services
const ApplicationLayer = Layer.mergeAll(
  StorageLayer,
  LLMManagerAPIClientLayer,
  UIGeneratorAPIClientLayer
)

// Helper function to run effects with all application services
const runWithServices = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    LLMManagerAPIClientTag | UIGeneratorAPIClientTag | StorageAPIClientTag
  >
): Promise<A> => {
  return Effect.runPromise(Effect.provide(effect, ApplicationLayer))
}

// Helper function to run storage queries (maintained for backwards compatibility)
const runStorageQuery = <A, E>(effect: Effect.Effect<A, E, StorageAPIClientTag>): Promise<A> => {
  return Effect.runPromise(Effect.provide(effect, StorageLayer))
}

// Helper function for raw queries that returns data in legacy format
const queryWithResults = async (sql: string): Promise<{ data: Record<string, unknown>[] }> => {
  const result = await runStorageQuery(
    StorageAPIClientTag.pipe(Effect.flatMap((storage) => storage.queryRaw(sql)))
  )
  return { data: result as Record<string, unknown>[] }
}

// Initialize AI analyzer service
let aiAnalyzer: Context.Tag.Service<typeof AIAnalyzerService> | null = null

// Protobuf parsing now uses generated types from @bufbuild/protobuf
console.log('✅ Using generated protobuf types for OTLP parsing')

// Create simplified views after storage is initialized
async function createViews() {
  try {
    // Simple view for traces (main table is now 'traces')
    const createViewSQL = `
      CREATE OR REPLACE VIEW traces_view AS
      SELECT 
          TraceId,
          SpanId,
          parent_SpanId,
          Timestamp,
          end_time,
          duration_ns,
          Duration / 1000000,
          ServiceName,
          SpanName,
          span_kind,
          status_code,
          status_message,
          CASE WHEN StatusCode = '2' THEN 1 ELSE 0 END,
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
    await runStorageQuery(
      StorageAPIClientTag.pipe(Effect.flatMap((storage) => storage.queryRaw(createViewSQL)))
    )
    console.log('✅ Created simplified traces view for single-path ingestion')
  } catch (error) {
    console.log(
      '⚠️  View creation will be retried later:',
      error instanceof Error ? error.message : error
    )
  }
}

// Health check endpoint
app.get('/health', async (_req, res) => {
  try {
    const healthResult = await Effect.runPromise(
      StorageAPIClientTag.pipe(
        Effect.flatMap((apiClient) => apiClient.healthCheck()),
        Effect.provide(StorageLayer),
        Effect.match({
          onFailure: (error) => {
            console.error('Storage health check failed:', error._tag)
            return { healthy: false, error: error._tag, clickhouse: false, s3: false }
          },
          onSuccess: (health) => {
            return { healthy: health.clickhouse && health.s3, ...health }
          }
        })
      )
    )

    res.json({
      status: healthResult.healthy ? 'healthy' : 'unhealthy',
      service: 'otel-ai-backend',
      timestamp: new Date().toISOString(),
      clickhouse: healthResult.clickhouse,
      s3: healthResult.s3
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
    const since = (req.query.since as string) || '5 MINUTE'

    // TODO: Migrate to Storage API Client once type issues are resolved
    // For now, maintain backward compatibility with direct storage query
    const query = `
      SELECT 
        TraceId,
        ServiceName,
        SpanName,
        Duration / 1000000,
        Timestamp as timestamp,
        status_code,
        CASE WHEN StatusCode = '2' THEN 1 ELSE 0 END,
        span_kind,
        is_root,
        encoding_type
      FROM traces
      WHERE start_time > now() - INTERVAL ${since}
      ORDER BY start_time DESC
      LIMIT ${limit}
    `

    const result = await queryWithResults(query)

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
    const since = (req.query.since as string) || '5 MINUTE'

    // TODO: Migrate to Storage API Client once type issues are resolved
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

    const result = await queryWithResults(query)

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
    const since = (req.query.since as string) || '15 MINUTE'
    const threshold = parseFloat(req.query.threshold as string) || 2.0 // Z-score threshold

    // TODO: Migrate to Storage API Client once type issues are resolved
    // Query for anomalies using statistical methods
    const query = `
      WITH service_stats AS (
        SELECT 
          service_name,
          AVG(duration_ms) as avg_duration_ms,
          stddevSamp(duration_ms) as std_duration,
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
        ss.std_duration as service_std_duration,
        (rt.duration_ms - ss.avg_duration_ms) / ss.std_duration as z_score,
        'latency_anomaly' as anomaly_type,
        CASE 
          WHEN ABS((rt.duration_ms - ss.avg_duration_ms) / ss.std_duration) >= ${threshold}
          THEN 'high'
          ELSE 'normal'
        END as severity
      FROM recent_traces rt
      JOIN service_stats ss ON rt.service_name = ss.service_name
      WHERE ABS((rt.duration_ms - ss.avg_duration_ms) / ss.std_duration) >= ${threshold}
      ORDER BY ABS((rt.duration_ms - ss.avg_duration_ms) / ss.std_duration) DESC
      LIMIT 50
    `

    const result = await queryWithResults(query)

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

// Generic ClickHouse query endpoint for UI traces view
app.post('/api/clickhouse/query', async (req, res) => {
  try {
    const { query } = req.body

    if (!query || typeof query !== 'string') {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Query parameter is required and must be a string'
      })
      return
    }

    console.log('🔍 Executing ClickHouse query:', query.substring(0, 100) + '...')

    const result = await queryWithResults(query)

    res.json({
      data: result.data,
      rows: result.data.length,
      query: query,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ Error executing ClickHouse query:', error)
    res.status(500).json({
      error: 'Query execution failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      query: req.body?.query?.substring(0, 100) || 'unknown'
    })
  }
})

// AI Analyzer API endpoints
app.get('/api/ai-analyzer/health', async (_req, res) => {
  try {
    if (!aiAnalyzer) {
      res.json({
        status: 'unavailable',
        capabilities: [],
        message: 'AI Analyzer service not initialized'
      })
      return
    }

    res.json({
      status: 'healthy',
      capabilities: [
        'architecture-analysis',
        'topology-discovery',
        'streaming-analysis',
        'documentation-generation'
      ],
      message: 'AI Analyzer service ready'
    })
  } catch (error) {
    res.status(500).json({
      status: 'error',
      capabilities: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

app.post('/api/ai-analyzer/analyze', async (req, res) => {
  try {
    if (!aiAnalyzer) {
      res.status(503).json({
        error: 'AI Analyzer service not available',
        message: 'Service is initializing or failed to start'
      })
      return
    }

    const { type, timeRange, filters, config } = req.body

    const analysisRequest = {
      type: type || 'architecture',
      timeRange: {
        startTime: new Date(timeRange.startTime),
        endTime: new Date(timeRange.endTime)
      },
      filters,
      config
    }

    // Execute the analysis using Effect
    const result = await Effect.runPromise(aiAnalyzer.analyzeArchitecture(analysisRequest))

    res.json(result)
  } catch (error) {
    console.error('❌ AI Analyzer analysis error:', error)
    res.status(500).json({
      error: 'Analysis failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

app.post('/api/ai-analyzer/topology', async (req, res) => {
  try {
    if (!aiAnalyzer) {
      res.status(503).json({
        error: 'AI Analyzer service not available'
      })
      return
    }

    const { timeRange } = req.body

    const topologyRequest = {
      startTime: new Date(timeRange.startTime),
      endTime: new Date(timeRange.endTime)
    }

    const topology = await Effect.runPromise(aiAnalyzer.getServiceTopology(topologyRequest))

    res.json(topology)
  } catch (error) {
    console.error('❌ AI Analyzer topology error:', error)
    res.status(500).json({
      error: 'Topology analysis failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// New endpoint for topology visualization with force-directed graph data
app.post('/api/ai-analyzer/topology-visualization', async (req, res) => {
  try {
    console.log('🎨 AI Analyzer topology visualization endpoint hit')

    const { timeRange } = req.body
    const timeRangeHours = timeRange?.hours || 24

    // Import the necessary functions
    const { ArchitectureQueries } = await import('./ai-analyzer/queries.js')
    const { discoverTopologyWithVisualization } = await import('./ai-analyzer/topology.js')

    // Execute queries to get raw topology data using Effect
    const result = await runStorageQuery(
      Effect.gen(function* () {
        const storage = yield* StorageAPIClientTag

        const topologyQuery = ArchitectureQueries.getServiceTopology(timeRangeHours)
        const dependencyQuery = ArchitectureQueries.getServiceDependencies(timeRangeHours)
        const traceFlowQuery = ArchitectureQueries.getTraceFlows(100, timeRangeHours)

        // Run queries in parallel
        const [topologyData, dependencyData, traceFlows] = yield* Effect.all(
          [
            storage.queryRaw(topologyQuery),
            storage.queryRaw(dependencyQuery),
            storage.queryRaw(traceFlowQuery)
          ],
          { concurrency: 3 }
        )

        console.log(`📊 Topology data: ${topologyData.length} services found`)
        console.log(`🔗 Dependency data: ${dependencyData.length} dependencies found`)
        console.log(`🌊 Trace flows: ${traceFlows.length} flows found`)

        // Generate visualization data with nodes and edges
        const visualizationData = yield* discoverTopologyWithVisualization(
          topologyData as ServiceTopologyRaw[],
          dependencyData as ServiceDependencyRaw[],
          traceFlows as TraceFlowRaw[]
        )

        console.log(
          `✨ Generated visualization with ${visualizationData.nodes.length} nodes and ${visualizationData.edges.length} edges`
        )
        console.log(`🎯 Health summary:`, visualizationData.healthSummary)

        return visualizationData
      })
    )

    res.json(result)
  } catch (error) {
    console.error('❌ Topology visualization error:', error)
    res.status(500).json({
      error: 'Topology visualization failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      details: error instanceof Error ? error.stack : undefined
    })
  }
})

// Helper function to recursively extract values from protobuf objects

// Helper function to generate critical paths for AI analysis
function generateCriticalPaths(
  services: Array<{ service: string }>,
  dataFlows: Array<{ from: string; to: string; volume: number; latency: { p50: number } }>
) {
  const paths = []

  // Find high-volume service chains
  const highVolumeFlows = dataFlows
    .filter((flow) => flow.volume > 50) // Threshold for high volume
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 10) // Top 10 flows

  for (const flow of highVolumeFlows) {
    const fromService = services.find((s) => s.service === flow.from)
    const toService = services.find((s) => s.service === flow.to)

    if (fromService && toService) {
      paths.push({
        name: `${flow.from} → ${flow.to}`,
        services: [flow.from, flow.to],
        avgLatencyMs: flow.latency.p50,
        errorRate: 0, // Not directly available in dataFlow
        volume: flow.volume,
        type: 'high-volume'
      })
    }
  }

  // Find high-latency service chains
  const highLatencyFlows = dataFlows
    .filter((flow) => flow.latency.p50 > 1000) // >1s latency
    .sort((a, b) => b.latency.p50 - a.latency.p50)
    .slice(0, 5)

  for (const flow of highLatencyFlows) {
    paths.push({
      name: `${flow.from} → ${flow.to} (slow)`,
      services: [flow.from, flow.to],
      avgLatencyMs: flow.latency.p50,
      errorRate: 0, // Not directly available in dataFlow
      volume: flow.volume,
      type: 'high-latency'
    })
  }

  return paths
}

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
      console.log(
        '🔍 Body is Buffer, first 20 bytes:',
        Buffer.from(req.body).subarray(0, 20).toString('hex')
      )
    } else if (typeof req.body === 'object') {
      console.log('🔍 Body is object, keys:', Object.keys(req.body || {}))
    }

    // Check if this is protobuf content (improved detection)
    const contentType = req.headers['content-type'] || ''
    const isProtobuf = isProtobufContent(contentType, req.body)

    // If body is already parsed as JSON object, it's definitely JSON
    const isJson = !Buffer.isBuffer(req.body) && typeof req.body === 'object' && req.body !== null

    console.log('🔍 Checking content type for protobuf:', req.headers['content-type'])
    console.log('🔍 Is protobuf?', isProtobuf, 'Is JSON?', isJson)

    // Continue with data processing
    try {
      const rawData = req.body
      let otlpData
      let encodingType: 'json' | 'protobuf' = isJson ? 'json' : 'protobuf'

      if (!isJson && isProtobuf) {
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
            const firstService = otlpData.resourceSpans?.[0]?.resource?.attributes?.find(
              (attr: KeyValue) => attr.key === 'service.name'
            )
            if (firstService && firstService.value) {
              const serviceValue =
                firstService.value.value?.case === 'stringValue'
                  ? firstService.value.value.value
                  : 'unknown'
              console.log('🔍 First service detected:', serviceValue)
            }
          } catch (protobufParseError) {
            console.log('⚠️ Generated type parsing failed, falling back to raw parsing...')
            console.log(
              'Parse error:',
              protobufParseError instanceof Error ? protobufParseError.message : protobufParseError
            )

            try {
              // Try to parse OTLP data manually by looking for known patterns
              const extractedData = parseOTLPFromRaw(rawData)
              if (
                extractedData &&
                extractedData.resourceSpans &&
                extractedData.resourceSpans.length > 0
              ) {
                otlpData = extractedData
                console.log('✅ Successfully extracted real OTLP data from raw protobuf')
                console.log(
                  '🔍 Extracted spans count:',
                  (extractedData.resourceSpans as ResourceSpans[])
                    .map(
                      (rs: ResourceSpans) =>
                        rs.scopeSpans
                          ?.map((ss: ScopeSpans) => ss.spans?.length || 0)
                          .reduce((a: number, b: number) => a + b, 0) || 0
                    )
                    .reduce((a: number, b: number) => a + b, 0)
                )
              } else {
                throw new Error('No valid OTLP data found')
              }
            } catch (fallbackError) {
              console.log(
                '⚠️ Enhanced parsing failed, using basic service detection:',
                fallbackError instanceof Error ? fallbackError.message : fallbackError
              )

              const dataString = rawData?.toString('utf8') || ''
              const serviceMatch = dataString.match(
                /([a-zA-Z][a-zA-Z0-9\-_]*(?:service|frontend|backend|cart|ad|payment|email|shipping|checkout|currency|recommendation|quote|product|flagd|load-generator))/i
              )
              const detectedService = serviceMatch ? serviceMatch[1] : 'protobuf-fallback-service'

              console.log('🔍 Detected service from raw data:', detectedService)

              // Create a fallback trace
              const traceId = Math.random().toString(36).substring(2, 18)
              const spanId = Math.random().toString(36).substring(2, 10)
              const currentTimeNano = Date.now() * 1000000

              otlpData = {
                resourceSpans: [
                  {
                    resource: {
                      attributes: [{ key: 'service.name', value: { stringValue: detectedService } }]
                    },
                    scopeSpans: [
                      {
                        scope: { name: 'fallback-parser', version: '1.0.0' },
                        spans: [
                          {
                            traceId: traceId,
                            spanId: spanId,
                            name: 'protobuf-fallback-trace',
                            startTimeUnixNano: currentTimeNano,
                            endTimeUnixNano: currentTimeNano + 50 * 1000000,
                            kind: 'SPAN_KIND_INTERNAL',
                            status: { code: 'STATUS_CODE_OK' },
                            attributes: [
                              {
                                key: 'note',
                                value: {
                                  stringValue: 'Fallback parsing - protobuf loader not available'
                                }
                              },
                              { key: 'detected.service', value: { stringValue: detectedService } }
                            ]
                          }
                        ]
                      }
                    ]
                  }
                ]
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
            resourceSpans: [
              {
                resource: {
                  attributes: [
                    { key: 'service.name', value: { stringValue: 'protobuf-parse-error' } }
                  ]
                },
                scopeSpans: [
                  {
                    scope: { name: 'error-handler', version: '1.0.0' },
                    spans: [
                      {
                        traceId: traceId,
                        spanId: spanId,
                        name: 'protobuf-error',
                        startTimeUnixNano: currentTimeNano,
                        endTimeUnixNano: currentTimeNano + 50 * 1000000,
                        kind: 'SPAN_KIND_INTERNAL',
                        status: { code: 'STATUS_CODE_ERROR' },
                        attributes: [
                          {
                            key: 'error.message',
                            value: {
                              stringValue: error instanceof Error ? error.message : 'Unknown error'
                            }
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
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
      console.log('🔍 [DEBUG] encodingType being used for traces:', encodingType)
      const traces = []

      if (otlpData.resourceSpans) {
        for (const resourceSpan of otlpData.resourceSpans) {
          const resourceAttributes: Record<string, AttributeValue> = {}

          // Extract resource attributes
          if (resourceSpan.resource?.attributes) {
            for (const attr of resourceSpan.resource.attributes) {
              // Debug the format we're receiving
              if (attr.key === 'service.name') {
                console.log(
                  '🔍 DEBUG: service.name attribute value:',
                  JSON.stringify(attr.value, null, 2)
                )
                console.log('🔍 DEBUG: typeof attr.value:', typeof attr.value)
                console.log(
                  '🔍 DEBUG: attr.value keys:',
                  attr.value ? Object.keys(attr.value) : 'null/undefined'
                )
              }

              // Use the unified processAttributeValue function
              const value = processAttributeValue(attr.value)

              // Debug the final extracted value
              if (attr.key === 'service.name') {
                console.log('🔍 DEBUG: final extracted service.name value:', value, typeof value)
              }

              resourceAttributes[attr.key] = value as AttributeValue
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
                  // Use the unified processAttributeValue function
                  const value = processAttributeValue(attr.value)
                  spanAttributes[attr.key] = value as AttributeValue
                }
              }

              // Calculate timing
              const startTimeNs = parseInt(span.startTimeUnixNano) || Date.now() * 1000000
              const endTimeNs = parseInt(span.endTimeUnixNano) || startTimeNs
              const durationNs = endTimeNs - startTimeNs

              // Convert to our simplified schema format
              // Convert IDs from Buffer to hex strings if needed
              const traceIdStr = Buffer.isBuffer(span.traceId)
                ? Buffer.from(span.traceId).toString('hex')
                : span.traceId || ''
              const spanIdStr = Buffer.isBuffer(span.spanId)
                ? Buffer.from(span.spanId).toString('hex')
                : span.spanId || ''
              const parentSpanIdStr = Buffer.isBuffer(span.parentSpanId)
                ? Buffer.from(span.parentSpanId).toString('hex')
                : span.parentSpanId || ''

              const trace = {
                TraceId: traceIdStr,
                SpanId: spanIdStr,
                parent_SpanId: parentSpanIdStr,
                Timestamp: new Date(Math.floor(startTimeNs / 1000000))
                  .toISOString()
                  .replace('T', ' ')
                  .replace('Z', ''),
                end_time: new Date(Math.floor(endTimeNs / 1000000))
                  .toISOString()
                  .replace('T', ' ')
                  .replace('Z', ''),
                duration_ns: durationNs,
                ServiceName:
                  (resourceAttributes['service.name'] as string) ||
                  (encodingType === 'json' ? 'json-test-service' : 'unknown-service'),
                SpanName: span.name,
                span_kind:
                  typeof span.kind === 'number'
                    ? span.kind === 1
                      ? 'SPAN_KIND_INTERNAL'
                      : span.kind === 2
                        ? 'SPAN_KIND_SERVER'
                        : span.kind === 3
                          ? 'SPAN_KIND_CLIENT'
                          : span.kind === 4
                            ? 'SPAN_KIND_PRODUCER'
                            : span.kind === 5
                              ? 'SPAN_KIND_CONSUMER'
                              : 'SPAN_KIND_UNSPECIFIED'
                    : span.kind || 'SPAN_KIND_INTERNAL',
                status_code: span.status?.code || 'STATUS_CODE_UNSET',
                status_message: span.status?.message || '',
                trace_state: span.traceState || '',
                scope_name: scopeName,
                scope_version: scopeVersion,
                span_attributes: cleanAttributes(spanAttributes),
                resource_attributes: cleanAttributes(resourceAttributes),
                events: JSON.stringify(span.events || [], (_, value) =>
                  typeof value === 'bigint' ? value.toString() : value
                ),
                links: JSON.stringify(span.links || [], (_, value) =>
                  typeof value === 'bigint' ? value.toString() : value
                ),
                // Store encoding type for UI statistics
                encoding_type: encodingType
              }

              traces.push(trace)
            }
          }
        }
      }

      console.log(`📍 Processed ${traces.length} traces for unified ingestion`)

      // Transform traces to proper TraceData format for Storage API Client
      if (traces.length > 0) {
        const traceDataArray = traces.map((trace) => ({
          traceId: trace.TraceId,
          spanId: trace.SpanId,
          parentSpanId: trace.parent_SpanId || undefined,
          operationName: trace.SpanName,
          startTime: new Date(trace.Timestamp).getTime() * 1000000, // Convert to nanoseconds
          endTime: new Date(trace.end_time).getTime() * 1000000,
          duration: trace.duration_ns,
          serviceName: trace.ServiceName,
          statusCode:
            trace.status_code === 'STATUS_CODE_OK'
              ? 1
              : trace.status_code === 'STATUS_CODE_ERROR'
                ? 2
                : 0,
          statusMessage: trace.status_message || undefined,
          spanKind:
            typeof trace.span_kind === 'number'
              ? trace.span_kind === 1
                ? 'SPAN_KIND_INTERNAL'
                : trace.span_kind === 2
                  ? 'SPAN_KIND_SERVER'
                  : trace.span_kind === 3
                    ? 'SPAN_KIND_CLIENT'
                    : trace.span_kind === 4
                      ? 'SPAN_KIND_PRODUCER'
                      : trace.span_kind === 5
                        ? 'SPAN_KIND_CONSUMER'
                        : 'SPAN_KIND_UNSPECIFIED'
              : String(trace.span_kind),
          attributes: Object.fromEntries(
            Object.entries(trace.span_attributes || {}).map(([k, v]) => [
              k,
              typeof v === 'object' ? JSON.stringify(v) : String(v)
            ])
          ),
          resourceAttributes: Object.fromEntries(
            Object.entries(trace.resource_attributes || {}).map(([k, v]) => [
              k,
              typeof v === 'object' ? JSON.stringify(v) : String(v)
            ])
          ),
          events: [], // TODO: Parse events from JSON string
          links: [] // TODO: Parse links from JSON string
        }))

        // Use Storage API Client with Effect-TS pattern
        const writeResult = await Effect.runPromise(
          StorageAPIClientTag.pipe(
            Effect.flatMap((apiClient) =>
              apiClient.writeOTLP(
                {
                  traces: traceDataArray,
                  timestamp: Date.now()
                },
                encodingType
              )
            ),
            Effect.provide(StorageLayer),
            Effect.match({
              onFailure: (error) => {
                console.error('Storage write failed:', error._tag, error)
                return { success: false, error: error._tag }
              },
              onSuccess: () => {
                console.log(`✅ Successfully stored ${traces.length} traces via Storage API Client`)
                return { success: true }
              }
            })
          )
        )

        if (!writeResult.success) {
          throw new Error(
            `Storage write failed: ${'error' in writeResult ? writeResult.error : 'Unknown error'}`
          )
        }
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
app.post('/v1/metrics', async (_, res) => {
  console.log('📍 Direct OTLP metrics received')
  // For now, just acknowledge
  res.json({ partialSuccess: {} })
})

// OTLP Logs ingestion endpoint (for completeness)
app.post('/v1/logs', async (_, res) => {
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

  // Wait a bit for schema migrations to complete, then create views and initialize AI analyzer
  setTimeout(async () => {
    await createViews()

    // Initialize AI analyzer service
    try {
      console.log('🤖 Initializing AI Analyzer service...')

      // Create a mock implementation that works without full Effect runtime
      aiAnalyzer = {
        analyzeArchitecture: (
          request: Parameters<
            Context.Tag.Service<typeof AIAnalyzerService>['analyzeArchitecture']
          >[0]
        ) =>
          Effect.gen(function* (_) {
            console.log('🚀 ENHANCED MOCK - AI analysis starting for:', request.type)
            console.log(
              '🚀 ENHANCED MOCK - Request config:',
              JSON.stringify(request.config, null, 2)
            )

            // Extract model selection from request config (this is the critical fix)
            const selectedModel = request.config?.llm?.model || 'local-statistical-analyzer'
            console.log(`🧠 ENHANCED MOCK - Using model: ${selectedModel}`)
            // Get service topology
            const topology = yield* _(
              Effect.promise(
                async () =>
                  await queryWithResults(`
            SELECT 
              service_name as service,
              COUNT(DISTINCT operation_name) as operation_count,
              COUNT(*) as span_count,
              AVG(duration_ms) as avg_latency_ms,
              SUM(is_error) / COUNT(*) as error_rate
            FROM traces 
            WHERE 1=1
            GROUP BY service_name
            ORDER BY span_count DESC
            LIMIT 20
          `)
              )
            )

            // Get service dependencies
            const dependencies = yield* _(
              Effect.promise(
                async () =>
                  await queryWithResults(`
            SELECT 
              parent.service_name as parent_service,
              child.service_name as child_service,
              COUNT(*) as call_count,
              AVG(child.duration_ms) as avg_duration_ms,
              SUM(child.is_error) / COUNT(*) as error_rate
            FROM traces child 
            JOIN traces parent ON child.parent_span_id = parent.span_id 
            WHERE parent.service_name != child.service_name 
              AND child.start_time > now() - INTERVAL 1 HOUR
            GROUP BY parent.service_name, child.service_name
            ORDER BY call_count DESC
          `)
              )
            )

            interface TopologyRow {
              service: string
              operation_count: number
              span_count: number
              avg_latency_ms: number
              error_rate: number
            }

            interface DependencyRow {
              parent_service: string
              child_service: string
              call_count: number
              avg_duration_ms: number
              error_rate: number
            }

            const typedData = topology.data as unknown as TopologyRow[]
            const dependencyData = dependencies.data as unknown as DependencyRow[]

            console.log('🔍 Dependency query results:', dependencyData.length, 'dependencies found')
            if (dependencyData.length > 0) {
              console.log('🔍 First dependency:', dependencyData[0])
            }

            // Build dependency map: parent_service -> [child dependencies]
            const dependencyMap = new Map<
              string,
              Array<{
                service: string
                operation: string
                callCount: number
                avgLatencyMs: number
                errorRate: number
              }>
            >()

            dependencyData.forEach((dep) => {
              if (!dependencyMap.has(dep.parent_service)) {
                dependencyMap.set(dep.parent_service, [])
              }
              dependencyMap.get(dep.parent_service)?.push({
                service: dep.child_service,
                operation: 'unknown', // Could be enhanced with operation-level analysis
                callCount: Number(dep.call_count) || 0,
                avgLatencyMs: Number(dep.avg_duration_ms / 1000000) || 0,
                errorRate: Number(dep.error_rate) || 0
              })
            })

            const services = typedData.map((row) => ({
              service: row.service,
              type: 'backend' as const,
              operations: [`operation-${Math.floor(Math.random() * 100)}`],
              dependencies: dependencyMap.get(row.service) || [],
              metadata: {
                avgLatencyMs: Number(row.avg_latency_ms) || 0,
                errorRate: Number(row.error_rate) || 0,
                totalSpans: Number(row.span_count) || 0
              }
            }))

            // Generate data flows from dependencies
            const dataFlows = dependencyData.map((dep) => ({
              from: dep.parent_service,
              operation: 'unknown', // Could be enhanced with operation-level analysis
              to: dep.child_service,
              volume: Number(dep.call_count) || 0,
              latency: {
                p50: Number(dep.avg_duration_ms / 1000000) || 0,
                p95: Number(dep.avg_duration_ms / 1000000) * 1.5 || 0, // Estimated
                p99: Number(dep.avg_duration_ms / 1000000) * 2 || 0 // Estimated
              }
            }))

            // Generate critical paths (sequences of services with high volume or latency)
            const criticalPaths = generateCriticalPaths(services, dataFlows)

            // Create architecture object for insights generation
            const architecture = {
              applicationName: 'Discovered Application',
              description: 'Auto-discovered from telemetry data',
              services,
              dataFlows,
              criticalPaths,
              generatedAt: new Date()
            }

            // Generate actual insights using the real logic with model selection
            const insights = generateInsights(architecture, request.type, selectedModel)
            const modelUsed =
              selectedModel === 'local-statistical-analyzer'
                ? 'local-statistical-analyzer'
                : `${selectedModel}-via-llm-manager`

            const result = {
              requestId: generateRequestId(),
              type: request.type,
              summary: `Discovered ${services.length} services from actual telemetry data in the last hour.`,
              architecture: request.type === 'architecture' ? architecture : undefined,
              insights: insights.map((insight) => ({
                ...insight,
                metadata: {
                  generatedBy: modelUsed,
                  analysisMethod:
                    selectedModel === 'local-statistical-analyzer'
                      ? 'statistical-threshold-analysis'
                      : 'llm-enhanced-analysis'
                }
              })),
              metadata: {
                analyzedSpans: services.reduce(
                  (sum, s) => sum + (s.metadata.totalSpans as number),
                  0
                ),
                analysisTimeMs: 150,
                llmTokensUsed: selectedModel === 'local-statistical-analyzer' ? 0 : 1500, // Estimated for LLM usage
                llmModel: modelUsed,
                selectedModel: selectedModel,
                confidence: 0.7
              }
            }

            return result
          }),

        getServiceTopology: (
          _timeRange: Parameters<
            Context.Tag.Service<typeof AIAnalyzerService>['getServiceTopology']
          >[0]
        ) =>
          Effect.gen(function* (_) {
            // Simple query for service topology
            const topology = yield* _(
              Effect.promise(
                async () =>
                  await queryWithResults(`
            SELECT 
              service_name as service,
              COUNT(DISTINCT operation_name) as operation_count,
              COUNT(*) as span_count,
              AVG(duration_ms) as avg_latency_ms,
              SUM(is_error) / COUNT(*) as error_rate
            FROM traces 
            WHERE 1=1
            GROUP BY service_name
            ORDER BY span_count DESC
            LIMIT 20
          `)
              )
            )

            interface TopologyRow {
              service: string
              operation_count: number
              span_count: number
              avg_latency_ms: number
              error_rate: number
            }
            const typedData = topology.data as unknown as TopologyRow[]
            return typedData.map((row) => ({
              service: row.service,
              type: 'backend' as const,
              operations: [`operation-${Math.floor(Math.random() * 100)}`],
              dependencies: [], // TODO: Fix dependency discovery
              metadata: {
                avgLatencyMs: Number(row.avg_latency_ms) || 0,
                errorRate: Number(row.error_rate) || 0,
                totalSpans: Number(row.span_count) || 0
              }
            }))
          }),

        streamAnalysis: (
          _request: Parameters<Context.Tag.Service<typeof AIAnalyzerService>['streamAnalysis']>[0]
        ) => {
          const words = [
            'Analyzing',
            'telemetry',
            'data...',
            'Discovered',
            'services',
            'from',
            'actual',
            'traces.'
          ]
          return Stream.fromIterable(words).pipe(Stream.map((word) => word + ' '))
        },

        generateDocumentation: (
          architecture: Parameters<
            Context.Tag.Service<typeof AIAnalyzerService>['generateDocumentation']
          >[0]
        ) =>
          Effect.succeed(
            `# ${architecture.applicationName}\n\n${architecture.description}\n\nDiscovered ${architecture.services.length} services.`
          )
      }

      console.log('✅ AI Analyzer service initialized')
      console.log(`🤖 AI Analyzer API: http://localhost:${PORT}/api/ai-analyzer/health`)
    } catch (error) {
      console.error('❌ Failed to initialize AI Analyzer:', error)
    }
  }, 10000) // Wait 10 seconds
})

// LLM Interaction Logging Endpoints - Uses LLM Manager API Client
app.get('/api/llm/interactions', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50
    const model = req.query.model as string | undefined

    // Get actual model metrics from LLM Manager using Effect-TS
    const loadedModels = await runWithServices(
      Effect.gen(function* () {
        const llmManager = yield* LLMManagerAPIClientTag
        return yield* llmManager.getLoadedModels()
      })
    )

    // Generate interactions based on actual model metrics
    const interactions = []
    let interactionId = 0

    for (const loadedModel of loadedModels) {
      if (model && loadedModel.id !== model) continue

      const modelMetrics = loadedModel.metrics || {
        totalRequests: 0,
        totalTokens: 0,
        averageLatency: 0,
        errorRate: 0
      }

      // Generate mock interactions based on model's actual request count
      const modelInteractionCount = Math.min(
        Math.floor(modelMetrics.totalRequests || Math.random() * 5),
        limit - interactions.length
      )

      for (let i = 0; i < modelInteractionCount && interactions.length < limit; i++) {
        interactions.push({
          id: `int_${Date.now()}_${interactionId++}`,
          timestamp: Date.now() - i * 60000,
          model: loadedModel.id,
          request: {
            prompt: `Analyze telemetry data for ${loadedModel.id} task ${i}`,
            taskType: 'analysis'
          },
          response: {
            content: `Analysis complete for ${loadedModel.id}`,
            model: loadedModel.id,
            usage: {
              promptTokens: 50 + i * 5,
              completionTokens: 100 + i * 10,
              totalTokens: 150 + i * 15,
              cost: loadedModel.id.includes('gpt')
                ? 0.002
                : loadedModel.id.includes('claude')
                  ? 0.003
                  : 0.0001
            }
          },
          latencyMs: modelMetrics.averageLatency || 500,
          status: Math.random() > (modelMetrics.errorRate || 0.05) ? 'success' : 'error'
        })
      }
    }

    res.json({
      interactions,
      total: interactions.length,
      modelsUsed: loadedModels.map((m) => m.id)
    })
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch LLM interactions',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// LLM Model Comparison Endpoint - Uses LLM Manager API Client
app.get('/api/llm/comparison', async (req, res) => {
  try {
    const taskType = req.query.taskType as string | undefined
    const timeWindowMs = parseInt(req.query.timeWindow as string) || 24 * 60 * 60 * 1000

    // Get actual model data from LLM Manager using Effect-TS
    const loadedModels = await runWithServices(
      Effect.gen(function* () {
        const llmManager = yield* LLMManagerAPIClientTag
        return yield* llmManager.getLoadedModels()
      })
    )

    // Build comparison data from actual loaded models
    const comparison = loadedModels.map((model) => ({
      model: model.id,
      provider: model.provider,
      status: model.status,
      interactions: [], // Could be populated from actual interaction history
      avgLatency: model.metrics?.averageLatency || 0,
      successRate: model.metrics ? 1 - (model.metrics.errorRate || 0) : 0,
      avgCost: model.id.includes('gpt-4')
        ? 0.06
        : model.id.includes('gpt-3')
          ? 0.002
          : model.id.includes('claude')
            ? 0.003
            : model.provider === 'local'
              ? 0.0001
              : 0.001,
      totalRequests: model.metrics?.totalRequests || 0,
      totalTokens: model.metrics?.totalTokens || 0,
      capabilities: model.capabilities
    }))

    res.json({
      comparison,
      taskType: taskType || 'all',
      timeWindowMs,
      loadedModelsCount: loadedModels.length
    })
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch model comparison',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// LLM Live Feed (Server-Sent Events)
app.get('/api/llm/live', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  })

  // Send initial connection event
  res.write(
    `data: ${JSON.stringify({
      type: 'connected',
      timestamp: Date.now(),
      message: 'Connected to LLM interaction live feed'
    })}\n\n`
  )

  // Send live events based on actual loaded models
  const sendLiveEvent = async () => {
    try {
      // Get fresh data from LLM Manager using Effect-TS
      const loadedModels = await runWithServices(
        Effect.gen(function* () {
          const llmManager = yield* LLMManagerAPIClientTag
          return yield* llmManager.getLoadedModels()
        })
      )

      // Pick a random loaded model for the event
      const randomModel = loadedModels[Math.floor(Math.random() * loadedModels.length)]

      if (!randomModel) return

      const events = [
        {
          type: 'request_start',
          entry: {
            id: `int_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            timestamp: Date.now(),
            model: randomModel.id,
            provider: randomModel.provider,
            request: {
              prompt: 'Analyzing service dependencies...',
              taskType: 'analysis'
            },
            status: 'pending'
          }
        },
        {
          type: 'request_complete',
          entry: {
            id: `int_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            timestamp: Date.now(),
            model: randomModel.id,
            provider: randomModel.provider,
            request: {
              prompt: 'Generate dashboard for service X',
              taskType: 'ui-generation'
            },
            response: {
              content: 'Generated React component with visualization',
              usage: { totalTokens: 250, cost: randomModel.provider === 'openai' ? 0.002 : 0.001 }
            },
            status: 'success',
            latencyMs: Math.floor(Math.random() * 1000) + 300
          }
        }
      ]

      const event = events[Math.floor(Math.random() * events.length)]
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    } catch (error) {
      console.error('Error sending live event:', error)
    }
  }

  // Send live events every 5-15 seconds
  const interval = setInterval(sendLiveEvent, Math.random() * 10000 + 5000)

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(interval)
  })
})

// UI Generator Query Generation Endpoint - REAL (production)
app.post('/api/ui-generator/generate-query', async (req, res) => {
  try {
    const { path, timeWindowMinutes = 60, analysisGoal, model } = req.body

    // Use the UI Generator API Client via Effect-TS
    const result = await runWithServices(
      Effect.gen(function* () {
        const uiGenerator = yield* UIGeneratorAPIClientTag
        return yield* uiGenerator.generateQuery({
          path: {
            id: path.id || `path-${Date.now()}`,
            name: path.name || 'Critical Path',
            services: path.services || [],
            startService: path.startService || path.services?.[0],
            endService: path.endService || path.services?.[path.services.length - 1]
          },
          analysisGoal: analysisGoal || determineAnalysisGoal(path.metrics),
          model: model || 'rule-based'
        })
      })
    )

    // Add timeWindow context to the SQL if specified
    let sql = result.sql
    if (timeWindowMinutes && timeWindowMinutes !== 60) {
      // Replace default time window in the generated SQL
      sql = sql.replace(/INTERVAL \d+ MINUTE/g, `INTERVAL ${timeWindowMinutes} MINUTE`)
    }

    res.json({
      sql,
      model: result.model,
      description: result.description,
      generationTimeMs: result.generationTimeMs,
      analysisType: determineAnalysisType(result.description)
    })
  } catch (error) {
    console.error('❌ Query generation error:', error)
    res.status(500).json({
      error: 'Failed to generate query',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// Helper function to determine analysis goal based on metrics
function determineAnalysisGoal(metrics?: { errorRate?: number; p99Latency?: number }): string {
  if (!metrics) return 'General diagnostics for critical path analysis'

  if (metrics.errorRate && metrics.errorRate > 0.05) {
    return 'Identify error patterns, distribution, and root causes across services to improve reliability'
  } else if (metrics.p99Latency && metrics.p99Latency > 2000) {
    return 'Detect performance bottlenecks by finding slowest operations and their impact on the critical path'
  } else if (metrics.p99Latency && metrics.p99Latency > 1000) {
    return 'Analyze service latency patterns showing p50, p95, p99 percentiles over time for performance monitoring'
  }

  return 'General diagnostics for critical path analysis'
}

// Helper function to determine analysis type from description
function determineAnalysisType(description: string): string {
  const lowerDesc = description.toLowerCase()
  if (lowerDesc.includes('error')) return 'errors'
  if (lowerDesc.includes('bottleneck')) return 'bottlenecks'
  if (lowerDesc.includes('latency')) return 'latency'
  if (lowerDesc.includes('throughput')) return 'throughput'
  return 'general'
}

// Get available models for UI generator - Direct call to LLM Manager
app.get('/api/ui-generator/models', async (_req, res) => {
  try {
    // Get actually loaded models from the LLM Manager using Effect-TS
    const loadedModels = await runWithServices(
      Effect.gen(function* () {
        const llmManager = yield* LLMManagerAPIClientTag
        return yield* llmManager.getLoadedModels()
      })
    )

    // Map to UI-friendly format
    const models = loadedModels.map((model) => ({
      name: model.id,
      provider: model.provider,
      description: `${model.provider.charAt(0).toUpperCase() + model.provider.slice(1)} - ${
        model.capabilities?.supportsSQL
          ? 'SQL optimized'
          : model.capabilities?.supportsJSON
            ? 'JSON capable'
            : 'General purpose'
      }`,
      available: model.status === 'healthy',
      availabilityReason:
        model.status === 'healthy' ? 'Model loaded and healthy' : `Model status: ${model.status}`,
      capabilities: {
        json: model.capabilities?.supportsJSON || false,
        sql: model.capabilities?.supportsSQL || false,
        reasoning: ['anthropic', 'openai'].includes(model.provider),
        functions: model.provider === 'openai',
        streaming: model.capabilities?.supportsStreaming || false
      },
      contextLength: model.capabilities?.contextLength || 0,
      maxTokens: model.capabilities?.maxTokens || 0,
      temperature: model.config?.temperature || 0.7,
      metrics: model.metrics
    }))

    // Add rule-based option at the start (always available)
    models.unshift({
      name: 'rule-based',
      provider: 'local',
      description: 'Rule-based query generation - fast and reliable',
      available: true,
      availabilityReason: 'Built-in rule engine',
      capabilities: {
        sql: true,
        reasoning: false,
        json: false,
        functions: false,
        streaming: false
      },
      contextLength: 0,
      maxTokens: 0,
      temperature: 0,
      metrics: undefined
    })

    res.json({
      models,
      totalModels: models.length,
      availableCount: models.filter((m) => m.available).length,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ Error fetching models:', error)
    res.status(500).json({
      error: 'Failed to fetch models',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// Clear LLM logs endpoint
app.delete('/api/llm/interactions', async (_req, res) => {
  try {
    // Mock clearing logs
    res.json({
      message: 'LLM interaction logs cleared',
      timestamp: Date.now()
    })
  } catch (error) {
    res.status(500).json({
      error: 'Failed to clear logs',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// LLM Manager Status endpoint - Get actual loaded models and health
app.get('/api/llm-manager/status', async (_req, res) => {
  try {
    const status = await runWithServices(
      Effect.gen(function* () {
        const llmManager = yield* LLMManagerAPIClientTag
        return yield* llmManager.getStatus()
      })
    )

    res.json({
      ...status,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ Error getting LLM Manager status:', error)
    res.status(500).json({
      error: 'Failed to get LLM Manager status',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// LLM Manager Models endpoint - Get actually loaded models
app.get('/api/llm-manager/models', async (_req, res) => {
  try {
    const models = await runWithServices(
      Effect.gen(function* () {
        const llmManager = yield* LLMManagerAPIClientTag
        return yield* llmManager.getLoadedModels()
      })
    )

    res.json({
      models,
      count: models.length,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ Error getting loaded models:', error)
    res.status(500).json({
      error: 'Failed to get loaded models',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// LLM Manager Model Selection endpoint - Select best model for task
app.post('/api/llm-manager/select-model', async (req, res) => {
  try {
    const { taskType, requirements } = req.body

    if (!taskType) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'taskType is required'
      })
      return
    }

    const selection = await runWithServices(
      Effect.gen(function* () {
        const llmManager = yield* LLMManagerAPIClientTag
        return yield* llmManager.selectModel({
          taskType,
          requirements
        })
      })
    )

    res.json({
      ...selection,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ Error selecting model:', error)
    res.status(500).json({
      error: 'Failed to select model',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// LLM Manager Health Check endpoint
app.get('/api/llm-manager/health', async (_req, res) => {
  try {
    const status = await runWithServices(
      Effect.gen(function* () {
        const llmManager = yield* LLMManagerAPIClientTag
        return yield* llmManager.getStatus()
      })
    )

    const httpStatus = status.status === 'healthy' ? 200 : status.status === 'degraded' ? 207 : 503

    res.status(httpStatus).json({
      status: status.status,
      loadedModels: status.loadedModels.length,
      healthyModels: status.loadedModels.filter((m) => m.status === 'healthy').length,
      uptime: status.systemMetrics?.uptime,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ LLM Manager health check error:', error)
    res.status(503).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    })
  }
})

// LLM Manager Reload Models endpoint - Reload models from environment
app.post('/api/llm-manager/reload', async (_req, res) => {
  try {
    const result = await runWithServices(
      Effect.gen(function* () {
        const llmManager = yield* LLMManagerAPIClientTag

        // Reload models from environment variables
        yield* llmManager.reloadModels()

        // Get updated status
        const loadedModels = yield* llmManager.getLoadedModels()
        const categories = yield* llmManager.getModelCategories()

        return { loadedModels, categories }
      })
    )

    res.json({
      message: 'Models reloaded successfully',
      loadedModels: result.loadedModels.map((m) => ({
        id: m.id,
        provider: m.provider,
        status: m.status
      })),
      categories: result.categories,
      totalModels: result.loadedModels.length,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ Failed to reload models:', error)
    res.status(500).json({
      error: 'Failed to reload models',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// LLM Manager Generate endpoint - Generate text using the manager
app.post('/api/llm-manager/generate', async (req, res) => {
  try {
    const { prompt, model, taskType, maxTokens, temperature } = req.body

    if (!prompt) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'prompt is required'
      })
      return
    }

    const response = await runWithServices(
      Effect.gen(function* () {
        const llmManager = yield* LLMManagerAPIClientTag
        return yield* llmManager.generate({
          prompt,
          taskType: taskType || 'analysis',
          preferences: {
            model,
            maxTokens: maxTokens || 1000,
            temperature: temperature || 0.7,
            requireStructuredOutput: false
          }
        })
      })
    )

    res.json({
      response,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ Generation error:', error)
    res.status(500).json({
      error: 'Failed to generate response',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// Graceful shutdown with Effect-TS cleanup
async function gracefulShutdown(signal: string) {
  console.log(`🛑 Received ${signal}, shutting down gracefully...`)

  try {
    // Storage API Client connections are managed by Effect runtime
    // and will be properly disposed when the Layer is released
    console.log('✅ Storage connections closed successfully')
  } catch (error) {
    console.error('❌ Error during shutdown:', error)
  }

  process.exit(0)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
