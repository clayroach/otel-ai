import { Schema } from '@effect/schema'
import { Context, Effect, Layer } from 'effect'
import {
  DynamicComponentGeneratorServiceTag,
  type DynamicComponent
} from './dynamic-component-generator.js'
import { ResultAnalysisServiceTag } from './result-analysis-service.js'

/**
 * UI Generation Pipeline Service - Phase 3D
 *
 * Complete end-to-end pipeline from natural language to React components.
 * Integrates query generation, execution, analysis, and component generation.
 */

// ========================
// Schema Definitions
// ========================

const PipelineRequestSchema = Schema.Struct({
  naturalLanguageQuery: Schema.String,
  context: Schema.optional(
    Schema.Struct({
      criticalPath: Schema.optional(Schema.String),
      timeRange: Schema.optional(Schema.String),
      services: Schema.optional(Schema.Array(Schema.String))
    })
  ),
  options: Schema.optional(
    Schema.Struct({
      preferredModel: Schema.optional(Schema.String),
      maxRetries: Schema.optional(Schema.Number),
      timeout: Schema.optional(Schema.Number)
    })
  )
})
type PipelineRequest = Schema.Schema.Type<typeof PipelineRequestSchema>

const PipelineResponseSchema = Schema.Struct({
  query: Schema.Struct({
    sql: Schema.String,
    model: Schema.String,
    generationTime: Schema.Number,
    explanation: Schema.optional(Schema.String)
  }),
  results: Schema.Struct({
    data: Schema.Array(Schema.Unknown),
    rowCount: Schema.Number,
    executionTime: Schema.Number
  }),
  component: Schema.Unknown, // DynamicComponent
  metadata: Schema.Struct({
    totalTime: Schema.Number,
    steps: Schema.Array(
      Schema.Struct({
        name: Schema.String,
        duration: Schema.Number,
        status: Schema.Literal('success', 'error', 'skipped')
      })
    )
  })
})
type PipelineResponse = Schema.Schema.Type<typeof PipelineResponseSchema>

// ========================
// Service Definition
// ========================

export interface UIGenerationPipelineService {
  generateUI: (request: PipelineRequest) => Effect.Effect<PipelineResponse, Error, never>
  generateDiagnosticUI: (
    criticalPath: string,
    issueType: 'latency' | 'errors' | 'throughput'
  ) => Effect.Effect<PipelineResponse, Error, never>
}

export const UIGenerationPipelineServiceTag = Context.GenericTag<UIGenerationPipelineService>(
  'UIGenerationPipelineService'
)

// ========================
// Service Implementation
// ========================

