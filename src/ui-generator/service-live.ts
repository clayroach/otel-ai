/**
 * UI Generator Service Live Implementation
 * Properly declares all dependencies and implements Effect-TS patterns
 */

import { Effect, Layer, pipe } from 'effect'
import { UIGeneratorService, UIGeneratorServiceTag, type ValidationResult } from './service.js'
import type { QueryGenerationAPIRequest, QueryGenerationAPIResponse } from './api-client.js'
import { LLMManagerServiceTag } from '../llm-manager/llm-manager-service.js'
import { StorageServiceTag } from '../storage/services.js'
import { ConfigServiceTag } from '../storage/services.js'
import { UIGeneratorErrors, type UIGeneratorError } from './errors.js'
import { type CriticalPath } from './schemas.js'
import {
  generateQueryWithLLM,
  generateAndOptimizeQuery,
  ANALYSIS_GOALS
} from './query-generator/llm-query-generator.js'

/**
 * Internal implementation of UI Generator Service
 * Not exported - use UIGeneratorServiceLive Layer instead
 */
const makeUIGeneratorService: Effect.Effect<
  UIGeneratorService,
  never,
  LLMManagerServiceTag | StorageServiceTag | ConfigServiceTag
> = Effect.gen(function* () {
  // Explicitly resolve all dependencies upfront
  const llmManager = yield* LLMManagerServiceTag
  const storage = yield* StorageServiceTag
  yield* ConfigServiceTag // Ensure config is available even if not directly used

  console.log('🔧 [UIGeneratorService] Initializing with resolved dependencies')

  return {
    generateQuery: (request: QueryGenerationAPIRequest) =>
      pipe(
        generateSingleQuery(request),
        Effect.provide(Layer.succeed(LLMManagerServiceTag, llmManager)),
        Effect.provide(Layer.succeed(StorageServiceTag, storage))
      ),

    generateMultipleQueries: (request: QueryGenerationAPIRequest & { patterns?: string[] }) =>
      pipe(
        generateMultipleQueriesImpl(request),
        Effect.provide(Layer.succeed(LLMManagerServiceTag, llmManager)),
        Effect.provide(Layer.succeed(StorageServiceTag, storage))
      ),

    validateQuery: (sql: string) => Effect.succeed(validateQueryImpl(sql))
  }
})

/**
 * Generate a single query with proper dependency usage
 */
const generateSingleQuery = (
  request: QueryGenerationAPIRequest
): Effect.Effect<
  QueryGenerationAPIResponse,
  UIGeneratorError,
  LLMManagerServiceTag | StorageServiceTag
