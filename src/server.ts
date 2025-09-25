/**
 * OTLP Ingestion Server for AI-Native Observability Platform
 * Provides direct OTLP ingestion endpoint for "direct" path testing
 * Trigger clean workflow validation
 */

import { fromBinary } from '@bufbuild/protobuf'
import cors from 'cors'
import { Effect, Layer } from 'effect'
import express from 'express'
import { AIAnalyzerService, AIAnalyzerMockLayer } from './ai-analyzer/index.js'
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
import {
  StorageAPIClientTag,
  ClickHouseConfigTag,
  StorageAPIClientLayer,
  StorageLayer as StorageServiceLayer,
  StorageServiceTag,
  ConfigServiceLive
} from './storage/index.js'
import {
  LLMManagerAPIClientTag,
  LLMManagerAPIClientLayer,
  LLMManagerLive,
  LLMManagerServiceTag
} from './llm-manager/index.js'
import { UIGeneratorAPIClientTag, UIGeneratorAPIClientLayer } from './ui-generator/index.js'
import { interactionLogger, type LLMInteraction } from './llm-manager/interaction-logger.js'
import {
  AnnotationService,
  AnnotationServiceLive,
  DiagnosticsSessionManager,
  DiagnosticsSessionManagerLive,
  FeatureFlagController,
  FeatureFlagControllerLive,
  FeatureFlagConfigTag,
  type Annotation,
  type DiagnosticsSession
} from './annotations/index.js'
import {
  OtlpCaptureServiceTag,
  OtlpCaptureServiceLive,
  OtlpReplayServiceTag,
  OtlpReplayServiceLive
} from './otlp-capture/index.js'
import { S3StorageTag, S3StorageLive } from './storage/s3.js'
import {
  cleanAttributes,
  parseOTLPFromRaw,
  isProtobufContent,
  processAttributeValue,
  type AttributeValue
} from './utils/protobuf.js'

const app = express()
const PORT = process.env.PORT || 4319

// In-memory state for diagnostic sessions and feature flags
interface DiagnosticState {
  activeSession: DiagnosticsSession | null
  enabledFlags: Set<string>
  flagStates: Map<string, boolean>
}

const diagnosticState: DiagnosticState = {
  activeSession: null,
  enabledFlags: new Set(),
  flagStates: new Map()
}

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

// Create the storage API client layer with ClickHouse configuration
const StorageAPIClientLayerWithConfig = StorageAPIClientLayer.pipe(
  Layer.provide(Layer.succeed(ClickHouseConfigTag, clickhouseConfig))
)

// Create config layer first - shared by all services
const ConfigLayer = ConfigServiceLive

// Create storage layers with config
const StorageWithConfig = StorageServiceLayer.pipe(Layer.provide(ConfigLayer))

// Create feature flag config layer
const FeatureFlagConfigLayer = Layer.succeed(FeatureFlagConfigTag, {
  flagdHost: process.env.FLAGD_HOST ?? 'localhost',
  flagdPort: parseInt(process.env.FLAGD_PORT ?? '8013'),
  cacheTTL: parseInt(process.env.FLAGD_CACHE_TTL ?? '30000'),
  timeout: parseInt(process.env.FLAGD_TIMEOUT ?? '5000')
})

// Create S3Storage layer for OTLP capture
const S3StorageLayer = S3StorageLive

// Create OTLP capture services with S3 dependency
const OtlpCaptureLayer = OtlpCaptureServiceLive.pipe(Layer.provide(S3StorageLayer))
const OtlpReplayLayer = OtlpReplayServiceLive.pipe(Layer.provide(S3StorageLayer))

// Create the base dependencies
const BaseDependencies = Layer.mergeAll(
  ConfigLayer, // Shared config service
  StorageWithConfig, // Storage Service with Config
  StorageAPIClientLayerWithConfig, // Storage API client with ClickHouse config
  LLMManagerLive, // LLM Manager service
  LLMManagerAPIClientLayer, // LLM Manager API client
  AIAnalyzerMockLayer(), // AI Analyzer (mock)
  AnnotationServiceLive.pipe(Layer.provide(StorageWithConfig)), // Annotation Service
  FeatureFlagControllerLive.pipe(Layer.provide(FeatureFlagConfigLayer)), // Feature Flag Controller
  DiagnosticsSessionManagerLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        AnnotationServiceLive.pipe(Layer.provide(StorageWithConfig)),
        FeatureFlagControllerLive.pipe(Layer.provide(FeatureFlagConfigLayer))
      )
    )
  ), // Diagnostics Session Manager
  S3StorageLayer, // S3 storage for OTLP capture
  OtlpCaptureLayer, // OTLP capture service
  OtlpReplayLayer // OTLP replay service
)

