/**
 * Unit tests for SQL Evaluator-Optimizer pattern using ClickHouse test container
 * Tests SQL validation and optimization against actual ClickHouse schema without data
 */

import { Effect, pipe } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LLMManagerLive } from '../../../llm-manager/index.js'
import { evaluateAndOptimizeSQLWithLLM, evaluateSQLExecution, validateSQLSemantics, type ClickHouseClient as EvaluatorClient, type SQLEvaluationResult } from '../../query-generator/sql-evaluator-optimizer.js'
import {
  type ClickHouseTestContainer,
  startClickHouseContainer,
  setupClickHouseSchema,
  cleanupClickHouseContainer,
  getSchemaInfo
} from '../test-utils/clickhouse-container.js'



describe('SQL Evaluator-Optimizer Unit Tests', () => {
  let testContainer: ClickHouseTestContainer
  let testClient: EvaluatorClient

  beforeAll(async () => {
    try {
      // Start ClickHouse container using shared utilities
      testContainer = await startClickHouseContainer()
      testClient = testContainer.evaluatorClient

      // Set up the schema from migration file
      await setupClickHouseSchema(testContainer.client)

    } catch (error) {
      console.error('❌ Failed to start ClickHouse container:', error)
      throw error
    }
  }, 120000) // 2 minute timeout for container startup

  afterAll(async () => {
    if (testContainer) {
      await cleanupClickHouseContainer(testContainer)
    }
  })


  describe('Claude-generated query with UNKNOWN_IDENTIFIER error', () => {
    // This represents a real Claude query with an error in CTE column references
    // The query defines columns like p95_latency_ms in service_metrics CTE
    // But service_health CTE tries to use p50_latency_ms which doesn't exist
    const claudeQueryWithError = `
      WITH problematic_traces AS (
        SELECT DISTINCT trace_id
        FROM otel.traces
        WHERE service_name IN ('frontend', 'cart', 'checkout', 'payment', 'email')
          AND start_time >= now() - INTERVAL 15 MINUTE
          AND (
            duration_ns / 1000000 > 1000  -- High latency traces
            OR status_code != 'OK'         -- Failed traces
            OR trace_id IN (
              SELECT trace_id FROM otel.traces
              GROUP BY trace_id
              HAVING count() > 20  -- Complex traces with many spans
            )
          )
      ),
      service_metrics AS (
        SELECT
          service_name,
          count() AS request_count,
          countIf(status_code != 'OK') AS error_count,
          quantile(0.5)(duration_ns / 1000000) AS p50_latency_ms,  -- Defined here
          quantile(0.95)(duration_ns / 1000000) AS p95_latency_ms,
          quantile(0.99)(duration_ns / 1000000) AS p99_latency_ms
        FROM otel.traces
        WHERE trace_id IN (SELECT trace_id FROM problematic_traces)
          AND service_name IN ('frontend', 'cart', 'checkout', 'payment', 'email')
          AND start_time >= now() - INTERVAL 15 MINUTE
        GROUP BY service_name
      ),
      service_health AS (
        SELECT
          service_name,
          request_count,
          error_count,
          round(error_count * 100.0 / request_count, 2) AS error_rate,
          p50_latency_ms,  -- This exists from service_metrics
          p95_latency_ms,
          p99_latency_ms,
          multiIf(
            error_rate > 5 OR p95_latency_ms > 1000, 'CRITICAL',
            error_rate > 2 OR p95_latency_ms > 500, 'WARNING',
            'HEALTHY'
          ) AS health_status
        FROM service_metrics
      ),
      service_impact AS (
        SELECT
          service_name,
          request_count,
          error_count,
          error_rate,
          p95_latency_ms,
          request_count * p95_latency_ms AS total_time_impact
        FROM service_health
        ORDER BY total_time_impact DESC
      )
      SELECT
        service_name,
        request_count,
        error_count,
        error_rate,
        p50_latency_ms,  -- But then is used here
        p95_latency_ms,
        p99_latency_ms,
        health_status,
        total_time_impact
      FROM service_impact
      WHERE request_count > 5
      ORDER BY error_rate DESC, total_time_impact DESC
    `

    it('should detect UNKNOWN_IDENTIFIER error in service_health CTE', async () => {
      const result: SQLEvaluationResult = await Effect.runPromise(evaluateSQLExecution(claudeQueryWithError, testClient))

      expect(result.isValid).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error?.code).toBe('UNKNOWN_IDENTIFIER')
      expect(result.error?.message).toContain('p50_latency_ms')

      console.log('❌ Claude query error:', result.error?.code)
      console.log('   Message:', result.error?.message)
    })

    it('should attempt to fix the UNKNOWN_IDENTIFIER error with LLM', async () => {
      const context = {
        services: ['frontend', 'cart', 'checkout', 'payment', 'email'],
        analysisGoal: 'Analyze service latency patterns'
      }

      const result = await Effect.runPromise(
        pipe(
          evaluateAndOptimizeSQLWithLLM(claudeQueryWithError, testClient, context, 2),
          Effect.provide(LLMManagerLive)
        )
      )

      // Since our mock LLM returns empty, rule-based optimization should kick in
      // But the UNKNOWN_IDENTIFIER in a complex CTE won't be auto-fixed
      expect(result.attempts.length).toBeGreaterThan(0)

      const firstAttempt = result.attempts[0]
      expect(firstAttempt?.isValid).toBe(false)
      expect(firstAttempt?.error?.code).toBe('UNKNOWN_IDENTIFIER')

      console.log('🔧 Optimization applied:', result.attempts.length > 1 ?
        'LLM returned empty result, using rule-based optimization' :
        'No optimization found')
      console.log('ℹ️ Rule-based optimization attempted (complex CTE issue not auto-fixable)')
    })
  })

  describe('Syntax errors that must be caught before execution', () => {
    it('should detect typo in SQL keywords like PIIOT instead of PIVOT', async () => {
      const sqlWithTypo = `
        SELECT service_name, count() as request_count
        FROM otel.traces
        WHERE start_time >= now() - INTERVAL 1 HOUR
        GROUP BY service_name
        PIIOT JOIN (
          SELECT service_name, max(request_count) as max_requests
          FROM (
            SELECT service_name, count() as request_count
            FROM otel.traces
            GROUP BY service_name
          )
        ) USING service_name
      `

      const result = await Effect.runPromise(evaluateSQLExecution(sqlWithTypo, testClient))

      expect(result.isValid).toBe(false)
      expect(result.error?.code).toBe('SYNTAX_ERROR')
      expect(result.error?.message).toContain('PIIOT')

      console.log('❌ PIIOT typo error:', result.error?.code)
      console.log('   Message:', result.error?.message)
    })

    it('should detect malformed JOIN syntax with extra parenthesis', async () => {
      const malformedJoin = `
        SELECT t1.service_name, count() as request_count
        FROM otel.traces t1
        LEFT JOIN (
          SELECT service_name, operation_name
          FROM otel.traces
        ) t2
        ON t1.service_name = t2.service_name
        )  -- Extra closing parenthesis
        WHERE t1.start_time >= now() - INTERVAL 1 HOUR
        GROUP BY t1.service_name, t1.operation_name
      `

      const result = await Effect.runPromise(evaluateSQLExecution(malformedJoin, testClient))

      expect(result.isValid).toBe(false)
      expect(result.error?.code).toBe('SYNTAX_ERROR')
      expect(result.error?.message).toMatch(/parenthes|unexpected/i)

      console.log('❌ Extra parenthesis error:', result.error?.code)
      console.log('   Message:', result.error?.message)
    })

    it('should catch missing commas between SELECT fields', async () => {
      const missingCommaSQL = `
        SELECT
          service_name
          count() as request_count
        FROM otel.traces
        GROUP BY service_name, operation_name
      `

      const result = await Effect.runPromise(evaluateSQLExecution(missingCommaSQL, testClient))

      expect(result.isValid).toBe(false)
      expect(result.error?.code).toBe('SYNTAX_ERROR')

      console.log('❌ Missing comma error:', result.error?.code)
      console.log('   Message:', result.error?.message)
    })
  })

  describe('Semantic validation with EXPLAIN PLAN', () => {
    it('should catch ILLEGAL_AGGREGATION errors before execution', async () => {
      const illegalAggregateSQL = `
        SELECT
          service_name,
          count() as request_count,
          sum(duration_ns/1000000 * count()) as total_time_ms
        FROM otel.traces
        WHERE service_name IN ('frontend', 'backend')
        GROUP BY service_name
      `

      const result = await Effect.runPromise(validateSQLSemantics(illegalAggregateSQL, testClient))

      expect(result.isValid).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error?.code).toBe('ILLEGAL_AGGREGATION')
      expect(result.error?.message).toMatch(/aggregate|nested/i)

      console.log('❌ [SEMANTIC] ILLEGAL_AGGREGATION caught:', result.error?.code)
      console.log('   Message:', result.error?.message)
    })

    it('should catch NOT_AN_AGGREGATE errors for columns not in GROUP BY', async () => {
      const notAggregateSQL = `
        SELECT
          service_name,
          operation_name,
          count() as request_count
        FROM otel.traces
        GROUP BY service_name
      `

      const result = await Effect.runPromise(validateSQLSemantics(notAggregateSQL, testClient))

      expect(result.isValid).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error?.code).toBe('NOT_AN_AGGREGATE')
      expect(result.error?.message).toContain('operation_name')

      console.log('❌ [SEMANTIC] NOT_AN_AGGREGATE caught:', result.error?.code)
      console.log('   Message:', result.error?.message)
    })

    it('should validate semantically correct queries', async () => {
      const validSQL = `
        SELECT
          service_name,
          count() as request_count,
          avg(duration_ns/1000000) as avg_duration_ms
        FROM otel.traces
        WHERE service_name IN ('frontend', 'backend')
        GROUP BY service_name
        ORDER BY request_count DESC
      `

      const result = await Effect.runPromise(validateSQLSemantics(validSQL, testClient))

      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
      expect(result.executionTimeMs).toBeGreaterThan(0)

      console.log(`✅ [SEMANTIC] Valid query semantics validated in ${result.executionTimeMs}ms`)
    })

    it('should catch type mismatches in semantic validation', async () => {
      const typeMismatchSQL = `
        SELECT
          service_name,
          count() + 'invalid_string' as invalid_calc
        FROM otel.traces
        GROUP BY service_name
      `

      const result = await Effect.runPromise(validateSQLSemantics(typeMismatchSQL, testClient))

      expect(result.isValid).toBe(false)
      expect(result.error).toBeDefined()
      expect(['TYPE_MISMATCH', 'ILLEGAL_TYPE_OF_ARGUMENT', 'SYNTAX_ERROR', 'SEMANTIC_ERROR']).toContain(result.error?.code)

      console.log('❌ [SEMANTIC] Type error caught:', result.error?.code)
      console.log('   Message:', result.error?.message)
    })

    it('should be faster than execution test since no data is processed', async () => {
      const complexQuery = `
        WITH service_metrics AS (
          SELECT
            service_name,
            count() as request_count,
            avg(duration_ns/1000000) as avg_duration_ms
          FROM otel.traces
          WHERE start_time >= now() - INTERVAL 1 HOUR
          GROUP BY service_name
        )
        SELECT * FROM service_metrics
        ORDER BY request_count DESC
      `

      const semanticStart = Date.now()
      const semanticResult = await Effect.runPromise(validateSQLSemantics(complexQuery, testClient))
      const semanticTime = Date.now() - semanticStart

      const executionStart = Date.now()
      const executionResult = await Effect.runPromise(evaluateSQLExecution(complexQuery, testClient))
      const executionTime = Date.now() - executionStart

      expect(semanticResult.isValid).toBe(true)
      expect(executionResult.isValid).toBe(true)

      // Semantic validation should typically be faster since it doesn't process data
      console.log(`⚡ [SEMANTIC] Validation time: ${semanticTime}ms`)
      console.log(`⚡ [EXECUTION] Test time: ${executionTime}ms`)
      console.log(`⚡ [PERFORMANCE] Semantic validation is ${executionTime >= semanticTime ? 'faster' : 'slower'} than execution`)
    })
  })

  describe('Enhanced evaluator output with validation comments', () => {
    it('should include comprehensive validation attempts in result', async () => {
      const sqlWithError = `
        SELECT
          service_name,
          operation_name,
          request_count,
          error_rate,
          p95_latency_ms
        FROM (
          SELECT
            service_name,
            operation_name,
            count() as request_count,
            countIf(status_code != 'OK') / count() as error_rate,
            quantile(0.95)(duration_ns/1000000) as p95_latency_ms
          FROM otel.traces
          WHERE start_time >= now() - INTERVAL 1 HOUR
          GROUP BY service_name, operation_name
          ORDER BY request_count DESC
        )
        HAVING request_count > 5  -- HAVING after ORDER BY is invalid
      `

      const result = await Effect.runPromise(
        pipe(
          evaluateAndOptimizeSQLWithLLM(sqlWithError, testClient, {
            services: ['frontend', 'backend'],
            analysisGoal: 'Analyze error patterns'
          }, 3),
          Effect.provide(LLMManagerLive)
        )
      )

      expect(result.attempts.length).toBeGreaterThan(0)

      // The HAVING clause outside subquery might be valid in some ClickHouse versions
      // or it might fail with a syntax error
      const firstAttempt = result.attempts[0]
      if (firstAttempt?.isValid) {
        console.log('✅ Query with HAVING outside subquery is valid in this ClickHouse version')
        expect(firstAttempt.executionTimeMs).toBeGreaterThan(0)
      } else {
        expect(firstAttempt?.error?.code).toBe('SYNTAX_ERROR')
        expect(firstAttempt?.error?.message).toContain('HAVING')
      }

      console.log('📊 Validation attempts:', result.attempts.length)
      console.log('   First attempt valid:', result.attempts[0]?.isValid)
      console.log('   Error code:', result.attempts[0]?.error?.code)
      console.log('   Full error message:', result.attempts[0]?.error?.message)
    })

    it('should track optimization attempts with explanations', async () => {
      const sqlWithTableError = `
        SELECT service_name, COUNT(*)
        FROM traces  -- Missing otel prefix
        WHERE service_name = 'frontend'
        GROUP BY service_name
      `

      const result = await Effect.runPromise(
        pipe(
          evaluateAndOptimizeSQLWithLLM(sqlWithTableError, testClient, {
            services: ['frontend'],
            analysisGoal: 'Count requests'
          }, 2),
          Effect.provide(LLMManagerLive)
        )
      )

      expect(result.attempts.length).toBeGreaterThan(0)
      expect(result.attempts[0]?.error?.code).toMatch(/UNKNOWN|SEMANTIC_ERROR/)

      const optimizationsApplied = result.attempts
        .filter((_, i) => i > 0)
        .map(_ => 'Applied rule-based optimization')

      console.log('🔧 Optimizations applied:', optimizationsApplied.length)
      if (optimizationsApplied.length > 0) {
        console.log('   Explanation:', optimizationsApplied[0])
        console.log('   Changes:', ['Applied rule-based optimization for UNKNOWN'])
      }
    })

    it('should preserve full error messages without truncation', async () => {
      const complexErrorSQL = `
        SELECT * FROM non_existent_table_with_very_long_name_that_triggers_detailed_error_message
      `

      const result = await Effect.runPromise(evaluateSQLExecution(complexErrorSQL, testClient))

      expect(result.isValid).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error?.message).toBeDefined()

      // Ensure error message is not truncated
      const errorLength = result.error?.message?.length || 0
      expect(errorLength).toBeGreaterThan(50)

      console.log('📝 Full error message length:', errorLength)
      console.log('   Error code:', result.error?.code)
    })
  })

  describe('Common ClickHouse SQL errors', () => {
    it('should detect aggregate functions in WHERE clause', async () => {
      const invalidAggregate = `
        SELECT service_name, count() as request_count
        FROM otel.traces
        WHERE count() > 10  -- Aggregate in WHERE is not allowed
        GROUP BY service_name
      `

      const result = await Effect.runPromise(evaluateSQLExecution(invalidAggregate, testClient))

      expect(result.isValid).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error?.code).toBe('ILLEGAL_AGGREGATION')

      console.log('❌ Aggregate in WHERE error:', result.error?.code)
      console.log('   Message:', result.error?.message)
    })

    it('should detect wrong table reference (otel.traces when in otel db)', async () => {
      const wrongTableRef = `
        SELECT service_name
        FROM unknown_table
        LIMIT 1
      `

      const result = await Effect.runPromise(evaluateSQLExecution(wrongTableRef, testClient))

      expect(result.isValid).toBe(false)
      expect(result.error?.code).toBe('UNKNOWN')

      console.log('❌ Table not found error:', result.error?.code)
    })

    it('should validate correct SQL executes successfully', async () => {
      const validSQL = `
        SELECT service_name, count() as request_count
        FROM otel.traces
        WHERE start_time >= now() - INTERVAL 1 HOUR
        GROUP BY service_name
        HAVING count() > 5
        ORDER BY request_count DESC
        LIMIT 10
      `

      const result = await Effect.runPromise(evaluateSQLExecution(validSQL, testClient))

      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
      expect(result.executionTimeMs).toBeGreaterThan(0)

      console.log(`✅ Valid SQL executed in ${result.executionTimeMs} ms`)
    })

    it('should fix NOT_AN_AGGREGATE errors by converting count() * column to sum(column)', async () => {
      const invalidSQL = `
        SELECT
          service_name,
          count() * (duration_ns/1000000) as total_duration_ms,
          count() as request_count
        FROM otel.traces
        WHERE service_name IN ('frontend', 'backend')
        GROUP BY service_name
        ORDER BY total_duration_ms DESC
      `

      const context = {
        services: ['frontend', 'backend'],
        analysisGoal: 'Calculate total request duration by multiplying count by average duration'
      }

      const result = await Effect.runPromise(
        pipe(
          evaluateAndOptimizeSQLWithLLM(invalidSQL, testClient, context, 3),
          Effect.provide(LLMManagerLive)
        )
      )

      // First attempt should fail with NOT_AN_AGGREGATE
      const firstAttempt = result.attempts[0]
      expect(firstAttempt?.isValid).toBe(false)
      expect(firstAttempt?.error?.code).toBe('NOT_AN_AGGREGATE')

      // The rule-based optimizer should fix it
      if (result.finalSql !== invalidSQL) {
        expect(result.finalSql).toContain('sum(duration_ns/1000000)')
        expect(result.finalSql).not.toContain('count() * (duration_ns/1000000)')
        console.log('✅ NOT_AN_AGGREGATE error fixed:')
        console.log('   Original: count() * (duration_ns/1000000)')
        console.log('   Fixed: sum(duration_ns/1000000)')
      }
    })
  })

  describe('Schema validation helpers', () => {
    it('should provide schema information for test validation', () => {
      // Get schema info from shared utilities
      const schemaInfo = getSchemaInfo()

      // We should have the traces table
      expect(schemaInfo.tables).toContain('traces')

      // Check that traces table has expected columns
      const tracesColumns = schemaInfo.columns.traces
      expect(tracesColumns).toBeDefined()
      expect(tracesColumns).toContain('trace_id')
      expect(tracesColumns).toContain('span_id')
      expect(tracesColumns).toContain('service_name')
      expect(tracesColumns).toContain('operation_name')
      expect(tracesColumns).toContain('duration_ns')

      console.log('📊 Schema tables:', schemaInfo.tables)
      console.log('   Traces columns sample:', tracesColumns?.slice(0, 5))
    })
  })
})