> =>
  pipe(
    Effect.gen(function* () {
      const startTime = Date.now()

      // Convert API request to internal CriticalPath format
      const criticalPath: CriticalPath = {
        id: request.path.id,
        name: request.path.name,
        services: request.path.services,
        startService: request.path.startService,
        endService: request.path.endService,
        edges: request.path.services.slice(0, -1).map((service, i) => ({
          source: service,
          target: request.path.services[i + 1]!
        })),
        metrics: {
          requestCount: 10000,
          avgLatency: 150,
          errorRate: 0.01,
          p99Latency: 500
        },
        priority: 'high',
        severity: 0.75,
        lastUpdated: new Date()
      }

      // Use default analysis goal if not provided
      const analysisGoal = request.analysisGoal || ANALYSIS_GOALS.latency

      // Configure LLM settings
      const llmConfig = request.model
        ? {
            model: request.model,
            ...(request.isClickHouseAI !== undefined && { isClickHouseAI: request.isClickHouseAI })
          }
        : request.isClickHouseAI !== undefined
          ? { isClickHouseAI: request.isClickHouseAI }
          : undefined

      // Generate query using appropriate method
      console.log(
        `🔧 [EVALUATOR] Service-Live received useEvaluatorOptimizer: ${request.useEvaluatorOptimizer}`
      )
      console.log(`🔧 [EVALUATOR] Service-Live deciding query generation method`)

      const queryEffect = request.useEvaluatorOptimizer
        ? Effect.gen(function* () {
            console.log(
              '🔄 [EVALUATOR] Service-Live EVALUATOR PATH - calling generateAndOptimizeQuery'
            )
            console.log('🔄 [EVALUATOR] Service-Live parameters:', {
              path: criticalPath.name,
              analysisGoal,
              llmConfig,
              enableEvaluator: true
            })
            return yield* generateAndOptimizeQuery(
              criticalPath,
              analysisGoal,
              llmConfig,
              true // Enable evaluator
            )
          })
        : Effect.gen(function* () {
            console.log(
              '🔄 [EVALUATOR] Service-Live DIRECT PATH - calling generateQueryWithLLM (NO EVALUATOR)'
            )
            console.log('🔄 [EVALUATOR] Service-Live parameters:', {
              path: criticalPath.name,
              analysisGoal,
              llmConfig
            })
            return yield* generateQueryWithLLM(criticalPath, analysisGoal, llmConfig)
          })

      // Execute the query generation
      const generatedQuery = yield* queryEffect

      // Sanitize SQL for ClickHouse compatibility
      const sanitizedSql = sanitizeSQL(generatedQuery.sql)

      // Build response
      const response: QueryGenerationAPIResponse = {
        sql: sanitizedSql,
        model: request.model || 'default',
        actualModel: request.model || 'portkey-default',
        description: generatedQuery.description,
        expectedColumns: Object.entries(generatedQuery.expectedSchema || {}).map(
          ([name, type]) => ({
            name,
            type,
            description: `Column: ${name}`
          })
        ),
        generationTimeMs: Date.now() - startTime
      }

      // Return the response directly - no need for validation as we control the structure
      return response
    }),
    Effect.catchAll((error: unknown) => {
      console.error('❌ [UIGeneratorService] Query generation error:', error)

      // Handle specific error types
      if (error && typeof error === 'object' && '_tag' in error) {
        if (error._tag === 'ModelUnavailable') {
          return Effect.fail(
            UIGeneratorErrors.modelUnavailable(
              'Requested model is unavailable',
              request.model || 'unknown'
            )
          )
        }
      }

      // For other errors, generate fallback response
      const fallbackPath: CriticalPath = {
        ...request.path,
        edges: request.path.services.slice(0, -1).map((service, i) => ({
          source: service,
          target: request.path.services[i + 1]!
        })),
        metrics: { requestCount: 0, avgLatency: 0, errorRate: 0, p99Latency: 0 },
        priority: 'low',
        severity: 0,
        lastUpdated: new Date()
      }
      return Effect.succeed({
        sql: generateFallbackQuery(fallbackPath),
        model: 'fallback',
        actualModel: 'fallback',
        description: `Fallback query generated due to error: ${error instanceof Error ? error.message : String(error)}`,
        expectedColumns: getDefaultExpectedColumns(),
        generationTimeMs: 0
      })
    })
  )

/**
 * Generate multiple queries for different patterns
 */
const generateMultipleQueriesImpl = (
  request: QueryGenerationAPIRequest & { patterns?: string[] }
): Effect.Effect<
  QueryGenerationAPIResponse[],
  UIGeneratorError,
  LLMManagerServiceTag | StorageServiceTag
> => {
  const patterns = request.patterns || [
    ANALYSIS_GOALS.latency,
    ANALYSIS_GOALS.errors,
    ANALYSIS_GOALS.bottlenecks
  ]

  return Effect.all(
    patterns.map((pattern) => generateSingleQuery({ ...request, analysisGoal: pattern })),
    { concurrency: 3 }
  )
}

/**
 * Validate SQL query for safety and correctness
 */
