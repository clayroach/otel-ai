import { Effect, pipe } from 'effect'
import type { CriticalPath } from './query-generator/types.js'
import {
  generateQueryWithLLM,
  generateAndOptimizeQuery,
  ANALYSIS_GOALS
} from './query-generator/llm-query-generator.js'
import type { SQLEvaluationResult } from './query-generator/sql-evaluator-optimizer.js'

export interface QueryGenerationAPIRequest {
  path: {
    id: string
    name: string
    services: string[]
    startService: string
    endService: string
  }
  analysisGoal?: string
  model?: string
  isClickHouseAI?: boolean
  useEvaluatorOptimizer?: boolean // Enable evaluator-optimizer for SQL validation
}

export interface QueryGenerationAPIResponse {
  sql: string
  model: string
  actualModel?: string
  description: string
  expectedColumns?: Array<{
    name: string
    type: string
    description: string
  }>
  generationTimeMs?: number
  evaluations?: SQLEvaluationResult[] // Include evaluation history if evaluator was used
}

/**
 * API client for UI Generator service
 * Provides HTTP endpoints for query generation from Critical Paths
 */
export class UIGeneratorAPIClient {
  // Declare backward compatibility aliases as static members
  static generateQuery: typeof UIGeneratorAPIClient.generateQueryEffect
  static generateMultipleQueries: typeof UIGeneratorAPIClient.generateMultipleQueriesEffect
  /**
   * Generate a ClickHouse query from a Critical Path
   * Returns an Effect that needs LLM and optionally Storage services
   */
  static generateQueryEffect(request: QueryGenerationAPIRequest) {
    const startTime = Date.now()

    // Convert API request to internal CriticalPath format
    const criticalPath: CriticalPath = {
      id: request.path.id,
      name: request.path.name,
      services: request.path.services,
      startService: request.path.startService,
      endService: request.path.endService
    }

    // Use default analysis goal if not provided
    const analysisGoal = request.analysisGoal || ANALYSIS_GOALS.latency

    // Model will be determined by Portkey config defaults if not specified
    const targetModel = request.model
    const isClickHouseAI = request.isClickHouseAI

    // Determine the config object once
    const llmConfig = targetModel
      ? { model: targetModel, ...(isClickHouseAI !== undefined && { isClickHouseAI }) }
      : isClickHouseAI !== undefined
        ? { isClickHouseAI }
        : undefined

    // Generate the Effect based on evaluator usage
    console.log(
      `🔧 [EVALUATOR] API Client received useEvaluatorOptimizer: ${request.useEvaluatorOptimizer}`
    )
    console.log(
      `🔧 [EVALUATOR] API Client deciding code path - evaluator enabled: ${!!request.useEvaluatorOptimizer}`
    )

    const queryEffect = request.useEvaluatorOptimizer
      ? Effect.gen(function* () {
          console.log(
            '🔄 [EVALUATOR] API Client taking EVALUATOR PATH - calling generateAndOptimizeQuery'
          )
          console.log('🔄 [EVALUATOR] API Client parameters:', {
            criticalPath: criticalPath.name,
            analysisGoal,
            llmConfig,
            enableEvaluator: true
          })
          // Use the evaluator-optimizer version with StorageService
          return yield* generateAndOptimizeQuery(
            criticalPath,
            analysisGoal,
            llmConfig,
            true // Enable evaluator
          )
        })
      : Effect.gen(function* () {
          console.log(
            '🔄 [EVALUATOR] API Client taking DIRECT PATH - calling generateQueryWithLLM (NO EVALUATOR)'
          )
          console.log('🔄 [EVALUATOR] API Client parameters:', {
            criticalPath: criticalPath.name,
            analysisGoal,
            llmConfig
          })
          return yield* generateQueryWithLLM(criticalPath, analysisGoal, llmConfig)
        })

    // Return the Effect for external execution with proper layers
    return pipe(
      queryEffect,
      Effect.map((query) => ({
        sql: UIGeneratorAPIClient.sanitizeSQL(query.sql), // Remove semicolons for ClickHouse compatibility
        model: targetModel || 'default', // The model that was requested
        actualModel: targetModel || 'portkey-default', // Track actual model used
        description: query.description,
        expectedColumns: Object.entries(query.expectedSchema || {}).map(([name, type]) => ({
          name,
          type,
          description: `Column: ${name}`
        })),
        generationTimeMs: Date.now() - startTime,
        evaluations: 'evaluations' in query ? query.evaluations : undefined // Include evaluation history if present
      })),
      Effect.catchAll((error: unknown) => {
        console.error('❌ Query generation error:', error)

        // Check if this is a ModelUnavailable error
        const isModelUnavailable =
          (typeof error === 'object' &&
            error !== null &&
            '_tag' in error &&
            error._tag === 'ModelUnavailable') ||
          (error instanceof Error && error.message.includes('ModelUnavailable'))

        if (isModelUnavailable) {
          // Re-throw model unavailability errors - don't fall back to SQL generation
          return Effect.fail(error)
        }

        // For other errors (network issues, parsing errors, etc.), generate a fallback query
        const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
        return Effect.succeed({
          sql: UIGeneratorAPIClient.generateFallbackQuery(criticalPath),
          model: 'fallback',
          description: `Fallback query generated due to error: ${errorMessage}`,
          expectedColumns: UIGeneratorAPIClient.getExpectedColumns(),
          generationTimeMs: Date.now() - startTime
        })
      })
    )
  }

