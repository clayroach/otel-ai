/**
 * Topology Analyzer Service Implementation
 *
 * Statistical analysis of trace data for service topology discovery.
 * Provides insights into service dependencies, performance patterns, and architecture.
 */

import { Effect, Layer } from 'effect'
import { Schema } from '@effect/schema'
import type { TraceData } from '../storage/schemas.js'
import type { ServiceTopologyRaw, ServiceDependencyRaw, TraceFlowRaw } from './queries.js'
import { TopologyAnalyzerService } from './types.js'
import type {
  AnalysisRequest,
  AnalysisResult,
  AnalysisError,
  ApplicationArchitecture,
  ServiceTopology,
  Insight
} from './types.js'
import { discoverApplicationTopology } from './topology.js'
import { StorageServiceTag } from '../storage/services.js'

/**
 * Configuration for Topology Analyzer
 */
export const AnalyzerConfigSchema = Schema.Struct({
  clickhouse: Schema.Struct({
    host: Schema.String,
    port: Schema.Number,
    database: Schema.String,
    username: Schema.optional(Schema.String),
    password: Schema.optional(Schema.String)
  }),
  analysis: Schema.Struct({
    defaultTimeWindowHours: Schema.Number,
    minSpanThreshold: Schema.Number,
    maxServicesAnalyzed: Schema.Number
  })
})

export type AnalyzerConfig = Schema.Schema.Type<typeof AnalyzerConfigSchema>

/**
 * Default configuration
 */
export const defaultAnalyzerConfig: AnalyzerConfig = {
  clickhouse: {
    host: 'localhost',
    port: 8123,
    database: 'otel'
  },
  analysis: {
    defaultTimeWindowHours: 24,
    minSpanThreshold: 1,
    maxServicesAnalyzed: 50
  }
}

/**
 * Internal: Topology Analyzer Service Implementation
 * Not exported - use TopologyAnalyzerLayer instead
 */
const makeTopologyAnalyzerService = (config: AnalyzerConfig) =>
  Effect.gen(function* (_) {
    const storageService = yield* _(StorageServiceTag)

    const analyzeArchitecture = (
      request: AnalysisRequest
    ): Effect.Effect<AnalysisResult, AnalysisError, never> =>
      Effect.gen(function* (_) {
        const startTime = Date.now()
        const timeRangeHours =
          Math.abs(request.timeRange.endTime.getTime() - request.timeRange.startTime.getTime()) /
          (1000 * 60 * 60)

        try {
          // Step 1: Gather raw data from ClickHouse
          const traces = yield* _(
            storageService
              .queryTraces({
                timeRange: {
                  start: request.timeRange.startTime.getTime(),
                  end: request.timeRange.endTime.getTime()
                },
                limit: 10000,
                filters: request.filters || {}
              })
              .pipe(
                Effect.mapError(
                  (storageError): AnalysisError => ({
                    _tag: 'QueryError',
                    message: `Failed to query traces: ${storageError.message}`,
                    query: 'Traces query for topology analysis'
                  })
                )
              )
          )

          // Transform traces to topology data format
          const [topologyData, dependencyData, traceFlows] = transformTracesToTopology(
            traces,
            timeRangeHours
          )

          // Check if we have sufficient data
          if (topologyData.length < config.analysis.minSpanThreshold) {
            return yield* _(
              Effect.fail({
                _tag: 'InsufficientData' as const,
                message: `Insufficient trace data: ${topologyData.length} spans found, minimum ${config.analysis.minSpanThreshold} required`,
                spanCount: topologyData.length
              })
            )
          }

          // Step 2: Discover application topology
          const architecture = yield* _(
            discoverApplicationTopology(topologyData, dependencyData, traceFlows)
          )

          // Step 3: Generate statistical insights
          const insights = generateInsights(architecture, request.type)

          const analysisTimeMs = Date.now() - startTime

          const result: AnalysisResult = {
            requestId: generateRequestId(),
            type: request.type,
            summary: `Topology analysis discovered ${architecture.services.length} services with ${dependencyData.length} dependencies`,
            architecture: request.type === 'architecture' ? architecture : undefined,
            insights,
            metadata: {
              analyzedSpans: topologyData.reduce((sum, t) => sum + t.total_spans, 0),
              analysisTimeMs,
              confidence: calculateConfidenceScore(topologyData, dependencyData)
            }
          }

          return result
        } catch (error) {
          return yield* _(
            Effect.fail({
              _tag: 'ConfigurationError' as const,
              message: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            })
          )
        }
      })

    const getServiceTopology = (timeRange: {
      startTime: Date
      endTime: Date
    }): Effect.Effect<readonly ServiceTopology[], AnalysisError, never> =>
      Effect.gen(function* (_) {
        const timeRangeHours =
          Math.abs(timeRange.endTime.getTime() - timeRange.startTime.getTime()) / (1000 * 60 * 60)

        const traces = yield* _(
          storageService
            .queryTraces({
              timeRange: {
                start: timeRange.startTime.getTime(),
                end: timeRange.endTime.getTime()
              },
              limit: 5000,
              filters: {}
            })
            .pipe(
              Effect.mapError(
                (storageError): AnalysisError => ({
                  _tag: 'QueryError',
                  message: `Failed to query ClickHouse: ${storageError.message}`,
                  query: 'Service topology queries'
                })
              )
            )
        )

        const [topologyData, dependencyData] = transformTracesToTopology(traces, timeRangeHours)

        const architecture = yield* _(discoverApplicationTopology(topologyData, dependencyData, []))
        return architecture.services
      })

    return {
      analyzeArchitecture,
      getServiceTopology
    }
  })

