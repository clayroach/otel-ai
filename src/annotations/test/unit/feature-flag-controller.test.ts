import { describe, it, expect } from 'vitest'
import { Effect, Layer } from 'effect'
import {
  FeatureFlagController,
  FeatureFlagControllerMock,
  FeatureFlagError,
  type FeatureFlag,
  type FlagEvaluation
} from '../../feature-flag-controller.js'

describe('FeatureFlagController', () => {
  describe('Mock Implementation', () => {
    const runWithMock = <A, E>(effect: Effect.Effect<A, E, FeatureFlagController>) =>
      Effect.runPromise(effect.pipe(Effect.provide(FeatureFlagControllerMock)))

    it('should list available flags', async () => {
      const result = await runWithMock(
        Effect.gen(function* () {
          const controller = yield* FeatureFlagController
          return yield* controller.listFlags()
        })
      )

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        name: 'testFlag1',
        value: true,
        defaultValue: false,
        description: 'Test flag 1'
      })
      expect(result[1]).toEqual({
        name: 'testFlag2',
        value: false,
        defaultValue: false,
        description: 'Test flag 2'
      })
    })

    it('should get flag value', async () => {
      const result = await runWithMock(
        Effect.gen(function* () {
          const controller = yield* FeatureFlagController
          return yield* controller.getFlagValue('testFlag1')
        })
      )

      expect(result).toBe(true)
    })

    it('should evaluate flag with context', async () => {
      const result = await runWithMock(
        Effect.gen(function* () {
          const controller = yield* FeatureFlagController
          return yield* controller.evaluateFlag('testFlag1', { targetingKey: 'test-user' })
        })
      )

      expect(result).toEqual({
        value: true,
        reason: 'STATIC',
        variant: 'on'
      })
    })

    it('should enable flag', async () => {
      await runWithMock(
        Effect.gen(function* () {
          const controller = yield* FeatureFlagController
          return yield* controller.enableFlag('testFlag1')
        })
      )
      // Should not throw
      expect(true).toBe(true)
    })

    it('should disable flag', async () => {
      await runWithMock(
        Effect.gen(function* () {
          const controller = yield* FeatureFlagController
          return yield* controller.disableFlag('testFlag1')
        })
      )
      // Should not throw
      expect(true).toBe(true)
    })
  })

  describe('Error Handling', () => {
    // Custom error layer for testing error scenarios
    const ErrorControllerLayer = Layer.succeed(FeatureFlagController, {
      listFlags: () =>
        Effect.fail(
          new FeatureFlagError({
            reason: 'ConnectionFailure',
            message: 'Cannot connect to flagd service',
            retryable: true
          })
        ),
      getFlagValue: () =>
        Effect.fail(
          new FeatureFlagError({
            reason: 'FlagNotFound',
            message: 'Flag not found',
            retryable: false
          })
        ),
      enableFlag: () =>
        Effect.fail(
          new FeatureFlagError({
            reason: 'InvalidValue',
            message: 'Cannot enable flag',
            retryable: false
          })
        ),
      disableFlag: () =>
        Effect.fail(
          new FeatureFlagError({
            reason: 'InvalidValue',
            message: 'Cannot disable flag',
            retryable: false
          })
        ),
      evaluateFlag: () =>
        Effect.fail(
          new FeatureFlagError({
            reason: 'EvaluationError',
            message: 'Flag evaluation failed',
            retryable: true
          })
        )
    })

    it('should handle connection failure', async () => {
      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const controller = yield* FeatureFlagController
          return yield* controller.listFlags()
        }).pipe(Effect.provide(ErrorControllerLayer))
      )

      expect(result._tag).toBe('Failure')
      if (result._tag === 'Failure') {
        const error = result.cause._tag === 'Fail' ? result.cause.error : null
        expect(error).toBeInstanceOf(FeatureFlagError)
        if (error instanceof FeatureFlagError) {
          expect(error.reason).toBe('ConnectionFailure')
          expect(error.retryable).toBe(true)
        }
      }
    })

    it('should handle flag not found', async () => {
      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const controller = yield* FeatureFlagController
          return yield* controller.getFlagValue('nonexistent')
        }).pipe(Effect.provide(ErrorControllerLayer))
      )

      expect(result._tag).toBe('Failure')
      if (result._tag === 'Failure') {
        const error = result.cause._tag === 'Fail' ? result.cause.error : null
        expect(error).toBeInstanceOf(FeatureFlagError)
        if (error instanceof FeatureFlagError) {
          expect(error.reason).toBe('FlagNotFound')
          expect(error.retryable).toBe(false)
        }
      }
    })

    it('should handle evaluation error', async () => {
      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const controller = yield* FeatureFlagController
          return yield* controller.evaluateFlag('testFlag')
        }).pipe(Effect.provide(ErrorControllerLayer))
      )

      expect(result._tag).toBe('Failure')
      if (result._tag === 'Failure') {
        const error = result.cause._tag === 'Fail' ? result.cause.error : null
        expect(error).toBeInstanceOf(FeatureFlagError)
        if (error instanceof FeatureFlagError) {
          expect(error.reason).toBe('EvaluationError')
          expect(error.retryable).toBe(true)
        }
      }
    })
  })

  describe('Flag Types', () => {
    it('should validate FeatureFlag structure', () => {
      const flag: FeatureFlag = {
        name: 'testFlag',
        value: true,
        defaultValue: false,
        description: 'Test flag',
        metadata: { category: 'test' }
      }

      expect(flag.name).toBe('testFlag')
      expect(flag.value).toBe(true)
      expect(flag.defaultValue).toBe(false)
      expect(flag.description).toBe('Test flag')
      expect(flag.metadata).toEqual({ category: 'test' })
    })

    it('should validate FlagEvaluation structure', () => {
      const evaluation: FlagEvaluation = {
        value: true,
        variant: 'on',
        reason: 'TARGETING_MATCH',
        errorCode: undefined,
        errorMessage: undefined
      }

      expect(evaluation.value).toBe(true)
      expect(evaluation.variant).toBe('on')
      expect(evaluation.reason).toBe('TARGETING_MATCH')
      expect(evaluation.errorCode).toBeUndefined()
      expect(evaluation.errorMessage).toBeUndefined()
    })
  })
})