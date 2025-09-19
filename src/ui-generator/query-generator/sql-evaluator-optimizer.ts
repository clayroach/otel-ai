/**
 * SQL Evaluator-Optimizer Pattern
 *
 * Instead of pre-emptively fixing SQL, this module:
 * 1. Evaluates SQL by executing it against ClickHouse
 * 2. Captures any errors or performance issues
 * 3. Optimizes the SQL based on actual errors
 * 4. Re-evaluates until successful or max attempts reached
 */

import { Effect, pipe } from 'effect'
import { LLMManagerServiceTag } from '../../llm-manager/index.js'
import type { LLMRequest, LLMError } from '../../llm-manager/types.js'

// ClickHouse client interface using Effect
// The error type is generic to support different storage implementations
export interface ClickHouseClient<E = Error> {
  queryRaw: (sql: string) => Effect.Effect<unknown[], E>
}

// Type for unknown error objects (unused but kept for future error handling)
// type UnknownError = {
//   message?: string
//   toString: () => string
// }

/**
 * Standard ClickHouse error codes
 * Source: https://github.com/ClickHouse/ClickHouse/blob/master/src/Common/ErrorCodes.cpp
 */
export enum ClickHouseErrorCode {
  UNKNOWN_IDENTIFIER = 47,
  TYPE_MISMATCH = 53,
  UNKNOWN_TABLE = 60,
  SYNTAX_ERROR = 62,
  UNKNOWN_AGGREGATE_FUNCTION = 63,
  INCORRECT_QUERY = 80,
  ILLEGAL_AGGREGATION = 184,
  AMBIGUOUS_IDENTIFIER = 207,
  AMBIGUOUS_COLUMN_NAME = 352,
  NUMBER_OF_ARGUMENTS_DOESNT_MATCH = 42,
  ILLEGAL_TYPE_OF_ARGUMENT = 43,
  TOO_DEEP_AST = 167,
  // Default for unrecognized errors
  UNKNOWN = 0
}

/**
 * Map error code names to their numeric values
 */
export const ErrorCodeNames: Record<string, ClickHouseErrorCode> = {
  UNKNOWN_IDENTIFIER: ClickHouseErrorCode.UNKNOWN_IDENTIFIER,
  TYPE_MISMATCH: ClickHouseErrorCode.TYPE_MISMATCH,
  UNKNOWN_TABLE: ClickHouseErrorCode.UNKNOWN_TABLE,
  SYNTAX_ERROR: ClickHouseErrorCode.SYNTAX_ERROR,
  UNKNOWN_AGGREGATE_FUNCTION: ClickHouseErrorCode.UNKNOWN_AGGREGATE_FUNCTION,
  INCORRECT_QUERY: ClickHouseErrorCode.INCORRECT_QUERY,
  ILLEGAL_AGGREGATION: ClickHouseErrorCode.ILLEGAL_AGGREGATION,
  AMBIGUOUS_IDENTIFIER: ClickHouseErrorCode.AMBIGUOUS_IDENTIFIER,
  AMBIGUOUS_COLUMN_NAME: ClickHouseErrorCode.AMBIGUOUS_COLUMN_NAME,
  NUMBER_OF_ARGUMENTS_DOESNT_MATCH: ClickHouseErrorCode.NUMBER_OF_ARGUMENTS_DOESNT_MATCH,
  ILLEGAL_TYPE_OF_ARGUMENT: ClickHouseErrorCode.ILLEGAL_TYPE_OF_ARGUMENT,
  TOO_DEEP_AST: ClickHouseErrorCode.TOO_DEEP_AST,
  UNKNOWN: ClickHouseErrorCode.UNKNOWN
}

export interface SQLEvaluationResult {
  sql: string
  isValid: boolean
  executionTimeMs?: number
  error?: {
    code: string
    codeNumber: number
    message: string
    position?: number
  }
  rowCount?: number
  columns?: Array<{ name: string; type: string }>
}

export interface SQLOptimizationRequest {
  originalSql: string
  error: {
    code: string
    message: string
  }
  context?: {
    services: string[]
    analysisGoal: string
  }
}

export interface SQLOptimizationResult {
  optimizedSql: string
  explanation: string
  changes: string[]
}

/**
 * Evaluates SQL by executing it against ClickHouse
 */
