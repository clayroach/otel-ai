import { Effect, pipe, Duration } from 'effect'
import { CriticalPath, GeneratedQuery, QueryPattern } from './types.js'
import { type LLMRequest, LLMManagerServiceTag } from '../../llm-manager/index.js'
import { Schema } from '@effect/schema'
import {
  isSQLSpecificModel as checkSQLModel,
  extractResponseContent,
  needsResponseWrapping,
  getModelConfig
} from '../../llm-manager/model-registry.js'

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
  process.env.LLM_SQL_MODEL_1 || process.env.LLM_GENERAL_MODEL_1 || 'sqlcoder-7b-2' // Fallback if nothing configured

import {
  generateSQLModelPrompt,
  generateGeneralLLMPrompt,
  validateDiagnosticQuery,
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
  const diagnosticPrompt = generateGeneralLLMPrompt(path, analysisGoal, CORE_DIAGNOSTIC_REQUIREMENTS)
  
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

  const request: LLMRequest = {
    prompt: checkSQLModel(modelName)
      ? prompt
      : `You are a ClickHouse SQL expert. Always return valid JSON responses. Generate consistent, optimal queries based on the examples provided.\n\n${prompt}`,
    taskType: 'analysis',
    preferences: {
      model: modelName, // Use actual model name, not generic types
      maxTokens: modelConfig.maxTokens || 4000,
      temperature: modelName === llmConfig?.model ? 0 : (modelConfig.temperature ?? 0), // Use 0 for explicit model selection
      requireStructuredOutput: true
    }
  }

  // Use the LLM Manager Service Layer (proper Effect-TS pattern)
  // This will reuse the singleton LLM Manager instead of creating a new one each time
  const generateEffect = Effect.gen(function* () {
    const llmManagerService = yield* LLMManagerServiceTag
    return yield* llmManagerService.generate(request)
  })

  return pipe(
    generateEffect,
    Effect.timeout(Duration.seconds(30)), // 30s timeout for all LLM requests
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

        // Check if this is a SQL-specific model that needs wrapping
        const needsWrapping = needsResponseWrapping(modelName, 'sql')

        let parsed: LLMQueryResponse & { insights?: string }

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
            // First check if content still has markdown blocks after extraction
            let jsonContent = extractedContent
            if (jsonContent.startsWith('```json')) {
              jsonContent = jsonContent.substring(7).replace(/```$/, '').trim()
            } else if (jsonContent.startsWith('```')) {
              jsonContent = jsonContent.substring(3).replace(/```$/, '').trim()
            }

            parsed = JSON.parse(jsonContent) as LLMQueryResponse & { insights?: string }
          } catch (e) {
            // If JSON parse fails and it looks like SQL, wrap it
            if (
              extractedContent.toUpperCase().includes('SELECT') ||
              extractedContent.toUpperCase().includes('FROM')
            ) {
              console.log('   INFO: Model returned raw SQL, wrapping in JSON structure')
              parsed = {
                sql: extractedContent,
                description: `Query for ${analysisGoal}`,
                expectedColumns: [],
                reasoning: 'Direct SQL generation'
              }
            } else {
              throw new Error(`Invalid response format: ${extractedContent.substring(0, 100)}`)
            }
          }
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

        // Convert to GeneratedQuery format
        const query: GeneratedQuery = {
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
          )
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
export const validateGeneratedSQL = (sql: string): boolean => {
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
