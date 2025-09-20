import { Effect, pipe, Duration } from 'effect'
import { CriticalPath, GeneratedQuery, QueryPattern } from './types.js'
import { type LLMRequest, LLMManagerServiceTag } from '../../llm-manager/index.js'
import { Schema } from '@effect/schema'
import { extractResponseContent, getModelConfig } from '../../llm-manager/response-extractor.js'
import {
  evaluateAndOptimizeSQLWithLLM,
  type SQLEvaluationResult,
  type ClickHouseClient
} from './sql-evaluator-optimizer.js'
import { StorageServiceTag } from '../../storage/index.js'

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

// Default model will be determined by Portkey configuration
export const DEFAULT_MODEL = undefined // Let Portkey config handle defaults

import {
  generateSQLModelPrompt,
  generateGeneralLLMPrompt,
  CORE_DIAGNOSTIC_REQUIREMENTS
} from './diagnostic-query-instructions.js'

// Create a dynamic prompt with examples for the LLM
const createDynamicQueryPrompt = (
  path: CriticalPath,
  analysisGoal: string,
  modelName?: string,
  isClickHouseAI?: boolean
): string => {
  // For SQL-specific models, use the unified diagnostic instructions
  // Check if model is SQL-specific based on known model names
  const isSQLModel = modelName
    ? ['sqlcoder', 'codellama', 'starcoder'].some((m) => modelName.toLowerCase().includes(m))
    : false

  if (isSQLModel) {
    return generateSQLModelPrompt(path, analysisGoal, CORE_DIAGNOSTIC_REQUIREMENTS)
  }

  // For general models, use the unified diagnostic instructions with JSON wrapping
  const diagnosticPrompt = generateGeneralLLMPrompt(
    path,
    analysisGoal,
    CORE_DIAGNOSTIC_REQUIREMENTS
  )

  // Add ClickHouse-specific instructions when using ClickHouse AI
  const clickhouseInstructions = isClickHouseAI
    ? `

CRITICAL ClickHouse SQL Rules (MUST FOLLOW):
1. Table name: Use 'traces' (never 'otel.traces')
2. Aggregate functions FORBIDDEN in WHERE clauses:
   - WRONG: WHERE count() > 5
   - CORRECT: GROUP BY ... HAVING count() > 5
3. Column aliases cannot be used in WHERE:
   - WRONG: WHERE request_count > 5 (if request_count is SELECT count() AS request_count)
   - CORRECT: GROUP BY ... HAVING count() > 5
4. In CTEs, aggregate results need GROUP BY:
   - If using count(), sum(), avg() - MUST include GROUP BY
   - Filter aggregates with HAVING, not WHERE

ClickHouse-Specific Syntax:
- Use quantile(0.95)(...) for percentiles (not percentile_cont)
- Use toStartOfMinute(timestamp) for time bucketing
- Use countIf(condition) for conditional counting
- Use arrayJoin for expanding arrays
- Use -If suffix for conditional aggregates (sumIf, avgIf, etc.)

CORRECT ClickHouse Query Example:
\`\`\`sql
WITH service_metrics AS (
  SELECT
    service_name,
    count() as request_count,
    countIf(status_code != 'OK') as error_count,
    quantile(0.95)(duration_ns/1000000) as p95_latency_ms
  FROM traces
  WHERE
    service_name IN ('frontend', 'backend', 'database')
    AND start_time >= now() - INTERVAL 15 MINUTE
  GROUP BY service_name
  HAVING request_count > 10  -- Aggregate filter in HAVING, not WHERE!
)
SELECT
  service_name,
  request_count,
  error_count,
  round(error_count * 100.0 / request_count, 2) as error_rate,
  p95_latency_ms
FROM service_metrics
ORDER BY error_rate DESC, p95_latency_ms DESC
\`\`\`

AVOID These Common Mistakes:
❌ WHERE request_count > 5 (request_count is aggregate)
❌ WHERE avg(duration) > 100
❌ FROM otel.traces
❌ CTE with count() but no GROUP BY
✅ HAVING count() > 5
✅ HAVING avg(duration) > 100
✅ FROM traces
✅ CTE with aggregates includes GROUP BY
`
    : ''

  return `${diagnosticPrompt}${clickhouseInstructions}

Return a JSON response with:
{
  "sql": "The complete ClickHouse query${isClickHouseAI ? ' (following ClickHouse rules above)' : ''}",
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
  llmConfig?: { endpoint?: string; model?: string; isClickHouseAI?: boolean }
): Effect.Effect<GeneratedQuery, Error, LLMManagerServiceTag> => {
  const modelName = llmConfig?.model
  // For now, use null for model config when model is undefined - this will use defaults
  const modelConfig = getModelConfig(null)

  const prompt = createDynamicQueryPrompt(
    path,
    analysisGoal,
    modelName || 'general-model',
    llmConfig?.isClickHouseAI
  )

  // Log prompt size for debugging performance issues
  if (process.env.DEBUG_PORTKEY_TIMING) {
    console.log(`[LLM Query Generator] Prompt size: ${prompt.length} chars for model ${modelName}`)
  }

  // Use appropriate token limits
  const maxTokens = modelConfig.maxTokens || 4000

  const request: LLMRequest = {
    prompt:
      modelName &&
      ['sqlcoder', 'codellama', 'starcoder'].some((m) => modelName.toLowerCase().includes(m))
        ? prompt
        : `You are a ClickHouse SQL expert. Always return valid JSON responses. Generate consistent, optimal queries based on the examples provided.\n\n${prompt}`,
    taskType: 'analysis', // SQL analysis task type
    preferences: {
      model: modelName || undefined, // Use actual model name, let Portkey handle defaults
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
      // For now, use null modelInfo since we don't have ModelInfo objects here
      const extracted = extractResponseContent(content, null)

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
        // For now, use null modelInfo since we don't have ModelInfo objects here
        const extractedContent = extractResponseContent(content, null)

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
        // For now, check model name directly since we don't have ModelInfo objects
        const needsWrapping = modelName
          ? ['sqlcoder', 'codellama', 'starcoder'].some((m) => modelName.toLowerCase().includes(m))
          : false

        let parsed: (LLMQueryResponse & { insights?: string }) | undefined

        if (
          needsWrapping &&
          modelName &&
          ['sqlcoder', 'codellama', 'starcoder'].some((m) => modelName.toLowerCase().includes(m))
        ) {
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

            // First attempt: try parsing as-is
            console.log(`📝 [LLM Query Generator] Parsing JSON content...`)
            let parsedJson: LLMQueryResponse & {
              insights?: string
              body?: LLMQueryResponse
              statusCode?: number
            }

            try {
              parsedJson = JSON.parse(jsonContent)
            } catch (parseError) {
              // If initial parse fails, try to fix common issues
              console.log(
                `⚠️ [LLM Query Generator] Initial JSON parse failed, attempting to fix...`
              )

              // Try to extract just the JSON object if there's extra content
              const jsonMatch = jsonContent.match(/\{[\s\S]*\}/)
              if (jsonMatch) {
                // Extract the SQL content and create a simple response
                const sqlMatch = jsonMatch[0].match(/"sql"\s*:\s*"([\s\S]*?)"/)
                if (sqlMatch && sqlMatch[1]) {
                  // Extract the SQL and create a minimal valid response
                  const sql = sqlMatch[1]
                    .replace(/\\n/g, '\n') // Unescape newlines
                    .replace(/\\"/g, '"') // Unescape quotes
                    .replace(/\\\\/g, '\\') // Unescape backslashes

                  console.log(`✅ [LLM Query Generator] Extracted SQL from malformed JSON`)
                  parsedJson = {
                    sql: sql,
                    description: 'Query generated via ClickHouse AI',
                    expectedColumns: [],
                    reasoning: 'Extracted from Claude response'
                  }
                } else {
                  throw parseError
                }
              } else {
                throw parseError
              }
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

            // Debug: Log what we're about to return
            console.log(`📝 [LLM Query Generator] Parsed SQL length: ${parsed.sql.length} chars`)
            console.log(
              `📝 [LLM Query Generator] Parsed SQL preview: ${parsed.sql.substring(0, 100)}...`
            )
          } catch (e) {
            console.error(`❌ [LLM Query Generator] JSON parse error:`, e)
            console.log(
              `❌ [LLM Query Generator] Failed to parse content length: ${extractedContent.length} chars`
            )
            console.log(
              `❌ [LLM Query Generator] First 200 chars: ${extractedContent.substring(0, 200)}...`
            )
            console.log(
              `❌ [LLM Query Generator] Content starts with: '${extractedContent.substring(0, 10)}'`
            )
            console.log(
              `❌ [LLM Query Generator] Is it JSON? ${extractedContent.trim().startsWith('{')}`
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
            // BUT make sure it's not JSON containing SQL
            if (
              !parsed &&
              extractedContent &&
              !extractedContent.trim().startsWith('{') && // Not JSON
              !extractedContent.includes('"sql"') && // Not JSON with sql field
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

        // Note: SQL post-processing has been removed in favor of evaluator-optimizer pattern
        // The evaluator-optimizer will fix SQL errors by running queries against ClickHouse
        // and iteratively fixing issues based on actual errors

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

        // Add comprehensive metadata comments for debugging
        const metadata = [
          `-- Model: ${response.model || modelName}`,
          llmConfig?.isClickHouseAI
            ? `-- Mode: ClickHouse AI (General model for SQL generation)`
            : null,
          `-- Generated: ${new Date().toISOString()}`,
          `-- Analysis Goal: ${analysisGoal}`,
          `-- Services: ${path.services.join(', ')}`,
          response.usage
            ? `-- Tokens: ${response.usage.totalTokens} (prompt: ${response.usage.promptTokens}, completion: ${response.usage.completionTokens})`
            : null,
          response.metadata?.latencyMs
            ? `-- Generation Time: ${response.metadata.latencyMs}ms`
            : null,
          response.metadata?.cached ? `-- Cached: true` : null,
          parsed.reasoning ? `-- Reasoning: ${parsed.reasoning}` : null,
          '-- ========================================='
        ]
          .filter(Boolean)
          .join('\n')

        // Debug: Check if parsed.sql is actually just SQL or contains JSON
        if (parsed.sql.includes('"sql"') || parsed.sql.includes('{')) {
          console.warn(
            `⚠️ [LLM Query Generator] WARNING: parsed.sql appears to contain JSON structure!`
          )
          console.warn(`⚠️ [LLM Query Generator] First 200 chars: ${parsed.sql.substring(0, 200)}`)

          // Try to extract just the SQL if it's wrapped in JSON
          try {
            const jsonParsed = JSON.parse(parsed.sql)
            if (jsonParsed.sql) {
              console.log(`✅ [LLM Query Generator] Extracted SQL from nested JSON`)
              // Create a new parsed object with the extracted SQL
              parsed = {
                ...parsed,
                sql: jsonParsed.sql
              }
            }
          } catch (e) {
            // Not JSON, continue with original
          }
        }

        const sqlWithComment = metadata + '\n' + parsed.sql.trim()

        // Convert to GeneratedQuery format with model information
        const query: GeneratedQuery & { model?: string; reasoning?: string } = {
          id: `${path.id}_${Date.now()}_llm`,
          name: `${analysisGoal.substring(0, 50)} - ${path.name}`,
          description: parsed.description,
          pattern: QueryPattern.SERVICE_LATENCY, // Default pattern, but LLM decides actual query structure
          sql: sqlWithComment,
          expectedSchema: parsed.expectedColumns.reduce(
            (acc, col) => {
              acc[col.name] = col.type
              return acc
            },
            {} as Record<string, string>
          ),
          ...(response.model || modelName
            ? { model: (response.model || modelName) as string }
            : {}), // Include the actual model that was used
          ...(parsed.reasoning ? { reasoning: parsed.reasoning } : {})
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
  analysisGoal: string
): Effect.Effect<GeneratedQuery, Error, LLMManagerServiceTag> => {
  // Use Portkey's default SQL model (codellama-7b-instruct) via routing
  // No endpoint needed - all requests go through Portkey Gateway
  const config = {
    model: 'codellama-7b-instruct' // Portkey will route this appropriately
  }
  return generateQueryWithLLM(path, analysisGoal, config)
}

/**
 * Generate and optimize query using evaluator-optimizer pattern
 * This executes the query against ClickHouse and fixes any errors iteratively
 */
export const generateAndOptimizeQuery = (
  path: CriticalPath,
  analysisGoal: string,
  llmConfig?: { endpoint?: string; model?: string; isClickHouseAI?: boolean },
  useEvaluator: boolean = false
): Effect.Effect<
  GeneratedQuery & { evaluations?: SQLEvaluationResult[] },
  Error,
  LLMManagerServiceTag | StorageServiceTag
> => {
  console.log(`🔧 [EVALUATOR] generateAndOptimizeQuery called with useEvaluator: ${useEvaluator}`)
  console.log(`🔧 [EVALUATOR] generateAndOptimizeQuery parameters:`, {
    path: path.name,
    analysisGoal,
    llmConfig,
    useEvaluator
  })

  return Effect.gen(function* () {
    console.log(
      `🔧 [EVALUATOR] generateAndOptimizeQuery Effect starting - first generating initial query`
    )

    // First, generate the initial query
    const initialQuery = yield* generateQueryWithLLM(path, analysisGoal, llmConfig)

    console.log(
      `🔧 [EVALUATOR] generateAndOptimizeQuery got initial query: ${initialQuery.sql.substring(0, 100)}...`
    )

    // If evaluator not enabled, return the initial query
    if (!useEvaluator) {
      console.log(
        '🔄 [EVALUATOR] generateAndOptimizeQuery SKIPPING EVALUATOR - useEvaluator is false'
      )
      console.log(
        '🔄 [EVALUATOR] generateAndOptimizeQuery returning initial query WITHOUT optimization'
      )
      return initialQuery
    }

    console.log(
      '🔄 [EVALUATOR] generateAndOptimizeQuery PROCEEDING WITH EVALUATOR - useEvaluator is true'
    )
    console.log(
      '🔄 [EVALUATOR] generateAndOptimizeQuery about to call evaluateAndOptimizeSQLWithLLM'
    )

    // Get the storage service for ClickHouse queries
    const storage = yield* StorageServiceTag

    // Create adapter for ClickHouse client interface, mapping StorageError to Error
    const clickhouseClient: ClickHouseClient = {
      queryRaw: (sql: string) =>
        pipe(
          storage.queryRaw(sql),
          Effect.mapError((error) => new Error(`Storage query failed: ${JSON.stringify(error)}`))
        ),
      queryText: (sql: string) =>
        pipe(
          storage.queryText(sql),
          Effect.mapError((error) => new Error(`Storage query failed: ${JSON.stringify(error)}`))
        )
    }

    console.log('🔄 [LLM Query Generator] Starting evaluator-optimizer loop with LLM support')

    // Run the evaluator-optimizer loop with LLM support
    const result = yield* pipe(
      evaluateAndOptimizeSQLWithLLM(
        initialQuery.sql,
        clickhouseClient,
        {
          services: [...path.services],
          analysisGoal
        },
        3 // Max 3 attempts
      ),
      Effect.catchAll((error) => {
        console.error('❌ [LLM Query Generator] Evaluator-optimizer failed:', error)
        // Fall back to initial query with empty evaluations
        return Effect.succeed({
          finalSql: initialQuery.sql,
          attempts: [],
          optimizations: []
        })
      })
    )

    // Add validation attempt information to SQL comments
    let validationComments = ''
    if (result.attempts.length > 0) {
      validationComments = [
        '',
        '-- ========== VALIDATION ATTEMPTS ==========',
        `-- Total Attempts: ${result.attempts.length}`,
        ...result.attempts.map((attempt, idx) => {
          const lines = []
          lines.push(`-- Attempt ${idx + 1}: ${attempt.isValid ? '✅ VALID' : '❌ INVALID'}`)
          if (attempt.error) {
            lines.push(`--   Error Code: ${attempt.error.code}`)
            lines.push(`--   Error: ${attempt.error.message}`)
          }
          if (attempt.executionTimeMs) {
            lines.push(`--   Execution Time: ${attempt.executionTimeMs}ms`)
          }
          return lines.join('\n')
        }),
        `-- Final Status: ${result.attempts[result.attempts.length - 1]?.isValid ? '✅ Query validated successfully' : '⚠️ Query may have issues'}`,
        '-- ========================================='
      ].join('\n')
    }

    // Add optimization information if any
    if (result.optimizations && result.optimizations.length > 0) {
      validationComments += [
        '',
        '-- ========== OPTIMIZATIONS APPLIED ==========',
        ...result.optimizations.map((opt, idx) => {
          const lines = []
          lines.push(`-- Optimization ${idx + 1}:`)
          lines.push(`--   ${opt.explanation || 'Applied automatic optimization'}`)
          if (opt.changes && opt.changes.length > 0) {
            opt.changes.forEach((change) => {
              lines.push(`--   - ${change}`)
            })
          }
          return lines.join('\n')
        }),
        '-- ============================================='
      ].join('\n')
    }

    // Prepend validation comments to the final SQL
    const finalSqlWithComments = validationComments
      ? result.finalSql.replace(/^(--[^\n]*\n)*/, '$&' + validationComments + '\n')
      : result.finalSql

    // Return the optimized query with evaluation history
    return {
      ...initialQuery,
      sql: finalSqlWithComments,
      evaluations: result.attempts,
      validationAttempts: result.attempts.length,
      finalValidation: result.attempts[result.attempts.length - 1],
      description:
        result.attempts.length > 0 && result.attempts[result.attempts.length - 1]?.isValid
          ? `${initialQuery.description} (optimized after ${result.attempts.length} attempts)`
          : result.attempts.length > 0
            ? `${initialQuery.description} (optimization attempted)`
            : initialQuery.description
    }
  })
}

// Validate generated SQL with ClickHouse-specific checks
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

  // ClickHouse-specific validation
  return validateClickHouseSQL(sql)
}

// ClickHouse-specific SQL validation
export const validateClickHouseSQL = (sql: string): boolean => {
  const upperSQL = sql.toUpperCase()

  // Check for required elements
  if (!upperSQL.includes('SELECT')) {
    console.log('❌ [ClickHouse SQL Validation] Query must contain SELECT statement')
    return false
  }
  if (!upperSQL.includes('FROM')) {
    console.log('❌ [ClickHouse SQL Validation] Query must specify FROM table')
    return false
  }

  // Check for dangerous operations
  const forbidden = ['DROP', 'DELETE', 'TRUNCATE', 'ALTER', 'CREATE TABLE', 'INSERT', 'UPDATE']
  for (const op of forbidden) {
    if (upperSQL.includes(op)) {
      console.log(`❌ [ClickHouse SQL Validation] Forbidden operation: ${op}`)
      return false
    }
  }

  return true
}
