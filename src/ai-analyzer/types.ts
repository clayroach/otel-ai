/**
 * AI Analyzer Types and Schemas
 * 
 * LLM-based analysis of trace data for application architecture discovery and insights.
 * Focused on understanding service topology, data flows, and generating architectural documentation.
 */

import { Schema } from '@effect/schema'
import { Effect, Stream, Context } from 'effect'

// Configuration Schemas
export const AnalysisConfigSchema = Schema.Struct({
  llm: Schema.Struct({
    model: Schema.Literal('gpt', 'claude', 'llama'),
    temperature: Schema.Number,
    maxTokens: Schema.Number
  }),
  analysis: Schema.Struct({
    timeWindowHours: Schema.Number, // How far back to analyze
    minSpanCount: Schema.Number, // Minimum spans needed for analysis
    serviceFilterPattern: Schema.optional(Schema.String) // Optional service name filter
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
  filters: Schema.optional(Schema.Struct({
    services: Schema.optional(Schema.Array(Schema.String)),
    operations: Schema.optional(Schema.Array(Schema.String)),
    traceIds: Schema.optional(Schema.Array(Schema.String))
  })),
  config: Schema.optional(AnalysisConfigSchema)
})

export const ServiceTopologySchema = Schema.Struct({
  service: Schema.String,
  type: Schema.Literal('frontend', 'api', 'backend', 'database', 'queue', 'cache', 'external'),
  operations: Schema.Array(Schema.String),
  dependencies: Schema.Array(Schema.Struct({
    service: Schema.String,
    operation: Schema.String,
    callCount: Schema.Number,
    avgLatencyMs: Schema.Number,
    errorRate: Schema.Number
  })),
  metadata: Schema.Struct({
    avgLatencyMs: Schema.optional(Schema.Number),
    p95LatencyMs: Schema.optional(Schema.Number),
    errorRate: Schema.optional(Schema.Number),
    totalSpans: Schema.optional(Schema.Union(Schema.Number, Schema.String)), // Handle BigInt conversion
    throughput: Schema.optional(Schema.Number),
    dependencies: Schema.optional(Schema.Number),
    rootSpans: Schema.optional(Schema.Number)
  })
})

export const ApplicationArchitectureSchema = Schema.Struct({
  applicationName: Schema.String,
  description: Schema.String,
  services: Schema.Array(ServiceTopologySchema),
  dataFlows: Schema.Array(Schema.Struct({
    from: Schema.String,
    to: Schema.String,
    operation: Schema.String,
    volume: Schema.Number,
    latency: Schema.Struct({
      p50: Schema.Number,
      p95: Schema.Number,
      p99: Schema.Number
    })
  })),
  criticalPaths: Schema.Array(Schema.Struct({
    name: Schema.String,
    services: Schema.Array(Schema.String),
    avgLatencyMs: Schema.Number,
    errorRate: Schema.Number
  })),
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

export const TopologyVisualizationDataSchema = Schema.extend(ApplicationArchitectureSchema, Schema.Struct({
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
}))

// Enhanced evidence formatting schemas for model differentiation
export const ModelSpecificEvidenceSchema = Schema.Struct({
  format: Schema.Literal('structured', 'narrative', 'statistical'),
  data: Schema.Record(Schema.String, Schema.Unknown),
  visualizations: Schema.optional(Schema.Array(Schema.Struct({
    type: Schema.Literal('timeseries', 'heatmap', 'network', 'distribution', 'scatter', 'bar'),
    title: Schema.String,
    description: Schema.String,
    config: Schema.Record(Schema.String, Schema.Unknown),
    data: Schema.Array(Schema.Unknown)
  }))),
  metadata: Schema.Struct({
    processingTime: Schema.Number,
    dataPoints: Schema.Number,
    confidence: Schema.Number,
    model: Schema.String,
    analysisMethod: Schema.Literal('statistical', 'llm-enhanced', 'multi-model'),
    enhancementLevel: Schema.Literal('basic', 'statistical', 'advanced', 'expert')
  })
})

export const EnhancedInsightSchema = Schema.Struct({
  type: Schema.Literal('performance', 'reliability', 'architecture', 'optimization'),
  severity: Schema.Literal('info', 'warning', 'critical'),
  title: Schema.String,
  description: Schema.String,
  recommendation: Schema.optional(Schema.String),
  evidence: ModelSpecificEvidenceSchema,
  modelAnalysis: Schema.optional(Schema.Struct({
    model: Schema.Literal('gpt-4', 'claude-3', 'llama-2', 'statistical'),
    analysisType: Schema.Literal('mathematical', 'explanatory', 'realtime', 'statistical'),
    confidence: Schema.Number,
    reasoningPath: Schema.optional(Schema.Array(Schema.String)),
    alternatives: Schema.optional(Schema.Array(Schema.String))
  }))
})

export const AnalysisResultSchema = Schema.Struct({
  requestId: Schema.String,
  type: Schema.Literal('architecture', 'dataflow', 'dependencies', 'insights'),
  summary: Schema.String,
  architecture: Schema.optional(ApplicationArchitectureSchema),
  insights: Schema.Array(EnhancedInsightSchema),
  documentation: Schema.optional(Schema.Struct({
    markdown: Schema.String,
    diagrams: Schema.optional(Schema.Array(Schema.Struct({
      type: Schema.Literal('architecture', 'sequence', 'dataflow'),
      description: Schema.String,
      mermaidCode: Schema.String
    })))
  })),
  metadata: Schema.Struct({
    analyzedSpans: Schema.Union(Schema.Number, Schema.String), // Handle both number and string
    analysisTimeMs: Schema.Number,
    llmTokensUsed: Schema.Number,
    confidence: Schema.Number, // 0-1 score
    selectedModel: Schema.optional(Schema.String),
    llmModel: Schema.optional(Schema.String)
  })
})

// Additional API Response Schemas for Integration Tests
export const HealthCheckResponseSchema = Schema.Struct({
  status: Schema.Literal('healthy', 'unhealthy'),
  capabilities: Schema.Array(Schema.String),
  message: Schema.String
})

// Type-safe topology response array
export const TopologyResponseSchema = Schema.Array(ServiceTopologySchema)

// Type-safe analysis response with proper metadata types (more flexible for JSON responses)
export const AnalysisResponseSchema = Schema.Struct({
  requestId: Schema.String,
  type: Schema.Literal('architecture', 'dataflow', 'dependencies', 'insights'),
  summary: Schema.String,
  architecture: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)), // Flexible architecture object
  insights: Schema.Array(Schema.Record(Schema.String, Schema.Unknown)), // Flexible insights
  documentation: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)), // Flexible documentation
  metadata: Schema.Struct({
    analyzedSpans: Schema.Union(Schema.Number, Schema.String), // Handle both number and string
    analysisTimeMs: Schema.Number,
    llmTokensUsed: Schema.Number,
    confidence: Schema.Number, // 0-1 score
    selectedModel: Schema.optional(Schema.String),
    llmModel: Schema.optional(Schema.String)
  })
})

