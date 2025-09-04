/**
 * ClickHouse AI Query Generator Service
 *
 * Uses general-purpose AI models to generate ClickHouse-optimized queries.
 * This simulates the functionality of ClickHouse's built-in ?? command
 * but allows programmatic generation and execution.
 */

import { Context, Effect, Layer } from 'effect'
import { CriticalPath, GeneratedQueryWithThunk, QueryPattern, QueryResult } from './types.js'
import { StorageAPIClientTag } from '../../storage/api-client'
import { createMultiModelSimpleLLMManager } from '../../llm-manager/multi-model-simple-manager'
import { type LLMRequest } from '../../llm-manager'

/**
 * Service definition for ClickHouse AI Query Generator
 */
export class CriticalPathQueryGeneratorClickHouseAI extends Context.Tag(
  'CriticalPathQueryGeneratorClickHouseAI'
)<
  CriticalPathQueryGeneratorClickHouseAI,
  {
    readonly generateQueries: (
      path: CriticalPath
    ) => Effect.Effect<GeneratedQueryWithThunk[], Error>

    readonly optimizeQuery: (query: string, analysisGoal: string) => Effect.Effect<string, Error>

    readonly explainQuery: (query: string) => Effect.Effect<string, Error>
  }
>() {}

/**
 * Implementation of ClickHouse AI Query Generator
 */