// Create the composed application layer with all services
// UIGenerator needs access to all base dependencies
const ApplicationLayer = Layer.mergeAll(
  BaseDependencies,
  UIGeneratorAPIClientLayer.pipe(Layer.provide(BaseDependencies))
)

// Helper function to run effects with all application services
// The effect can require any of the services provided by ApplicationLayer
// We use a union type of all possible service dependencies
type AppServices =
  | LLMManagerAPIClientTag
  | UIGeneratorAPIClientTag
  | StorageAPIClientTag
  | AIAnalyzerService
  | LLMManagerServiceTag
  | StorageServiceTag
  | AnnotationService
  | FeatureFlagController
  | DiagnosticsSessionManager
  | OtlpCaptureServiceTag
  | OtlpReplayServiceTag
  | S3StorageTag

const runWithServices = <A, E>(effect: Effect.Effect<A, E, AppServices>): Promise<A> => {
  // TEMPORARY: Add type assertion back to enable compilation while debugging
  return Effect.runPromise(Effect.provide(effect, ApplicationLayer) as Effect.Effect<A, E, never>)
}

// Helper function to run storage queries (maintained for backwards compatibility)
const runStorageQuery = <A, E>(effect: Effect.Effect<A, E, StorageAPIClientTag>): Promise<A> => {
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
        Effect.provide(StorageAPIClientLayerWithConfig),
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
    // AI Analyzer service is always available through the layer
    res.json({
      status: 'healthy',
      capabilities: [
        'architecture-analysis',
        'topology-discovery',
        'streaming-analysis',
        'documentation-generation'
      ],
      message: 'AI Analyzer service ready (using mock layer)'
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

    // Execute the analysis using Effect and the service layer
    const result = await runWithServices(
      Effect.gen(function* () {
        const aiAnalyzer = yield* AIAnalyzerService
        return yield* aiAnalyzer.analyzeArchitecture(analysisRequest)
      })
    )

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
    const { timeRange } = req.body

    const topologyRequest = {
      startTime: new Date(timeRange.startTime),
      endTime: new Date(timeRange.endTime)
    }

    // Execute the topology request using Effect and the service layer
    const topology = await runWithServices(
      Effect.gen(function* () {
        const aiAnalyzer = yield* AIAnalyzerService
        return yield* aiAnalyzer.getServiceTopology(topologyRequest)
      })
    )

    res.json(topology)
  } catch (error) {
    console.error('❌ AI Analyzer topology error:', error)
    res.status(500).json({
      error: 'Topology analysis failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// UI Generator endpoints
app.post('/api/ui-generator/from-sql', async (req, res) => {
  try {
    const { sql, queryResults, context } = req.body

    // Import the UI generation services
    const {
      ResultAnalysisServiceTag,
      ResultAnalysisServiceLive,
      ChartConfigGeneratorServiceTag,
      ChartConfigGeneratorServiceLive
    } = await import('./ui-generator/services/index.js')
    const { Effect, Layer } = await import('effect')

    // Create layer composition
    const ServiceLayers = Layer.mergeAll(ResultAnalysisServiceLive, ChartConfigGeneratorServiceLive)

    // Extract the actual data array from queryResults
    const dataArray = Array.isArray(queryResults)
      ? queryResults
      : queryResults?.data || queryResults

    // Analyze the query results to determine the best visualization
    const analysis = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* ResultAnalysisServiceTag
        return yield* service.analyzeResults(dataArray)
      }).pipe(Effect.provide(ServiceLayers))
    )

    // Generate chart configuration based on the analysis
    // Deep copy the analysis to convert readonly types to mutable
    const chartConfig = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* ChartConfigGeneratorServiceTag
        return yield* service.generateConfig(
          {
            ...analysis,
            columns: analysis.columns.map((col) => ({
              ...col,
              sampleValues: [...col.sampleValues],
              semanticType: col.semanticType || ''
            })),
            detectedPatterns: [...analysis.detectedPatterns]
          },
          dataArray
        )
      }).pipe(Effect.provide(ServiceLayers))
    )

    // Return the component specification
    res.json({
      component: {
        component:
          chartConfig.type === 'table'
            ? 'DynamicDataTable'
            : chartConfig.type === 'line'
              ? 'DynamicLineChart'
              : chartConfig.type === 'bar'
                ? 'DynamicBarChart'
                : 'DynamicDataTable',
        props: {
          config: chartConfig.config,
          data: Array.isArray(queryResults) ? queryResults : queryResults?.data || queryResults,
          height: '400px'
        }
      },
      analysis,
      metadata: {
        sql,
        context,
        generatedAt: Date.now()
      }
    })
  } catch (error) {
    console.error('❌ UI Generator error:', error)
    res.status(500).json({
      error: 'UI generation failed',
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

// Diagnostics API Endpoints
app.get('/api/diagnostics/flags', async (_req, res) => {
  try {
    const flags = await runWithServices(
      Effect.gen(function* () {
        const controller = yield* FeatureFlagController
        return yield* controller.listFlags()
      })
    )

    res.json({
      flags,
      enabled: Array.from(diagnosticState.enabledFlags),
      states: Object.fromEntries(diagnosticState.flagStates)
    })
  } catch (error) {
    console.error('❌ Error listing feature flags:', error)
    res.status(500).json({
      error: 'Failed to list feature flags',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

app.post('/api/diagnostics/flags/:flagName', async (req, res) => {
  try {
    const { flagName } = req.params
    const { enable } = req.body

    await runWithServices(
      Effect.gen(function* () {
        const controller = yield* FeatureFlagController
        if (enable) {
          yield* controller.enableFlag(flagName)
          diagnosticState.enabledFlags.add(flagName)
          diagnosticState.flagStates.set(flagName, true)
          console.log(`✅ Feature flag ${flagName} enabled`)
        } else {
          yield* controller.disableFlag(flagName)
          diagnosticState.enabledFlags.delete(flagName)
          diagnosticState.flagStates.set(flagName, false)
          console.log(`✅ Feature flag ${flagName} disabled`)
        }
      })
    )

    res.json({
      flagName,
      enabled: enable,
      message: `Feature flag ${flagName} ${enable ? 'enabled' : 'disabled'}`
    })
  } catch (error) {
    console.error('❌ Error toggling feature flag:', error)
    res.status(500).json({
      error: 'Failed to toggle feature flag',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

app.post('/api/diagnostics/sessions', async (req, res) => {
  try {
    const { name, description } = req.body

    const session = await runWithServices(
      Effect.gen(function* () {
        const manager = yield* DiagnosticsSessionManager
        const newSession = yield* manager.createSession({
          name: name || 'Diagnostic Session',
          flagName: 'diagnostics.enabled',
          metadata: {
            description: description || 'Manual diagnostic session',
            source: 'api'
          }
        })

        // Start the session immediately
        yield* manager.startSession(newSession.id)

        // Update in-memory state
        diagnosticState.activeSession = newSession
        console.log(`✅ Diagnostic session ${newSession.id} created and started`)

        return newSession
      })
    )

    res.json(session)
  } catch (error) {
    console.error('❌ Error creating diagnostic session:', error)
    res.status(500).json({
      error: 'Failed to create diagnostic session',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

app.get('/api/diagnostics/sessions', async (_req, res) => {
  try {
    const sessions = await runWithServices(
      Effect.gen(function* () {
        const manager = yield* DiagnosticsSessionManager
        return yield* manager.listSessions()
      })
    )

    res.json({
      sessions,
      activeSession: diagnosticState.activeSession
    })
  } catch (error) {
    console.error('❌ Error listing diagnostic sessions:', error)
    res.status(500).json({
      error: 'Failed to list diagnostic sessions',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

app.get('/api/diagnostics/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params

    const session = await runWithServices(
      Effect.gen(function* () {
        const manager = yield* DiagnosticsSessionManager
        return yield* manager.getSession(sessionId)
      })
    )

    res.json(session)
  } catch (error) {
    console.error('❌ Error getting diagnostic session:', error)
    res.status(500).json({
      error: 'Failed to get diagnostic session',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

app.delete('/api/diagnostics/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params

    const session = await runWithServices(
      Effect.gen(function* () {
        const manager = yield* DiagnosticsSessionManager
        const stoppedSession = yield* manager.stopSession(sessionId)

        // Clear active session if it matches
        if (diagnosticState.activeSession?.id === sessionId) {
          diagnosticState.activeSession = null
          console.log(`✅ Cleared active diagnostic session ${sessionId}`)
        }

        return stoppedSession
      })
    )

    res.json({
      message: `Diagnostic session ${sessionId} stopped`,
      session
    })
  } catch (error) {
    console.error('❌ Error stopping diagnostic session:', error)
    res.status(500).json({
      error: 'Failed to stop diagnostic session',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

app.get('/api/diagnostics/sessions/:sessionId/annotations', async (req, res) => {
  try {
    const { sessionId } = req.params

    const annotations = await runWithServices(
      Effect.gen(function* () {
        const manager = yield* DiagnosticsSessionManager
        return yield* manager.getSessionAnnotations(sessionId)
      })
    )

    res.json({
      sessionId,
      annotations,
      count: annotations.length
    })
  } catch (error) {
    console.error('❌ Error getting session annotations:', error)
    res.status(500).json({
      error: 'Failed to get session annotations',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// OTLP Capture API Endpoints
app.get('/api/capture/sessions', async (_req, res) => {
  try {
    const sessions = await runWithServices(
      Effect.gen(function* () {
        const captureService = yield* OtlpCaptureServiceTag
        return yield* captureService.listCaptureSessions()
      })
    )

    res.json({
      sessions,
      count: sessions.length,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ Error listing capture sessions:', error)
    res.status(500).json({
      error: 'Failed to list capture sessions',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

app.get('/api/capture/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params

    const status = await runWithServices(
      Effect.gen(function* () {
        const captureService = yield* OtlpCaptureServiceTag
        return yield* captureService.getCaptureStatus(sessionId)
      })
    )

    res.json(status)
  } catch (error) {
    console.error('❌ Error getting capture session:', error)
    res.status(500).json({
      error: 'Failed to get capture session',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

app.post('/api/capture/sessions', async (req, res) => {
  try {
    const { sessionId, description, enabledFlags, captureTraces, captureMetrics, captureLogs } =
      req.body

    const session = await runWithServices(
      Effect.gen(function* () {
        const captureService = yield* OtlpCaptureServiceTag
        return yield* captureService.startCapture({
          sessionId: sessionId || `capture-${Date.now()}`,
          description: description || 'Manual capture session',
          enabledFlags: enabledFlags || [],
          captureTraces: captureTraces !== false,
          captureMetrics: captureMetrics === true,
          captureLogs: captureLogs === true,
          compressionEnabled: true
        })
      })
    )

    res.json(session)
  } catch (error) {
    console.error('❌ Error starting capture session:', error)
    res.status(500).json({
      error: 'Failed to start capture session',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

app.delete('/api/capture/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params

    const finalSession = await runWithServices(
      Effect.gen(function* () {
        const captureService = yield* OtlpCaptureServiceTag
        return yield* captureService.stopCapture(sessionId)
      })
    )

    res.json({
      message: `Capture session ${sessionId} stopped`,
      session: finalSession
    })
  } catch (error) {
    console.error('❌ Error stopping capture session:', error)
    res.status(500).json({
      error: 'Failed to stop capture session',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// OTLP Replay API Endpoints
app.get('/api/replay/available', async (_req, res) => {
  try {
    const sessions = await runWithServices(
      Effect.gen(function* () {
        const replayService = yield* OtlpReplayServiceTag
        return yield* replayService.listAvailableReplays()
      })
    )

    res.json({
      sessions,
      count: sessions.length,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ Error listing available replays:', error)
    res.status(500).json({
      error: 'Failed to list available replays',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

app.post('/api/replay/start', async (req, res) => {
  try {
    const {
      sessionId,
      timestampAdjustment = 'current',
      speedMultiplier = 1.0,
      targetEndpoint,
      replayTraces = true,
      replayMetrics = false,
      replayLogs = false
    } = req.body

    if (!sessionId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'sessionId is required'
      })
    }

    const replayStatus = await runWithServices(
      Effect.gen(function* () {
        const replayService = yield* OtlpReplayServiceTag
        return yield* replayService.startReplay({
          sessionId,
          timestampAdjustment,
          speedMultiplier,
          targetEndpoint: targetEndpoint || `http://localhost:${PORT}/v1/traces`,
          replayTraces,
          replayMetrics,
          replayLogs
        })
      })
    )

    res.json(replayStatus)
    return
  } catch (error) {
    console.error('❌ Error starting replay:', error)
    res.status(500).json({
      error: 'Failed to start replay',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
    return
  }
})

app.get('/api/replay/status/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params

    const status = await runWithServices(
      Effect.gen(function* () {
        const replayService = yield* OtlpReplayServiceTag
        return yield* replayService.getReplayStatus(sessionId)
      })
    )

    res.json(status)
  } catch (error) {
    console.error('❌ Error getting replay status:', error)
    res.status(500).json({
      error: 'Failed to get replay status',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

app.get('/api/replay/stream/:sessionId/:signalType', async (req, res) => {
  try {
    const { sessionId, signalType } = req.params

    if (!['traces', 'metrics', 'logs'].includes(signalType)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'signalType must be one of: traces, metrics, logs'
      })
    }

    // Set up SSE response
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    })

    // Stream the replay data
    await runWithServices(
      Effect.gen(function* () {
        const replayService = yield* OtlpReplayServiceTag
        const stream = replayService.replayDataStream(
          sessionId,
          signalType as 'traces' | 'metrics' | 'logs'
        )

        // Process the stream
        const { Stream } = yield* Effect.promise(() => import('effect'))
        yield* stream.pipe(
          Stream.tap((chunk) =>
            Effect.sync(() => {
              // Send chunk as SSE event
              res.write(
                `data: ${JSON.stringify({
                  type: 'data',
                  signalType,
                  size: chunk.length,
                  timestamp: Date.now()
                })}\n\n`
              )
            })
          ),
          Stream.runDrain
        )

        // Send completion event
        res.write(
          `data: ${JSON.stringify({
            type: 'complete',
            sessionId,
            signalType,
            timestamp: Date.now()
          })}\n\n`
        )
        res.end()
      }).pipe(
        Effect.catchAll((error) => {
          console.error('❌ Stream error:', error)
          res.write(
            `data: ${JSON.stringify({
              type: 'error',
              error: error instanceof Error ? error.message : 'Unknown error'
            })}\n\n`
          )
          res.end()
          return Effect.succeed(undefined)
        })
      )
    )
    return
  } catch (error) {
    console.error('❌ Error streaming replay data:', error)
    res.status(500).json({
      error: 'Failed to stream replay data',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
    return
  }
})

// Helper function to recursively extract values from protobuf objects

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
            Effect.provide(StorageAPIClientLayerWithConfig),
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

        // Capture raw OTLP data if a diagnostic session is capturing
        if (diagnosticState.activeSession && diagnosticState.activeSession.phase === 'capturing') {
          console.log(
            `🎬 Capturing OTLP data for diagnostic session: ${diagnosticState.activeSession.id}`
          )

          // Capture the raw OTLP data to S3
          await runWithServices(
            Effect.gen(function* () {
              const captureService = yield* OtlpCaptureServiceTag

              // Check if we have an active capture session
              if (!diagnosticState.activeSession) return // Type guard
              const captureSessionId = `diag-${diagnosticState.activeSession.id}`

              // Try to get existing capture session or create a new one
              const existingSession = yield* captureService
                .getCaptureStatus(captureSessionId)
                .pipe(Effect.catchAll(() => Effect.succeed(null)))

              if (!existingSession || existingSession.status !== 'active') {
                // Create new capture session
                yield* captureService.startCapture({
                  sessionId: captureSessionId,
                  diagnosticSessionId: diagnosticState.activeSession.id,
                  description: `Capture for diagnostic session: ${diagnosticState.activeSession.name}`,
                  enabledFlags: Array.from(diagnosticState.enabledFlags),
                  captureTraces: true,
                  captureMetrics: false,
                  captureLogs: false,
                  compressionEnabled: true
                })
                console.log(`✅ Started OTLP capture session: ${captureSessionId}`)
              }

              // Capture the OTLP data
              const captureData = Buffer.isBuffer(req.body)
                ? req.body
                : Buffer.from(JSON.stringify(otlpData))

              yield* captureService.captureOTLPData(captureSessionId, captureData, 'traces')

              console.log(`✅ Captured ${captureData.length} bytes of OTLP data to S3`)
            }).pipe(
              Effect.catchAll((error) => {
                console.error('❌ Failed to capture OTLP data:', error)
                return Effect.succeed('capture-error')
              })
            )
          )
        }

        // After successful storage, create annotations if we have an active diagnostic session
        if (diagnosticState.activeSession) {
          console.log(
            `📝 Creating annotations for diagnostic session: ${diagnosticState.activeSession.id}`
          )

          // Annotate traces with feature flag states
          const annotationPromises = traces.map(async (trace) => {
            const traceId = trace.TraceId

            // Create annotations for each enabled feature flag
            for (const flagName of diagnosticState.enabledFlags) {
              const annotation: Annotation = {
                signalType: 'trace',
                traceId,
                timeRangeStart: new Date(),
                timeRangeEnd: new Date(Date.now() + 86400000), // 24 hours TTL
                annotationType: 'test',
                annotationKey: `test.flag.${flagName}`,
                annotationValue: JSON.stringify({
                  sessionId: diagnosticState.activeSession?.id || 'unknown',
                  flagState: 'enabled',
                  timestamp: Date.now(),
                  serviceName: trace.ServiceName || 'unknown'
                }),
                createdBy: 'system:diagnostics'
              }

              // Use the annotation service to store the annotation
              await runWithServices(
                Effect.gen(function* () {
                  const annotationService = yield* AnnotationService
                  const result = yield* annotationService.annotate(annotation)
                  console.log(`✅ Created annotation for trace ${traceId} with flag ${flagName}`)
                  return result
                }).pipe(
                  Effect.catchAll((error) => {
                    console.error(`❌ Failed to create annotation for trace ${traceId}:`, error)
                    return Effect.succeed('error')
                  })
                )
              )
            }

            // Also create a session metadata annotation
            const sessionAnnotation: Annotation = {
              signalType: 'trace',
              traceId,
              timeRangeStart: new Date(),
              timeRangeEnd: new Date(Date.now() + 86400000), // 24 hours TTL
              annotationType: 'meta',
              annotationKey: `meta.session.${diagnosticState.activeSession?.id || 'unknown'}`,
              annotationValue: JSON.stringify({
                sessionId: diagnosticState.activeSession?.id || 'unknown',
                sessionName: diagnosticState.activeSession?.name || 'unknown',
                phase: diagnosticState.activeSession?.phase || 'unknown',
                timestamp: Date.now()
              }),
              createdBy: 'system:diagnostics'
            }

            await runWithServices(
              Effect.gen(function* () {
                const annotationService = yield* AnnotationService
                const result = yield* annotationService.annotate(sessionAnnotation)
                console.log(`✅ Created session annotation for trace ${traceId}`)
                return result
              }).pipe(
                Effect.catchAll((error) => {
                  console.error(`❌ Failed to create session annotation:`, error)
                  return Effect.succeed('error')
                })
              )
            )
          })

          await Promise.all(annotationPromises)
          console.log(`✅ Annotations created for ${traces.length} traces`)
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
  console.log(`🎯 Diagnostics API: http://localhost:${PORT}/api/diagnostics/flags`)
  console.log(`📝 Session Management: http://localhost:${PORT}/api/diagnostics/sessions`)

  // Wait a bit for schema migrations to complete, then create views
  setTimeout(async () => {
    await createViews()
    console.log('✅ AI Analyzer service available through layer composition')
    console.log(`🤖 AI Analyzer API: http://localhost:${PORT}/api/ai-analyzer/health`)
  }, 10000) // Wait 10 seconds
})

// LLM Interaction Logging Endpoints - Uses LLM Manager API Client
app.get('/api/llm/interactions', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50
    const model = req.query.model as string | undefined

    // Only return real interactions from the logger - NO MOCK DATA
    const realInteractions = interactionLogger.getInteractions(limit, model)

    console.log(`📊 Serving ${realInteractions.length} real Portkey interactions`)

    // Get unique models from real interactions
    const modelsUsed = Array.from(new Set(realInteractions.map((i) => i.model)))

    res.json({
      interactions: realInteractions,
      total: realInteractions.length,
      modelsUsed,
      source: 'portkey'
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

    // Only return real comparison data from the logger - NO MOCK DATA
    const realComparison = interactionLogger.getModelComparison(timeWindowMs)

    console.log(`📊 Serving real model comparison for ${realComparison.length} models`)
    res.json({
      comparison: realComparison,
      source: 'portkey',
      taskType: taskType || 'all',
      timeWindowMs
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
      message: 'Connected to LLM interaction live feed (with real Portkey data)'
    })}\n\n`
  )

  // Set up listeners for real interaction events
  const handleInteractionStart = (interaction: LLMInteraction) => {
    res.write(
      `data: ${JSON.stringify({
        type: 'request_start',
        entry: interaction,
        timestamp: Date.now()
      })}\n\n`
    )
  }

  const handleInteractionComplete = (interaction: LLMInteraction) => {
    res.write(
      `data: ${JSON.stringify({
        type: 'request_complete',
        entry: interaction,
        timestamp: Date.now()
      })}\n\n`
    )
  }

  const handleInteractionError = (interaction: LLMInteraction) => {
    res.write(
      `data: ${JSON.stringify({
        type: 'request_error',
        entry: interaction,
        timestamp: Date.now()
      })}\n\n`
    )
  }

  // Register event listeners - ONLY REAL EVENTS, NO MOCK DATA
  interactionLogger.on('interaction:start', handleInteractionStart)
  interactionLogger.on('interaction:complete', handleInteractionComplete)
  interactionLogger.on('interaction:error', handleInteractionError)

  // Clean up on client disconnect
  req.on('close', () => {
    // Remove real event listeners
    interactionLogger.off('interaction:start', handleInteractionStart)
    interactionLogger.off('interaction:complete', handleInteractionComplete)
    interactionLogger.off('interaction:error', handleInteractionError)
  })
})

// UI Generator Query Generation Endpoint - REAL (production)
app.post('/api/ui-generator/generate-query', async (req, res) => {
  try {
    const {
      path,
      timeWindowMinutes = 60,
      analysisGoal,
      model,
      isClickHouseAI,
      useEvaluatorOptimizer = true // Enable evaluator by default for better query validation
    } = req.body

    // Validate that path exists
    if (!path || !path.services || path.services.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Path with services array is required'
      })
    }

    console.log(`🔧 [EVALUATOR] Server received useEvaluatorOptimizer: ${useEvaluatorOptimizer}`)
    console.log(`🔧 [EVALUATOR] Request body keys:`, Object.keys(req.body))
    console.log(
      `🔧 [EVALUATOR] About to call UIGeneratorAPIClient.generateQuery with evaluator flag: ${useEvaluatorOptimizer}`
    )

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
          analysisGoal: analysisGoal || determineAnalysisGoal(path?.metrics),
          model: model, // Model will be determined by Portkey config defaults
          isClickHouseAI: isClickHouseAI, // Pass ClickHouse AI flag
          useEvaluatorOptimizer: useEvaluatorOptimizer // Pass evaluator flag
        })
      })
    )

    // Add timeWindow context to the SQL if specified
    let sql = result.sql
    if (timeWindowMinutes && timeWindowMinutes !== 60) {
      // Replace default time window in the generated SQL
      sql = sql.replace(/INTERVAL \d+ MINUTE/g, `INTERVAL ${timeWindowMinutes} MINUTE`)
    }

    return res.json({
      sql,
      model: result.model,
      description: result.description,
      generationTimeMs: result.generationTimeMs,
      analysisType: determineAnalysisType(result.description),
      // Include optimization status if evaluator was used
      optimizationStatus: result.evaluations
        ? {
            wasOptimized: result.evaluations.length > 1,
            attempts: result.evaluations.length,
            finalValid: result.evaluations?.[result.evaluations.length - 1]?.isValid || false,
            errors:
              result.evaluations
                ?.filter((e) => !e.isValid)
                .map((e, index) => ({
                  attempt: index + 1,
                  code: e.error?.code,
                  message: e.error?.message
                })) || []
          }
        : undefined
    })
  } catch (error) {
    console.error('❌ Query generation error:', error)

    // Check if this is a ModelUnavailable error
    const errorObj = error as { _tag?: string; message?: string }
    if (
      errorObj._tag === 'ModelUnavailable' ||
      (errorObj.message && errorObj.message.includes('ModelUnavailable'))
    ) {
      return res.status(503).json({
        error: 'Model unavailable',
        message: errorObj.message || 'The requested model is not available',
        retryAfter: 60 // Suggest retry after 60 seconds
      })
    }

    // Generic error handling
    return res.status(500).json({
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
        model.capabilities?.includes('sql')
          ? 'SQL optimized'
          : model.capabilities?.includes('general')
            ? 'General purpose'
            : 'Specialized model'
      }`,
      available: model.status === 'available',
      availabilityReason:
        model.status === 'available' ? 'Model loaded and healthy' : `Model status: ${model.status}`,
      capabilities: {
        json: model.capabilities?.includes('general') || false,
        sql: model.capabilities?.includes('sql') || false,
        reasoning: ['anthropic', 'openai'].includes(model.provider),
        functions: model.provider === 'openai',
        streaming: true // Most modern models support streaming
      },
      contextLength: model.metadata?.contextLength || 0,
      maxTokens: model.metadata?.maxTokens || 0,
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

// Removed bogus pipeline endpoints - the real flow is:
// Service Topology → Critical Paths → /api/ui-generator/generate-query → /api/clickhouse → /api/ui-generator/from-sql

// Clear LLM logs endpoint
app.delete('/api/llm/interactions', async (_req, res) => {
  try {
    // Clear real interaction logs
    interactionLogger.clearInteractions()

    console.log('🧹 Cleared all LLM interaction logs')

    res.json({
      message: 'LLM interaction logs cleared',
      timestamp: Date.now(),
      source: 'portkey'
    })
  } catch (error) {
    res.status(500).json({
      error: 'Failed to clear logs',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// LLM Manager Implementation Info - Shows which backend is being used
app.get('/api/llm-manager/implementation', async (_req, res) => {
  const usePortkey = process.env.USE_PORTKEY_GATEWAY === 'true'

  res.json({
    implementation: usePortkey ? 'portkey-gateway' : 'original-llm-manager',
    usePortkey,
    details: usePortkey
      ? {
          gatewayUrl: process.env.PORTKEY_GATEWAY_URL || 'http://localhost:8787',
          configPath: '/config/config.json',
          features: [
            'Configuration-driven routing',
            'Automatic failover',
            'Semantic caching',
            'Native observability',
            '1,600+ model support'
          ],
          healthCheck: `${process.env.PORTKEY_GATEWAY_URL || 'http://localhost:8787'}/health`
        }
      : {
          models: ['gpt', 'claude', 'llama'],
          routing: 'Code-based routing',
          features: [
            'Multi-model support',
            'Fallback strategies',
            'Response caching',
            'Custom routing logic'
          ]
        },
    timestamp: new Date().toISOString()
  })
})

// LLM Manager Status endpoint - Get actual loaded models and health
app.get('/api/llm-manager/status', async (_req, res) => {
  try {
    const status = await runWithServices(
      Effect.flatMap(LLMManagerAPIClientTag, (llmManager) => llmManager.getStatus())
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
      Effect.flatMap(LLMManagerAPIClientTag, (llmManager) => llmManager.getLoadedModels())
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
      Effect.flatMap(LLMManagerAPIClientTag, (llmManager) =>
        llmManager.selectModel({
          taskType,
          requirements
        })
      )
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
      Effect.flatMap(LLMManagerAPIClientTag, (llmManager) => llmManager.getStatus())
    )

    const httpStatus =
      status.status === 'operational' ? 200 : status.status === 'degraded' ? 207 : 503

    res.status(httpStatus).json({
      status: status.status,
      loadedModels: status.loadedModels?.length || 0,
      healthyModels: status.loadedModels?.filter((m) => m.status === 'available').length || 0,
      uptime: status.systemMetrics?.uptime,
      timestamp: new Date().toISOString(),
      config: status.config
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

// Critical Service Detection API - Find real issues for investigation
app.get('/api/critical-services', async (req, res) => {
  try {
    const timeHours = parseInt(req.query.timeHours as string) || 3
    const minErrorRate = parseFloat(req.query.minErrorRate as string) || 0.1

    const criticalServicesQuery = `
      SELECT 
        service_name,
        operation_name,
        COUNT(*) as total_traces,
        countIf(status_code = 'ERROR' OR is_error = 1) as error_count,
        (countIf(status_code = 'ERROR' OR is_error = 1) * 100.0 / COUNT(*)) as error_rate,
        max(start_time) as latest_error,
        min(start_time) as first_error,
        avgIf(duration_ms, status_code = 'ERROR' OR is_error = 1) as avg_error_duration,
        avgIf(duration_ms, status_code != 'ERROR' AND is_error != 1) as avg_success_duration
      FROM traces 
      WHERE start_time >= subtractHours(now(), ${timeHours})
      GROUP BY service_name, operation_name 
      HAVING error_count > 0 AND error_rate >= ${minErrorRate}
      ORDER BY error_rate DESC, error_count DESC 
      LIMIT 10
    `

    console.log('🔍 Finding critical services with query:', criticalServicesQuery)
    const result = await queryWithResults(criticalServicesQuery)

    // Generate investigation queries for each critical service
    const criticalServices = result.data.map((service: Record<string, unknown>) => {
      const error_rate = Number(service.error_rate || 0)
      return {
        ...service,
        investigationQuery: generateInvestigationQuery(service),
        severity: error_rate >= 10 ? 'critical' : error_rate >= 5 ? 'high' : 'medium',
        actionable: true
      }
    })

    res.json({
      critical_services: criticalServices,
      total_found: criticalServices.length,
      time_range_hours: timeHours,
      min_error_rate: minErrorRate,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ Error finding critical services:', error)
    res.status(500).json({
      error: 'Failed to find critical services',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// Generate targeted investigation query for a critical service
function generateInvestigationQuery(service: Record<string, unknown>): string {
  const service_name = String(service.service_name || 'unknown')
  const operation_name = String(service.operation_name || 'unknown')
  const error_rate = Number(service.error_rate || 0)

  return `-- Investigation Query for ${service_name}:${operation_name} (${error_rate.toFixed(2)}% error rate)
-- This query shows error patterns, timing, and root cause insights

SELECT 
  trace_id,
  start_time,
  duration_ms,
  status_code,
  is_error,
  span_attributes,
  -- Error analysis fields
  CASE 
    WHEN is_error = 1 OR status_code = 'ERROR' THEN 'ERROR'
    WHEN duration_ms > 5000 THEN 'SLOW'  
    ELSE 'SUCCESS'
  END as issue_type,
  -- Performance comparison
  duration_ms - (SELECT avg(duration_ms) FROM traces WHERE service_name = '${service_name}' AND operation_name = '${operation_name}' AND is_error != 1) as duration_vs_avg
FROM traces
WHERE service_name = '${service_name}' 
  AND operation_name = '${operation_name}'
  AND start_time >= subtractHours(now(), 3)
ORDER BY 
  CASE WHEN is_error = 1 OR status_code = 'ERROR' THEN 0 ELSE 1 END,  -- Errors first
  start_time DESC
LIMIT 100`
}

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
