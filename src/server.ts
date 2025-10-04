/**
 * OTLP Ingestion Server for AI-Native Observability Platform
 * Provides direct OTLP ingestion endpoint for "direct" path testing
 * Trigger clean workflow validation
 */

import { fromBinary } from '@bufbuild/protobuf'
import cors from 'cors'
import { Effect, Layer } from 'effect'
import express from 'express'
import {
  AnnotationService,
  AnnotationServiceLive,
  DiagnosticsSessionManager,
  DiagnosticsSessionManagerLive
} from './annotations/index.js'
import {
  LLMManagerAPIClientLayer,
  LLMManagerAPIClientTag,
  LLMManagerLive,
  LLMManagerServiceTag
} from './llm-manager/index.js'
import { ExportTraceServiceRequestSchema } from './opentelemetry/index.js'
import {
  OtlpCaptureServiceLive,
  OtlpCaptureServiceTag,
  OtlpHttpReplayClientLive,
  OtlpReplayServiceLive,
  OtlpReplayServiceTag,
  type RetentionPolicy,
  RetentionServiceLive,
  RetentionServiceTag,
  TrainingDataReaderLive,
  TrainingDataReaderTag
} from './record-replay/otlp-capture/index.js'
import {
  ClickHouseConfigTag,
  ConfigServiceLive,
  REQUIRED_TABLES,
  StorageAPIClientLayer,
  StorageAPIClientTag,
  type StorageError,
  StorageLayer as StorageServiceLayer,
  StorageServiceTag
} from './storage/index.js'
import { S3StorageLive, S3StorageTag } from './storage/s3.js'
import { TopologyAnalyzerLayer, TopologyAnalyzerService } from './topology-analyzer/index.js'
import { UIGeneratorAPIClientLayer, UIGeneratorAPIClientTag } from './ui-generator/index.js'
import { type AttributeValue, cleanAttributes, isProtobufContent } from './utils/protobuf.js'

// Helper function to convert protobuf attributes array to Record format
function convertAttributesToRecord(attributes: unknown): Record<string, unknown> {
  if (!attributes) {
    return {}
  }

  // If it's already a Record, return it
  if (typeof attributes === 'object' && !Array.isArray(attributes) && attributes !== null) {
    return attributes as Record<string, unknown>
  }

  // If it's an array of KeyValue objects, convert to Record
  if (Array.isArray(attributes)) {
    const result: Record<string, unknown> = {}
    for (const attr of attributes) {
      if (typeof attr === 'object' && attr !== null && 'key' in attr && 'value' in attr) {
        const keyValuePair = attr as { key: string; value: unknown }
        result[keyValuePair.key] = keyValuePair.value
      }
    }
    return result
  }

  return {}
}

// Import routers from package index files
import {
  AIInsightsRouterLive,
  AIInsightsRouterTag,
  CriticalPathAnalyzerLive
} from './ai-insights/index.js'
import {
  type AnnotationsRouter,
  AnnotationsRouterLive,
  AnnotationsRouterTag
} from './annotations/router.js'
import {
  ConfigWatcherTag,
  DebugLoggerLayerLive,
  DebugLoggerTag,
  type SpanData,
  type DebugLogger as DebugLoggerService,
  type ConfigWatcher as ConfigWatcherService
} from './debug-logger/index.js'
import {
  type LLMManagerRouter,
  LLMManagerRouterLive,
  LLMManagerRouterTag
} from './llm-manager/router.js'
import {
  type OtlpCaptureRouter,
  OtlpCaptureRouterLive,
  OtlpCaptureRouterTag
} from './record-replay/router/capture-router.js'
import { type StorageRouter, StorageRouterLive, StorageRouterTag } from './storage/index.js'
import {
  type TopologyAnalyzerRouter,
  TopologyAnalyzerRouterLive,
  TopologyAnalyzerRouterTag
} from './topology-analyzer/index.js'
import {
  type UIGeneratorRouter,
  UIGeneratorRouterLive,
  UIGeneratorRouterTag
} from './ui-generator/index.js'

