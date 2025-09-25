import { Context, Data, Effect, Layer } from 'effect'
import * as Schema from '@effect/schema/Schema'
import { OpenFeature, type EvaluationContext } from '@openfeature/server-sdk'
import { FlagdProvider } from '@openfeature/flagd-provider'

// Error types
export class FeatureFlagError extends Data.TaggedError('FeatureFlagError')<{
  readonly reason: 'ConnectionFailure' | 'FlagNotFound' | 'EvaluationError' | 'InvalidValue'
  readonly message: string
  readonly retryable: boolean
}> {}

// Schema definitions
const FeatureFlagSchema = Schema.Struct({
  name: Schema.String,
  value: Schema.Boolean,
  defaultValue: Schema.Boolean,
  description: Schema.optional(Schema.String),
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Unknown))
})

export type FeatureFlag = Schema.Schema.Type<typeof FeatureFlagSchema>

const FlagEvaluationSchema = Schema.Struct({
  value: Schema.Boolean,
  variant: Schema.optional(Schema.String),
  reason: Schema.String,
  errorCode: Schema.optional(Schema.String),
  errorMessage: Schema.optional(Schema.String)
})

export type FlagEvaluation = Schema.Schema.Type<typeof FlagEvaluationSchema>

// Service interface
export interface FeatureFlagControllerImpl {
  readonly listFlags: () => Effect.Effect<readonly FeatureFlag[], FeatureFlagError, never>
  readonly getFlagValue: (flagName: string) => Effect.Effect<boolean, FeatureFlagError, never>
  readonly enableFlag: (flagName: string) => Effect.Effect<void, FeatureFlagError, never>
  readonly disableFlag: (flagName: string) => Effect.Effect<void, FeatureFlagError, never>
  readonly evaluateFlag: (
    flagName: string,
    context?: Record<string, unknown>
  ) => Effect.Effect<FlagEvaluation, FeatureFlagError, never>
}

export class FeatureFlagController extends Context.Tag('FeatureFlagController')<
  FeatureFlagController,
  FeatureFlagControllerImpl
>() {}

// Configuration
export interface FeatureFlagConfig {
  readonly flagdHost: string
  readonly flagdPort: number
  readonly cacheTTL?: number
  readonly timeout?: number
}

export class FeatureFlagConfigTag extends Context.Tag('FeatureFlagConfig')<
  FeatureFlagConfigTag,
  FeatureFlagConfig
>() {}

