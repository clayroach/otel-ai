/**
 * AI Insights Package Types
 * Core type definitions for LLM-powered analysis services
 */

import { Schema } from '@effect/schema'
import { Data } from 'effect'

// Re-export CriticalPath types from ui-generator
export type { CriticalPath } from '../../ui-generator/query-generator/types.js'
export { CriticalPathSchema } from '../../ui-generator/query-generator/types.js'

/**
 * Service metrics data for critical path analysis
 *
 * Note: This is different from topology-analyzer's ServiceTopology.
 * This is a simplified metrics-focused view used for path discovery.
 */
export const ServiceMetricsSchema = Schema.Struct({
  serviceName: Schema.String,
  callCount: Schema.Number,
  errorRate: Schema.Number,
  avgLatency: Schema.Number,
  p99Latency: Schema.Number,
  dependencies: Schema.Array(
    Schema.Struct({
      targetService: Schema.String,
      callCount: Schema.Number,
      errorRate: Schema.Number,
      avgLatency: Schema.Number
    })
  )
})
export type ServiceMetrics = Schema.Schema.Type<typeof ServiceMetricsSchema>

/**
 * Errors
 */
export class CriticalPathDiscoveryError extends Data.TaggedError('CriticalPathDiscoveryError')<{
  readonly message: string
  readonly cause?: unknown
}> {}

export class RootCauseAnalysisError extends Data.TaggedError('RootCauseAnalysisError')<{
  readonly message: string
  readonly cause?: unknown
}> {}