const app = express()
const PORT = process.env.PORT || 4319

// Note: Diagnostic state is now managed by the annotations router

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
  port: parseInt(process.env.CLICKHOUSE_PORT || '8124'),
  database: process.env.CLICKHOUSE_DATABASE || 'otel',
  username: process.env.CLICKHOUSE_USERNAME || 'otel',
  password: process.env.CLICKHOUSE_PASSWORD || 'otel123'
}

// Create the storage API client layer with ClickHouse configuration and debug logger
const StorageAPIClientLayerWithConfig = StorageAPIClientLayer.pipe(
  Layer.provide(
    Layer.mergeAll(Layer.succeed(ClickHouseConfigTag, clickhouseConfig), DebugLoggerLayerLive)
  )
)

// Create config layer first - shared by all services
const ConfigLayer = ConfigServiceLive

// Create storage layers with config and debug logger
// StorageServiceLayer needs ConfigLayer and DebugLogger (via makeClickHouseStorage)
const StorageWithConfig = StorageServiceLayer.pipe(
  Layer.provide(Layer.mergeAll(ConfigLayer, DebugLoggerLayerLive))
)

// Create S3Storage layer for OTLP capture
const S3StorageLayer = S3StorageLive

// Create OTLP capture services with S3 dependency
const OtlpCaptureLayer = OtlpCaptureServiceLive.pipe(Layer.provide(S3StorageLayer))
const HttpReplayClientLayer = OtlpHttpReplayClientLive
const OtlpReplayLayer = OtlpReplayServiceLive.pipe(
  Layer.provide(Layer.mergeAll(S3StorageLayer, HttpReplayClientLayer))
)
const RetentionServiceLayer = RetentionServiceLive.pipe(Layer.provide(S3StorageLayer))
const TrainingDataReaderLayer = TrainingDataReaderLive.pipe(
  Layer.provide(Layer.mergeAll(S3StorageLayer, StorageAPIClientLayerWithConfig))
)

// Create Topology Analyzer layer with its dependencies
const TopologyAnalyzerWithDeps = TopologyAnalyzerLayer().pipe(Layer.provide(StorageWithConfig))

// Create the base dependencies
const BaseDependencies = Layer.mergeAll(
  ConfigLayer, // Shared config service
  DebugLoggerLayerLive, // Debug logger (needed by storage layers)
  StorageWithConfig, // Storage Service with Config and DebugLogger
  StorageAPIClientLayerWithConfig, // Storage API client with ClickHouse config and DebugLogger
  LLMManagerLive, // LLM Manager service
  LLMManagerAPIClientLayer, // LLM Manager API client
  TopologyAnalyzerWithDeps, // Topology Analyzer (real implementation with dependencies)
  AnnotationServiceLive.pipe(Layer.provide(StorageWithConfig)), // Annotation Service
  DiagnosticsSessionManagerLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        AnnotationServiceLive.pipe(Layer.provide(StorageWithConfig)),
        OtlpCaptureServiceLive.pipe(Layer.provide(S3StorageLayer))
      )
    )
  ), // Diagnostics Session Manager
  S3StorageLayer, // S3 storage for OTLP capture
  OtlpCaptureLayer, // OTLP capture service
  OtlpReplayLayer, // OTLP replay service
  RetentionServiceLayer, // Retention service for cleanup policies
  TrainingDataReaderLayer // Training data reader for AI model training
)

// Create the extended dependencies that include UI Generator API Client and AI Insights
const ExtendedDependencies = Layer.mergeAll(
  BaseDependencies,
  UIGeneratorAPIClientLayer.pipe(Layer.provide(BaseDependencies)),
  CriticalPathAnalyzerLive.pipe(Layer.provide(BaseDependencies)) // Critical Path Analyzer needs LLMManagerLive
)

// Create router layers - they need access to all services including UIGeneratorAPIClient
const RouterLayers = Layer.mergeAll(
  StorageRouterLive,
  UIGeneratorRouterLive,
  TopologyAnalyzerRouterLive,
  LLMManagerRouterLive,
  AnnotationsRouterLive,
  OtlpCaptureRouterLive,
  AIInsightsRouterLive
)

