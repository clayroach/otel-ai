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
    startTime: Schema.Date,
    endTime: Schema.Date
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
  metadata: Schema.Record(Schema.String, Schema.Unknown)
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
  generatedAt: Schema.Date
})

export const AnalysisResultSchema = Schema.Struct({
  requestId: Schema.String,
  type: Schema.Literal('architecture', 'dataflow', 'dependencies', 'insights'),
  summary: Schema.String,
  architecture: Schema.optional(ApplicationArchitectureSchema),
  insights: Schema.Array(Schema.Struct({
    type: Schema.Literal('performance', 'reliability', 'architecture', 'optimization'),
    severity: Schema.Literal('info', 'warning', 'critical'),
    title: Schema.String,
    description: Schema.String,
    recommendation: Schema.optional(Schema.String),
    evidence: Schema.Array(Schema.Unknown) // Supporting data/spans
  })),
  documentation: Schema.optional(Schema.Struct({
    markdown: Schema.String,
    diagrams: Schema.optional(Schema.Array(Schema.Struct({
      type: Schema.Literal('architecture', 'sequence', 'dataflow'),
      description: Schema.String,
      mermaidCode: Schema.String
    })))
  })),
  metadata: Schema.Struct({
    analyzedSpans: Schema.Number,
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