  /**
   * Generate multiple queries for different analysis patterns
   * Returns an Effect array that needs proper layers
   */
  static generateMultipleQueriesEffect(
    request: QueryGenerationAPIRequest & { patterns?: string[] }
  ) {
    const patterns = request.patterns || [
      ANALYSIS_GOALS.latency,
      ANALYSIS_GOALS.errors,
      ANALYSIS_GOALS.bottlenecks
    ]

    return Effect.all(
      patterns.map((pattern) =>
        UIGeneratorAPIClient.generateQueryEffect({
          ...request,
          analysisGoal: pattern
        })
      ),
      { concurrency: 3 }
    )
  }

  /**
   * Validate a SQL query for safety and correctness
   */
  static validateQuery(sql: string): { valid: boolean; errors: string[] } {
    const errors: string[] = []
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

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * Get expected columns for rule-based queries
   */
  private static getExpectedColumns(): Array<{ name: string; type: string; description: string }> {
    return [
      {
        name: 'service_name',
        type: 'String',
        description: 'Name of the service in the critical path'
      },
      {
        name: 'minute',
        type: 'DateTime',
        description: 'Minute-level timestamp for metrics aggregation'
      },
      { name: 'request_count', type: 'UInt64', description: 'Number of requests processed' },
      { name: 'p50_ms', type: 'Float64', description: '50th percentile latency in milliseconds' },
      { name: 'p95_ms', type: 'Float64', description: '95th percentile latency in milliseconds' },
      { name: 'p99_ms', type: 'Float64', description: '99th percentile latency in milliseconds' },
      { name: 'error_count', type: 'UInt64', description: 'Number of errors encountered' },
      {
        name: 'error_rate',
        type: 'Float64',
        description: 'Percentage of requests resulting in errors'
      }
    ]
  }

  /**
   * Sanitize SQL to be compatible with ClickHouse JSON format
   */
  private static sanitizeSQL(sql: string): string {
    // Preserve all metadata comments at the beginning
    const lines = sql.split('\n')
    const metadataLines: string[] = []
    let sqlStartIndex = 0

    // Collect all comment lines at the beginning
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line && line.startsWith('--')) {
        metadataLines.push(line)
        sqlStartIndex = i + 1
      } else if (line?.trim() === '') {
        // Skip empty lines between comments
        sqlStartIndex = i + 1
      } else {
        // Found first non-comment line
        break
      }
    }

    // Get the actual SQL without metadata
    const sqlWithoutMetadata = lines.slice(sqlStartIndex).join('\n')

    // Remove trailing semicolons that cause ClickHouse multi-statement errors
    let sanitized = sqlWithoutMetadata.replace(/;\s*$/, '').trim()

    // Fix table name - ensure we use otel.traces instead of just traces
    sanitized = sanitized.replace(/FROM\s+traces\b/gi, 'FROM otel.traces')

    // Re-add metadata comments if present
    const metadata = metadataLines.length > 0 ? metadataLines.join('\n') + '\n' : ''
    return metadata + sanitized
  }

  /**
   * Generate a fallback query when LLM generation fails
   */
  private static generateFallbackQuery(path: CriticalPath): string {
    const services = path.services.map((s) => `'${s.replace(/'/g, "''")}'`).join(', ')

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
}

// Add backward compatibility aliases for tests
UIGeneratorAPIClient.generateQuery = UIGeneratorAPIClient.generateQueryEffect
UIGeneratorAPIClient.generateMultipleQueries = UIGeneratorAPIClient.generateMultipleQueriesEffect

// Export for convenience
export const generateQuery = UIGeneratorAPIClient.generateQueryEffect
export const generateMultipleQueries = UIGeneratorAPIClient.generateMultipleQueriesEffect
export const validateQuery = UIGeneratorAPIClient.validateQuery
