import { Schema } from '@effect/schema'
import { Effect } from 'effect'

// Critical Path types
export const CriticalPathSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  services: Schema.Array(Schema.String),
  startService: Schema.String,
  endService: Schema.String,
  edges: Schema.Array(
    Schema.Struct({
      source: Schema.String,
      target: Schema.String
    })
  ),
  metrics: Schema.Struct({
    requestCount: Schema.Number,
    avgLatency: Schema.Number,
    errorRate: Schema.Number,
    p99Latency: Schema.Number
  }),
  priority: Schema.Literal('critical', 'high', 'medium', 'low'),
  severity: Schema.Number.pipe(Schema.between(0, 1)), // 0-1 score
  lastUpdated: Schema.DateFromString,
  metadata: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown }))
})
export type CriticalPath = Schema.Schema.Type<typeof CriticalPathSchema>

// Query patterns
export enum QueryPattern {
  SERVICE_LATENCY = 'service_latency',
  ERROR_DISTRIBUTION = 'error_distribution',
  BOTTLENECK_DETECTION = 'bottleneck_detection',
  VOLUME_THROUGHPUT = 'volume_throughput',
  TIME_COMPARISON = 'time_comparison'
}

// Generated query with thunk for lazy evaluation
export const GeneratedQuerySchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  pattern: Schema.Enums(QueryPattern),
  sql: Schema.String,
  expectedSchema: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String }))
})
export type GeneratedQuery = Schema.Schema.Type<typeof GeneratedQuerySchema>

// Query result
export const QueryResultSchema = Schema.Struct({
  queryId: Schema.String,
  data: Schema.Array(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  executionTimeMs: Schema.Number,
  rowCount: Schema.Number,
  error: Schema.optional(Schema.String)
})
export type QueryResult = Schema.Schema.Type<typeof QueryResultSchema>

// Query thunk type for lazy evaluation
export type QueryThunk = () => Effect.Effect<QueryResult, Error, never>

// Extended generated query with thunk
export interface GeneratedQueryWithThunk extends GeneratedQuery {
  executeThunk: QueryThunk
}

// Service interface
export interface CriticalPathQueryGenerator {
  readonly generateQueries: (
    path: CriticalPath
  ) => Effect.Effect<GeneratedQueryWithThunk[], Error, never>
  readonly generateQueryThunk: (
    path: CriticalPath,
    pattern: QueryPattern
  ) => Effect.Effect<QueryThunk, Error, never>
}

// Query configuration
export const QueryConfigSchema = Schema.Struct({
  timeRangeMinutes: Schema.optionalWith(Schema.Number, { default: () => 60 }),
  limit: Schema.optionalWith(Schema.Number, { default: () => 1000 }),
  aggregationInterval: Schema.optionalWith(Schema.String, { default: () => '1 minute' })
})
export type QueryConfig = Schema.Schema.Type<typeof QueryConfigSchema>
