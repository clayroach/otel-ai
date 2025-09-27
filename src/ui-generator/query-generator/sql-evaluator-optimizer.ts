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
import { NetworkError } from '../../llm-manager/types.js'

// ClickHouse client interface using Effect
// The error type is generic to support different storage implementations
export interface ClickHouseClient<E = Error> {
  queryRaw: (sql: string) => Effect.Effect<unknown[], E>
  queryText: (sql: string) => Effect.Effect<string, E>
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
  // Parsing and Syntax Errors
  CANNOT_PARSE_TEXT = 6,
  SYNTAX_ERROR = 62,
  INCORRECT_QUERY = 80,
  UNEXPECTED_EXPRESSION = 183,
  TOO_DEEP_AST = 167,

  // Column and Table Errors
  THERE_IS_NO_COLUMN = 8,
  NO_SUCH_COLUMN_IN_TABLE = 16,
  UNKNOWN_IDENTIFIER = 47,
  UNKNOWN_TABLE = 60,
  AMBIGUOUS_IDENTIFIER = 207,
  AMBIGUOUS_COLUMN_NAME = 352,
  COLUMN_QUERIED_MORE_THAN_ONCE = 52,
  EMPTY_LIST_OF_COLUMNS_QUERIED = 51,
  INCORRECT_NUMBER_OF_COLUMNS = 7,

  // Type and Argument Errors
  TYPE_MISMATCH = 53,
  ILLEGAL_TYPE_OF_ARGUMENT = 43,
  CANNOT_CONVERT_TYPE = 70,
  INCOMPATIBLE_COLUMNS = 122,
  NUMBER_OF_ARGUMENTS_DOESNT_MATCH = 42,

  // Aggregate Function Errors
  UNKNOWN_AGGREGATE_FUNCTION = 63,
  AGGREGATE_FUNCTION_DOESNT_ALLOW_PARAMETERS = 133,
  PARAMETERS_TO_AGGREGATE_FUNCTIONS_MUST_BE_LITERALS = 134,
  ILLEGAL_AGGREGATION = 184,
  NOT_AN_AGGREGATE = 215, // Column not under aggregate function and not in GROUP BY

  // Default for unrecognized errors
  UNKNOWN = 0
}

/**
 * Map error code names to their numeric values
 */
