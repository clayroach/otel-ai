/**
 * AI Analyzer API Client with Effect-TS Error Channels
 *
 * Production-ready API client for AI analyzer service with proper
 * type safety, error handling, and Schema validation.
 */

import { Effect, Layer, Context } from 'effect'
import { Schema } from '@effect/schema'
import { APIClientService, type APIClientError } from '../shared/api-client.js'

// Enhanced schemas with all missing properties
const ServiceMetadataSchema = Schema.Struct({
  avgLatencyMs: Schema.optional(Schema.Number),
  p95LatencyMs: Schema.optional(Schema.Number), // Added missing property
  errorRate: Schema.optional(Schema.Number),
  totalSpans: Schema.Union(Schema.String, Schema.Number),
  throughput: Schema.optional(Schema.Number),
  rootSpans: Schema.optional(Schema.Number), // Added missing property
  dependencies: Schema.optional(Schema.Number)
})

const ServiceTopologySchema = Schema.Struct({
  service: Schema.String,
  type: Schema.Union(
    Schema.Literal('frontend'),
    Schema.Literal('api'),
    Schema.Literal('backend'),
    Schema.Literal('database'),
    Schema.Literal('queue'),
    Schema.Literal('cache'),
    Schema.Literal('external')
  ),
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
  metadata: ServiceMetadataSchema
})

const AnalysisRequestSchema = Schema.Struct({
  type: Schema.Union(
    Schema.Literal('architecture'),
    Schema.Literal('performance'),
    Schema.Literal('reliability')
  ),
  timeRange: Schema.Struct({
    startTime: Schema.String,
    endTime: Schema.String
  }),
  filters: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  config: Schema.optional(
    Schema.Struct({
      llm: Schema.optional(
        Schema.Struct({
          model: Schema.Union(
            Schema.Literal('claude'),
            Schema.Literal('gpt'),
            Schema.Literal('llama')
          ),
          temperature: Schema.Number,
          maxTokens: Schema.Number
        })
      ),
      analysis: Schema.optional(
        Schema.Struct({
          timeWindowHours: Schema.Number,
          minSpanCount: Schema.Number
        })
      ),
      output: Schema.optional(
        Schema.Struct({
          format: Schema.Union(Schema.Literal('markdown'), Schema.Literal('json')),
          includeDigrams: Schema.Boolean,
          detailLevel: Schema.Union(
            Schema.Literal('summary'),
            Schema.Literal('detailed'),
            Schema.Literal('comprehensive')
          )
        })
      )
    })
  )
})

const AnalysisResponseSchema = Schema.Struct({
  requestId: Schema.String,
  type: Schema.String,
  summary: Schema.String,
  architecture: Schema.Struct({
    applicationName: Schema.String,
    description: Schema.String,
    services: Schema.Array(ServiceTopologySchema),
    dataFlows: Schema.Array(Schema.Unknown),
    criticalPaths: Schema.Array(Schema.Unknown),
    generatedAt: Schema.String
  }),
  insights: Schema.Array(
    Schema.Struct({
      type: Schema.String,
      severity: Schema.String,
      title: Schema.String,
      description: Schema.String,
      recommendation: Schema.String,
      evidence: Schema.Unknown,
      modelAnalysis: Schema.optional(Schema.Unknown)
    })
  ),
  metadata: Schema.Struct({
    analyzedSpans: Schema.Union(Schema.String, Schema.Number),
    analysisTimeMs: Schema.Number,
    llmTokensUsed: Schema.Number,
    llmModel: Schema.String,
    selectedModel: Schema.String,
    confidence: Schema.Number
  })
})

const TopologyResponseSchema = Schema.Array(ServiceTopologySchema)

// AI Analyzer specific client interface
export interface AIAnalyzerClient {
  readonly analyze: (
    request: typeof AnalysisRequestSchema.Type
  ) => Effect.Effect<typeof AnalysisResponseSchema.Type, APIClientError, never>

  readonly getTopology: (timeRange: {
    startTime: string
    endTime: string
  }) => Effect.Effect<typeof TopologyResponseSchema.Type, APIClientError, never>

  readonly health: () => Effect.Effect<{ status: string; message: string }, APIClientError, never>
}

// Helper functions for safe property access
export const parseSpanCount = (spanCount: string | number): number => {
  if (typeof spanCount === 'number') return spanCount
  const parsed = parseInt(spanCount, 10)
  return isNaN(parsed) ? 0 : parsed
}

export const getServiceName = (service: { service?: string }): string => {
  return service.service || 'unknown-service'
}

// Implementation using the shared API client with proper Effect-TS typing
export const createAIAnalyzerClient = (
  baseUrl: string
): Effect.Effect<AIAnalyzerClient, never, APIClientService> =>
  Effect.map(APIClientService, (apiClient) => ({
    analyze: (request) => apiClient.post(`${baseUrl}/analyze`, request, AnalysisResponseSchema),

    getTopology: (timeRange) =>
      apiClient.post(`${baseUrl}/topology`, { timeRange }, TopologyResponseSchema),

    health: () =>
      apiClient.get(
        `${baseUrl}/health`,
        Schema.Struct({
          status: Schema.String,
          message: Schema.String
        })
      )
  }))

// Import the API client layer
import { APIClientLayer } from '../shared/api-client.js'

// Convenience layer for testing and service usage
export const AIAnalyzerClientLive = (baseUrl: string = 'http://localhost:4319/api/ai-analyzer') =>
  Layer.effect(
    Context.GenericTag<AIAnalyzerClient>('AIAnalyzerClient'),
    createAIAnalyzerClient(baseUrl)
  ).pipe(Layer.provide(APIClientLayer))

// Export schemas for use in tests and other services
export {
  ServiceMetadataSchema,
  ServiceTopologySchema,
  AnalysisRequestSchema,
  AnalysisResponseSchema,
  TopologyResponseSchema
}