// Type exports
export type AnalysisConfig = Schema.Schema.Type<typeof AnalysisConfigSchema>
export type AnalysisRequest = Schema.Schema.Type<typeof AnalysisRequestSchema>
export type ServiceTopology = Schema.Schema.Type<typeof ServiceTopologySchema>
export type ApplicationArchitecture = Schema.Schema.Type<typeof ApplicationArchitectureSchema>
export type AnalysisResult = Schema.Schema.Type<typeof AnalysisResultSchema>
export type HealthCheckResponse = Schema.Schema.Type<typeof HealthCheckResponseSchema>
export type TopologyResponse = Schema.Schema.Type<typeof TopologyResponseSchema>
export type AnalysisResponse = Schema.Schema.Type<typeof AnalysisResponseSchema>
export type ServiceNode = Schema.Schema.Type<typeof ServiceNodeSchema>
export type ServiceEdge = Schema.Schema.Type<typeof ServiceEdgeSchema>
export type TopologyVisualizationData = Schema.Schema.Type<typeof TopologyVisualizationDataSchema>

// Error ADT
export type AnalysisError =
  | { _tag: 'InsufficientData'; message: string; spanCount: number }
  | { _tag: 'QueryError'; message: string; query: string }
  | { _tag: 'LLMError'; message: string; model: string }
  | { _tag: 'ConfigurationError'; message: string }
  | { _tag: 'TimeoutError'; message: string; timeoutMs: number }

// Service Interface
export interface AIAnalyzerServiceImpl {
  readonly analyzeArchitecture: (request: AnalysisRequest) => Effect.Effect<AnalysisResult, AnalysisError, never>
  readonly streamAnalysis: (request: AnalysisRequest) => Stream.Stream<string, AnalysisError, never>
  readonly getServiceTopology: (timeRange: { startTime: Date; endTime: Date }) => Effect.Effect<readonly ServiceTopology[], AnalysisError, never>
  readonly generateDocumentation: (architecture: ApplicationArchitecture) => Effect.Effect<string, AnalysisError, never>
}

// Context tags
export class AIAnalyzerService extends Context.Tag('AIAnalyzerService')<AIAnalyzerService, AIAnalyzerServiceImpl>() {}