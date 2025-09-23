/**
 * LLM Manager Types and Schemas
 * 
 * Core type definitions for multi-model LLM orchestration following Effect-TS patterns.
 * Supports GPT, Claude, and local models with intelligent routing and fallback strategies.
 */

import { Schema } from '@effect/schema'
import { Data } from 'effect'

// Configuration Schemas
export const LLMConfigSchema = Schema.Struct({
  models: Schema.Struct({
    gpt: Schema.optional(
      Schema.Struct({
        apiKey: Schema.String,
        model: Schema.String, // "gpt-4", "gpt-3.5-turbo"
        maxTokens: Schema.Number,
        temperature: Schema.Number,
        endpoint: Schema.optional(Schema.String)
      })
    ),
    claude: Schema.optional(
      Schema.Struct({
        apiKey: Schema.String,
        model: Schema.String, // "claude-3-opus", "claude-3-sonnet"
        maxTokens: Schema.Number,
        temperature: Schema.Number,
        endpoint: Schema.optional(Schema.String)
      })
    ),
    llama: Schema.optional(
      Schema.Struct({
        modelPath: Schema.String,
        contextLength: Schema.Number,
        threads: Schema.Number,
        gpuLayers: Schema.optional(Schema.Number),
        endpoint: Schema.optional(Schema.String) // For LM Studio or similar
      })
    )
  }),
  routing: Schema.Struct({
    strategy: Schema.Literal('cost', 'performance', 'balanced'),
    fallbackOrder: Schema.Array(Schema.Literal('gpt', 'claude', 'llama')),
    maxRetries: Schema.Number,
    timeoutMs: Schema.Number
  }),
  cache: Schema.Struct({
    enabled: Schema.Boolean,
    ttlSeconds: Schema.Number,
    maxSize: Schema.Number
  })
})

export const LLMRequestSchema = Schema.Struct({
  prompt: Schema.String,
  taskType: Schema.Literal('analysis', 'ui-generation', 'config-management', 'general', 'market-intelligence', 'architectural-insights', 'anomaly-detection'),
  context: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  preferences: Schema.optional(
    Schema.Struct({
      model: Schema.optional(Schema.String), // Accept any model name, not just generic types
      maxTokens: Schema.optional(Schema.Number),
      temperature: Schema.optional(Schema.Number),
      priority: Schema.optional(Schema.Literal('low', 'medium', 'high')),
      useMultiModel: Schema.optional(Schema.Boolean),
      requireStructuredOutput: Schema.optional(Schema.Boolean)
    })
  ),
  streaming: Schema.optional(Schema.Boolean)
})

export const LLMResponseSchema = Schema.Struct({
  content: Schema.String,
  model: Schema.String,
  usage: Schema.Struct({
    promptTokens: Schema.Number,
    completionTokens: Schema.Number,
    totalTokens: Schema.Number,
    cost: Schema.optional(Schema.Number)
  }),
  metadata: Schema.Struct({
    latencyMs: Schema.Number,
    retryCount: Schema.Number,
    cached: Schema.Boolean,
    confidence: Schema.optional(Schema.Number),
    modelChain: Schema.optional(Schema.Array(Schema.String)),
    routingStrategy: Schema.optional(Schema.String),
    fallbackUsed: Schema.optional(Schema.Boolean)
  })
})

export const ConversationContextSchema = Schema.Struct({
  id: Schema.String,
  messages: Schema.Array(
    Schema.Struct({
      role: Schema.Literal('user', 'assistant', 'system'),
      content: Schema.String,
      timestamp: Schema.Number
    })
  ),
  metadata: Schema.Record(Schema.String, Schema.Unknown),
  createdAt: Schema.Number,
  updatedAt: Schema.Number
})

export const ModelHealthStatusSchema = Schema.Struct({
  model: Schema.String,
  status: Schema.Literal('healthy', 'degraded', 'unavailable'),
  latencyMs: Schema.optional(Schema.Number),
  errorRate: Schema.optional(Schema.Number),
  lastChecked: Schema.Number
})

// Type exports
export type LLMConfig = Schema.Schema.Type<typeof LLMConfigSchema>
export type LLMRequest = Schema.Schema.Type<typeof LLMRequestSchema>
export type LLMResponse = Schema.Schema.Type<typeof LLMResponseSchema>
export type ConversationContext = Schema.Schema.Type<typeof ConversationContextSchema>
export type ModelHealthStatus = Schema.Schema.Type<typeof ModelHealthStatusSchema>

// LLM Error ADT using Effect-TS Data.TaggedEnum pattern
export class ModelUnavailable extends Data.TaggedError('ModelUnavailable')<{
  model: string
  message: string
}> {}

export class RateLimitExceeded extends Data.TaggedError('RateLimitExceeded')<{
  model: string
  retryAfter: number
  message: string
}> {}

export class InvalidRequest extends Data.TaggedError('InvalidRequest')<{
  message: string
  request: LLMRequest
}> {}

export class AuthenticationFailed extends Data.TaggedError('AuthenticationFailed')<{
  model: string
  message: string
}> {}

export class TimeoutError extends Data.TaggedError('TimeoutError')<{
  model: string
  timeoutMs: number
}> {}

export class ContextTooLarge extends Data.TaggedError('ContextTooLarge')<{
  model: string
  tokenCount: number
  maxTokens: number
}> {}

export class ConfigurationError extends Data.TaggedError('ConfigurationError')<{
  message: string
}> {}

export class NetworkError extends Data.TaggedError('NetworkError')<{
  model: string
  message: string
}> {}

export class AllModelsUnavailable extends Data.TaggedError('AllModelsUnavailable')<{
  message: string
}> {}

export type LLMError =
  | ModelUnavailable
  | RateLimitExceeded
  | InvalidRequest
  | AuthenticationFailed
  | TimeoutError
  | ContextTooLarge
  | ConfigurationError
  | NetworkError
  | AllModelsUnavailable

// Model type definitions
export type ModelType = string // Accept any model name, not just hardcoded generic types
export type TaskType = 'analysis' | 'ui-generation' | 'config-management' | 'general' | 'market-intelligence' | 'architectural-insights' | 'anomaly-detection'
export type RoutingStrategy = 'cost' | 'performance' | 'balanced'

// Utility types for model clients
export interface ModelClient {
  readonly generate: (request: LLMRequest) => Effect.Effect<LLMResponse, LLMError, never>
  readonly generateStream?: (request: LLMRequest) => Stream.Stream<string, LLMError, never>
  readonly isHealthy: () => Effect.Effect<boolean, LLMError, never>
}

// Import Effect types at the end to avoid circular dependencies
import { Effect, Stream } from 'effect'