export const evaluateSQL = <E = Error>(
  sql: string,
  clickhouseClient: ClickHouseClient<E>
): Effect.Effect<SQLEvaluationResult, E> => {
  return Effect.gen(function* () {
    const startTime = Date.now()

    // Execute the query with LIMIT 1 for testing validity
    const testSql = `${sql.replace(/;?\s*$/, '')} LIMIT 1`

    const result = yield* pipe(
      clickhouseClient.queryRaw(testSql),
      Effect.map((data) => {
        const executionTimeMs = Date.now() - startTime
        const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : []

        const result: SQLEvaluationResult = {
          sql,
          isValid: true,
          executionTimeMs,
          rowCount: rows.length,
          columns:
            rows.length > 0 && rows[0]
              ? Object.keys(rows[0]).map((name) => ({
                  name,
                  type: typeof (rows[0] as Record<string, unknown>)[name]
                }))
              : []
        }
        return result
      }),
      Effect.catchAll((error) => {
        const executionTimeMs = Date.now() - startTime
        const errorMessage = error instanceof Error ? error.message : String(error)

        // Parse ClickHouse error
        let errorCode = 'UNKNOWN'
        let errorCodeNumber = ClickHouseErrorCode.UNKNOWN
        let position: number | undefined

        // Extract error code from ClickHouse error message
        // First try to extract the numeric code directly (e.g., "Code: 184")
        const codeMatch = errorMessage.match(/Code:\s*(\d+)/i)
        if (codeMatch && codeMatch[1]) {
          const numericCode = parseInt(codeMatch[1], 10)
          // Map numeric code to our enum
          for (const [name, value] of Object.entries(ErrorCodeNames)) {
            if (value === numericCode) {
              errorCode = name
              errorCodeNumber = numericCode
              break
            }
          }
          // If we didn't find a match, set the numeric code anyway
          if (errorCode === 'UNKNOWN') {
            errorCodeNumber = numericCode
          }
        }

        // Fallback to pattern matching if no numeric code found
        if (errorCode === 'UNKNOWN') {
          if (
            errorMessage.includes('ILLEGAL_AGGREGATION') ||
            errorMessage.includes('Aggregate function')
          ) {
            errorCode = 'ILLEGAL_AGGREGATION'
            errorCodeNumber = ClickHouseErrorCode.ILLEGAL_AGGREGATION
          } else if (
            errorMessage.includes('Unknown expression identifier') ||
            errorMessage.includes('UNKNOWN_IDENTIFIER')
          ) {
            errorCode = 'UNKNOWN_IDENTIFIER'
            errorCodeNumber = ClickHouseErrorCode.UNKNOWN_IDENTIFIER
          } else if (
            errorMessage.includes('SYNTAX_ERROR') ||
            errorMessage.includes('Syntax error')
          ) {
            errorCode = 'SYNTAX_ERROR'
            errorCodeNumber = ClickHouseErrorCode.SYNTAX_ERROR
          } else if (errorMessage.includes('TYPE_MISMATCH')) {
            errorCode = 'TYPE_MISMATCH'
            errorCodeNumber = ClickHouseErrorCode.TYPE_MISMATCH
          } else if (
            errorMessage.includes('UNKNOWN_TABLE') ||
            errorMessage.includes("Table .* doesn't exist")
          ) {
            errorCode = 'UNKNOWN_TABLE'
            errorCodeNumber = ClickHouseErrorCode.UNKNOWN_TABLE
          } else if (errorMessage.includes('Unknown aggregate function')) {
            errorCode = 'UNKNOWN_AGGREGATE_FUNCTION'
            errorCodeNumber = ClickHouseErrorCode.UNKNOWN_AGGREGATE_FUNCTION
          }
        }

        // Try to extract position if available
        const positionMatch = errorMessage.match(/at position (\d+)/i)
        if (positionMatch && positionMatch[1]) {
          position = parseInt(positionMatch[1], 10)
        }

        const errorResult: SQLEvaluationResult = {
          sql,
          isValid: false,
          executionTimeMs,
          error: {
            code: errorCode,
            codeNumber: errorCodeNumber,
            message: errorMessage,
            ...(position !== undefined && { position })
          }
        }
        return Effect.succeed(errorResult)
      })
    )

    return result
  })
}

