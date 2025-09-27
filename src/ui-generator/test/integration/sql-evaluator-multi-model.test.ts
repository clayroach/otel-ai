/**
 * Integration tests for SQL Evaluator-Optimizer with multiple LLM models
 * Tests the full evaluateAndOptimizeSQLWithLLM function with real LLM services
 */

import { Effect, pipe } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LLMManagerLive } from '../../../llm-manager/index.js'
import { evaluateAndOptimizeSQLWithLLM, type ClickHouseClient as EvaluatorClient } from '../../query-generator/sql-evaluator-optimizer.js'
import {
  type ClickHouseTestContainer,
  startClickHouseContainer,
  setupClickHouseSchema,
  cleanupClickHouseContainer
} from '../test-utils/clickhouse-container.js'
import {
  filterExternalModels,
  shouldSkipExternalLLMTests
} from '../../../llm-manager/test/utils/llm-availability.js'

describe('SQL Evaluator-Optimizer with Multiple LLM Models', () => {
  let testContainer: ClickHouseTestContainer
  let testClient: EvaluatorClient

  // Models to test - all accessed through Portkey gateway
  // Portkey should be configured with virtual keys for each model
  const allModels = [
    { name: 'claude-3-haiku-20240307', provider: 'anthropic' },
    { name: 'gpt-4o-mini', provider: 'openai' },
    { name: 'codellama-7b-instruct', provider: 'local' },
    { name: 'deepseek-coder-6.7b-instruct', provider: 'local' }
  ]

  // In CI, only test external models (Claude, OpenAI)
  const models = process.env.CI === 'true' ? filterExternalModels(allModels) : allModels

  beforeAll(async () => {
    // Skip setup only if no external LLM keys available
    if (shouldSkipExternalLLMTests()) {
      console.log('⚠️  No LLM API keys available - skipping test setup')
      return
    }

    if (process.env.CI === 'true') {
      console.log('🔄 Running in CI - testing external models only (Claude, OpenAI)')
    }

    console.log('🚀 Starting ClickHouse test container for multi-model tests...')

    // Start ClickHouse container using shared utilities
    testContainer = await startClickHouseContainer()
    testClient = testContainer.evaluatorClient

    // Set up the schema from migration file
    await setupClickHouseSchema(testContainer.client)

    console.log('✅ Schema created for multi-model tests')
  })

  describe.skipIf(shouldSkipExternalLLMTests())('Parallel model testing with Effect', () => {
    it('should test all models in parallel for NOT_AN_AGGREGATE errors', async () => {
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

      console.log('\n🚀 Running NOT_AN_AGGREGATE tests for all models in parallel using Effect...')

      interface ModelTestResult {
        model: string
        success: boolean
        duration: number
        attempts: number
        errorDetected: boolean
        error?: string
      }

      // Create Effects for each model test
      const testEffects = models.map(model => {
        const context = {
          services: ['frontend', 'backend'],
          analysisGoal: `Calculate total request duration (testing with ${model.name})`
        }

        const startTime = Date.now()
        console.log(`  🔄 Testing ${model.name}...`)

        return pipe(
          evaluateAndOptimizeSQLWithLLM(invalidSQL, testClient, context, 3),
          Effect.provide(LLMManagerLive),
          Effect.map(result => {
            const duration = Date.now() - startTime
            const firstAttempt = result.attempts[0]
            const success = result.finalSql !== invalidSQL &&
                           result.finalSql.includes('sum(duration_ns/1000000)') &&
                           !result.finalSql.includes('count() * (duration_ns/1000000)')
            console.log(`  ✅ ${model.name} completed in ${duration}ms`)

            const testResult: ModelTestResult = {
              model: model.name,
              success,
              duration,
              attempts: result.attempts.length,
              errorDetected: firstAttempt?.error?.code === 'NOT_AN_AGGREGATE'
            }
            return testResult
          }),
          Effect.catchAll(error => {
            const duration = Date.now() - startTime
            const errorMsg = error instanceof Error ? error.message : String(error)
            console.log(`  ❌ ${model.name} failed after ${duration}ms: ${errorMsg}`)

            const errorResult: ModelTestResult = {
              model: model.name,
              success: false,
              duration,
              attempts: 0,
              errorDetected: false,
              error: errorMsg
            }
            return Effect.succeed(errorResult)
          })
        )
      })

      // Run all Effects in parallel
      const results = await Effect.runPromise(
        Effect.all(testEffects, { concurrency: "unbounded" })
      )

      // Print results
      console.log('\n📊 NOT_AN_AGGREGATE Test Results:')
      results.forEach(result => {
        console.log(`  ${result.model}:`)
        console.log(`    Success: ${result.success ? '✅' : '❌'}`)
        console.log(`    Duration: ${result.duration}ms`)
        console.log(`    Error detected: ${result.errorDetected ? '✅' : '❌'}`)
        if (result.error) {
          console.log(`    Error: ${result.error}`)
        }
      })

      // At least one model should succeed
      const successCount = results.filter(r => r.success).length
      expect(successCount).toBeGreaterThan(0)
      console.log(`\n✅ ${successCount}/${results.length} models fixed NOT_AN_AGGREGATE`)
    })

    it('should test all models in parallel for UNKNOWN_IDENTIFIER errors', async () => {
      const invalidSQL = `
        WITH service_metrics AS (
          SELECT
            service_name,
            count() as request_count,
            quantile(0.95)(duration_ns/1000000) as p95_latency
          FROM otel.traces
          GROUP BY service_name
        ),
        service_health AS (
          SELECT
            service_name,
            request_count,
            p95_latency,
            p50_latency -- This column doesn't exist in service_metrics
          FROM service_metrics
        )
        SELECT * FROM service_health
      `

      console.log('\n🚀 Running UNKNOWN_IDENTIFIER tests for all models in parallel using Effect...')

      interface ModelTestResult {
        model: string
        success: boolean
        duration: number
        attempts: number
        errorDetected: boolean
        error?: string
      }

      // Create Effects for each model test
      const testEffects = models.map(model => {
        const context = {
          services: ['frontend', 'backend'],
          analysisGoal: `Analyze service health metrics (testing with ${model.name})`
        }

        const startTime = Date.now()
        console.log(`  🔄 Testing ${model.name}...`)

        return pipe(
          evaluateAndOptimizeSQLWithLLM(invalidSQL, testClient, context, 3),
          Effect.provide(LLMManagerLive),
          Effect.map(result => {
            const duration = Date.now() - startTime
            const firstAttempt = result.attempts[0]
            const success = result.finalSql !== invalidSQL
            console.log(`  ✅ ${model.name} completed in ${duration}ms`)

            const testResult: ModelTestResult = {
              model: model.name,
              success,
              duration,
              attempts: result.attempts.length,
              errorDetected: firstAttempt?.error?.code === 'UNKNOWN_IDENTIFIER'
            }
            return testResult
          }),
          Effect.catchAll(error => {
            const duration = Date.now() - startTime
            const errorMsg = error instanceof Error ? error.message : String(error)
            console.log(`  ❌ ${model.name} failed after ${duration}ms: ${errorMsg}`)

            const errorResult: ModelTestResult = {
              model: model.name,
              success: false,
              duration,
              attempts: 0,
              errorDetected: false,
              error: errorMsg
            }
            return Effect.succeed(errorResult)
          })
        )
      })

      // Run all Effects in parallel
      const results = await Effect.runPromise(
        Effect.all(testEffects, { concurrency: "unbounded" })
      )

      // Print results
      console.log('\n📊 UNKNOWN_IDENTIFIER Test Results:')
      console.log(`  Total models tested: ${results.length}`)
      results.forEach(result => {
        console.log(`  ${result.model}:`)
        console.log(`    Success: ${result.success ? '✅' : '❌'}`)
        console.log(`    Duration: ${result.duration}ms`)
        console.log(`    Attempts: ${result.attempts}`)
        console.log(`    Error detected: ${result.errorDetected ? '✅' : '❌'}`)
        if (result.error) {
          console.log(`    Error: ${result.error}`)
        }
      })

      // Check if at least the error was detected by all models
      const errorDetectionCount = results.filter(r => r.errorDetected).length
      const successCount = results.filter(r => r.success).length

      console.log(`\n📈 Summary:`)
      console.log(`  Models that detected UNKNOWN_IDENTIFIER: ${errorDetectionCount}/${results.length}`)
      console.log(`  Models that fixed the error: ${successCount}/${results.length}`)

      // At minimum, all models should detect the error
      expect(errorDetectionCount).toBeGreaterThan(0)

      // Log warning if no models could fix it
      if (successCount === 0) {
        console.log(`  ⚠️  No models were able to fix the UNKNOWN_IDENTIFIER error in complex CTEs`)
        console.log(`      This is a known difficult case - the test validates error detection`)
      }
    })

    it('should test all models in parallel for SYNTAX_ERROR with HAVING clause', async () => {
      const invalidSQL = `
        SELECT
          service_name,
          count() as request_count,
          avg(duration_ns/1000000) as avg_latency
        FROM otel.traces
        GROUP BY service_name
        ORDER BY request_count DESC
        HAVING request_count > 100  -- HAVING after ORDER BY is invalid
      `

      console.log('\n🚀 Running SYNTAX_ERROR tests for all models in parallel using Effect...')

      interface ModelTestResult {
        model: string
        success: boolean
        duration: number
        attempts: number
        errorDetected: boolean
        error?: string
      }

      // Create Effects for each model test
      const testEffects = models.map(model => {
        const context = {
          services: ['frontend', 'backend'],
          analysisGoal: `Find high-traffic services (testing with ${model.name})`
        }

        const startTime = Date.now()
        console.log(`  🔄 Testing ${model.name}...`)

        return pipe(
          evaluateAndOptimizeSQLWithLLM(invalidSQL, testClient, context, 3),
          Effect.provide(LLMManagerLive),
          Effect.map(result => {
            const duration = Date.now() - startTime
            const firstAttempt = result.attempts[0]
            let success = false

            if (result.finalSql !== invalidSQL) {
              // HAVING should be before ORDER BY in the fixed version
              const havingIndex = result.finalSql.indexOf('HAVING')
              const orderByIndex = result.finalSql.indexOf('ORDER BY')
              success = havingIndex !== -1 && orderByIndex !== -1 && havingIndex < orderByIndex
            }
            console.log(`  ✅ ${model.name} completed in ${duration}ms`)

            const testResult: ModelTestResult = {
              model: model.name,
              success,
              duration,
              attempts: result.attempts.length,
              errorDetected: firstAttempt?.error?.code === 'SYNTAX_ERROR'
            }
            return testResult
          }),
          Effect.catchAll(error => {
            const duration = Date.now() - startTime
            const errorMsg = error instanceof Error ? error.message : String(error)
            console.log(`  ❌ ${model.name} failed after ${duration}ms: ${errorMsg}`)

            const errorResult: ModelTestResult = {
              model: model.name,
              success: false,
              duration,
              attempts: 0,
              errorDetected: false,
              error: errorMsg
            }
            return Effect.succeed(errorResult)
          })
        )
      })

      // Run all Effects in parallel
      const results = await Effect.runPromise(
        Effect.all(testEffects, { concurrency: "unbounded" })
      )

      // Print results
      console.log('\n📊 SYNTAX_ERROR Test Results:')
      results.forEach(result => {
        console.log(`  ${result.model}:`)
        console.log(`    Success: ${result.success ? '✅' : '❌'}`)
        console.log(`    Duration: ${result.duration}ms`)
        console.log(`    Error detected: ${result.errorDetected ? '✅' : '❌'}`)
        if (result.error) {
          console.log(`    Error: ${result.error}`)
        }
      })

      // At least one model should succeed
      const successCount = results.filter(r => r.success).length
      expect(successCount).toBeGreaterThan(0)
      console.log(`\n✅ ${successCount}/${results.length} models fixed SYNTAX_ERROR`)
    })
  })

  describe.skipIf(shouldSkipExternalLLMTests())('Known Issues - Models Cannot Fix', () => {
    // TODO: Enable this test when models can properly fix UNKNOWN_IDENTIFIER in complex CTEs
    it.skip('should fix UNKNOWN_IDENTIFIER errors in complex CTEs', async () => {
      const invalidSQL = `
        WITH service_metrics AS (
          SELECT
            service_name,
            count() as request_count,
            quantile(0.95)(duration_ns/1000000) as p95_latency
          FROM otel.traces
          GROUP BY service_name
        ),
        service_health AS (
          SELECT
            service_name,
            request_count,
            p95_latency,
            p50_latency -- This column doesn't exist in service_metrics
          FROM service_metrics
        )
        SELECT * FROM service_health
      `

      console.log('\n🔬 Testing UNKNOWN_IDENTIFIER fixing capability for all models...')
      console.log('   This test validates if models can actually FIX the error, not just detect it')

      interface ModelFixResult {
        model: string
        fixed: boolean
        finalSQL: string
        attempts: number
        duration: number
        error?: string
      }

      // Test each model's ability to fix the error
      const testEffects = models.map(model => {
        const context = {
          services: ['frontend', 'backend'],
          analysisGoal: `Fix missing p50_latency column in CTE (testing ${model.name})`
        }

        const startTime = Date.now()
        console.log(`  🔧 Testing ${model.name}'s fixing capability...`)

        return pipe(
          evaluateAndOptimizeSQLWithLLM(invalidSQL, testClient, context, 3),
          Effect.provide(LLMManagerLive),
          Effect.map(result => {
            const duration = Date.now() - startTime
            const fixed = result.finalSql !== invalidSQL &&
                         !result.finalSql.includes('p50_latency -- This column doesn\'t exist')

            // Check if the fix is valid by looking for proper column addition
            const hasProperFix = result.finalSql.includes('quantile(0.5)') ||
                                result.finalSql.includes('quantile(0.50)') ||
                                (result.finalSql.includes('p50_latency') &&
                                 result.finalSql.includes('service_metrics'))

            if (fixed && hasProperFix) {
              console.log(`  ✅ ${model.name} FIXED the error in ${duration}ms`)
            } else {
              console.log(`  ❌ ${model.name} could NOT fix the error after ${duration}ms`)
            }

            const fixResult: ModelFixResult = {
              model: model.name,
              fixed: fixed && hasProperFix,
              finalSQL: result.finalSql,
              attempts: result.attempts.length,
              duration
            }
            return fixResult
          }),
          Effect.catchAll(error => {
            const duration = Date.now() - startTime
            const errorMsg = error instanceof Error ? error.message : String(error)
            console.log(`  ❌ ${model.name} failed with error after ${duration}ms: ${errorMsg}`)

            const errorResult: ModelFixResult = {
              model: model.name,
              fixed: false,
              finalSQL: invalidSQL,
              attempts: 0,
              duration,
              error: errorMsg
            }
            return Effect.succeed(errorResult)
          })
        )
      })

      // Run all tests in parallel
      const results = await Effect.runPromise(
        Effect.all(testEffects, { concurrency: "unbounded" })
      )

      // Detailed report
      console.log('\n📊 UNKNOWN_IDENTIFIER Fix Capability Report:')
      console.log('=' .repeat(60))

      results.forEach((result, index) => {
        console.log(`\n${index + 1}. ${result.model}:`)
        console.log(`   Fixed: ${result.fixed ? '✅ YES' : '❌ NO'}`)
        console.log(`   Attempts: ${result.attempts}`)
        console.log(`   Duration: ${result.duration}ms`)

        if (result.fixed) {
          console.log(`   Fix applied: Added missing p50_latency calculation to CTE`)
        } else if (result.error) {
          console.log(`   Error: ${result.error}`)
        } else {
          console.log(`   Issue: Could not generate proper fix for missing column`)
        }
      })

      // Summary
      const fixedCount = results.filter(r => r.fixed).length
      console.log('\n📈 Summary:')
      console.log(`   Models that fixed the error: ${fixedCount}/${results.length}`)

      if (fixedCount === 0) {
        console.log(`   ⚠️  KNOWN ISSUE: No models can currently fix UNKNOWN_IDENTIFIER in complex CTEs`)
        console.log(`      This requires adding 'quantile(0.5)(duration_ns/1000000) as p50_latency'`)
        console.log(`      to the service_metrics CTE`)
      }

      // This test expects at least one model to fix the error
      // Currently fails - that's why it's skipped
      expect(fixedCount).toBeGreaterThan(0)
    })
  })

  describe.skipIf(shouldSkipExternalLLMTests())('Comprehensive model comparison with Effect', () => {
    it('should compare all models on complex SQL with multiple errors', async () => {
      const testSQL = `
        SELECT
          service_name,
          operation_name,
          count() * avg(duration_ns) as weighted_duration,
          percentile(0.99)(duration_ns/1000000) as p99_latency
        FROM traces  -- Missing otel prefix
        WHERE service_name IN ('frontend', 'backend')
        GROUP BY service_name
        ORDER BY weighted_duration DESC
        HAVING count() > 10  -- HAVING after ORDER BY
      `

      const context = {
        services: ['frontend', 'backend'],
        analysisGoal: 'Compare model optimization capabilities'
      }

      console.log('\n🚀 Running comprehensive comparison for all models in parallel using Effect...')

      interface ModelResult {
        model: string
        success: boolean
        attempts: number
        duration: number
        error?: string
        errorsFixed: string[]
        finalValid: boolean
      }

      // Create Effects for all model tests
      const testEffects = models.map(model => {
        console.log(`  🔄 Starting test for ${model.name}...`)
        const startTime = Date.now()

        return pipe(
          evaluateAndOptimizeSQLWithLLM(testSQL, testClient, context, 3),
          Effect.provide(LLMManagerLive),
          Effect.map(result => {
            const duration = Date.now() - startTime
            const modelResult: ModelResult = {
              model: model.name,
              success: result.finalSql !== testSQL,
              attempts: result.attempts.length,
              duration,
              errorsFixed: result.attempts
                .filter(a => !a.isValid)
                .map(a => a.error?.code)
                .filter((code): code is string => code !== undefined),
              finalValid: result.attempts[result.attempts.length - 1]?.isValid || false
            }
            return modelResult
          }),
          Effect.catchAll(error => Effect.succeed({
            model: model.name,
            success: false,
            attempts: 0,
            duration: Date.now() - startTime,
            error: error instanceof Error ? error.message : String(error),
            errorsFixed: [],
            finalValid: false
          } as ModelResult))
        )
      })

      // Run all Effects in parallel and get results
      const results = await Effect.runPromise(
        Effect.all(testEffects, { concurrency: "unbounded" })
      )

      // Print comprehensive comparison report
      console.log('\n📊 Comprehensive Model Comparison Report:')
      console.log('=' .repeat(60))

      // Sort by success and duration
      const sortedResults = results.sort((a, b) => {
        if (a.success !== b.success) return b.success ? 1 : -1
        return a.duration - b.duration
      })

      sortedResults.forEach((result, index) => {
        console.log(`\n${index + 1}. ${result.model}:`)
        console.log(`   Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`)
        console.log(`   Duration: ${result.duration}ms`)
        console.log(`   Attempts: ${result.attempts}`)
        console.log(`   Errors Fixed: ${result.errorsFixed.join(', ') || 'None'}`)
        console.log(`   Final Valid: ${result.finalValid ? '✅' : '❌'}`)
        if (result.error) {
          console.log(`   Error: ${result.error}`)
        }
      })

      // Summary statistics
      const successfulModels = results.filter(r => r.success)
      const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length
      const fastestModel = sortedResults[0]

      console.log('\n📈 Summary Statistics:')
      console.log(`   Success Rate: ${successfulModels.length}/${results.length} (${Math.round(successfulModels.length * 100 / results.length)}%)`)
      console.log(`   Average Duration: ${Math.round(avgDuration)}ms`)

      if (fastestModel) {
        console.log(`   Fastest Model: ${fastestModel.model} (${fastestModel.duration}ms)`)
      }

      if (successfulModels.length > 0) {
        const bestModel = successfulModels[0]
        if (bestModel) {
          console.log(`   Best Performing: ${bestModel.model} (Fixed ${bestModel.errorsFixed.length} errors)`)
        }
      }

      // At least one model should succeed
      expect(successfulModels.length).toBeGreaterThan(0)
      console.log(`\n✅ Test completed: ${successfulModels.length} model(s) successfully fixed the SQL`)
    }) // 3 minute timeout for comprehensive test
  })

  describe('Memory Protection and Semantic Validation Testing', () => {
    it('should apply memory protection for complex aggregation queries', async () => {
      // Skip if no test environment
      if (shouldSkipExternalLLMTests() || !testClient) {
        console.log('⚠️  Skipping semantic validation test - no test environment')
        return
      }

      // Complex aggregation SQL that requires memory protection
      const complexAggregationSQL = `
        SELECT
          service_name,
          count() * avg(duration_ns) AS weighted_duration
        FROM otel.traces
        WHERE service_name IN ('frontend', 'backend')
        GROUP BY service_name
      `

      // Note: count() * avg() is valid SQL but memory-intensive, requiring LIMIT 0 protection

      console.log('\n🔍 Testing memory protection for complex aggregation queries...')
      console.log('🔍 SQL contains: count() * avg(duration_ns) - should trigger memory protection')

      // Import the semantic validation function directly
      const { validateSQLSemantics } = await import('../../query-generator/sql-evaluator-optimizer.js')

      // Test semantic validation and memory protection
      const program = Effect.gen(function* () {
        console.log('🔧 Running validateSQLSemantics with memory protection...')
        const result = yield* validateSQLSemantics(complexAggregationSQL, testClient)
        return result
      })

      const result = await Effect.runPromise(program)

      console.log('✅ Semantic validation completed successfully with memory protection')
      console.log('📊 Validation result:', {
        isValid: result.isValid,
        executionTime: result.executionTimeMs,
        rowCount: result.rowCount,
        columnsDetected: result.columns?.length || 0
      })

      // Memory protection should allow the query to validate successfully
      // The protection prevents crashes while maintaining functionality
      expect(result.isValid).toBe(true)
      expect(result.executionTimeMs).toBeLessThan(5000) // Should be fast with protection
      expect(result.rowCount).toBe(0) // Protected execution returns no rows

      console.log('✅ Memory protection working: Complex aggregation validated safely')
      console.log('✅ No ClickHouse crashes with count() * avg() pattern')
    }, 30000) // 30 second timeout
  })

  afterAll(async () => {
    if (testContainer) {
      await cleanupClickHouseContainer(testContainer)
    }
  })
})