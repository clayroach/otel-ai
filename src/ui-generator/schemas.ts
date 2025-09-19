/**
 * UI Generator Schema Definitions
 * Runtime validation with Effect Schema for type safety at service boundaries
 */

import { Schema } from '@effect/schema'

/**
 * Critical Path Schema - represents a user journey through services
 */
export const CriticalPathSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  services: Schema.Array(Schema.String),
  startService: Schema.String,
  endService: Schema.String
})

/**
 * Query Generation API Request Schema
 */
export const QueryGenerationAPIRequestSchema = Schema.Struct({
  path: CriticalPathSchema,
  analysisGoal: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
  isClickHouseAI: Schema.optional(Schema.Boolean),
  useEvaluatorOptimizer: Schema.optional(Schema.Boolean)
})

/**
 * Expected Column Schema for query results
 */
export const ExpectedColumnSchema = Schema.Struct({
  name: Schema.String,
  type: Schema.String,
  description: Schema.String
})

/**
 * Query Generation API Response Schema
 */
export const QueryGenerationAPIResponseSchema = Schema.Struct({
  sql: Schema.String,
  model: Schema.String,
  actualModel: Schema.optional(Schema.String),
  description: Schema.String,
  expectedColumns: Schema.optional(Schema.Array(ExpectedColumnSchema)),
  generationTimeMs: Schema.optional(Schema.Number)
})

/**
 * Multiple Query Generation Request Schema
 */
export const MultipleQueryGenerationRequestSchema = Schema.extend(
  QueryGenerationAPIRequestSchema,
  Schema.Struct({
    patterns: Schema.optional(Schema.Array(Schema.String))
  })
)

/**
 * Query Validation Result Schema
 */
export const ValidationResultSchema = Schema.Struct({
  valid: Schema.Boolean,
  errors: Schema.Array(Schema.String),
  warnings: Schema.optional(Schema.Array(Schema.String))
})

/**
 * LLM Configuration Schema
 */
export const LLMConfigSchema = Schema.optional(
  Schema.Struct({
    model: Schema.optional(Schema.String),
    isClickHouseAI: Schema.optional(Schema.Boolean),
    temperature: Schema.optional(Schema.Number),
    maxTokens: Schema.optional(Schema.Number)
  })
)

/**
 * Analysis Goals Schema - predefined query patterns
 */
export const AnalysisGoalSchema = Schema.Literal(
  'latency',
  'errors',
  'bottlenecks',
  'throughput',
  'dependencies',
  'performance'
)

/**
 * Service Configuration Schema
 */
export const ServiceConfigSchema = Schema.Struct({
  enableFallback: Schema.optional(Schema.Boolean),
  defaultTimeout: Schema.optional(Schema.Number),
  maxRetries: Schema.optional(Schema.Number)
})

// Export derived types for TypeScript usage
export type CriticalPath = Schema.Schema.Type<typeof CriticalPathSchema>
export type QueryGenerationAPIRequest = Schema.Schema.Type<typeof QueryGenerationAPIRequestSchema>
export type QueryGenerationAPIResponse = Schema.Schema.Type<typeof QueryGenerationAPIResponseSchema>
export type MultipleQueryGenerationRequest = Schema.Schema.Type<
  typeof MultipleQueryGenerationRequestSchema
>
export type ValidationResult = Schema.Schema.Type<typeof ValidationResultSchema>
export type ExpectedColumn = Schema.Schema.Type<typeof ExpectedColumnSchema>
export type LLMConfig = Schema.Schema.Type<typeof LLMConfigSchema>
export type AnalysisGoal = Schema.Schema.Type<typeof AnalysisGoalSchema>
export type ServiceConfig = Schema.Schema.Type<typeof ServiceConfigSchema>

/**
 * Schema validation helpers
 */
export const validateRequest = Schema.decodeUnknown(QueryGenerationAPIRequestSchema)
export const validateResponse = Schema.decodeUnknown(QueryGenerationAPIResponseSchema)
export const validateMultipleRequest = Schema.decodeUnknown(MultipleQueryGenerationRequestSchema)
export const validateValidationResult = Schema.decodeUnknown(ValidationResultSchema)