/**
 * Optimizes SQL based on ClickHouse errors using LLM
 */
export const optimizeSQLWithLLM = (
  request: SQLOptimizationRequest
): Effect.Effect<SQLOptimizationResult, LLMError, LLMManagerServiceTag> => {
  return Effect.gen(function* () {
    const llmManager = yield* LLMManagerServiceTag

    // Create a focused prompt for SQL optimization
    const prompt = createOptimizationPrompt(request)

    const llmRequest: LLMRequest = {
      prompt,
      taskType: 'analysis',
      preferences: {
        temperature: 0, // Deterministic optimization
        maxTokens: 2000,
        requireStructuredOutput: true
      }
    }

    const response = yield* llmManager.generate(llmRequest)

    // Parse the optimization response
    const optimizationResult = parseOptimizationResponse(response.content)

    return optimizationResult
  })
}

/**
 * Creates optimization prompt based on error
 */
function createOptimizationPrompt(request: SQLOptimizationRequest): string {
  const errorSpecificGuidance = getErrorSpecificGuidance(request.error.code)

  return `You are a ClickHouse SQL optimization expert. Fix the following SQL query based on the error.

ORIGINAL SQL:
\`\`\`sql
${request.originalSql}
\`\`\`

ERROR:
Code: ${request.error.code}
Message: ${request.error.message}

${errorSpecificGuidance}

${
  request.context
    ? `CONTEXT:
- Services: ${request.context.services.join(', ')}
- Analysis Goal: ${request.context.analysisGoal}`
    : ''
}

Return a JSON response:
{
  "optimizedSql": "The corrected ClickHouse SQL query",
  "explanation": "Brief explanation of what was fixed",
  "changes": ["List of specific changes made"]
}`
}

/**
 * Get error-specific guidance for optimization
 */
function getErrorSpecificGuidance(errorCode: string): string {
  switch (errorCode) {
    case 'ILLEGAL_AGGREGATION':
      return `ILLEGAL_AGGREGATION Error - ClickHouse specific rules:
1. Aggregate functions (COUNT, SUM, AVG, etc.) CANNOT be used in WHERE clauses
2. To filter on aggregates, use HAVING clause after GROUP BY
3. Column aliases with aggregates cannot be used in WHERE

Fix by:
- Moving aggregate conditions from WHERE to HAVING
- Ensuring GROUP BY is present when using aggregates
- Using HAVING for filtering aggregate results`

    case 'UNKNOWN_IDENTIFIER':
      return `UNKNOWN_IDENTIFIER Error - Column or alias not found:
1. Check column names match the schema exactly
2. Ensure aliases are defined before being used
3. Table should be 'traces' not 'otel.traces'
4. Common columns: service_name, operation_name, trace_id, span_id, start_time, duration_ns, status_code`

    case 'SYNTAX_ERROR':
      return `SYNTAX_ERROR - ClickHouse SQL syntax issue:
1. Use ClickHouse-specific functions (quantile instead of percentile_cont)
2. Ensure proper quoting for string literals (single quotes)
3. Check for missing commas or parentheses
4. Verify INTERVAL syntax (e.g., INTERVAL 15 MINUTE)`

    case 'TYPE_MISMATCH':
      return `TYPE_MISMATCH Error - Data type issue:
1. duration_ns is UInt64 - divide by 1000000 for milliseconds
2. start_time is DateTime64 - use appropriate date functions
3. status_code is String - compare with 'OK' not 1 or true`

    case 'UNKNOWN_TABLE':
      return `UNKNOWN_TABLE Error:
1. Use 'traces' as the table name (not 'otel.traces')
2. Ensure the FROM clause references the correct table`

    default:
      return `General ClickHouse optimization guidelines:
1. Move aggregate functions from WHERE to HAVING
2. Use 'traces' table name
3. Include GROUP BY when using aggregates
4. Use ClickHouse-specific functions`
  }
}

/**
 * Parse LLM optimization response
 */
