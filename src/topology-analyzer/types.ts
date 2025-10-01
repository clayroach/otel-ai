/**
 * Topology Analyzer Types and Schemas
 *
 * Statistical analysis of trace data for service topology discovery and insights.
 * Focused on understanding service dependencies, performance patterns, and architecture.
 */

import { Schema } from '@effect/schema'
import { Effect, Context } from 'effect'

// Configuration Schemas (simplified - no LLM config)
export const AnalysisConfigSchema = Schema.Struct({
  analysis: Schema.Struct({
    timeWindowHours: Schema.Number,
    minSpanCount: Schema.Number,
    serviceFilterPattern: Schema.optional(Schema.String)
  }),
  output: Schema.Struct({
    format: Schema.Literal('text', 'markdown', 'json'),
    includeDigrams: Schema.Boolean,
    detailLevel: Schema.Literal('summary', 'detailed', 'comprehensive')
  })
})

// Request/Response Schemas
export const AnalysisRequestSchema = Schema.Struct({
  type: Schema.Literal('architecture', 'dataflow', 'dependencies', 'insights'),
  timeRange: Schema.Struct({
    startTime: Schema.Union(Schema.Date, Schema.DateFromString),
    endTime: Schema.Union(Schema.Date, Schema.DateFromString)
  }),
  filters: Schema.optional(
    Schema.Struct({
      services: Schema.optional(Schema.Array(Schema.String)),
      operations: Schema.optional(Schema.Array(Schema.String)),
      traceIds: Schema.optional(Schema.Array(Schema.String))
    })
  ),
  config: Schema.optional(AnalysisConfigSchema)
})

export const ServiceTopologySchema = Schema.Struct({
  service: Schema.String,
  type: Schema.Literal('frontend', 'api', 'backend', 'database', 'queue', 'cache', 'external'),
  operations: Schema.Array(Schema.String),
  dependencies: Schema.Array(
    Schema.Struct({
      service: Schema.String,
      operation: Schema.String,
      callCount: Schema.Number,
      avgLatencyMs: Schema.Number,
      errorRate: Schema.Number
    })
  ),
  metadata: Schema.Struct({
    avgLatencyMs: Schema.optional(Schema.Number),
    p95LatencyMs: Schema.optional(Schema.Number),
    errorRate: Schema.optional(Schema.Number),
    totalSpans: Schema.optional(Schema.Union(Schema.Number, Schema.String)),
    throughput: Schema.optional(Schema.Number),
    dependencies: Schema.optional(Schema.Number),
    rootSpans: Schema.optional(Schema.Number)
  })
})

export const ApplicationArchitectureSchema = Schema.Struct({
  applicationName: Schema.String,
  description: Schema.String,
  services: Schema.Array(ServiceTopologySchema),
  dataFlows: Schema.Array(
    Schema.Struct({
      from: Schema.String,
      to: Schema.String,
      operation: Schema.String,
      volume: Schema.Number,
      latency: Schema.Struct({
        p50: Schema.Number,
        p95: Schema.Number,
        p99: Schema.Number
      })
    })
  ),
  criticalPaths: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      services: Schema.Array(Schema.String),
      avgLatencyMs: Schema.Number,
      errorRate: Schema.Number
    })
  ),
  generatedAt: Schema.Union(Schema.Date, Schema.DateFromString)
})

// Topology visualization specific schemas
export const ServiceNodeSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  category: Schema.String,
  symbolSize: Schema.Number,
  itemStyle: Schema.Struct({
    color: Schema.String
  }),
  label: Schema.Struct({
    show: Schema.Boolean
  }),
  metrics: Schema.Struct({
    rate: Schema.Number,
    errorRate: Schema.Number,
    duration: Schema.Number
  }),
  position: Schema.optional(Schema.Tuple(Schema.Number, Schema.Number))
})

export const ServiceEdgeSchema = Schema.Struct({
  source: Schema.String,
  target: Schema.String,
  value: Schema.Number,
  lineStyle: Schema.Struct({
    width: Schema.Number,
    color: Schema.String
  })
})