export const ErrorCodeNames: Record<string, ClickHouseErrorCode> = {
  // Parsing and Syntax
  CANNOT_PARSE_TEXT: ClickHouseErrorCode.CANNOT_PARSE_TEXT,
  SYNTAX_ERROR: ClickHouseErrorCode.SYNTAX_ERROR,
  INCORRECT_QUERY: ClickHouseErrorCode.INCORRECT_QUERY,
  UNEXPECTED_EXPRESSION: ClickHouseErrorCode.UNEXPECTED_EXPRESSION,
  TOO_DEEP_AST: ClickHouseErrorCode.TOO_DEEP_AST,

  // Columns and Tables
  THERE_IS_NO_COLUMN: ClickHouseErrorCode.THERE_IS_NO_COLUMN,
  NO_SUCH_COLUMN_IN_TABLE: ClickHouseErrorCode.NO_SUCH_COLUMN_IN_TABLE,
  UNKNOWN_IDENTIFIER: ClickHouseErrorCode.UNKNOWN_IDENTIFIER,
  UNKNOWN_TABLE: ClickHouseErrorCode.UNKNOWN_TABLE,
  AMBIGUOUS_IDENTIFIER: ClickHouseErrorCode.AMBIGUOUS_IDENTIFIER,
  AMBIGUOUS_COLUMN_NAME: ClickHouseErrorCode.AMBIGUOUS_COLUMN_NAME,
  COLUMN_QUERIED_MORE_THAN_ONCE: ClickHouseErrorCode.COLUMN_QUERIED_MORE_THAN_ONCE,
  EMPTY_LIST_OF_COLUMNS_QUERIED: ClickHouseErrorCode.EMPTY_LIST_OF_COLUMNS_QUERIED,
  INCORRECT_NUMBER_OF_COLUMNS: ClickHouseErrorCode.INCORRECT_NUMBER_OF_COLUMNS,

  // Types and Arguments
  TYPE_MISMATCH: ClickHouseErrorCode.TYPE_MISMATCH,
  ILLEGAL_TYPE_OF_ARGUMENT: ClickHouseErrorCode.ILLEGAL_TYPE_OF_ARGUMENT,
  CANNOT_CONVERT_TYPE: ClickHouseErrorCode.CANNOT_CONVERT_TYPE,
  INCOMPATIBLE_COLUMNS: ClickHouseErrorCode.INCOMPATIBLE_COLUMNS,
  NUMBER_OF_ARGUMENTS_DOESNT_MATCH: ClickHouseErrorCode.NUMBER_OF_ARGUMENTS_DOESNT_MATCH,

  // Aggregates
  UNKNOWN_AGGREGATE_FUNCTION: ClickHouseErrorCode.UNKNOWN_AGGREGATE_FUNCTION,
  AGGREGATE_FUNCTION_DOESNT_ALLOW_PARAMETERS:
    ClickHouseErrorCode.AGGREGATE_FUNCTION_DOESNT_ALLOW_PARAMETERS,
  PARAMETERS_TO_AGGREGATE_FUNCTIONS_MUST_BE_LITERALS:
    ClickHouseErrorCode.PARAMETERS_TO_AGGREGATE_FUNCTIONS_MUST_BE_LITERALS,
  ILLEGAL_AGGREGATION: ClickHouseErrorCode.ILLEGAL_AGGREGATION,
  NOT_AN_AGGREGATE: ClickHouseErrorCode.NOT_AN_AGGREGATE,

  // Default
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
 * Validates SQL syntax using EXPLAIN AST without executing the query
 * This is a lightweight way to check if the query is syntactically correct
 */
export const validateSQLSyntax = <E = Error>(
  sql: string,
  clickhouseClient: ClickHouseClient<E>
): Effect.Effect<SQLEvaluationResult, E> => {
  console.log(`🔧 [SQL-VALIDATOR] validateSQLSyntax called with SQL length: ${sql.length}`)
  console.log(`🔧 [SQL-VALIDATOR] validateSQLSyntax SQL preview: ${sql.substring(0, 100)}...`)

  return Effect.gen(function* () {
    const startTime = Date.now()

    // Use EXPLAIN AST to validate syntax without execution
    const explainQuery = `EXPLAIN AST ${sql.replace(/;?\s*$/, '')}`

    console.log('🔍 [SQL-VALIDATOR] validateSQLSyntax executing EXPLAIN AST query')
    console.log(
      '🔍 [SQL-VALIDATOR] validateSQLSyntax EXPLAIN query:',
      explainQuery.substring(0, 150) + '...'
    )

    const result = yield* pipe(
      clickhouseClient.queryText(explainQuery),
      Effect.map((_astText) => {
        const executionTimeMs = Date.now() - startTime

        console.log('✅ [SQL-VALIDATOR] validateSQLSyntax syntax is VALID - no errors found')
        console.log('✅ [SQL-VALIDATOR] AST returned successfully, query is syntactically correct')

        const result: SQLEvaluationResult = {
          sql,
          isValid: true,
          executionTimeMs,
          // No row data since we only validated syntax
          rowCount: 0,
          columns: []
        }
        return result
      }),
      Effect.catchAll((error) => {
        const executionTimeMs = Date.now() - startTime
        const errorMessage = error instanceof Error ? error.message : String(error)

        console.log('❌ [SQL-VALIDATOR] validateSQLSyntax syntax validation FAILED:', errorMessage)
        console.log(
          '❌ [SQL-VALIDATOR] validateSQLSyntax this error should trigger optimization attempts'
        )

        // Parse ClickHouse error
        let errorCode = 'SYNTAX_ERROR'
        let errorCodeNumber = ClickHouseErrorCode.SYNTAX_ERROR
        let position: number | undefined

        // Extract error code from ClickHouse error message
        const codeMatch = errorMessage.match(/Code:\s*(\d+)/i)
        if (codeMatch && codeMatch[1]) {
          const numericCode = parseInt(codeMatch[1], 10)
          errorCodeNumber = numericCode

          // Map numeric code to our enum
          for (const [name, value] of Object.entries(ErrorCodeNames)) {
            if (value === numericCode) {
              errorCode = name
              break
            }
          }
        }

        // Try to extract position if available
        const positionMatch = errorMessage.match(/at position (\d+)|position (\d+)/i)
        if (positionMatch) {
          const matchedValue = positionMatch[1] || positionMatch[2]
          if (matchedValue) {
            position = parseInt(matchedValue, 10)
          }
        }

        // Also check for line/col information
        const lineColMatch = errorMessage.match(/\(line (\d+), col (\d+)\)/i)
        let lineInfo = ''
        if (lineColMatch) {
          lineInfo = ` (line ${lineColMatch[1]}, col ${lineColMatch[2]})`
        }

        const result: SQLEvaluationResult = {
          sql,
          isValid: false,
          executionTimeMs,
          error: {
            code: errorCode,
            codeNumber: errorCodeNumber,
            message: errorMessage + lineInfo,
            ...(position !== undefined && { position })
          }
        }
        return Effect.succeed(result)
      })
    )

    return result
  })
}

/**
 * Validates SQL semantics using EXPLAIN PLAN to catch aggregation and semantic errors
 * without executing the query. This catches ILLEGAL_AGGREGATION, NOT_AN_AGGREGATE, etc.
 */
export const validateSQLSemantics = <E = Error>(
  sql: string,
  clickhouseClient: ClickHouseClient<E>
): Effect.Effect<SQLEvaluationResult, E> => {
  console.log(
    `🔧 [SQL-SEMANTIC-VALIDATOR] validateSQLSemantics called with SQL length: ${sql.length}`
  )
  console.log(
    `🔧 [SQL-SEMANTIC-VALIDATOR] validateSQLSemantics SQL preview: ${sql.substring(0, 100)}...`
  )

  return Effect.gen(function* () {
    const startTime = Date.now()

    // Use EXPLAIN PLAN to validate query semantics without execution
    const explainQuery = `EXPLAIN PLAN ${sql.replace(/;?\s*$/, '')}`

    console.log('🔍 [SQL-SEMANTIC-VALIDATOR] validateSQLSemantics executing EXPLAIN PLAN query')
    console.log(
      '🔍 [SQL-SEMANTIC-VALIDATOR] validateSQLSemantics EXPLAIN query:',
      explainQuery.substring(0, 150) + '...'
    )

    const result = yield* pipe(
      clickhouseClient.queryText(explainQuery),
      Effect.map((_planText) => {
        const executionTimeMs = Date.now() - startTime

        console.log(
          '✅ [SQL-SEMANTIC-VALIDATOR] validateSQLSemantics semantics are VALID - no errors found'
        )
        console.log(
          '✅ [SQL-SEMANTIC-VALIDATOR] EXPLAIN PLAN returned successfully, query is semantically correct'
        )

        const result: SQLEvaluationResult = {
          sql,
          isValid: true,
          executionTimeMs,
          // No row data since we only validated semantics
          rowCount: 0,
          columns: []
        }
        return result
      }),
      Effect.catchAll((error) => {
        const executionTimeMs = Date.now() - startTime
        const errorMessage = error instanceof Error ? error.message : String(error)

        console.log(
          '❌ [SQL-SEMANTIC-VALIDATOR] validateSQLSemantics semantic validation FAILED:',
          errorMessage
        )
        console.log(
          '❌ [SQL-SEMANTIC-VALIDATOR] validateSQLSemantics this error should trigger optimization attempts'
        )

        // Parse ClickHouse error - enhanced for semantic errors
        let errorCode = 'SEMANTIC_ERROR'
        let errorCodeNumber = ClickHouseErrorCode.UNKNOWN
        let position: number | undefined

        // Extract error code from ClickHouse error message
        const codeMatch = errorMessage.match(/Code:\s*(\d+)/i)
        if (codeMatch && codeMatch[1]) {
          const numericCode = parseInt(codeMatch[1], 10)
          errorCodeNumber = numericCode

          // Map numeric code to our enum
          for (const [name, value] of Object.entries(ErrorCodeNames)) {
            if (value === numericCode) {
              errorCode = name
              break
            }
          }
        }

        // Enhanced pattern matching for semantic errors
        if (errorCode === 'SEMANTIC_ERROR' || errorCode === 'UNKNOWN') {
          if (
            errorMessage.includes('ILLEGAL_AGGREGATION') ||
            errorMessage.includes('Aggregate function') ||
            errorMessage.includes('nested aggregate functions')
          ) {
            errorCode = 'ILLEGAL_AGGREGATION'
            errorCodeNumber = ClickHouseErrorCode.ILLEGAL_AGGREGATION
          } else if (
            errorMessage.includes('NOT_AN_AGGREGATE') ||
            errorMessage.includes('not under aggregate function and not in GROUP BY')
          ) {
            errorCode = 'NOT_AN_AGGREGATE'
            errorCodeNumber = ClickHouseErrorCode.NOT_AN_AGGREGATE
          } else if (
            errorMessage.includes('Unknown expression identifier') ||
            errorMessage.includes('UNKNOWN_IDENTIFIER')
          ) {
            errorCode = 'UNKNOWN_IDENTIFIER'
            errorCodeNumber = ClickHouseErrorCode.UNKNOWN_IDENTIFIER
          } else if (
            errorMessage.includes('TYPE_MISMATCH') ||
            errorMessage.includes('Cannot convert type')
          ) {
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

        // Extract line information if available
        const lineMatch = errorMessage.match(/at line (\d+)/i)
        let lineInfo = ''
        if (lineMatch && lineMatch[1]) {
          lineInfo = ` at line ${lineMatch[1]}`
        }

        const result: SQLEvaluationResult = {
          sql,
          isValid: false,
          executionTimeMs,
          error: {
            code: errorCode,
            codeNumber: errorCodeNumber,
            message: errorMessage + lineInfo,
            ...(position !== undefined && { position })
          }
        }
        return Effect.succeed(result)
      })
    )

    return result
  })
}

/**
 * Evaluates SQL by executing it against ClickHouse (Stage 3: Execution Test)
 */
export const evaluateSQLExecution = <E = Error>(
  sql: string,
  clickhouseClient: ClickHouseClient<E>
): Effect.Effect<SQLEvaluationResult, E> => {
  return Effect.gen(function* () {
    const startTime = Date.now()

    // Smart handling of LIMIT and FORMAT clauses
    let testSql = sql.replace(/;?\s*$/, '') // Remove trailing semicolon

    // Check if the query already has FORMAT clause
    const formatMatch = testSql.match(/\s+(FORMAT\s+\w+)$/i)
    let formatClause = ''
    if (formatMatch) {
      formatClause = formatMatch[1] || ''
      // Remove FORMAT clause temporarily
      testSql = testSql.substring(0, testSql.length - formatMatch[0].length)
    }

    // Check if the query already has a LIMIT clause
    const hasLimit = /\bLIMIT\s+\d+/i.test(testSql)

    // Add LIMIT 1 only if there isn't already a LIMIT
    if (!hasLimit) {
      testSql = `${testSql} LIMIT 1`
    }

    // Re-add FORMAT clause after LIMIT if it existed
    if (formatClause) {
      testSql = `${testSql} ${formatClause}`
    }

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
            errorMessage.includes('NOT_AN_AGGREGATE') ||
            errorMessage.includes('not under aggregate function and not in GROUP BY')
          ) {
            errorCode = 'NOT_AN_AGGREGATE'
            errorCodeNumber = ClickHouseErrorCode.NOT_AN_AGGREGATE
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
4. CANNOT use aggregates INSIDE other aggregates (e.g., sum(column * count()) is illegal)
5. CANNOT multiply by aggregate aliases in aggregate functions

Common illegal patterns:
- sum(duration_ns/1000000 * request_count) where request_count is count()
- sum(column * count())
- avg(field * aggregated_alias)

Fix by:
- Moving aggregate conditions from WHERE to HAVING
- Ensuring GROUP BY is present when using aggregates
- Using HAVING for filtering aggregate results
- Removing multiplication by aggregate functions: sum(col * count()) → sum(col)
- Using separate calculations for totals instead of nested aggregates`

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

    case 'NOT_AN_AGGREGATE':
      return `NOT_AN_AGGREGATE Error (Code 215) - Column not under aggregate function and not in GROUP BY:
1. When using GROUP BY, all columns in SELECT must either be:
   - In the GROUP BY clause, OR
   - Used inside an aggregate function (COUNT, SUM, AVG, MIN, MAX, etc.)
2. Common mistake: count() * column_name should be sum(column_name)
3. If you need the raw column value multiplied by count, wrap it in an aggregate

The specific error in your query:
- count() * (duration_ns/1000000) is invalid
- Should be: sum(duration_ns/1000000) to get total duration
- Or: count() * avg(duration_ns/1000000) to get count multiplied by average

Fix by:
- Changing count() * (duration_ns/1000000) to sum(duration_ns/1000000)
- Or wrapping the column in an appropriate aggregate function`

    case 'THERE_IS_NO_COLUMN':
    case 'NO_SUCH_COLUMN_IN_TABLE':
      return `Column does not exist error:
1. Check exact column names in the traces table
2. Common columns: trace_id, span_id, parent_span_id, service_name, operation_name, start_time, end_time, duration_ns, status_code
3. Use correct case sensitivity (ClickHouse is case-sensitive)`

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
  console.log(
    `🔧 [SQL-VALIDATOR] evaluateAndOptimizeSQLWithLLM called with SQL length: ${sql.length}`
  )
  console.log(`🔧 [SQL-VALIDATOR] evaluateAndOptimizeSQLWithLLM parameters:`, {
    context,
    maxAttempts
  })
  console.log(
    `🔧 [SQL-VALIDATOR] evaluateAndOptimizeSQLWithLLM SQL preview: ${sql.substring(0, 100)}...`
  )

  return Effect.gen(function* () {
    console.log(
      `🔧 [SQL-VALIDATOR] evaluateAndOptimizeSQLWithLLM Effect starting with ${maxAttempts} max attempts`
    )

    const attempts: SQLEvaluationResult[] = []
    const optimizations: SQLOptimizationResult[] = []
    let currentSql = sql

    for (let i = 0; i < maxAttempts; i++) {
      console.log(
        `🔄 [SQL-VALIDATOR] evaluateAndOptimizeSQLWithLLM Attempt ${i + 1}/${maxAttempts}`
      )
      console.log(
        `🔄 [SQL-VALIDATOR] evaluateAndOptimizeSQLWithLLM Current SQL: ${currentSql.substring(0, 100)}...`
      )

      // First validate syntax using EXPLAIN AST (lightweight, no data execution)
      console.log(`🔄 [SQL-VALIDATOR] evaluateAndOptimizeSQLWithLLM calling validateSQLSyntax`)
      const syntaxValidation = yield* pipe(
        validateSQLSyntax(currentSql, clickhouseClient),
        Effect.mapError(
          (error) =>
            new NetworkError({
              model: 'clickhouse',
              message: `Syntax validation failed: ${error}`
            })
        )
      )

      // If syntax is invalid, immediately try to fix it without executing
      if (!syntaxValidation.isValid) {
        console.log(`❌ [SQL Evaluator] Syntax invalid: ${syntaxValidation.error?.message}`)
        attempts.push(syntaxValidation)

        // If we have attempts left, optimize with LLM
        if (i < maxAttempts - 1 && syntaxValidation.error) {
          console.log(`🔧 [SQL Optimizer] Fixing syntax error: ${syntaxValidation.error.code}`)

          const optimizationRequest: SQLOptimizationRequest = {
            originalSql: currentSql,
            error: {
              code: syntaxValidation.error.code,
              message: syntaxValidation.error.message
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
                    syntaxValidation.error?.code || 'UNKNOWN'
                  ),
                  explanation: `LLM returned empty result, using rule-based optimization`,
                  changes: [
                    `Applied rule-based optimization for ${syntaxValidation.error?.code || 'UNKNOWN'}`
                  ]
                }
              }
              return result
            }),
            Effect.catchAll((_error) => {
              // If LLM optimization fails, use rule-based approach
              console.log('⚠️ [SQL Optimizer] LLM optimization failed, using rule-based approach')
              return Effect.succeed({
                optimizedSql: applyRuleBasedOptimization(
                  currentSql,
                  syntaxValidation.error?.code || 'UNKNOWN'
                ),
                explanation: 'LLM optimization failed, using rule-based optimization',
                changes: ['Applied rule-based optimization']
              })
            })
          )

          optimizations.push(optimization)
          currentSql = optimization.optimizedSql
          console.log(`🔄 [SQL Optimizer] Applied optimization: ${optimization.changes.join(', ')}`)
        }
        continue // Skip execution test since syntax is invalid
      }

      console.log('✅ [SQL Evaluator] Syntax is valid, now validating semantics with EXPLAIN PLAN')

      // If syntax is valid, validate semantics using EXPLAIN PLAN
      const semanticValidation = yield* pipe(
        validateSQLSemantics(currentSql, clickhouseClient),
        Effect.mapError(
          (error) =>
            new NetworkError({
              model: 'clickhouse',
              message: `Semantic validation failed: ${error}`
            })
        )
      )

      // If semantics are invalid, try to fix before execution
      if (!semanticValidation.isValid) {
        console.log(`❌ [SQL Evaluator] Semantics invalid: ${semanticValidation.error?.message}`)
        attempts.push(semanticValidation)

        // If we have attempts left, optimize with LLM
        if (i < maxAttempts - 1 && semanticValidation.error) {
          console.log(`🔧 [SQL Optimizer] Fixing semantic error: ${semanticValidation.error.code}`)

          const optimizationRequest: SQLOptimizationRequest = {
            originalSql: currentSql,
            error: {
              code: semanticValidation.error.code,
              message: semanticValidation.error.message
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
                    semanticValidation.error?.code || 'UNKNOWN'
                  ),
                  explanation: `LLM returned empty result, using rule-based optimization`,
                  changes: [
                    `Applied rule-based optimization for ${semanticValidation.error?.code || 'UNKNOWN'}`
                  ]
                }
              }
              return result
            }),
            Effect.catchAll((_error) => {
              // If LLM optimization fails, use rule-based approach
              console.log('⚠️ [SQL Optimizer] LLM optimization failed, using rule-based approach')
              return Effect.succeed({
                optimizedSql: applyRuleBasedOptimization(
                  currentSql,
                  semanticValidation.error?.code || 'UNKNOWN'
                ),
                explanation: 'LLM optimization failed, using rule-based optimization',
                changes: ['Applied rule-based optimization']
              })
            })
          )

          optimizations.push(optimization)
          currentSql = optimization.optimizedSql
          console.log(`🔄 [SQL Optimizer] Applied optimization: ${optimization.changes.join(', ')}`)
        }
        continue // Skip execution test since semantics are invalid
      }

      console.log(
        '✅ [SQL Evaluator] Syntax and semantics are valid, now testing execution with LIMIT 1'
      )

      // If syntax and semantics are valid, test execution with LIMIT 1
      const evaluation = yield* pipe(
        evaluateSQLExecution(currentSql, clickhouseClient),
        Effect.mapError(
          (error) =>
            new NetworkError({
              model: 'clickhouse',
              message: `SQL execution test failed: ${error}`
            })
        )
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

      // Log execution failure
      console.log(
        `❌ [SQL Evaluator] Execution test failed: ${evaluation.error?.code} - ${evaluation.error?.message}`
      )

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
    console.log(
      `❌ [SQL Evaluator] Final attempt error: ${attempts[attempts.length - 1]?.error?.code} - ${attempts[attempts.length - 1]?.error?.message}`
    )
    console.log(`📊 [SQL Evaluator] Optimization attempts made: ${optimizations.length}`)
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
  E,
  never
> => {
  return Effect.gen(function* () {
    const attempts: SQLEvaluationResult[] = []
    const optimizations: SQLOptimizationResult[] = []
    let currentSql = sql

    for (let i = 0; i < maxAttempts; i++) {
      console.log(`🔄 [SQL Evaluator] Attempt ${i + 1}/${maxAttempts}`)

      // Evaluate the SQL
      const evaluation = yield* evaluateSQLExecution(currentSql, clickhouseClient)
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
    console.log(
      `❌ [SQL Evaluator] Final attempt error: ${attempts[attempts.length - 1]?.error?.code} - ${attempts[attempts.length - 1]?.error?.message}`
    )
    console.log(`📊 [SQL Evaluator] Optimization attempts made: ${optimizations.length}`)
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
      // Fix nested aggregates (e.g., sum(column * count()) -> sum(column))
      optimized = fixNestedAggregates(optimized)
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

    case 'NOT_AN_AGGREGATE':
      // Fix columns not under aggregate function
      // Common pattern: count() * (duration_ns/1000000) -> sum(duration_ns/1000000)
      optimized = optimized.replace(/count\(\)\s*\*\s*\(([^)]+)\)/gi, 'sum($1)')
      // Also try to fix duration_ns specifically
      optimized = optimized.replace(/count\(\)\s*\*\s*duration_ns/gi, 'sum(duration_ns)')
      // Fix pattern with division: count() * (column/number)
      optimized = optimized.replace(/count\(\)\s*\*\s*\(([^/)]+)\/([^)]+)\)/gi, 'sum($1/$2)')
      // Fix any count() * column pattern
      optimized = optimized.replace(/count\(\)\s*\*\s*(\w+)/gi, 'sum($1)')
      break

    case 'THERE_IS_NO_COLUMN':
    case 'NO_SUCH_COLUMN_IN_TABLE':
      // Try to fix common column name mistakes
      optimized = optimized.replace(/\btimestamp\b/gi, 'start_time')
      optimized = optimized.replace(/\bend_timestamp\b/gi, 'end_time')
      optimized = optimized.replace(/\bduration\b/gi, 'duration_ns')
      optimized = optimized.replace(/\berror_code\b/gi, 'status_code')
      optimized = optimized.replace(/\berror_message\b/gi, 'status_message')
      break

    case 'SYNTAX_ERROR': {
      // Try to fix HAVING after ORDER BY
      const havingAfterOrderMatch = optimized.match(/ORDER\s+BY[^;]*?(HAVING\s+[^;]+)/i)
      if (havingAfterOrderMatch && havingAfterOrderMatch[1]) {
        const havingClause = havingAfterOrderMatch[1]
        // Remove HAVING from after ORDER BY and add it before ORDER BY
        optimized = optimized.replace(havingAfterOrderMatch[1], '')
        optimized = optimized.replace(/ORDER\s+BY/i, `${havingClause} ORDER BY`)
      }
      break
    }
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

function fixNestedAggregates(sql: string): string {
  // Fix the specific pattern: sum(column * count()) or sum(column/number * count())
  // This pattern creates illegal aggregation in ClickHouse

  // Pattern 1: sum(duration_ns/1000000 * request_count) where request_count is count()
  // Replace with: sum(duration_ns/1000000) (removes the multiplication by count)
  sql = sql.replace(/sum\(([^*]+)\s*\*\s*request_count\)/gi, 'sum($1)')

  // Pattern 2: sum(column * count()) - generic pattern
  sql = sql.replace(/sum\(([^*]+)\s*\*\s*count\(\)\)/gi, 'sum($1)')

  // Pattern 3: sum(count() * column) - reversed pattern
  sql = sql.replace(/sum\(count\(\)\s*\*\s*([^)]+)\)/gi, 'sum($1)')

  // Pattern 4: avg(column * count()) -> avg(column)
  sql = sql.replace(/avg\(([^*]+)\s*\*\s*count\(\)\)/gi, 'avg($1)')

  // Pattern 5: sum(column * aggregateAlias) where aggregateAlias might be count/sum/etc
  // Look for patterns where we multiply by an alias that's likely an aggregate
  sql = sql.replace(/sum\(([^*]+)\s*\*\s*(request_count|error_count|total_count)\)/gi, 'sum($1)')

  return sql
}
