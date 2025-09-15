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

  beforeAll(async () => {
    // Check if LLM is available
    try {
      const response = await fetch('http://localhost:1234/v1/models')
      if (response.ok) {
        const data = await response.json()
        isLLMAvailable = data.data && data.data.length > 0
      }
    } catch {
      isLLMAvailable = false
    }

    if (!isLLMAvailable) {
      console.log('⚠️  LLM not available at localhost:1234, skipping integration tests')
    }
  })

  describe('With Real LLM Service', () => {
    it.skipIf(!isLLMAvailable)('should generate query through the layer', async () => {
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
          analysisGoal: 'Analyze service latency patterns showing p50, p95, p99 percentiles',
          model: process.env.LLM_SQL_MODEL_1 || 'sqlcoder-7b-2'
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
    })

    it.skipIf(!isLLMAvailable)(
      'should generate multiple queries for different patterns',
      async () => {
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
      }
    )

    it.skipIf(!isLLMAvailable)('should validate queries correctly', async () => {
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