/**
 * Helper functions
 */

/**
 * Clean protobuf service names from service identifiers
 */
const cleanServiceName = (serviceName: string): string => {
  if (!serviceName || typeof serviceName !== 'string') {
    return serviceName || 'unknown-service'
  }

  // Handle simple JSON object with stringValue
  if (serviceName.startsWith('{') && serviceName.includes('stringValue')) {
    try {
      const parsed = JSON.parse(serviceName)
      if (parsed.stringValue) {
        return parsed.stringValue
      }
    } catch (e) {
      // Not valid JSON, continue with other cleanup strategies
    }
  }

  return serviceName
}

/**
 * Transform storage traces into topology data format
 */
function transformTracesToTopology(
  traces: TraceData[],
  timeRangeHours: number
): [ServiceTopologyRaw[], ServiceDependencyRaw[], TraceFlowRaw[]] {
  // Group spans by service
  const serviceMap = new Map<
    string,
    {
      spans: typeof traces
      totalDuration: number
      errorCount: number
    }
  >()

  // Track dependencies
  const dependencies = new Map<string, ServiceDependencyRaw>()

  // Track trace flows
  const traceFlows: TraceFlowRaw[] = []

  for (const span of traces) {
    const serviceName = cleanServiceName(span.serviceName)

    // Aggregate service metrics
    if (!serviceMap.has(serviceName)) {
      serviceMap.set(serviceName, {
        spans: [],
        totalDuration: 0,
        errorCount: 0
      })
    }

    const serviceData = serviceMap.get(serviceName)
    if (!serviceData) continue
    serviceData.spans.push(span)
    // Convert nanoseconds to milliseconds
    serviceData.totalDuration += span.duration / 1_000_000
    if (span.statusCode === 2) {
      // STATUS_CODE_ERROR = 2
      serviceData.errorCount++
    }

    // Track dependencies (parent-child relationships)
    if (span.parentSpanId) {
      // Find parent span to determine dependency
      const parentSpan = traces.find((t) => t.spanId === span.parentSpanId)
      if (parentSpan && parentSpan.serviceName !== span.serviceName) {
        const depKey = `${cleanServiceName(parentSpan.serviceName)}->${serviceName}`
        if (!dependencies.has(depKey)) {
          dependencies.set(depKey, {
            service_name: cleanServiceName(parentSpan.serviceName),
            operation_name: parentSpan.operationName,
            dependent_service: serviceName,
            dependent_operation: span.operationName,
            call_count: 0,
            avg_duration_ms: 0,
            error_count: 0,
            total_count: 0
          })
        }

        const dep = dependencies.get(depKey)
        if (!dep) continue
        dep.call_count++
        dep.total_count++
        // Convert nanoseconds to milliseconds
        const durationMs = span.duration / 1_000_000
        dep.avg_duration_ms =
          ((dep.avg_duration_ms ?? 0) * (dep.call_count - 1) + durationMs) / dep.call_count
        if (span.statusCode === 2) {
          // STATUS_CODE_ERROR = 2
          dep.error_count++
        }
      }
    }
  }

  // Convert to topology format
  const topologyData: ServiceTopologyRaw[] = []
  for (const [serviceName, data] of serviceMap) {
    const operations = [...new Set(data.spans.map((s) => s.operationName))]
    topologyData.push({
      service_name: serviceName,
      operation_name: operations[0] || 'unknown',
      span_kind: 'SPAN_KIND_SERVER',
      total_spans: data.spans.length,
      root_spans: data.spans.filter((s) => !s.parentSpanId).length,
      error_spans: data.errorCount,
      // totalDuration is already in milliseconds after conversion above
      avg_duration_ms: data.totalDuration / data.spans.length,
      p95_duration_ms: (data.totalDuration / data.spans.length) * 1.2, // Approximate
      unique_traces: new Set(data.spans.map((s) => s.traceId)).size,
      rate_per_second: data.spans.length / (timeRangeHours * 3600),
      error_rate_percent: (data.errorCount / data.spans.length) * 100,
      health_status:
        data.errorCount / data.spans.length > 0.1
          ? 'critical'
          : data.errorCount / data.spans.length > 0.05
            ? 'warning'
            : 'healthy'
    })
  }

  return [topologyData, Array.from(dependencies.values()), traceFlows]
}