const validateQueryImpl = (sql: string): ValidationResult => {
  const errors: string[] = []
  const warnings: string[] = []
  const upperSQL = sql.toUpperCase()

  // Check for required elements
  if (!upperSQL.includes('SELECT')) {
    errors.push('Query must contain SELECT statement')
  }
  if (!upperSQL.includes('FROM')) {
    errors.push('Query must specify FROM table')
  }

  // Check for dangerous operations
  const forbidden = ['DROP', 'DELETE', 'TRUNCATE', 'ALTER', 'CREATE', 'INSERT', 'UPDATE']
  for (const op of forbidden) {
    if (upperSQL.includes(op)) {
      errors.push(`Forbidden operation: ${op}`)
    }
  }

  // Check for potential performance issues
  if (!upperSQL.includes('LIMIT')) {
    warnings.push('Consider adding LIMIT clause for large result sets')
  }

  if (upperSQL.includes('SELECT *')) {
    warnings.push('Consider selecting specific columns instead of SELECT *')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * Sanitize SQL to be compatible with ClickHouse
 */
const sanitizeSQL = (sql: string): string => {
  // Preserve metadata comments at the beginning
  const lines = sql.split('\n')
  const metadataLines: string[] = []
  let sqlStartIndex = 0

  // Collect comment lines at the beginning
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line && line.startsWith('--')) {
      metadataLines.push(line)
      sqlStartIndex = i + 1
    } else if (line?.trim() === '') {
      sqlStartIndex = i + 1
    } else {
      break
    }
  }

  // Get actual SQL without metadata
  const sqlWithoutMetadata = lines.slice(sqlStartIndex).join('\n')

  // Remove trailing semicolons and trim
  let sanitized = sqlWithoutMetadata.replace(/;\s*$/, '').trim()

  // Fix table name - ensure we use otel.traces
  sanitized = sanitized.replace(/FROM\s+traces\b/gi, 'FROM otel.traces')

  // Re-add metadata comments if present
  const metadata = metadataLines.length > 0 ? metadataLines.join('\n') + '\n' : ''
  return metadata + sanitized
}

/**
 * Generate fallback query when LLM generation fails
 */
const generateFallbackQuery = (path: CriticalPath): string => {
  const services = path.services.map((s: string) => `'${s.replace(/'/g, "''")}'`).join(', ')

  return `-- Fallback query for path: ${path.name}
-- Services: ${path.services.join(' → ')}
SELECT
  service_name,
  toStartOfMinute(start_time) as minute,
  count() as request_count,
  quantile(0.5)(duration_ns/1000000) as p50_ms,
  quantile(0.95)(duration_ns/1000000) as p95_ms,
  quantile(0.99)(duration_ns/1000000) as p99_ms,
  sum(CASE WHEN status_code != 'OK' THEN 1 ELSE 0 END) as error_count,
  round(sum(CASE WHEN status_code != 'OK' THEN 1 ELSE 0 END) * 100.0 / count(), 2) as error_rate
FROM otel.traces
WHERE
  service_name IN (${services})
  AND start_time >= now() - INTERVAL 1 HOUR
GROUP BY service_name, minute
ORDER BY minute DESC, service_name
LIMIT 1000`
}

/**
 * Get default expected columns for fallback queries
 */
const getDefaultExpectedColumns = () => [
  { name: 'service_name', type: 'String', description: 'Name of the service' },
  { name: 'minute', type: 'DateTime', description: 'Minute-level timestamp' },
  { name: 'request_count', type: 'UInt64', description: 'Number of requests' },
  { name: 'p50_ms', type: 'Float64', description: '50th percentile latency in milliseconds' },
  { name: 'p95_ms', type: 'Float64', description: '95th percentile latency in milliseconds' },
  { name: 'p99_ms', type: 'Float64', description: '99th percentile latency in milliseconds' },
  { name: 'error_count', type: 'UInt64', description: 'Number of errors' },
  { name: 'error_rate', type: 'Float64', description: 'Error rate percentage' }
]

/**
 * UI Generator Service Layer
 * Properly declares all dependencies that the service requires
 */
export const UIGeneratorServiceLive = Layer.effect(UIGeneratorServiceTag, makeUIGeneratorService)