// Implementation
const makeFeatureFlagController = Effect.gen(function* () {
  const config = yield* FeatureFlagConfigTag

  // Create provider with proper FlagdProviderOptions type
  const providerOptions: {
    host: string
    port: number
    maxCacheSize?: number
  } = {
    host: config.flagdHost,
    port: config.flagdPort
  }

  if (config.cacheTTL) {
    providerOptions.maxCacheSize = config.cacheTTL
  }

  const provider = new FlagdProvider(providerOptions)

  yield* Effect.sync(() => {
    OpenFeature.setProvider(provider)
  }).pipe(
    Effect.catchAll((error) =>
      Effect.fail(
        new FeatureFlagError({
          reason: 'ConnectionFailure',
          message: `Failed to initialize OpenFeature provider: ${String(error)}`,
          retryable: true
        })
      )
    )
  )

  const client = OpenFeature.getClient()

  return {
    listFlags: () =>
      Effect.tryPromise({
        try: async () => {
          // Flagd doesn't have a direct list API, so we maintain a known flags list
          // In production, this would be fetched from flagd configuration or a registry
          const knownFlags = [
            'productCatalogFailure',
            'recommendationCache',
            'adServiceFailure',
            'cartServiceFailure',
            'paymentServiceFailure',
            'loadgeneratorFloodHomepage'
          ]

          const flags = await Promise.all(
            knownFlags.map(async (name) => {
              try {
                const evaluation = await client.getBooleanDetails(name, false)
                return {
                  name,
                  value: evaluation.value,
                  defaultValue: false,
                  description: `Feature flag: ${name}`,
                  metadata: evaluation.flagMetadata
                }
              } catch {
                // Flag might not exist, return default
                return {
                  name,
                  value: false,
                  defaultValue: false,
                  description: `Feature flag: ${name}`
                }
              }
            })
          )

          return flags
        },
        catch: (error) =>
          new FeatureFlagError({
            reason: 'ConnectionFailure',
            message: `Failed to list flags: ${String(error)}`,
            retryable: true
          })
      }),

    getFlagValue: (flagName: string) =>
      Effect.tryPromise({
        try: async () => {
          const result = await client.getBooleanValue(flagName, false)
          return result
        },
        catch: (error) =>
          new FeatureFlagError({
            reason: 'EvaluationError',
            message: `Failed to get flag value for '${flagName}': ${String(error)}`,
            retryable: true
          })
      }),

    enableFlag: (flagName: string) =>
      Effect.tryPromise({
        try: async () => {
          // Note: Flagd is typically read-only from clients
          // In a real implementation, this would call a management API
          // For now, we'll simulate by attempting to evaluate with targeting context
          const evaluation = await client.getBooleanDetails(flagName, true, {
            targetingKey: 'override-enable'
          })

          if (!evaluation.value) {
            throw new Error('Flag could not be enabled')
          }
        },
        catch: (error) =>
          new FeatureFlagError({
            reason: 'InvalidValue',
            message: `Failed to enable flag '${flagName}': ${String(error)}`,
            retryable: false
          })
      }),

    disableFlag: (flagName: string) =>
      Effect.tryPromise({
        try: async () => {
          // Similar to enableFlag, this would use a management API in production
          const evaluation = await client.getBooleanDetails(flagName, false, {
            targetingKey: 'override-disable'
          })

          if (evaluation.value) {
            throw new Error('Flag could not be disabled')
          }
        },
        catch: (error) =>
          new FeatureFlagError({
            reason: 'InvalidValue',
            message: `Failed to disable flag '${flagName}': ${String(error)}`,
            retryable: false
          })
      }),

    evaluateFlag: (flagName: string, context?: Record<string, unknown>) =>
      Effect.tryPromise({
        try: async () => {
          // Convert context to EvaluationContext, using only the targetingKey if provided
          const evaluationContext: EvaluationContext = context?.targetingKey
            ? { targetingKey: String(context.targetingKey) }
            : {}

          const evaluation = await client.getBooleanDetails(
            flagName,
            false,
            evaluationContext
          )
          return {
            value: evaluation.value,
            variant: evaluation.variant,
            reason: evaluation.reason ?? 'DEFAULT',
            errorCode: evaluation.errorCode,
            errorMessage: evaluation.errorMessage
          }
        },
        catch: (error) =>
          new FeatureFlagError({
            reason: 'EvaluationError',
            message: `Failed to evaluate flag '${flagName}': ${String(error)}`,
            retryable: true
          })
      })
  }
})

// Layer with default configuration
export const FeatureFlagControllerLive = Layer.effect(
  FeatureFlagController,
  makeFeatureFlagController
).pipe(
  Layer.provide(
    Layer.succeed(FeatureFlagConfigTag, {
      flagdHost: process.env.FLAGD_HOST ?? 'localhost',
      flagdPort: parseInt(process.env.FLAGD_PORT ?? '8013'),
      cacheTTL: parseInt(process.env.FLAGD_CACHE_TTL ?? '30000'),
      timeout: parseInt(process.env.FLAGD_TIMEOUT ?? '5000')
    })
  )
)

// Mock implementation for testing
export const FeatureFlagControllerMock = Layer.succeed(FeatureFlagController, {
  listFlags: () =>
    Effect.succeed([
      {
        name: 'testFlag1',
        value: true,
        defaultValue: false,
        description: 'Test flag 1'
      },
      {
        name: 'testFlag2',
        value: false,
        defaultValue: false,
        description: 'Test flag 2'
      }
    ] as const),

  getFlagValue: (flagName: string) => Effect.succeed(flagName === 'testFlag1'),

  enableFlag: () => Effect.succeed(undefined),

  disableFlag: () => Effect.succeed(undefined),

  evaluateFlag: (flagName: string) =>
    Effect.succeed({
      value: flagName === 'testFlag1',
      reason: 'STATIC',
      variant: 'on'
    })
})