export const CriticalPathQueryGeneratorClickHouseAILive = Layer.effect(
  CriticalPathQueryGeneratorClickHouseAI,
  Effect.gen(function* () {
    const storageClient = yield* StorageAPIClientTag

    // Create a multi-model simple LLM manager
    const llmManager = createMultiModelSimpleLLMManager()

    // Log which models are available
    const availableModels = yield* llmManager.getAvailableModels()
    console.log('🤖 ClickHouse AI Query Generator initialized')
    console.log(`   Available models: ${availableModels.join(', ')}`)

    /**
     * Generate ClickHouse-optimized queries using AI
     */
    const generateQueries = (path: CriticalPath) =>
      Effect.gen(function* () {
        // Build context about the critical path
        const pathContext = `
          Critical Path: ${path.name}
          Services: ${path.services.join(', ')}
          Start Service: ${path.startService}
          End Service: ${path.endService}
          ${path.metadata ? `Metadata: ${JSON.stringify(path.metadata)}` : ''}
        `

        // Define analysis scenarios for the critical path
        // In test environments, limit scenarios to speed up execution
        const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true'
        const allScenarios = [
          {
            name: 'End-to-End Latency Analysis',
            goal: 'Analyze the complete latency distribution across the critical path'
          },
          {
            name: 'Service Bottleneck Detection',
            goal: 'Identify which services are causing the most delays'
          },
          {
            name: 'Error Impact Analysis',
            goal: 'Understand how errors in different services affect the critical path'
          },
          {
            name: 'Time Series Performance',
            goal: 'Analyze performance trends over time'
          },
          {
            name: 'Resource Utilization Correlation',
            goal: 'Correlate performance with resource metrics'
          }
        ]

        // Limit to 2 scenarios in test environment to speed up tests
        const analysisScenarios = isTestEnv ? allScenarios.slice(0, 2) : allScenarios

        const queries: GeneratedQueryWithThunk[] = []
        let queryCounter = 0

        for (const scenario of analysisScenarios) {
          queryCounter++
          const prompt = `
            You are a ClickHouse query expert. Generate an optimized ClickHouse query for the following scenario:
            
            ${pathContext}
            
            Analysis Goal: ${scenario.goal}
            
            Use the following ClickHouse-specific features when appropriate:
            - Quantile functions (quantile, quantileExact, quantileTiming)
            - Time window functions (tumbleWindow, hopWindow)
            - Array functions for trace analysis
            - Materialized views for performance
            - Sampling for large datasets
            
            The traces table has these columns:
            - trace_id, span_id, parent_span_id
            - service_name, operation_name
            - start_time (DateTime64), end_time (DateTime64)
            - duration_ns (UInt64)
            - status_code, status_message
            - span_kind, span_attributes (Map)
            - resource_attributes (Map)
            
            Return ONLY the SQL query without any explanation or markdown blocks.
          `

          const request: LLMRequest = {
            prompt,
            taskType: 'general',
            preferences: {
              // Let the router decide which model to use based on availability
              maxTokens: 1000,
              temperature: 0
            }
          }

          const response = yield* llmManager
            .generate(request)
            .pipe(
              Effect.mapError(
                (error) => new Error(`Failed to generate query: ${JSON.stringify(error)}`)
              )
            )

          // Clean the response to extract just the SQL
          let sql = response.content.trim()

          // Remove markdown blocks if present
          if (sql.startsWith('```sql')) {
            sql = sql.substring(6)
          }
          if (sql.startsWith('```')) {
            sql = sql.substring(3)
          }
          if (sql.endsWith('```')) {
            sql = sql.substring(0, sql.length - 3)
          }
          sql = sql.trim()

          // Map scenario name to QueryPattern
          const getPattern = (name: string): QueryPattern => {
            if (name.includes('Latency')) return QueryPattern.SERVICE_LATENCY
            if (name.includes('Bottleneck')) return QueryPattern.BOTTLENECK_DETECTION
            if (name.includes('Error')) return QueryPattern.ERROR_DISTRIBUTION
            if (name.includes('Time Series')) return QueryPattern.TIME_COMPARISON
            return QueryPattern.VOLUME_THROUGHPUT
          }

          // Create query execution thunk
          const executeThunk = (): Effect.Effect<QueryResult, Error, never> =>
            storageClient.queryRaw(sql).pipe(
              Effect.map((data) => {
                // Ensure data is an array of records
                const formattedData = Array.isArray(data)
                  ? data.map((item) =>
                      typeof item === 'object' && item !== null
                        ? (item as Record<string, unknown>)
                        : { value: item }
                    )
                  : []

                const result: QueryResult = {
                  queryId: `ai-query-${queryCounter}`,
                  data: formattedData,
                  rowCount: formattedData.length,
                  executionTimeMs: 0
                }
                return result
              }),
              Effect.catchAll((error) => {
                const errorResult: QueryResult = {
                  queryId: `ai-query-${queryCounter}`,
                  data: [],
                  rowCount: 0,
                  executionTimeMs: 0,
                  error: String(error)
                }
                return Effect.succeed(errorResult)
              })
            )

          queries.push({
            id: `ai-query-${queryCounter}`,
            name: scenario.name,
            description: scenario.goal,
            pattern: getPattern(scenario.name),
            sql,
            executeThunk
          })
        }

        return queries
      })

    /**
     * Optimize an existing query using AI
     */
    const optimizeQuery = (query: string, analysisGoal: string) =>
      Effect.gen(function* () {
        const prompt = `
          You are a ClickHouse optimization expert. Optimize the following query for better performance:
          
          Original Query:
          ${query}
          
          Analysis Goal: ${analysisGoal}
          
          Apply these optimization techniques:
          1. Use appropriate indexes and ORDER BY
          2. Replace subqueries with JOINs when more efficient
          3. Use ClickHouse-specific functions (quantile, arrayJoin, etc.)
          4. Consider using PREWHERE for filtering
          5. Use appropriate data types and compression
          6. Apply sampling for large datasets if appropriate
          
          Return ONLY the optimized SQL query without explanation.
        `

        const request: LLMRequest = {
          prompt,
          taskType: 'general',
          preferences: {
            maxTokens: 1000,
            temperature: 0
          }
        }

        const response = yield* llmManager
          .generate(request)
          .pipe(
            Effect.mapError(
              (error) => new Error(`Failed to optimize query: ${JSON.stringify(error)}`)
            )
          )

        // Clean the response
        let optimizedSql = response.content.trim()
        if (optimizedSql.includes('```')) {
          optimizedSql = optimizedSql
            .replace(/```sql\n?/g, '')
            .replace(/```/g, '')
            .trim()
        }

        return optimizedSql
      })

    /**
     * Explain what a query does using AI
     */
    const explainQuery = (query: string) =>
      Effect.gen(function* () {
        const prompt = `
          You are a ClickHouse expert. Explain what the following query does in simple terms:
          
          Query:
          ${query}
          
          Provide:
          1. A brief summary of what the query analyzes
          2. The main aggregations and calculations
          3. Any performance considerations
          4. Suggested improvements if applicable
          
          Keep the explanation concise and technical but understandable.
        `

        const request: LLMRequest = {
          prompt,
          taskType: 'general',
          preferences: {
            maxTokens: 500,
            temperature: 0.3
          }
        }

        const response = yield* llmManager
          .generate(request)
          .pipe(
            Effect.mapError(
              (error) => new Error(`Failed to explain query: ${JSON.stringify(error)}`)
            )
          )

        return response.content.trim()
      })

    return {
      generateQueries,
      optimizeQuery,
      explainQuery
    }
  })
)
