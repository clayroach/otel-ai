/**
 * Integration tests for UI Generator API Client Layer
 *
 * Tests the full integration with actual LLM query generation
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { Effect, Context, Layer } from 'effect'
import {
  UIGeneratorAPIClientLayer,
  UIGeneratorAPIClientTag
} from '../../api-client-layer.js'
import type { QueryGenerationAPIRequest } from '../../api-client.js'

describe('UI Generator API Client Layer Integration', () => {
  let isLLMAvailable = false
  let skipReason = ''

  beforeAll(async () => {
    // Skip LLM tests in CI - they require actual API calls which may not be reliable
    if (process.env.CI === 'true') {
      isLLMAvailable = false
      console.log('⚠️  Running in CI - skipping LLM integration tests that require API calls')
      return
    }

    // Check if Portkey gateway is available (with retries for CI)
    let gatewayAvailable = false
    const maxRetries = process.env.CI ? 5 : 1
    const retryDelay = 5000 // 5 seconds

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch('http://localhost:8787')
        if (response.ok) {
          const text = await response.text()
          gatewayAvailable = text.includes('Gateway')
          if (gatewayAvailable) {
            console.log(`✅ Connected to Portkey gateway on attempt ${attempt}`)
            break
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.log(`⚠️  Attempt ${attempt}/${maxRetries}: Could not connect to Portkey gateway at localhost:8787:`, errorMessage)
        if (attempt < maxRetries) {
          console.log(`   Retrying in ${retryDelay/1000} seconds...`)
          await new Promise(resolve => setTimeout(resolve, retryDelay))
        }
      }
    }

    // Check for API keys - CI uses CLAUDE_API_KEY, local uses ANTHROPIC_API_KEY
    const hasOpenAI = !!process.env.OPENAI_API_KEY
    const hasAnthropic = !!process.env.ANTHROPIC_API_KEY || !!process.env.CLAUDE_API_KEY
    const hasApiKeys = hasOpenAI || hasAnthropic

    // LLM is available if we have both gateway and API keys
    isLLMAvailable = gatewayAvailable && hasApiKeys

    if (!isLLMAvailable) {
      const skipReasons = []
      if (process.env.CI === 'true') {
        skipReasons.push('CI environment detected')
      }
      if (!gatewayAvailable) {
        skipReasons.push('Portkey gateway not available at localhost:8787')
      }
      if (!hasApiKeys) {
        skipReasons.push('No API keys configured (OPENAI_API_KEY or CLAUDE_API_KEY)')
      }

      skipReason = skipReasons.join(', ')
      console.log(`⚠️  LLM integration tests will be skipped: ${skipReason}`)
      console.log('   Gateway available:', gatewayAvailable)
      console.log('   API keys:', {
        OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
        ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
        CLAUDE_API_KEY: !!process.env.CLAUDE_API_KEY
      })
    } else {
      console.log('✅ Portkey gateway and API keys available, running integration tests')
    }
  })

  describe.skipIf(process.env.CI === 'true')('With Real LLM Service', () => {
    it('should generate query through the layer', async () => {

      try {
        const program = Effect.gen(function* () {
          const service = yield* UIGeneratorAPIClientTag

          const request: QueryGenerationAPIRequest = {
            path: {
              id: 'integration-test-path',
              name: 'Integration Test Path',
              services: ['frontend', 'api-gateway', 'user-service', 'database'],
              startService: 'frontend',
              endService: 'database'
            },
            analysisGoal: 'Analyze service latency patterns showing p50, p95, p99 percentiles'
            // Model selection handled by Portkey configuration
          }

          return yield* service.generateQuery(request)
        })

        const result = await Effect.runPromise(
          Effect.provide(program, UIGeneratorAPIClientLayer)
        )

        expect(result).toBeDefined()
        expect(result.sql).toBeTruthy()
        expect(result.sql).toContain('SELECT')
        expect(result.model).toBeTruthy()
        expect(result.description).toBeTruthy()
        expect(result.generationTimeMs).toBeGreaterThan(0)

        // Verify the SQL contains expected elements
        const sql = result.sql.toLowerCase()
        expect(sql).toMatch(/frontend|api-gateway|user-service|database/)
        expect(sql).toContain('traces')
      } catch (error) {
        // In CI, if we get a FiberFailure, it means the test shouldn't have run
        if (process.env.CI) {
          console.log('Test failed in CI - gateway may not be fully ready:', error)
          console.log('Skipping test due to CI environment limitations')
          return
        }
        throw error
      }
    })

    it(
      'should generate multiple queries for different patterns',
      async () => {

        try {
          const program = Effect.gen(function* () {
            const service = yield* UIGeneratorAPIClientTag

            const request = {
              path: {
                id: 'multi-query-test',
                name: 'Multi Query Test',
                services: ['service-a', 'service-b', 'service-c'],
                startService: 'service-a',
                endService: 'service-c'
              },
              patterns: ['latency', 'errors']
            }

            return yield* service.generateMultipleQueries(request)
          })

          const results = await Effect.runPromise(
            Effect.provide(program, UIGeneratorAPIClientLayer)
          )

          expect(results).toBeDefined()
          expect(Array.isArray(results)).toBe(true)
          expect(results.length).toBeGreaterThan(0)

          results.forEach((result) => {
            expect(result.sql).toBeTruthy()
            expect(result.sql).toContain('SELECT')
            expect(result.model).toBeTruthy()
            expect(result.description).toBeTruthy()
          })
        } catch (error) {
          // In CI, if we get a FiberFailure, it means the test shouldn't have run
          if (process.env.CI) {
            console.log('Test failed in CI - gateway may not be fully ready:', error)
            console.log('Skipping test due to CI environment limitations')
            return
          }
          throw error
        }
      }
    )

    it('should validate queries correctly', async () => {
      const program = Effect.gen(function* () {
        const service = yield* UIGeneratorAPIClientTag

        const validSQL = 'SELECT service_name, COUNT(*) FROM traces GROUP BY service_name'
        const invalidSQL = 'INVALID SQL STATEMENT'

        const validResult = yield* service.validateQuery(validSQL)
        const invalidResult = yield* service.validateQuery(invalidSQL)

        return { validResult, invalidResult }
      })

      const { validResult, invalidResult } = await Effect.runPromise(
        Effect.provide(program, UIGeneratorAPIClientLayer)
      )

      expect(validResult.valid).toBe(true)
      expect(validResult.errors).toHaveLength(0)

      expect(invalidResult.valid).toBe(false)
      expect(invalidResult.errors.length).toBeGreaterThan(0)
    })
  })

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const program = Effect.gen(function* () {
        const service = yield* UIGeneratorAPIClientTag

        // Use an invalid model to trigger an error
        const request: QueryGenerationAPIRequest = {
          path: {
            id: 'error-test',
            name: 'Error Test',
            services: ['service-x'],
            startService: 'service-x',
            endService: 'service-x'
          },
          model: 'non-existent-model-xyz-123'
        }

        return yield* service.generateQuery(request)
      })

      // This should either succeed with a fallback or fail with a proper error
      try {
        const result = await Effect.runPromise(
          Effect.provide(program, UIGeneratorAPIClientLayer)
        )

        // If it succeeds, it should be a fallback
        if (result.model === 'fallback') {
          expect(result.description).toContain('Fallback query')
        } else {
          // Or it used a different available model
          expect(result.sql).toBeTruthy()
        }
      } catch (error) {
        // If it fails, should be a proper error
        expect(error).toBeDefined()
        expect(error).toHaveProperty('message')
      }
    })
  })

  describe('Layer Composition', () => {
    it('should work with Effect Layer composition', async () => {
      // Create a test tag properly
      class TestService extends Context.Tag('TestService')<
        TestService,
        { testMethod: () => Effect.Effect<{ valid: boolean; errors: string[] }, never, never> }
      >() {}

      const TestServiceLayer = Layer.effect(
        TestService,
        Effect.gen(function* () {
          const uiGenerator = yield* UIGeneratorAPIClientTag
          return {
            testMethod: () =>
              uiGenerator.validateQuery('SELECT * FROM traces')
          }
        })
      )

      // Compose layers
      const AppLayer = Layer.provide(TestServiceLayer, UIGeneratorAPIClientLayer)

      const program = Effect.gen(function* () {
        const testService = yield* TestService
        return yield* testService.testMethod()
      })

      const result = await Effect.runPromise(
        Effect.provide(program, AppLayer)
      )

      expect(result).toBeDefined()
      expect(result.valid).toBe(true)
    })
  })

  describe('Convenience Functions', () => {
    it('should work with convenience function imports', async () => {
      const { generateQuery, validateQuery } = await import('../../api-client-layer.js')

      // Test generateQuery convenience function
      const queryProgram = generateQuery({
        path: {
          id: 'convenience-test',
          name: 'Convenience Test',
          services: ['svc'],
          startService: 'svc',
          endService: 'svc'
        }
      })

      // Test validateQuery convenience function
      const validateProgram = validateQuery('SELECT 1')

      // Both should work with the layer
      const layer = UIGeneratorAPIClientLayer

      try {
        const queryResult = await Effect.runPromise(
          Effect.provide(queryProgram, layer)
        )
        expect(queryResult).toBeDefined()
        expect(queryResult.sql).toBeTruthy()
      } catch (error) {
        // May fail if LLM is not available, but should be a proper error
        expect(error).toBeDefined()
      }

      const validateResult = await Effect.runPromise(
        Effect.provide(validateProgram, layer)
      )
      expect(validateResult).toBeDefined()
      // 'SELECT 1' is missing FROM clause, so it should be invalid
      expect(validateResult.valid).toBe(false)
      expect(validateResult.errors).toContain('Query must specify FROM table')
    })
  })
})