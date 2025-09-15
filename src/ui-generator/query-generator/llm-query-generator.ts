import { Effect, pipe, Duration } from 'effect'
import { CriticalPath, GeneratedQuery, QueryPattern } from './types.js'
import { type LLMRequest, LLMManagerServiceTag } from '../../llm-manager/index.js'
import { Schema } from '@effect/schema'
import {
  isSQLSpecificModel as checkSQLModel,
  extractResponseContent,
  needsResponseWrapping,
  getModelConfig
} from '../../llm-manager/response-extractor.js'

// Schema for LLM-generated query response
const LLMQueryResponseSchema = Schema.Struct({
  sql: Schema.String,
  description: Schema.String,
  expectedColumns: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      type: Schema.String,
      description: Schema.String
    })
  ),
  reasoning: Schema.String
})

type LLMQueryResponse = Schema.Schema.Type<typeof LLMQueryResponseSchema>

// Get default SQL model from environment or fallback
export const DEFAULT_MODEL =
  process.env.LLM_SQL_MODEL_1 || process.env.LLM_GENERAL_MODEL_1 || 'codellama-7b-instruct' // Fallback if nothing configured

import {
  generateSQLModelPrompt,
  generateGeneralLLMPrompt,
  CORE_DIAGNOSTIC_REQUIREMENTS
} from './diagnostic-query-instructions.js'

// Create a dynamic prompt with examples for the LLM
const createDynamicQueryPrompt = (
  path: CriticalPath,
  analysisGoal: string,
  modelName?: string
): string => {
  // For SQL-specific models, use the unified diagnostic instructions
  if (modelName && checkSQLModel(modelName)) {
    return generateSQLModelPrompt(path, analysisGoal, CORE_DIAGNOSTIC_REQUIREMENTS)
  }

  // For general models, use the unified diagnostic instructions with JSON wrapping
  const diagnosticPrompt = generateGeneralLLMPrompt(
    path,
    analysisGoal,
    CORE_DIAGNOSTIC_REQUIREMENTS
  )

  return `${diagnosticPrompt}

Return a JSON response with:
{
  "sql": "The complete ClickHouse query",
  "description": "Clear description of what this query analyzes",
  "expectedColumns": [
    {"name": "column_name", "type": "ClickHouse type", "description": "What this column represents"}
  ],
  "reasoning": "Why this query structure is optimal for the analysis goal"
}`
}

// Map of analysis goals for different contexts
export const ANALYSIS_GOALS = {
  latency:
    'Analyze service latency patterns showing p50, p95, p99 percentiles over time for performance monitoring',
  errors:
    'Identify error patterns, distribution, and root causes across services to improve reliability',
  bottlenecks:
    'Detect performance bottlenecks by finding slowest operations and their impact on the critical path',
  throughput:
    'Measure request volume, throughput rates, and success ratios to understand system capacity',
  comparison:
    'Compare current performance metrics with previous time periods to identify trends and regressions',
  custom: (goal: string) => goal
}