/**
 * Generate insights from architecture data using statistical analysis
 */
const generateInsights = (
  architecture: ApplicationArchitecture,
  _analysisType: AnalysisRequest['type']
): Insight[] => {
  const insights: Insight[] = []

  // Performance insights - high latency services
  const slowServices = architecture.services
    .filter((s) => s.metadata.avgLatencyMs !== undefined && s.metadata.avgLatencyMs > 1000)
    .sort((a, b) => (b.metadata.avgLatencyMs ?? 0) - (a.metadata.avgLatencyMs ?? 0))

  if (slowServices.length > 0) {
    const evidenceData = slowServices
      .slice(0, 5)
      .map(
        (s) =>
          `${cleanServiceName(s.service)}: ${Math.round(s.metadata.avgLatencyMs ?? 0)}ms avg latency (${s.metadata.totalSpans} spans)`
      )

    insights.push({
      type: 'performance' as const,
      severity: 'warning' as const,
      title: 'High Latency Services Detected',
      description: `${slowServices.length} services have average latency > 1000ms: ${slowServices
        .slice(0, 3)
        .map((s) => cleanServiceName(s.service))
        .join(', ')}`,
      recommendation: 'Investigate performance bottlenecks in these services',
      evidence: evidenceData
    })
  }

  // Error rate insights
  const errorProneServices = architecture.services
    .filter((s) => s.metadata.errorRate !== undefined && s.metadata.errorRate > 0.01) // 1% error rate
    .sort((a, b) => (b.metadata.errorRate ?? 0) - (a.metadata.errorRate ?? 0))

  if (errorProneServices.length > 0) {
    const evidenceData = errorProneServices
      .slice(0, 5)
      .map(
        (s) =>
          `${cleanServiceName(s.service)}: ${((s.metadata.errorRate ?? 0) * 100).toFixed(1)}% error rate (${s.metadata.totalSpans} spans)`
      )

    insights.push({
      type: 'reliability' as const,
      severity: 'critical' as const,
      title: 'High Error Rate Services',
      description: `${errorProneServices.length} services have error rates > 1%: ${errorProneServices
        .slice(0, 3)
        .map(
          (s) =>
            `${cleanServiceName(s.service)} (${((s.metadata.errorRate ?? 0) * 100).toFixed(1)}%)`
        )
        .join(', ')}`,
      recommendation: 'Review error handling and monitoring for these services',
      evidence: evidenceData
    })
  }

  // Architecture insights - complex dependencies
  const complexServices = architecture.services
    .filter((s) => s.dependencies.length > 5)
    .sort((a, b) => b.dependencies.length - a.dependencies.length)

  if (complexServices.length > 0) {
    const evidenceData = complexServices
      .slice(0, 3)
      .map(
        (s) =>
          `${cleanServiceName(s.service)}: ${s.dependencies.length} dependencies (${s.metadata.totalSpans} spans)`
      )

    insights.push({
      type: 'architecture' as const,
      severity: 'info' as const,
      title: 'Complex Service Dependencies',
      description: `${complexServices.length} services have > 5 dependencies: ${complexServices
        .slice(0, 3)
        .map((s) => `${cleanServiceName(s.service)} (${s.dependencies.length})`)
        .join(', ')}`,
      recommendation: 'Consider dependency injection or service consolidation',
      evidence: evidenceData
    })
  }

  return insights
}

export const generateRequestId = (): string =>
  `topology-analysis-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`