export const UIGenerationPipelineServiceLive = Layer.effect(
  UIGenerationPipelineServiceTag,
  Effect.gen(function* () {
    // Get dependency services provided by the layer
    const resultAnalysisService = yield* ResultAnalysisServiceTag
    const componentGeneratorService = yield* DynamicComponentGeneratorServiceTag

    return UIGenerationPipelineServiceTag.of({
      generateUI: (request: PipelineRequest) =>
        Effect.gen(function* () {
          const startTime = Date.now()
          const steps: Array<{
            name: string
            duration: number
            status: 'success' | 'error' | 'skipped'
          }> = []

          try {
            // Step 1: Generate SQL query from natural language (mocked for now)
            const queryStartTime = Date.now()
            const queryResult = yield* Effect.succeed({
              sql: generateMockSQL(request.naturalLanguageQuery),
              description: `Generated query for: ${request.naturalLanguageQuery}`,
              expectedColumns: [
                { name: 'time_bucket', type: 'DateTime', description: 'Time aggregation bucket' },
                { name: 'service_name', type: 'String', description: 'Service identifier' },
                { name: 'metric_value', type: 'Float64', description: 'Computed metric' }
              ],
              reasoning: 'Mock query for UI generation pipeline development'
            })
            steps.push({
              name: 'query-generation',
              duration: Date.now() - queryStartTime,
              status: 'success'
            })

            // Step 2: Execute query (mock for now - would connect to ClickHouse)
            const execStartTime = Date.now()
            const queryResults = yield* mockExecuteQuery(queryResult.sql)
            steps.push({
              name: 'query-execution',
              duration: Date.now() - execStartTime,
              status: 'success'
            })

            // Step 3: Analyze results
            const analysisStartTime = Date.now()
            yield* resultAnalysisService.analyzeResults(queryResults.data)
            steps.push({
              name: 'result-analysis',
              duration: Date.now() - analysisStartTime,
              status: 'success'
            })

            // Step 4: Generate component
            const componentStartTime = Date.now()
            const component = yield* componentGeneratorService.generateComponent({
              queryResults: queryResults.data,
              userIntent: request.naturalLanguageQuery
            })
            steps.push({
              name: 'component-generation',
              duration: Date.now() - componentStartTime,
              status: 'success'
            })

            return {
              query: {
                sql: queryResult.sql,
                model: request.options?.preferredModel || 'unknown',
                generationTime: steps[0]?.duration || 0,
                explanation: queryResult.description
              },
              results: queryResults,
              component,
              metadata: {
                totalTime: Date.now() - startTime,
                steps
              }
            }
          } catch (error) {
            // Add error step
            steps.push({
              name: 'error',
              duration: 0,
              status: 'error'
            })

            throw error
          }
        }),

      generateDiagnosticUI: (
        criticalPath: string,
        issueType: 'latency' | 'errors' | 'throughput'
      ): Effect.Effect<PipelineResponse, Error, never> =>
        Effect.gen(function* () {
          // Generate diagnostic query based on issue type
          const diagnosticQuery = generateDiagnosticQuery(criticalPath, issueType)

          // Use the UI generation logic directly (avoid circular service dependency)
          const startTime = Date.now()
          const steps: Array<{
            name: string
            duration: number
            status: 'success' | 'error' | 'skipped'
          }> = []

          // Mock query generation for diagnostic
          const queryStartTime = Date.now()
          const queryResult = {
            sql: generateMockSQL(diagnosticQuery.prompt),
            description: `Diagnostic analysis for ${issueType} in ${criticalPath}`,
            expectedColumns: [
              { name: 'time_bucket', type: 'DateTime', description: 'Time aggregation bucket' },
              { name: 'service_name', type: 'String', description: 'Service identifier' },
              { name: 'metric_value', type: 'Float64', description: 'Computed diagnostic metric' }
            ],
            reasoning: `Mock diagnostic query for ${issueType} analysis`
          }
          steps.push({
            name: 'diagnostic-query-generation',
            duration: Date.now() - queryStartTime,
            status: 'success'
          })

          // Execute mock query
          const execStartTime = Date.now()
          const queryResults = yield* mockExecuteQuery(queryResult.sql)
          steps.push({
            name: 'diagnostic-query-execution',
            duration: Date.now() - execStartTime,
            status: 'success'
          })

          // Analyze results
          const analysisStartTime = Date.now()
          yield* resultAnalysisService.analyzeResults(queryResults.data)
          steps.push({
            name: 'diagnostic-result-analysis',
            duration: Date.now() - analysisStartTime,
            status: 'success'
          })

          // Generate component
          const componentStartTime = Date.now()
          const component = yield* componentGeneratorService.generateComponent({
            queryResults: queryResults.data,
            userIntent: diagnosticQuery.prompt
          })
          steps.push({
            name: 'diagnostic-component-generation',
            duration: Date.now() - componentStartTime,
            status: 'success'
          })

          return {
            query: {
              sql: queryResult.sql,
              model: 'diagnostic-mock',
              generationTime: steps[0]?.duration || 0,
              explanation: queryResult.description
            },
            results: queryResults,
            component,
            metadata: {
              totalTime: Date.now() - startTime,
              steps
            }
          }
        })
    })
  })
)

// ========================
// Helper Functions
// ========================

/**
 * Generate mock SQL based on natural language query
 */
function generateMockSQL(naturalQuery: string): string {
  const lowerQuery = naturalQuery.toLowerCase()

  if (lowerQuery.includes('latency') || lowerQuery.includes('performance')) {
    return `
      SELECT 
        toStartOfMinute(timestamp) AS time_bucket,
        service_name,
        quantile(0.5)(duration_ms) AS p50_ms,
        quantile(0.95)(duration_ms) AS p95_ms,
        quantile(0.99)(duration_ms) AS p99_ms,
        count() AS request_count
      FROM traces
      WHERE timestamp >= now() - INTERVAL 15 MINUTE
      GROUP BY time_bucket, service_name
      ORDER BY time_bucket ASC
    `.trim()
  }

  if (lowerQuery.includes('error') || lowerQuery.includes('failure')) {
    return `
      SELECT 
        service_name,
        status_code,
        count() AS error_count,
        count() * 100.0 / sum(count()) OVER () AS error_rate
      FROM traces
      WHERE timestamp >= now() - INTERVAL 15 MINUTE
        AND status_code != 'OK'
      GROUP BY service_name, status_code
      ORDER BY error_count DESC
    `.trim()
  }

  // Check for explicit time-series requests
  if (
    lowerQuery.includes('per minute') ||
    lowerQuery.includes('over time') ||
    lowerQuery.includes('by minute') ||
    lowerQuery.includes('time') ||
    lowerQuery.includes('hour')
  ) {
    return `
      SELECT 
        toStartOfMinute(timestamp) AS time_bucket,
        service_name,
        count() AS request_count,
        avg(duration_ms) AS avg_latency
      FROM traces
      WHERE timestamp >= now() - INTERVAL 1 HOUR
      GROUP BY time_bucket, service_name
      ORDER BY time_bucket ASC
    `.trim()
  }

  // Default time-series query
  return `
    SELECT 
      toStartOfMinute(timestamp) AS time_bucket,
      service_name,
      count() AS request_count,
      avg(duration_ms) AS avg_latency
    FROM traces
    WHERE timestamp >= now() - INTERVAL 15 MINUTE
    GROUP BY time_bucket, service_name
    ORDER BY time_bucket ASC
  `.trim()
}

/**
 * Mock query execution - in production this would connect to ClickHouse
 */