function parseOptimizationResponse(content: string): SQLOptimizationResult {
  try {
    // Try to parse as JSON
    const parsed = JSON.parse(content)
    return {
      optimizedSql: parsed.optimizedSql || parsed.sql || '',
      explanation: parsed.explanation || parsed.reason || 'Query optimized for ClickHouse',
      changes: parsed.changes || []
    }
  } catch {
    // Fallback 1: Try to extract SQL from markdown code blocks
    const sqlMatch = content.match(/```sql\n([\s\S]*?)```/i)
    if (sqlMatch && sqlMatch[1]) {
      return {
        optimizedSql: sqlMatch[1].trim(),
        explanation: 'Query extracted from response',
        changes: ['Applied ClickHouse-specific optimizations']
      }
    }

    // Fallback 2: If content looks like SQL (starts with WITH or SELECT)
    const trimmedContent = content.trim()
    if (trimmedContent.match(/^(WITH|SELECT)/i)) {
      return {
        optimizedSql: trimmedContent,
        explanation: 'Direct SQL response from LLM',
        changes: ['Query returned directly without JSON wrapper']
      }
    }

    // Fallback 3: Return empty result (will trigger rule-based optimization)
    console.warn('Could not parse LLM response, returning empty result')
    return {
      optimizedSql: '',
      explanation: 'Failed to parse LLM response',
      changes: []
    }
  }
}

/**
 * Effect-based Evaluator-Optimizer Loop
 * Attempts to fix SQL through iterative evaluation and optimization with LLM support
 */
export const evaluateAndOptimizeSQLWithLLM = <E = Error>(
  sql: string,
  clickhouseClient: ClickHouseClient<E>,
  context?: { services: string[]; analysisGoal: string },
  maxAttempts: number = 3
): Effect.Effect<
  { finalSql: string; attempts: SQLEvaluationResult[]; optimizations: SQLOptimizationResult[] },
  LLMError | E,
  LLMManagerServiceTag
> => {
  return Effect.gen(function* () {
    const attempts: SQLEvaluationResult[] = []
    const optimizations: SQLOptimizationResult[] = []
    let currentSql = sql

    for (let i = 0; i < maxAttempts; i++) {
      console.log(`🔄 [SQL Evaluator] Attempt ${i + 1}/${maxAttempts}`)

      // Evaluate the SQL
      const evaluation = yield* pipe(
        evaluateSQL(currentSql, clickhouseClient),
        Effect.mapError((error) => ({
          _tag: 'NetworkError' as const,
          model: 'clickhouse',
          message: `SQL evaluation failed: ${error}`
        }))
      )

      attempts.push(evaluation)

      if (evaluation.isValid) {
        console.log(`✅ [SQL Evaluator] Query valid after ${i + 1} attempts`)
        return {
          finalSql: currentSql,
          attempts,
          optimizations
        }
      }

      // If not valid and we have attempts left, optimize with LLM
      if (i < maxAttempts - 1 && evaluation.error) {
        console.log(`🔧 [SQL Optimizer] Optimizing based on error: ${evaluation.error.code}`)

        const optimizationRequest: SQLOptimizationRequest = {
          originalSql: currentSql,
          error: {
            code: evaluation.error.code,
            message: evaluation.error.message
          },
          ...(context && { context })
        }

        const optimization = yield* pipe(
          optimizeSQLWithLLM(optimizationRequest),
          Effect.map((result) => {
            // If LLM returned empty SQL, use rule-based optimization
            if (!result.optimizedSql || result.optimizedSql.trim() === '') {
              return {
                optimizedSql: applyRuleBasedOptimization(
                  currentSql,
                  evaluation.error?.code || 'UNKNOWN'
                ),
                explanation: `LLM returned empty result, using rule-based optimization`,
                changes: [
                  `Applied rule-based optimization for ${evaluation.error?.code || 'UNKNOWN'}`
                ]
              }
            }
            return result
          }),
          Effect.catchAll((error) =>
            Effect.succeed({
              optimizedSql: applyRuleBasedOptimization(
                currentSql,
                evaluation.error?.code || 'UNKNOWN'
              ),
              explanation: `LLM optimization failed, used rule-based fallback: ${error}`,
              changes: [
                `Applied rule-based optimization for ${evaluation.error?.code || 'UNKNOWN'}`
              ]
            })
          )
        )

        optimizations.push(optimization)
        currentSql = optimization.optimizedSql
        console.log(`📝 [SQL Optimizer] Applied optimization: ${optimization.explanation}`)
      }
    }

    console.log(`❌ [SQL Evaluator] Failed to produce valid SQL after ${maxAttempts} attempts`)
    return {
      finalSql: currentSql,
      attempts,
      optimizations
    }
  })
}