export const TopologyVisualizationDataSchema = Schema.extend(
  ApplicationArchitectureSchema,
  Schema.Struct({
    nodes: Schema.Array(ServiceNodeSchema),
    edges: Schema.Array(ServiceEdgeSchema),
    runtimeEnvironments: Schema.Array(Schema.String),
    healthSummary: Schema.Struct({
      healthy: Schema.Number,
      warning: Schema.Number,
      degraded: Schema.Number,
      critical: Schema.Number,
      unavailable: Schema.Number
    })
  })
)

// Simplified Insight Schema (no LLM-specific fields)
export const InsightSchema = Schema.Struct({
  type: Schema.Literal('performance', 'reliability', 'architecture', 'optimization'),
  severity: Schema.Literal('info', 'warning', 'critical'),
  title: Schema.String,
  description: Schema.String,
  recommendation: Schema.optional(Schema.String),
  evidence: Schema.Array(Schema.String)
})

// Simplified Analysis Result (no LLM metadata)
export const AnalysisResultSchema = Schema.Struct({
  requestId: Schema.String,
  type: Schema.Literal('architecture', 'dataflow', 'dependencies', 'insights'),
  summary: Schema.String,
  architecture: Schema.optional(ApplicationArchitectureSchema),
  insights: Schema.Array(InsightSchema),
  metadata: Schema.Struct({
    analyzedSpans: Schema.Union(Schema.Number, Schema.String),
    analysisTimeMs: Schema.Number,
    confidence: Schema.Number
  })
})

// Additional API Response Schemas
export const HealthCheckResponseSchema = Schema.Struct({
  status: Schema.Literal('healthy', 'unhealthy'),
  capabilities: Schema.Array(Schema.String),
  message: Schema.String
})

export const TopologyResponseSchema = Schema.Array(ServiceTopologySchema)

export const AnalysisResponseSchema = Schema.Struct({
  requestId: Schema.String,
  type: Schema.Literal('architecture', 'dataflow', 'dependencies', 'insights'),
  summary: Schema.String,
  architecture: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  insights: Schema.Array(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  metadata: Schema.Struct({
    analyzedSpans: Schema.Union(Schema.Number, Schema.String),
    analysisTimeMs: Schema.Number,
    confidence: Schema.Number
  })
})

// Type exports
export type AnalysisConfig = Schema.Schema.Type<typeof AnalysisConfigSchema>
export type AnalysisRequest = Schema.Schema.Type<typeof AnalysisRequestSchema>
export type ServiceTopology = Schema.Schema.Type<typeof ServiceTopologySchema>
export type ApplicationArchitecture = Schema.Schema.Type<typeof ApplicationArchitectureSchema>
export type Insight = Schema.Schema.Type<typeof InsightSchema>
export type AnalysisResult = Schema.Schema.Type<typeof AnalysisResultSchema>
export type HealthCheckResponse = Schema.Schema.Type<typeof HealthCheckResponseSchema>
export type TopologyResponse = Schema.Schema.Type<typeof TopologyResponseSchema>
export type AnalysisResponse = Schema.Schema.Type<typeof AnalysisResponseSchema>
export type ServiceNode = Schema.Schema.Type<typeof ServiceNodeSchema>
export type ServiceEdge = Schema.Schema.Type<typeof ServiceEdgeSchema>
export type TopologyVisualizationData = Schema.Schema.Type<typeof TopologyVisualizationDataSchema>

// Error ADT (removed LLMError)
export type AnalysisError =
  | { _tag: 'InsufficientData'; message: string; spanCount: number }
  | { _tag: 'QueryError'; message: string; query: string }
  | { _tag: 'ConfigurationError'; message: string }
  | { _tag: 'TimeoutError'; message: string; timeoutMs: number }

// Service Interface (simplified - removed streamAnalysis and generateDocumentation)
export interface TopologyAnalyzerServiceImpl {
  readonly analyzeArchitecture: (
    request: AnalysisRequest
  ) => Effect.Effect<AnalysisResult, AnalysisError, never>
  readonly getServiceTopology: (timeRange: {
    startTime: Date
    endTime: Date
  }) => Effect.Effect<readonly ServiceTopology[], AnalysisError, never>
}

// Context tag (renamed from AIAnalyzerService)
export class TopologyAnalyzerService extends Context.Tag('TopologyAnalyzerService')<
  TopologyAnalyzerService,
  TopologyAnalyzerServiceImpl
>() {}
