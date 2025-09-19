/**
 * UI Generator API Client Layer for Effect-TS dependency injection
 *
 * Provides a properly typed Layer interface with explicit dependency declarations.
 * Replaces the old implementation that bypassed Effect-TS dependency checking.
 */

import { Context, Effect, Layer } from 'effect'
import { UIGeneratorServiceTag, type ValidationResult } from './service.js'
import { UIGeneratorServiceLive } from './service-live.js'
import type { QueryGenerationAPIRequest, QueryGenerationAPIResponse } from './api-client.js'
import type { UIGeneratorError } from './errors.js'

/**
 * UI Generator API Client Service Interface
 * Simplified interface for server usage with proper Effect-TS patterns
 *
 * NOTE: This interface returns Effects with no dependencies because
 * all dependencies are resolved at the layer level during service construction.
 */
export interface UIGeneratorAPIClientService {
  readonly generateQuery: (
    request: QueryGenerationAPIRequest
  ) => Effect.Effect<QueryGenerationAPIResponse, UIGeneratorError, never>

  readonly generateMultipleQueries: (
    request: QueryGenerationAPIRequest & { patterns?: string[] }
  ) => Effect.Effect<QueryGenerationAPIResponse[], UIGeneratorError, never>

  readonly validateQuery: (sql: string) => Effect.Effect<ValidationResult, UIGeneratorError, never>
}

/**
 * Context Tag for UI Generator API Client Service
 */
export class UIGeneratorAPIClientTag extends Context.Tag('UIGeneratorAPIClient')<
  UIGeneratorAPIClientTag,
  UIGeneratorAPIClientService
>() {}

/**
 * Implementation factory for UI Generator API Client Service
 *
 * CRITICAL: Now properly declares ALL dependencies that the service requires.
 * This ensures TypeScript catches missing dependencies at compile time.
 */
export const makeUIGeneratorAPIClientService: Effect.Effect<
  UIGeneratorAPIClientService,
  never,
  UIGeneratorServiceTag
> = Effect.gen(function* () {
  console.log('🔧 [UIGeneratorAPIClient] Initializing with resolved dependencies...')

  // Explicitly resolve the UI Generator Service dependency
  const uiGeneratorService = yield* UIGeneratorServiceTag

  // Return service interface that delegates to the resolved service
  return {
    generateQuery: (request: QueryGenerationAPIRequest) =>
      uiGeneratorService.generateQuery(request),

    generateMultipleQueries: (request: QueryGenerationAPIRequest & { patterns?: string[] }) =>
      uiGeneratorService.generateMultipleQueries(request),

    validateQuery: (sql: string) => uiGeneratorService.validateQuery(sql)
  }
})

/**
 * Effect Layer for UI Generator API Client Service
 *
 * This layer composition properly declares the dependency chain:
 * UIGeneratorAPIClient -> UIGeneratorService -> (LLMManager + Storage + Config)
 *
 * The dependencies are provided externally when this layer is used.
 */
export const UIGeneratorAPIClientLayer = Layer.effect(
  UIGeneratorAPIClientTag,
  makeUIGeneratorAPIClientService
).pipe(
  // Provide the UI Generator Service layer
  // Dependencies (LLM + Storage + Config) must be provided externally
  Layer.provide(UIGeneratorServiceLive)
)

// Export convenience functions for common operations
export const generateQuery = (request: QueryGenerationAPIRequest) =>
  Effect.flatMap(UIGeneratorAPIClientTag, (service) => service.generateQuery(request))

export const generateMultipleQueries = (
  request: QueryGenerationAPIRequest & { patterns?: string[] }
) => Effect.flatMap(UIGeneratorAPIClientTag, (service) => service.generateMultipleQueries(request))

export const validateQuery = (sql: string) =>
  Effect.flatMap(UIGeneratorAPIClientTag, (service) => service.validateQuery(sql))
