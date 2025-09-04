import { Effect, pipe } from 'effect'
import type { CriticalPath, GeneratedQuery } from './query-generator/types.js'
import { generateQueryWithLLM, ANALYSIS_GOALS } from './query-generator/llm-query-generator.js'

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
}

export interface QueryGenerationAPIResponse {
  sql: string
  model: string
  description: string
  expectedColumns?: Array<{
    name: string
    type: string
    description: string
  }>
  generationTimeMs?: number
}

/**
 * API client for UI Generator service
 * Provides HTTP endpoints for query generation from Critical Paths
 */
export class UIGeneratorAPIClient {
  /**
   * Generate a ClickHouse query from a Critical Path
   */
  static async generateQuery(
    request: QueryGenerationAPIRequest
  ): Promise<QueryGenerationAPIResponse> {
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

    // Run the Effect-based query generation
    const result = await Effect.runPromise(
      pipe(
        generateQueryWithLLM(
          criticalPath,
          analysisGoal,
          request.model ? { model: request.model } : undefined
        ),
        Effect.map((query: GeneratedQuery) => ({
          sql: query.sql,
          model: request.model || 'claude-3-5-sonnet-20241022',
          description: query.description,
          expectedColumns: Object.entries(query.expectedSchema || {}).map(([name, type]) => ({
            name,
            type,
            description: `Column: ${name}`
          })),
          generationTimeMs: Date.now() - startTime
        })),
        Effect.catchAll((error) =>
          Effect.succeed({
            sql: UIGeneratorAPIClient.generateFallbackQuery(criticalPath),
            model: 'fallback',
            description: `Fallback query generated due to error: ${error.message}`,
            expectedColumns: [],
            generationTimeMs: Date.now() - startTime
          })
        )
      )
    )

    return result
  }

  /**
   * Generate multiple queries for different analysis patterns
   */
  static async generateMultipleQueries(
    request: QueryGenerationAPIRequest & { patterns?: string[] }
  ): Promise<QueryGenerationAPIResponse[]> {
    const patterns = request.patterns || [
      ANALYSIS_GOALS.latency,
      ANALYSIS_GOALS.errors,
      ANALYSIS_GOALS.bottlenecks
    ]

    const results = await Promise.all(
      patterns.map((pattern) =>
        this.generateQuery({
          ...request,
          analysisGoal: pattern
        })
      )
    )

    return results
  }

  /**
   * Get available models for query generation
   */
  static getAvailableModels(): Array<{ name: string; provider: string; description: string }> {
    return [
      {
        name: 'claude-3-5-sonnet-20241022',
        provider: 'anthropic',
        description: 'Claude 3.5 Sonnet - Best for complex SQL generation'
      },
      {
        name: 'gpt-4o',
        provider: 'openai',
        description: 'GPT-4 Optimized - Good balance of speed and quality'
      },
      {
        name: 'sqlcoder-7b-2',
        provider: 'local',
        description: 'SQLCoder - Fast local SQL-specific model'
      }
    ]
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

// Export for convenience
export const generateQuery = UIGeneratorAPIClient.generateQuery.bind(UIGeneratorAPIClient)
export const generateMultipleQueries =
  UIGeneratorAPIClient.generateMultipleQueries.bind(UIGeneratorAPIClient)
export const getAvailableModels = UIGeneratorAPIClient.getAvailableModels.bind(UIGeneratorAPIClient)
export const validateQuery = UIGeneratorAPIClient.validateQuery.bind(UIGeneratorAPIClient)
