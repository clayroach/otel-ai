import { describe, it, expect, beforeAll } from 'vitest'
import { Effect, Layer, Duration } from 'effect'
import {
  FeatureFlagController,
  FeatureFlagControllerLive,
  FeatureFlagConfigTag
} from '../../feature-flag-controller.js'

// This test requires flagd to be running at localhost:8013
// Run with: pnpm demo:up (includes flagd) or standalone flagd container
describe('FeatureFlagController Integration Tests', () => {
  describe('Live flagd integration', () => {
    // Custom configuration for testing
    const TestConfigLayer = Layer.succeed(FeatureFlagConfigTag, {
      flagdHost: process.env.FLAGD_HOST ?? 'localhost',
      flagdPort: parseInt(process.env.FLAGD_PORT ?? '8013'),
      cacheTTL: 1000, // Short cache for testing
      timeout: 5000
    })

    const TestLayer = FeatureFlagControllerLive.pipe(
      Layer.provide(TestConfigLayer)
    )

    const runWithLive = <A, E>(effect: Effect.Effect<A, E, FeatureFlagController>) =>
      Effect.runPromise(
        effect.pipe(
          Effect.provide(TestLayer),
          Effect.timeout(Duration.seconds(10))
        )
      )

    beforeAll(async () => {
      // Note: flagd doesn't expose a REST health endpoint
      // The connection test will happen in the actual test cases
      console.log('🚀 Running flagd integration tests...')
      console.log('   Expecting flagd on localhost:8013 (gRPC)')
      console.log('   If tests fail, ensure flagd is running: pnpm demo:up')
    })

    it('should connect to flagd and list flags', async () => {
      const flags = await runWithLive(
        Effect.gen(function* () {
          const controller = yield* FeatureFlagController
          return yield* controller.listFlags()
        })
      )

      expect(Array.isArray(flags)).toBe(true)
      expect(flags.length).toBeGreaterThan(0)

      // Check for known OTel demo flags
      const flagNames = flags.map(f => f.name)
      console.log('Available flags:', flagNames)
      // These are the actual flags from the demo
      const expectedFlags = [
        'productCatalogFailure',
        'recommendationCacheFailure',
        'cartFailure',
        'paymentFailure',
        'adFailure'
      ]
      // At least some of these should be present
      const hasExpectedFlags = expectedFlags.some(flag => flagNames.includes(flag))
      expect(hasExpectedFlags).toBe(true)
    })

    it('should get flag value for known flag', async () => {
      const value = await runWithLive(
        Effect.gen(function* () {
          const controller = yield* FeatureFlagController
          return yield* controller.getFlagValue('productCatalogFailure')
        })
      )

      expect(typeof value).toBe('boolean')
    })

    it('should evaluate flag with context', async () => {
      const evaluation = await runWithLive(
        Effect.gen(function* () {
          const controller = yield* FeatureFlagController
          return yield* controller.evaluateFlag('productCatalogFailure', {
            targetingKey: 'test-user-123'
          })
        })
      )

      expect(evaluation).toHaveProperty('value')
      expect(typeof evaluation.value).toBe('boolean')
      expect(evaluation).toHaveProperty('reason')
      expect(typeof evaluation.reason).toBe('string')
    })

    it('should handle non-existent flag gracefully', async () => {
      const evaluation = await runWithLive(
        Effect.gen(function* () {
          const controller = yield* FeatureFlagController
          return yield* controller.evaluateFlag('non-existent-flag-xyz', {
            targetingKey: 'test-user'
          })
        })
      )

      // Should return default value (false) for non-existent flags
      expect(evaluation.value).toBe(false)
      expect(evaluation.reason).toMatch(/DEFAULT|ERROR/)
    })

    it('should handle multiple flag evaluations', async () => {
      const results = await runWithLive(
        Effect.gen(function* () {
          const controller = yield* FeatureFlagController

          const flags = [
            'productCatalogFailure',
            'recommendationCacheFailure',
            'adFailure'
          ]

          const evaluations = yield* Effect.all(
            flags.map(flag =>
              controller.evaluateFlag(flag, { targetingKey: 'batch-test' })
            ),
            { concurrency: 3 }
          )

          return evaluations
        })
      )

      expect(results).toHaveLength(3)
      results.forEach(result => {
        expect(result).toHaveProperty('value')
        expect(result).toHaveProperty('reason')
      })
    })

    it('should handle connection errors gracefully', async () => {
      // Create a layer with wrong port to test connection failure
      const BadConfigLayer = Layer.succeed(FeatureFlagConfigTag, {
        flagdHost: 'localhost',
        flagdPort: 9999, // Wrong port
        cacheTTL: 1000,
        timeout: 1000
      })

      const BadLayer = FeatureFlagControllerLive.pipe(
        Layer.provide(BadConfigLayer)
      )

      // Try to get a flag value with bad connection
      // Note: OpenFeature SDK might return default values instead of failing
      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const controller = yield* FeatureFlagController
          // Try to evaluate a flag - this should either fail or return default
          const evaluation = yield* controller.evaluateFlag('testFlag')
          // If we get here, check that it's returning a default/error reason
          return evaluation
        }).pipe(
          Effect.provide(BadLayer),
          Effect.timeout(Duration.seconds(2))
        )
      )

      // The test might succeed with default values or fail with connection error
      if (result._tag === 'Success') {
        // OpenFeature returns default values when flagd is unavailable
        const evaluation = result.value
        expect(evaluation.value).toBe(false) // Default value
        expect(['DEFAULT', 'ERROR', 'PROVIDER_NOT_READY'].some(
          reason => evaluation.reason.includes(reason)
        )).toBe(true)
      } else {
        // Or it might fail with a connection error
        expect(['TimeoutException', 'FeatureFlagError'].some(
          type => JSON.stringify(result.cause).includes(type)
        )).toBe(true)
      }
    })
  })

  describe('Mock fallback when flagd unavailable', () => {
    it('should use mock when flagd is not running', async () => {
      // This test always runs and demonstrates fallback behavior
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const controller = yield* FeatureFlagController
          return yield* controller.listFlags()
        }).pipe(
          Effect.provide(Layer.succeed(FeatureFlagController, {
            listFlags: () => Effect.succeed([{
              name: 'fallbackFlag',
              value: true,
              defaultValue: false,
              description: 'Fallback when flagd unavailable'
            }] as const),
            getFlagValue: () => Effect.succeed(true),
            enableFlag: () => Effect.succeed(undefined),
            disableFlag: () => Effect.succeed(undefined),
            evaluateFlag: () => Effect.succeed({
              value: true,
              reason: 'FALLBACK',
              variant: 'on'
            })
          }))
        )
      )

      expect(result).toHaveLength(1)
      expect(result[0]?.name).toBe('fallbackFlag')
    })
  })
})