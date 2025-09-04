/**
 * LLM Manager API Client Layer for Effect-TS dependency injection
 *
 * Provides a simplified Layer interface for server.ts to access LLM Manager
 * functionality without manual imports and singleton patterns.
 */

import { Context, Effect, Layer } from 'effect'
import type {
  LLMManagerAPIClient,
  LoadedModel,
  LLMManagerStatus,
  ModelSelectionRequest,
  ModelSelectionResponse
} from './api-client.js'
import { getLLMManagerClient } from './api-client.js'
import type { LLMRequest, LLMResponse } from './types.js'

/**
 * LLM Manager API Client Service Interface
 * Simplified interface for server usage with proper Effect-TS patterns
 */
export interface LLMManagerAPIClientService {
  readonly getStatus: () => Effect.Effect<LLMManagerStatus, Error, never>
  readonly getLoadedModels: () => Effect.Effect<LoadedModel[], Error, never>
  readonly selectModel: (
    request: ModelSelectionRequest
  ) => Effect.Effect<ModelSelectionResponse, Error, never>
  readonly generate: (request: LLMRequest) => Effect.Effect<LLMResponse, Error, never>
  readonly reloadModels: () => Effect.Effect<void, Error, never>
  readonly getModelMetrics: (modelId: string) => Effect.Effect<LoadedModel['metrics'], Error, never>
  readonly checkModelHealth: (modelId: string) => Effect.Effect<boolean, Error, never>
  readonly getModelCategories: () => Effect.Effect<Record<string, string[]>, never, never>
}

/**
 * Context Tag for LLM Manager API Client Service
 */
export class LLMManagerAPIClientTag extends Context.Tag('LLMManagerAPIClient')<
  LLMManagerAPIClientTag,
  LLMManagerAPIClientService
>() {}

/**
 * Implementation factory for LLM Manager API Client Service
 */
export const makeLLMManagerAPIClientService: Effect.Effect<
  LLMManagerAPIClientService,
  Error,
  never
> = Effect.gen(function* (_) {
  console.log('🔧 Initializing LLM Manager API Client Service...')

  // Get the singleton LLM Manager client instance
  const client: LLMManagerAPIClient = yield* _(
    Effect.promise(() => getLLMManagerClient()).pipe(
      Effect.mapError((error) => new Error(`Failed to initialize LLM Manager: ${error}`))
    )
  )

  console.log('✅ LLM Manager API Client Service initialized successfully')

  return {
    getStatus: () =>
      Effect.promise(() => client.getStatus()).pipe(
        Effect.mapError((error) => new Error(`Failed to get LLM Manager status: ${error}`))
      ),

    getLoadedModels: () =>
      Effect.promise(() => client.getLoadedModels()).pipe(
        Effect.mapError((error) => new Error(`Failed to get loaded models: ${error}`))
      ),

    selectModel: (request: ModelSelectionRequest) =>
      Effect.promise(() => client.selectModel(request)).pipe(
        Effect.mapError((error) => new Error(`Failed to select model: ${error}`))
      ),

    generate: (request: LLMRequest) =>
      Effect.promise(() => client.generate(request)).pipe(
        Effect.mapError((error) => new Error(`Failed to generate LLM response: ${error}`))
      ),

    reloadModels: () =>
      Effect.promise(() => client.reloadModels()).pipe(
        Effect.mapError((error) => new Error(`Failed to reload models: ${error}`))
      ),

    getModelMetrics: (modelId: string) =>
      Effect.promise(() => client.getModelMetrics(modelId)).pipe(
        Effect.mapError((error) => new Error(`Failed to get model metrics: ${error}`))
      ),

    checkModelHealth: (modelId: string) =>
      Effect.promise(() => client.checkModelHealth(modelId)).pipe(
        Effect.mapError((error) => new Error(`Failed to check model health: ${error}`))
      ),

    getModelCategories: () => Effect.succeed(client.getModelCategories())
  }
})

/**
 * Effect Layer for LLM Manager API Client Service
 */
export const LLMManagerAPIClientLayer = Layer.effect(
  LLMManagerAPIClientTag,
  makeLLMManagerAPIClientService
)

// Export convenience functions for common operations
export const getLoadedModels = Effect.gen(function* (_) {
  const service = yield* _(LLMManagerAPIClientTag)
  return yield* _(service.getLoadedModels())
})

export const getLLMManagerStatus = Effect.gen(function* (_) {
  const service = yield* _(LLMManagerAPIClientTag)
  return yield* _(service.getStatus())
})

export const selectBestModel = (request: ModelSelectionRequest) =>
  Effect.gen(function* (_) {
    const service = yield* _(LLMManagerAPIClientTag)
    return yield* _(service.selectModel(request))
  })

export const generateLLMResponse = (request: LLMRequest) =>
  Effect.gen(function* (_) {
    const service = yield* _(LLMManagerAPIClientTag)
    return yield* _(service.generate(request))
  })