// Create the composed application layer with all services and routers
const ApplicationLayer = Layer.mergeAll(
  ExtendedDependencies,
  RouterLayers.pipe(Layer.provide(ExtendedDependencies))
)

// Helper function to run effects with all application services
// The effect can require any of the services provided by ApplicationLayer
// We use a union type of all possible service dependencies
type AppServices =
  | LLMManagerAPIClientTag
  | UIGeneratorAPIClientTag
  | StorageAPIClientTag
  | TopologyAnalyzerService
  | LLMManagerServiceTag
  | StorageServiceTag
  | AnnotationService
  | DiagnosticsSessionManager
  | OtlpCaptureServiceTag
  | OtlpReplayServiceTag
  | S3StorageTag
  | RetentionServiceTag
  | TrainingDataReaderTag
  | StorageRouter
  | UIGeneratorRouter
  | TopologyAnalyzerRouter
  | LLMManagerRouter
  | AnnotationsRouter
  | OtlpCaptureRouter
  | DebugLoggerService
  | ConfigWatcherService

const runWithServices = <A, E>(effect: Effect.Effect<A, E, AppServices>): Promise<A> => {
  // TEMPORARY: Add type assertion back to enable compilation while debugging
  return Effect.runPromise(Effect.provide(effect, ApplicationLayer) as Effect.Effect<A, E, never>)
}

// Helper function for raw queries that returns data in legacy format
const runStorageQuery = <A>(
  effect: Effect.Effect<A, StorageError, StorageAPIClientTag>
): Promise<A> => {
  return Effect.runPromise(Effect.provide(effect, StorageAPIClientLayerWithConfig))
}

// Helper function for raw queries that returns data in legacy format
const queryWithResults = async (sql: string): Promise<{ data: Record<string, unknown>[] }> => {
  const result = await runStorageQuery(
    StorageAPIClientTag.pipe(Effect.flatMap((storage) => storage.queryRaw(sql)))
  )
  return { data: result as Record<string, unknown>[] }
}

// AI Analyzer service is now provided through the ApplicationLayer

// Protobuf parsing now uses generated types from @bufbuild/protobuf
console.log('✅ Using generated protobuf types for OTLP parsing')

// Create validation tables for ILLEGAL_AGGREGATION prevention
async function createValidationTables() {
  try {
    console.log(
      '📊 Creating validation tables with Null engine for ILLEGAL_AGGREGATION prevention...'
    )

    // Use centralized list of tables
    const tables = REQUIRED_TABLES

    for (const tableName of tables) {
      const validationTableSQL = `
        CREATE TABLE IF NOT EXISTS ${tableName}_validation
        AS ${tableName}
        ENGINE = Null
      `

      await queryWithResults(validationTableSQL)
      console.log(`  ✅ Created validation table: ${tableName}_validation`)
    }

    console.log('✅ All validation tables created successfully')
  } catch (error) {
    console.error('❌ Error creating validation tables:', error)
    // Don't throw - validation tables are not critical for startup
  }
}

// Core API Endpoints (not handled by package routers)