// Generate query using LLM with dynamic prompt
export const generateQueryWithLLM = (
  path: CriticalPath,
  analysisGoal: string,
  llmConfig?: { endpoint?: string; model?: string }
): Effect.Effect<GeneratedQuery, Error, LLMManagerServiceTag> => {
  const modelName = llmConfig?.model || DEFAULT_MODEL
  const modelConfig = getModelConfig(modelName)

  const prompt = createDynamicQueryPrompt(path, analysisGoal, modelName)

  // Log prompt size for debugging performance issues
  if (process.env.DEBUG_PORTKEY_TIMING) {
    console.log(`[LLM Query Generator] Prompt size: ${prompt.length} chars for model ${modelName}`)
  }

  // Use appropriate token limits
  const maxTokens = modelConfig.maxTokens || 4000

  const request: LLMRequest = {
    prompt: checkSQLModel(modelName)
      ? prompt
      : `You are a ClickHouse SQL expert. Always return valid JSON responses. Generate consistent, optimal queries based on the examples provided.\n\n${prompt}`,
    taskType: 'analysis',
    preferences: {
      model: modelName, // Use actual model name, not generic types
      maxTokens,
      temperature: modelName === llmConfig?.model ? 0 : (modelConfig.temperature ?? 0), // Use 0 for explicit model selection
      requireStructuredOutput: true
    }
  }

  // Helper to generate with retry on empty response
  const generateWithRetry = Effect.gen(function* () {
    const llmManagerService = yield* LLMManagerServiceTag

    // First attempt with original prompt
    const firstResponse = yield* llmManagerService.generate(request)

    // Quick check if response has valid SQL
    try {
      const content = firstResponse.content.trim()
      const extracted = extractResponseContent(modelName, content)

      // If it's JSON, check if SQL field is empty
      if (extracted.startsWith('{')) {
        const parsed = JSON.parse(extracted)
        if (!parsed.sql || parsed.sql === '' || parsed.sql === null) {
          console.log(
            `⚠️ [LLM Query Generator] First attempt returned empty SQL, retrying with explicit format request`
          )

          // Retry with more explicit prompt based on the analysis goal
          let exampleSQL = `SELECT service_name, COUNT(*) as request_count FROM traces WHERE service_name IN ('${path.services.join("', '")}') GROUP BY service_name`

          // Customize example based on analysis goal
          if (analysisGoal.toLowerCase().includes('latency')) {
            exampleSQL = `SELECT service_name, AVG(duration_ns/1000000) as avg_latency_ms, quantileExact(0.95)(duration_ns/1000000) as p95_latency_ms FROM traces WHERE service_name IN ('${path.services.join("', '")}') AND start_time >= now() - INTERVAL 15 MINUTE GROUP BY service_name`
          } else if (analysisGoal.toLowerCase().includes('error')) {
            exampleSQL = `SELECT service_name, COUNT(*) as total_requests, countIf(status_code != 'OK') as errors FROM traces WHERE service_name IN ('${path.services.join("', '")}') AND start_time >= now() - INTERVAL 15 MINUTE GROUP BY service_name`
          }

          const retryRequest: LLMRequest = {
            ...request,
            prompt: `Generate a ClickHouse SQL query for: ${analysisGoal}

Services: ${path.services.join(', ')}

Return a JSON object exactly like this:
{
  "sql": "${exampleSQL}",
  "description": "Query for ${analysisGoal}",
  "expectedColumns": [],
  "reasoning": "Analysis query"
}

The SQL must analyze: ${analysisGoal}`
          }

          const retryResponse = yield* llmManagerService.generate(retryRequest)
          return retryResponse
        }
      }
    } catch (e) {
      // If parsing fails, continue with original response
    }

    return firstResponse
  })

  return pipe(
    generateWithRetry,
    Effect.timeout(Duration.seconds(process.env.NODE_ENV === 'test' || process.env.CI ? 90 : 120)), // Extended timeout for integration tests
    Effect.map((response) => {
      try {
        const content = response.content.trim()

        // Debug logging in test environment
        if (process.env.NODE_ENV === 'test') {
          console.log(
            `   DEBUG: Raw LLM response (length ${content.length}):`,
            content.substring(0, 500)
          )
          if (content.length > 500) {
            console.log(
              `   DEBUG: ... (truncated, showing last 200 chars):`,
              content.substring(content.length - 200)
            )
          }
        }

        // Use model registry to extract content
        const extractedContent = extractResponseContent(modelName, content)

        console.log(`📝 [LLM Query Generator] Processing response from model: ${modelName}`)
        console.log(`📝 [LLM Query Generator] Raw content length: ${content.length} chars`)
        console.log(`📝 [LLM Query Generator] Raw content preview: ${content.substring(0, 200)}...`)
        console.log(
          `📝 [LLM Query Generator] Extracted content length: ${extractedContent.length} chars`
        )
        console.log(
          `📝 [LLM Query Generator] Extracted content preview: ${extractedContent.substring(0, 100)}...`
        )

        // Check if this is a SQL-specific model that needs wrapping
        const needsWrapping = needsResponseWrapping(modelName, 'sql')

        let parsed: (LLMQueryResponse & { insights?: string }) | undefined

        if (needsWrapping && checkSQLModel(modelName)) {
          // SQL-specific models return raw SQL that needs wrapping
          console.log('   INFO: SQL-specific model returned raw SQL, wrapping in JSON structure')
          if (process.env.NODE_ENV === 'test') {
            console.log('   DEBUG: Extracted SQL:', extractedContent)
          }
          parsed = {
            sql: extractedContent,
            description: `Query generated for ${analysisGoal}`,
            expectedColumns: [],
            reasoning: 'Direct SQL generation from SQL-specific model'
          }
        } else {
          // Try to parse as JSON
          try {
            // extractResponseContent already handles markdown blocks for us
            const jsonContent = extractedContent

            console.log(`📝 [LLM Query Generator] Parsing JSON content...`)
            let parsedJson = JSON.parse(jsonContent) as LLMQueryResponse & {
              insights?: string
              body?: LLMQueryResponse
              statusCode?: number
            }

            // Handle nested body structure (some models return this)
            if (parsedJson.body && typeof parsedJson.body === 'object') {
              console.log(`📝 [LLM Query Generator] Extracting from nested body structure`)
              parsedJson = parsedJson.body
            }

            console.log(`✅ [LLM Query Generator] Successfully parsed JSON response`)

            // Check if the parsed JSON has null values (common with some models)
            if (!parsedJson.sql || parsedJson.sql === null || parsedJson.sql === '') {
              console.log(
                `⚠️ [LLM Query Generator] JSON response has null or empty SQL field, treating as invalid`
              )
              throw new Error('JSON response has null or empty SQL field')
            }

            // Clean up SQL field if it starts with 'sql' on its own line
            let cleanedSql = parsedJson.sql
            if (cleanedSql && typeof cleanedSql === 'string') {
              const sqlLines = cleanedSql.split('\n')
              if (
                sqlLines.length > 0 &&
                sqlLines[0] &&
                sqlLines[0].trim().toLowerCase() === 'sql'
              ) {
                cleanedSql = sqlLines.slice(1).join('\n').trim()
                console.log(`📝 [LLM Query Generator] Removed 'sql' prefix from query`)
              }
            }

            parsed = {
              ...parsedJson,
              sql: cleanedSql
            }
          } catch (e) {
            console.error(`❌ [LLM Query Generator] JSON parse error:`, e)
            console.log(
              `❌ [LLM Query Generator] Failed to parse content: ${extractedContent.substring(0, 200)}...`
            )

            // Try to fix common JSON issues from LLMs
            let fixedContent = extractedContent

            // Fix unquoted SQL field (common with some models)
            // Look for patterns like: "sql": SELECT ... instead of "sql": "SELECT ..."
            // Also handle WITH as a starting keyword for CTEs
            const unquotedSqlMatch = fixedContent.match(
              /"sql"\s*:\s*((?:SELECT|WITH)[\s\S]*?)(?=,\s*"|}\s*$)/i
            )
            if (unquotedSqlMatch && unquotedSqlMatch[1]) {
              const sqlContent = unquotedSqlMatch[1].trim()
              // Remove trailing comma if present
              const cleanedSql = sqlContent.replace(/,\s*$/, '')
              // Escape the SQL and wrap in quotes
              const escapedSql = JSON.stringify(cleanedSql)
              fixedContent = fixedContent.replace(unquotedSqlMatch[0], `"sql": ${escapedSql}`)
              console.log(`📝 [LLM Query Generator] Fixed unquoted SQL field in JSON`)

              try {
                parsed = JSON.parse(fixedContent) as LLMQueryResponse & { insights?: string }
                console.log(`✅ [LLM Query Generator] Successfully parsed fixed JSON`)
              } catch (e2) {
                console.error(`❌ [LLM Query Generator] Still failed after fixing:`, e2)
                // Continue to fallback logic below
              }
            }

            // If we still don't have parsed content and it looks like SQL, wrap it
            // This handles cases where the model returns raw SQL or SQL in markdown blocks
            if (
              !parsed &&
              extractedContent &&
              (extractedContent.toUpperCase().includes('SELECT') ||
                extractedContent.toUpperCase().includes('WITH') ||
                extractedContent.toUpperCase().includes('FROM'))
            ) {
              console.log(
                '   INFO: Model returned raw SQL (possibly from markdown block), wrapping in JSON structure'
              )

              // Clean up any leading comments
              let cleanSQL = extractedContent
              const lines = cleanSQL.split('\n')
              // Remove leading comment lines
              while (lines.length > 0 && lines[0] && lines[0].trim().startsWith('--')) {
                lines.shift()
              }
              cleanSQL = lines.join('\n').trim()

              parsed = {
                sql: cleanSQL,
                description: `Query for ${analysisGoal}`,
                expectedColumns: [],
                reasoning: 'Direct SQL generation from model'
              }
            } else if (!parsed) {
              throw new Error(`Invalid response format: ${extractedContent.substring(0, 100)}`)
            }
          }
        }

        // Ensure we have a parsed response
        if (!parsed) {
          throw new Error('Failed to parse LLM response')
        }

        // Validate the generated SQL
        if (!validateGeneratedSQL(parsed.sql)) {
          if (process.env.NODE_ENV === 'test') {
            console.log(`   DEBUG: SQL validation failed for model ${modelName}`)
            console.log('   DEBUG: SQL:', parsed.sql.substring(0, 200))
            const upperSQL = parsed.sql.toUpperCase()
            console.log('   DEBUG: Missing required elements:')
            if (!upperSQL.includes('SELECT')) console.log('     - SELECT')
            if (!upperSQL.includes('FROM')) console.log('     - FROM clause')
          }
          throw new Error(
            'Generated SQL failed validation - contains forbidden operations or missing required elements'
          )
        }

        // Convert to GeneratedQuery format with model information
        const query: GeneratedQuery & { model?: string; reasoning?: string } = {
          id: `${path.id}_${Date.now()}_llm`,
          name: `${analysisGoal.substring(0, 50)} - ${path.name}`,
          description: parsed.description,
          pattern: QueryPattern.SERVICE_LATENCY, // Default pattern, but LLM decides actual query structure
          sql: parsed.sql.trim(),
          expectedSchema: parsed.expectedColumns.reduce(
            (acc, col) => {
              acc[col.name] = col.type
              return acc
            },
            {} as Record<string, string>
          ),
          model: response.model, // Include the actual model that was used
          reasoning: parsed.reasoning
        }

        return query
      } catch (error) {
        throw new Error(`Failed to parse LLM response: ${error}`)
      }
    }),
    Effect.catchAll((error) =>
      Effect.fail(new Error(`LLM query generation failed: ${JSON.stringify(error)}`))
    )
  )
}

// Generate multiple queries for different analysis goals
export const generateQueriesForGoals = (
  path: CriticalPath,
  analysisGoals: string[],
  llmConfig?: { endpoint?: string; model?: string }
): Effect.Effect<GeneratedQuery[], Error, LLMManagerServiceTag> => {
  return Effect.all(
    analysisGoals.map((goal) => generateQueryWithLLM(path, goal, llmConfig)),
    { concurrency: 1 } // Sequential to avoid overwhelming the LLM
  )
}

// Generate standard set of queries
export const generateStandardQueries = (
  path: CriticalPath,
  llmConfig?: { endpoint?: string; model?: string }
): Effect.Effect<GeneratedQuery[], Error, LLMManagerServiceTag> => {
  const standardGoals = [
    ANALYSIS_GOALS.latency,
    ANALYSIS_GOALS.errors,
    ANALYSIS_GOALS.bottlenecks,
    ANALYSIS_GOALS.throughput,
    ANALYSIS_GOALS.comparison
  ]

  return generateQueriesForGoals(path, standardGoals, llmConfig)
}

// Helper to generate query with SQL-specific model for performance
export const generateQueryWithSQLModel = (
  path: CriticalPath,
  analysisGoal: string,
  endpoint?: string
): Effect.Effect<GeneratedQuery, Error, LLMManagerServiceTag> => {
  return generateQueryWithLLM(path, analysisGoal, {
    endpoint: endpoint || 'http://localhost:1234/v1',
    model: process.env.LLM_SQL_MODEL_1 || DEFAULT_MODEL // Use environment SQL model
  })
}

// Validate generated SQL (basic validation)
export const validateGeneratedSQL = (sql: string | null | undefined): boolean => {
  // Check if SQL is null, undefined, or empty
  if (!sql || sql.trim() === '') {
    return false
  }

  const forbidden = ['DROP', 'DELETE', 'TRUNCATE', 'ALTER', 'CREATE', 'INSERT', 'UPDATE']

  const upperSQL = sql.toUpperCase()

  // Check for basic SQL structure
  if (!upperSQL.includes('SELECT')) {
    return false
  }

  // Check for FROM clause (can be any table/subquery, not just "traces")
  if (!upperSQL.includes('FROM')) {
    return false
  }

  // Check for forbidden operations
  for (const forbid of forbidden) {
    if (upperSQL.includes(forbid)) {
      return false
    }
  }

  return true
}