function mockExecuteQuery(sql: string): Effect.Effect<
  {
    data: unknown[]
    rowCount: number
    executionTime: number
  },
  Error,
  never
> {
  return Effect.succeed({
    data: generateMockData(sql),
    rowCount: 10,
    executionTime: Math.random() * 1000
  })
}

/**
 * Generate mock data based on SQL query patterns
 */
function generateMockData(sql: string): unknown[] {
  // Detect query type from SQL
  const isTimeSeriesQuery =
    sql.toLowerCase().includes('tostartofsecond') || sql.toLowerCase().includes('tostartofminute')
  const hasPercentiles = sql.toLowerCase().includes('quantile')

  if (isTimeSeriesQuery && hasPercentiles) {
    // Generate time-series data with percentiles
    return Array.from({ length: 10 }, (_, i) => ({
      time_bucket: new Date(Date.now() - (10 - i) * 60000).toISOString(),
      service_name: ['frontend', 'checkout', 'payment'][i % 3],
      p50_ms: 50 + Math.random() * 20,
      p95_ms: 100 + Math.random() * 50,
      p99_ms: 200 + Math.random() * 100,
      request_count: Math.floor(100 + Math.random() * 50)
    }))
  } else if (isTimeSeriesQuery) {
    // Generate simple time-series data without percentiles
    return Array.from({ length: 10 }, (_, i) => ({
      time_bucket: new Date(Date.now() - (10 - i) * 60000).toISOString(),
      service_name: ['frontend', 'checkout', 'payment'][i % 3],
      request_count: Math.floor(100 + Math.random() * 50),
      avg_latency: 50 + Math.random() * 100
    }))
  } else if (sql.toLowerCase().includes('error')) {
    // Generate error analysis data
    return Array.from({ length: 5 }, (_, i) => ({
      service_name: ['frontend', 'checkout', 'payment', 'cart', 'shipping'][i],
      error_count: Math.floor(Math.random() * 100),
      error_rate: Math.random() * 10,
      status_code: ['ERROR', 'OK', 'TIMEOUT'][Math.floor(Math.random() * 3)]
    }))
  } else {
    // Generate generic tabular data
    return Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      metric1: Math.random() * 100,
      metric2: Math.random() * 1000,
      category: `Category ${i % 3}`
    }))
  }
}

/**
 * Generate diagnostic queries based on issue type
 */
function generateDiagnosticQuery(
  criticalPath: string,
  issueType: 'latency' | 'errors' | 'throughput'
): { prompt: string; services: string[] } {
  // Extract services from critical path (simplified)
  const services = criticalPath.split('->').map((s) => s.trim())

  const queries = {
    latency: {
      prompt: `Analyze latency percentiles (p50, p95, p99) for services ${services.join(', ')} over the last 15 minutes, grouped by minute`,
      services
    },
    errors: {
      prompt: `Show error distribution and error rates for services ${services.join(', ')} in the last 15 minutes`,
      services
    },
    throughput: {
      prompt: `Calculate request throughput and success rates for services ${services.join(', ')} over the last 15 minutes`,
      services
    }
  }

  return queries[issueType]
}

// ========================
// Public API
// ========================

export class UIGenerationPipeline {
  /**
   * Generate UI component from natural language query
   */
  static async generateFromNaturalLanguage(
    query: string,
    options?: {
      preferredModel?: string
      context?: {
        criticalPath?: string
        timeRange?: string
        services?: string[]
      }
    }
  ): Promise<PipelineResponse> {
    const program = Effect.gen(function* () {
      const service = yield* UIGenerationPipelineServiceTag

      return yield* service.generateUI({
        naturalLanguageQuery: query,
        context: options?.context,
        options: {
          preferredModel: options?.preferredModel
        }
      })
    })

    // Use composite layer that includes all dependencies
    const { UIGeneratorPipelineServicesLive } = await import('./composite-layer.js')

    return Effect.runPromise(program.pipe(Effect.provide(UIGeneratorPipelineServicesLive)))
  }

  /**
   * Generate diagnostic UI for critical path issues
   */
  static async generateDiagnosticUI(
    criticalPath: string,
    issueType: 'latency' | 'errors' | 'throughput'
  ): Promise<PipelineResponse> {
    const program = Effect.gen(function* () {
      const service = yield* UIGenerationPipelineServiceTag

      return yield* service.generateDiagnosticUI(criticalPath, issueType)
    })

    // Use composite layer that includes all dependencies
    const { UIGeneratorPipelineServicesLive } = await import('./composite-layer.js')

    return Effect.runPromise(program.pipe(Effect.provide(UIGeneratorPipelineServicesLive)))
  }

  /**
   * Validate pipeline is ready
   */
  static async validate(): Promise<boolean> {
    try {
      const result = await UIGenerationPipeline.generateFromNaturalLanguage(
        'Show service latency over time',
        { preferredModel: 'claude-3-haiku-20240307' }
      )

      return !!(result.query && result.component && result.results)
    } catch {
      return false
    }
  }
}

// ========================
// Export Types
// ========================

export type { DynamicComponent, PipelineRequest, PipelineResponse }