const calculateConfidenceScore = (
  topologyData: ServiceTopologyRaw[],
  dependencyData: ServiceDependencyRaw[]
): number => {
  // Simple confidence calculation based on data volume
  const spanCount = topologyData.reduce((sum, t) => sum + t.total_spans, 0)
  const serviceCount = topologyData.length
  const dependencyCount = dependencyData.length

  // More data = higher confidence, but cap at 1.0
  const dataScore = Math.min(spanCount / 10000, 1.0) * 0.4
  const diversityScore = Math.min(serviceCount / 20, 1.0) * 0.3
  const connectivityScore = Math.min(dependencyCount / 50, 1.0) * 0.3

  return Math.min(dataScore + diversityScore + connectivityScore, 1.0)
}

/**
 * Topology Analyzer Service Layer - Production Implementation
 */
export const TopologyAnalyzerLayer = (config: AnalyzerConfig = defaultAnalyzerConfig) =>
  Layer.effect(TopologyAnalyzerService, makeTopologyAnalyzerService(config))

/**
 * Internal: Mock Topology Analyzer Service Implementation
 * Not exported - use TopologyAnalyzerMockLayer instead
 */
const makeTopologyAnalyzerMockService = (_config: AnalyzerConfig = defaultAnalyzerConfig) =>
  Effect.succeed({
    // Mock implementation that works without external dependencies
    analyzeArchitecture: (
      request: AnalysisRequest
    ): Effect.Effect<AnalysisResult, AnalysisError, never> =>
      Effect.gen(function* (_) {
        yield* _(Effect.logInfo(`🚀 MOCK - Topology analysis for: ${request.type}`))

        // Simple mock data
        const mockArchitecture: ApplicationArchitecture = {
          applicationName: 'Mock Application',
          description: 'Mock architecture discovered from telemetry data',
          services: [
            {
              service: 'mock-frontend',
              type: 'frontend' as const,
              operations: ['GET /', 'GET /api/data'],
              dependencies: [
                {
                  service: 'mock-backend',
                  operation: 'GET /api/data',
                  callCount: 150,
                  avgLatencyMs: 45,
                  errorRate: 0.02
                }
              ],
              metadata: {
                avgLatencyMs: 45,
                errorRate: 0.02,
                totalSpans: 1500
              }
            },
            {
              service: 'mock-backend',
              type: 'backend' as const,
              operations: ['GET /api/data', 'POST /api/process'],
              dependencies: [
                {
                  service: 'mock-database',
                  operation: 'SELECT',
                  callCount: 300,
                  avgLatencyMs: 12,
                  errorRate: 0.001
                }
              ],
              metadata: {
                avgLatencyMs: 75,
                errorRate: 0.05,
                totalSpans: 2300
              }
            },
            {
              service: 'mock-database',
              type: 'database' as const,
              operations: ['SELECT', 'INSERT', 'UPDATE'],
              dependencies: [],
              metadata: {
                avgLatencyMs: 12,
                errorRate: 0.001,
                totalSpans: 5000
              }
            }
          ],
          dataFlows: [],
          criticalPaths: [],
          generatedAt: new Date()
        }

        const mockInsights: Insight[] = [
          {
            type: 'performance',
            severity: 'info',
            title: 'Mock Performance Insight',
            description: 'This is a mock insight for testing',
            recommendation: 'No action needed - this is mock data',
            evidence: ['Mock evidence 1', 'Mock evidence 2']
          }
        ]

        return {
          requestId: generateRequestId(),
          type: request.type,
          summary: 'Mock analysis completed',
          architecture: mockArchitecture,
          insights: mockInsights,
          metadata: {
            analyzedSpans: 8800,
            analysisTimeMs: 50,
            confidence: 0.85
          }
        }
      }),

    getServiceTopology: (_timeRange: {
      startTime: Date
      endTime: Date
    }): Effect.Effect<readonly ServiceTopology[], AnalysisError, never> =>
      Effect.succeed([
        {
          service: 'mock-frontend',
          type: 'frontend' as const,
          operations: ['GET /', 'GET /api/data'],
          dependencies: [
            {
              service: 'mock-backend',
              operation: 'GET /api/data',
              callCount: 150,
              avgLatencyMs: 45,
              errorRate: 0.02
            }
          ],
          metadata: {
            avgLatencyMs: 45,
            errorRate: 0.02,
            totalSpans: 1500
          }
        }
      ] as const)
  })

/**
 * Mock Topology Analyzer Service Layer for Testing and Development
 */
export const TopologyAnalyzerMockLayer = (config: AnalyzerConfig = defaultAnalyzerConfig) =>
  Layer.effect(TopologyAnalyzerService, makeTopologyAnalyzerMockService(config))