// Health check endpoint
app.get('/health', async (_req, res) => {
  try {
    const healthResult = await runStorageQuery(
      StorageAPIClientTag.pipe(
        Effect.flatMap((apiClient) => apiClient.healthCheck()),
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
      status: 'healthy',
      message: 'OTLP Ingestion Server is operational',
      timestamp: new Date().toISOString(),
      services: {
        server: true,
        storage: healthResult.healthy,
        clickhouse: healthResult.clickhouse,
        s3: healthResult.s3
      }
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
    const traceId = req.query.traceId as string | undefined

    // If traceId is provided, return full trace with spans
    if (traceId) {
      // Get debug logger and config
      const { debugLogger, configWatcher } = await runWithServices(
        Effect.gen(function* () {
          const logger = yield* DebugLoggerTag
          const config = yield* ConfigWatcherTag
          return { debugLogger: logger, configWatcher: config }
        })
      )

      // Query all spans for this specific trace
      const query = `
        SELECT
          trace_id,
          span_id,
          parent_span_id,
          service_name,
          operation_name,
          toUnixTimestamp64Nano(start_time) AS start_time_unix_nano,
          toUnixTimestamp64Nano(end_time) AS end_time_unix_nano,
          duration_ns,
          status_code,
          status_message,
          span_kind,
          span_attributes,
          resource_attributes
        FROM otel.traces
        WHERE trace_id = '${traceId}'
        ORDER BY start_time ASC
      `

      const result = await queryWithResults(query)
      const spans = result.data as unknown as Array<{
        trace_id: string
        span_id: string
        parent_span_id: string
        service_name: string
        operation_name: string
        start_time_unix_nano: string
        end_time_unix_nano: string
        duration_ns: number
        status_code: string
        status_message: string
        span_kind: string
        span_attributes: Record<string, unknown>
        resource_attributes: Record<string, unknown>
      }>

      if (!spans || spans.length === 0) {
        res.status(404).json({ error: 'Trace not found' })
        return
      }

      // Calculate metadata
      const startTimes = spans.map((s) => BigInt(s.start_time_unix_nano))
      const endTimes = spans.map((s) => BigInt(s.end_time_unix_nano))
      const minStartTime = startTimes.reduce((a: bigint, b: bigint) => (a < b ? a : b))
      const maxEndTime = endTimes.reduce((a: bigint, b: bigint) => (a > b ? a : b))
      const durationNs = maxEndTime - minStartTime
      const durationMs = Number(durationNs) / 1_000_000

      const rootSpan = spans.find((s) => !s.parent_span_id || s.parent_span_id === '')
      const services = [...new Set(spans.map((s) => s.service_name))]

      // Convert to SpanData format for debug logger
      const spanDataList: SpanData[] = spans.map((span) => ({
        traceId: span.trace_id,
        spanId: span.span_id,
        parentSpanId: span.parent_span_id || null,
        serviceName: span.service_name,
        operationName: span.operation_name,
        startTimeUnixNano: span.start_time_unix_nano,
        endTimeUnixNano: span.end_time_unix_nano,
        durationNs: span.duration_ns,
        statusCode: span.status_code,
        attributes: span.span_attributes
      }))

      // Check if browser logging is enabled and format trace for browser
      let debugTrace: string | undefined
      try {
        const config = configWatcher.getCurrentConfig()
        console.log(`🔍 Debug config:`, {
          enabled: config.debug.traces.enabled,
          console: config.debug.traces.console,
          level: config.debug.level
        })

        const shouldIncludeBrowserTrace =
          config.debug.traces.enabled &&
          (config.debug.traces.console === 'browser' || config.debug.traces.console === 'both')

        console.log(`🔍 Should include browser trace: ${shouldIncludeBrowserTrace}`)

        // Format trace for browser if enabled
        if (shouldIncludeBrowserTrace) {
          debugTrace = debugLogger.formatTrace(traceId, spanDataList)
          console.log(`🔍 Debug trace formatted, length: ${debugTrace.length}`)
        }
      } catch (error) {
        console.error('❌ Error formatting debug trace:', error)
        debugTrace = undefined
      }

      res.json({
        spans: spans.map((span) => ({
          traceId: span.trace_id,
          spanId: span.span_id,
          parentSpanId: span.parent_span_id,
          serviceName: span.service_name,
          operationName: span.operation_name,
          startTimeUnixNano: span.start_time_unix_nano,
          endTimeUnixNano: span.end_time_unix_nano,
          durationNs: span.duration_ns,
          statusCode: span.status_code,
          statusMessage: span.status_message,
          spanKind: span.span_kind,
          attributes: span.span_attributes,
          resourceAttributes: span.resource_attributes
        })),
        metadata: {
          traceId,
          totalSpans: spans.length,
          rootSpanId: rootSpan?.span_id || spans[0]?.span_id,
          services,
          durationMs,
          startTime: Number(minStartTime) / 1_000_000,
          endTime: Number(maxEndTime) / 1_000_000
        },
        debugTrace
      })
      return
    }

    // TODO: Migrate to Storage API Client once type issues are resolved
    // For now, maintain backward compatibility with direct storage query
    const query = `
      SELECT
        trace_id,
        span_id,
        parent_span_id,
        operation_name,
        service_name,
        start_time,
        duration_ms,
        status_code,
        is_error,
        span_attributes,
        resource_attributes,
        encoding_type
      FROM traces
      WHERE start_time >= subtractMinutes(now(), toInt32(substring('${since}', 1, position('${since}', ' ') - 1)))
      ORDER BY start_time DESC
      LIMIT ${limit}
    `

    console.log('🔍 Querying traces since:', since)
    const result = await queryWithResults(query)

    res.json({
      traces: result.data,
      count: result.data.length,
      since: since,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ Error querying traces:', error)
    res.status(500).json({
      error: 'Failed to query traces',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// Package-specific routes are now handled by their respective routers
// The routers are mounted after the server starts (see mountRouters function below)

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

    console.log('🔍 Is protobuf content:', isProtobuf)

    let traceServiceRequest
    let totalSpans = 0
    let resourceSpansCount = 0

    if (isProtobuf && Buffer.isBuffer(req.body)) {
      console.log('📦 Processing as protobuf')
      traceServiceRequest = fromBinary(ExportTraceServiceRequestSchema, req.body)

      console.log('📊 Protobuf parsing completed')
      console.log('🎯 ResourceSpans count:', traceServiceRequest.resourceSpans?.length || 0)

      // Count total spans for logging
      totalSpans =
        traceServiceRequest.resourceSpans?.reduce((total, resourceSpan) => {
          const scopeSpansCount =
            resourceSpan.scopeSpans?.reduce((scopeTotal, scopeSpan) => {
              return scopeTotal + (scopeSpan.spans?.length || 0)
            }, 0) || 0
          return total + scopeSpansCount
        }, 0) || 0

      resourceSpansCount = traceServiceRequest.resourceSpans?.length || 0
    } else {
      console.log('📄 Processing as JSON')
      traceServiceRequest = req.body

      // Count spans in JSON format
      if (traceServiceRequest?.resourceSpans && Array.isArray(traceServiceRequest.resourceSpans)) {
        totalSpans = (traceServiceRequest.resourceSpans as Array<Record<string, unknown>>).reduce(
          (total: number, resourceSpan: Record<string, unknown>) => {
            const scopeSpans = resourceSpan.scopeSpans
            if (Array.isArray(scopeSpans)) {
              const scopeSpansCount = scopeSpans.reduce(
                (scopeTotal: number, scopeSpan: Record<string, unknown>) => {
                  const spans = scopeSpan.spans
                  return scopeTotal + (Array.isArray(spans) ? spans.length : 0)
                },
                0
              )
              return total + scopeSpansCount
            }
            return total
          },
          0
        )
        resourceSpansCount = traceServiceRequest.resourceSpans.length
      }
    }

    console.log(`📊 Total spans to process: ${totalSpans}`)
    console.log(`📦 ResourceSpans to process: ${resourceSpansCount}`)

    // Process the trace data for storage
    await runWithServices(
      Effect.gen(function* () {
        const storage = yield* StorageServiceTag

        console.log('🔄 Starting trace processing with Storage Service...')

        const processedTraces = []

        // Process each ResourceSpan
        for (const resourceSpan of (traceServiceRequest.resourceSpans as Array<
          Record<string, unknown>
        >) || []) {
          const resourceAttrs = cleanAttributes(
            convertAttributesToRecord(
              resourceSpan.resource && typeof resourceSpan.resource === 'object'
                ? (resourceSpan.resource as Record<string, unknown>).attributes
                : undefined
            )
          ) as Record<string, AttributeValue>

          // Process each ScopeSpan within the ResourceSpan
          for (const scopeSpan of (resourceSpan.scopeSpans as Array<Record<string, unknown>>) ||
            []) {
            // Process each Span within the ScopeSpan
            for (const span of (scopeSpan.spans as Array<Record<string, unknown>>) || []) {
              const cleanedSpanAttrs = cleanAttributes(convertAttributesToRecord(span.attributes))

              // Create trace record for storage (match TraceDataSchema)
              const traceRecord = {
                traceId: isProtobuf
                  ? Buffer.from((span.traceId as Uint8Array) || []).toString('hex')
                  : String(span.traceId || ''),
                spanId: isProtobuf
                  ? Buffer.from((span.spanId as Uint8Array) || []).toString('hex')
                  : String(span.spanId || ''),
                parentSpanId: span.parentSpanId
                  ? isProtobuf
                    ? Buffer.from(span.parentSpanId as Uint8Array).toString('hex')
                    : String(span.parentSpanId)
                  : undefined,
                operationName:
                  typeof span.name === 'string' ? span.name : String(span.name || 'unknown'),
                startTime: span.startTimeUnixNano
                  ? Number(span.startTimeUnixNano)
                  : Date.now() * 1_000_000,
                endTime: span.endTimeUnixNano
                  ? Number(span.endTimeUnixNano)
                  : Date.now() * 1_000_000,
                duration:
                  span.startTimeUnixNano && span.endTimeUnixNano
                    ? Number(span.endTimeUnixNano) - Number(span.startTimeUnixNano)
                    : 0,
                serviceName: extractServiceName(resourceAttrs),
                statusCode:
                  span.status && typeof span.status === 'object' && 'code' in span.status
                    ? Number(span.status.code) || 0
                    : 0, // 0=UNSET, 1=OK, 2=ERROR
                spanKind: span.kind?.toString() || 'INTERNAL',
                attributes: Object.fromEntries(
                  Object.entries(cleanedSpanAttrs).map(([k, v]) => [k, String(v)])
                ),
                resourceAttributes: Object.fromEntries(
                  Object.entries(resourceAttrs).map(([k, v]) => [k, String(v)])
                ),
                events: Array.isArray(span.events)
                  ? span.events.map((event: Record<string, unknown>) => ({
                      timestamp: event.timeUnixNano
                        ? Number(event.timeUnixNano)
                        : Date.now() * 1_000_000,
                      name: typeof event.name === 'string' ? event.name : String(event.name || ''),
                      attributes: Object.fromEntries(
                        Object.entries(
                          cleanAttributes(convertAttributesToRecord(event.attributes))
                        ).map(([k, v]) => [k, String(v)])
                      )
                    }))
                  : [],
                links: Array.isArray(span.links)
                  ? span.links.map((link: Record<string, unknown>) => ({
                      traceId: isProtobuf
                        ? Buffer.from((link.traceId as Uint8Array) || []).toString('hex')
                        : String(link.traceId || ''),
                      spanId: isProtobuf
                        ? Buffer.from((link.spanId as Uint8Array) || []).toString('hex')
                        : String(link.spanId || ''),
                      attributes: Object.fromEntries(
                        Object.entries(
                          cleanAttributes(convertAttributesToRecord(link.attributes))
                        ).map(([k, v]) => [k, String(v)])
                      )
                    }))
                  : []
              }

              processedTraces.push(traceRecord)
            }
          }
        }

        console.log(`💾 Storing ${processedTraces.length} processed traces...`)

        // Store traces using the Storage Service
        yield* storage.writeOTLP(
          {
            traces: processedTraces,
            metrics: [],
            logs: [],
            timestamp: Date.now() * 1_000_000 // nanoseconds
          },
          isProtobuf ? 'protobuf' : 'json'
        )

        console.log('✅ Traces stored successfully')
        return { storedTraces: processedTraces.length }
      })
    )

    res.json({ partialSuccess: {} })
  } catch (error) {
    console.error('❌ OTLP ingestion error:', error)
    res.status(500).json({
      error: 'OTLP ingestion failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// Helper function to extract service name from resource attributes
function extractServiceName(resourceAttrs: Record<string, AttributeValue>): string {
  // Look for service.name in resource attributes
  if (resourceAttrs['service.name']) {
    return String(resourceAttrs['service.name'])
  }

  // Fallback to other possible service identifiers
  if (resourceAttrs['k8s.pod.name']) {
    return String(resourceAttrs['k8s.pod.name'])
  }

  return 'unknown-service'
}

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

// Mount routers from packages
const mountRouters = async () => {
  try {
    console.log('🔧 Mounting package routers...')

    // Mount routers one by one to identify which one is failing
    console.log('📦 Mounting storage router...')
    const storageRouter = await runWithServices(StorageRouterTag)

    console.log('📦 Mounting topology analyzer router...')
    const topologyAnalyzerRouter = await runWithServices(TopologyAnalyzerRouterTag)

    console.log('📦 Mounting LLM manager router...')
    const llmManagerRouter = await runWithServices(LLMManagerRouterTag)

    console.log('📦 Mounting annotations router...')
    const annotationsRouter = await runWithServices(AnnotationsRouterTag)

    console.log('📦 Mounting OTLP capture router...')
    const otlpCaptureRouter = await runWithServices(OtlpCaptureRouterTag)

    console.log('📦 Mounting UI generator router...')
    const uiGeneratorRouter = await runWithServices(UIGeneratorRouterTag)

    console.log('📦 Mounting AI Insights router...')
    const aiInsightsRouter = await runWithServices(AIInsightsRouterTag)

    // Mount all the routers
    app.use(storageRouter.router)
    app.use(uiGeneratorRouter.router)
    app.use(topologyAnalyzerRouter.router)
    app.use(llmManagerRouter.router)
    app.use(annotationsRouter.router)
    app.use(otlpCaptureRouter.router)
    app.use(aiInsightsRouter.router)

    console.log('✅ All package routers mounted successfully')
  } catch (error) {
    console.error('❌ Error mounting routers:', error)
    process.exit(1)
  }
}

// Mount routers before starting server
await mountRouters()

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 OTLP Ingestion Server running on port ${PORT}`)
  console.log(`📡 Direct ingestion endpoint: http://localhost:${PORT}/v1/traces`)
  console.log(`🏥 Health check: http://localhost:${PORT}/health`)
  console.log(`🔧 MIDDLEWARE DEBUG BUILD v2.0 - GLOBAL MIDDLEWARE ACTIVE`)
  console.log(`🎯 Diagnostics API: http://localhost:${PORT}/api/diagnostics/flags`)
  console.log(`📝 Session Management: http://localhost:${PORT}/api/diagnostics/sessions`)
  console.log(`🎓 Training Data API: http://localhost:${PORT}/api/diagnostics/training/capture`)
  console.log(`🎬 OTLP Capture & Replay: http://localhost:${PORT}/api/capture/sessions`)
  console.log(`🗄️ Retention Management: http://localhost:${PORT}/api/retention/usage`)

  // Wait a bit for schema migrations to complete, then create validation tables
  setTimeout(async () => {
    // Create validation tables for ILLEGAL_AGGREGATION prevention
    await createValidationTables()

    console.log('✅ Topology Analyzer service available through layer composition')
    console.log(`🤖 Topology Analyzer API: http://localhost:${PORT}/api/topology/health`)

    // Start retention jobs with default policy
    try {
      const defaultRetentionPolicy: RetentionPolicy = {
        continuous: {
          retentionDays: 7,
          cleanupSchedule: '0 2 * * *', // Daily at 2 AM
          enabled: true
        },
        sessions: {
          defaultRetentionDays: 90,
          maxRetentionDays: 365,
          archiveAfterDays: 30,
          cleanupEnabled: true
        }
      }

      await runWithServices(
        Effect.gen(function* () {
          const retentionService = yield* RetentionServiceTag
          yield* retentionService.scheduleRetentionJobs(defaultRetentionPolicy)
          console.log('🧹 Default retention policy applied')
        })
      )
    } catch (error) {
      console.error('⚠️ Warning: Could not apply default retention policy:', error)
    }
  }, 2000)
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