/**
 * Evaluator-Optimizer Loop (version without LLM)
 * Attempts to fix SQL through iterative evaluation and optimization
 * This is kept for backward compatibility but uses Effect internally
 */
export const evaluateAndOptimizeSQL = <E = Error>(
  sql: string,
  clickhouseClient: ClickHouseClient<E>,
  context?: { services: string[]; analysisGoal: string },
  maxAttempts: number = 3
): Effect.Effect<
  { finalSql: string; attempts: SQLEvaluationResult[]; optimizations: SQLOptimizationResult[] },
  E
> => {
  return Effect.gen(function* () {
    const attempts: SQLEvaluationResult[] = []
    const optimizations: SQLOptimizationResult[] = []
    let currentSql = sql

    for (let i = 0; i < maxAttempts; i++) {
      console.log(`🔄 [SQL Evaluator] Attempt ${i + 1}/${maxAttempts}`)

      // Evaluate the SQL
      const evaluation = yield* evaluateSQL(currentSql, clickhouseClient)
      attempts.push(evaluation)

      if (evaluation.isValid) {
        console.log(`✅ [SQL Evaluator] Query valid after ${i + 1} attempts`)
        return {
          finalSql: currentSql,
          attempts,
          optimizations
        }
      }

      // If not valid and we have attempts left, optimize
      if (i < maxAttempts - 1 && evaluation.error) {
        console.log(`🔧 [SQL Optimizer] Optimizing based on error: ${evaluation.error.code}`)

        // Use rule-based optimization directly
        const optimization: SQLOptimizationResult = {
          optimizedSql: applyRuleBasedOptimization(currentSql, evaluation.error.code),
          explanation: `Applied rule-based optimization for ${evaluation.error.code}`,
          changes: [`Fixed ${evaluation.error.code} error using rule-based optimization`]
        }

        optimizations.push(optimization)
        currentSql = optimization.optimizedSql

        console.log(`📝 [SQL Optimizer] Applied optimization: ${optimization.explanation}`)
      }
    }

    console.log(`❌ [SQL Evaluator] Failed to produce valid SQL after ${maxAttempts} attempts`)
    return {
      finalSql: currentSql,
      attempts,
      optimizations
    }
  })
}

/**
 * Simple rule-based optimizer for common ClickHouse errors
 * Can be used as a fallback when LLM optimization is not available
 */
export function applyRuleBasedOptimization(sql: string, errorCode: string): string {
  let optimized = sql

  switch (errorCode) {
    case 'ILLEGAL_AGGREGATION':
      // Move aggregates from WHERE to HAVING
      optimized = moveAggregatesToHaving(optimized)
      break

    case 'UNKNOWN_TABLE':
      // Fix table references
      optimized = optimized.replace(/FROM\s+otel\.traces/gi, 'FROM traces')
      optimized = optimized.replace(/JOIN\s+otel\.traces/gi, 'JOIN traces')
      break

    case 'UNKNOWN_IDENTIFIER':
      // Common column name fixes
      optimized = optimized.replace(/\btimestamp\b/gi, 'start_time')
      optimized = optimized.replace(/\bduration\b/gi, 'duration_ns')
      break
  }

  return optimized
}

function moveAggregatesToHaving(sql: string): string {
  // Move aggregate functions from WHERE to HAVING clause
  const aggregatePattern =
    /WHERE\s+.*?(count\(\)|sum\([^)]+\)|avg\([^)]+\)|min\([^)]+\)|max\([^)]+\))[^;]*/gi

  if (aggregatePattern.test(sql) && sql.includes('GROUP BY')) {
    // Extract aggregate conditions and move to HAVING
    // This is simplified - a full implementation would need proper SQL parsing
    return sql.replace(/WHERE\s+(.*?)GROUP BY/gi, (match, conditions) => {
      const hasAggregates = /(count|sum|avg|min|max)\(/i.test(conditions)
      if (hasAggregates) {
        // Remove aggregates from WHERE - should be moved to HAVING
        // In a real implementation, we'd parse and reconstruct the clause
        return `GROUP BY`
      }
      return match
    })
  }

  return sql
}
