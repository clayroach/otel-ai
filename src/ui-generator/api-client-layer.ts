/**
 * UI Generator API Client Layer for Effect-TS dependency injection
 *
 * Provides a Layer interface for server.ts to access UI Generator
 * functionality without manual imports.
 */

import { Context, Effect, Layer } from 'effect'
import {
  UIGeneratorAPIClient,
  type QueryGenerationAPIRequest,
  type QueryGenerationAPIResponse
} from './api-client.js'
import { LLMManagerServiceTag } from '../llm-manager/llm-manager-service.js'
import { StorageServiceTag } from '../storage/services.js'

/**
 * UI Generator API Client Service Interface
 * Simplified interface for server usage with proper Effect-TS patterns
 */
export interface UIGeneratorAPIClientService {
  readonly generateQuery: (
    request: QueryGenerationAPIRequest
  ) => Effect.Effect<QueryGenerationAPIResponse, unknown, LLMManagerServiceTag | StorageServiceTag>
  readonly generateMultipleQueries: (
    request: QueryGenerationAPIRequest & { patterns?: string[] }
  ) => Effect.Effect<
    QueryGenerationAPIResponse[],
    unknown,
    LLMManagerServiceTag | StorageServiceTag
  >
  readonly validateQuery: (
    sql: string
  ) => Effect.Effect<{ valid: boolean; errors: string[] }, never, never>
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
 */
export const makeUIGeneratorAPIClientService: Effect.Effect<
  UIGeneratorAPIClientService,
  never,
  never
> = Effect.sync(() => {
  console.log('🔧 Initializing UI Generator API Client Service...')

  return {
    generateQuery: (request: QueryGenerationAPIRequest) =>
      // Return the raw Effect - layers will be provided at server level
      UIGeneratorAPIClient.generateQuery(request),

    generateMultipleQueries: (request: QueryGenerationAPIRequest & { patterns?: string[] }) =>
      // Return the raw Effect - layers will be provided at server level
      UIGeneratorAPIClient.generateMultipleQueries(request),

    validateQuery: (sql: string) => Effect.succeed(UIGeneratorAPIClient.validateQuery(sql))
  }
})

/**
 * Effect Layer for UI Generator API Client Service
 */
export const UIGeneratorAPIClientLayer = Layer.effect(
  UIGeneratorAPIClientTag,
  makeUIGeneratorAPIClientService
)

// Export convenience functions for common operations
export const generateQuery = (request: QueryGenerationAPIRequest) =>
  Effect.flatMap(UIGeneratorAPIClientTag, (service) => service.generateQuery(request))

export const generateMultipleQueries = (
  request: QueryGenerationAPIRequest & { patterns?: string[] }
) => Effect.flatMap(UIGeneratorAPIClientTag, (service) => service.generateMultipleQueries(request))

export const validateQuery = (sql: string) =>
  Effect.flatMap(UIGeneratorAPIClientTag, (service) => service.validateQuery(sql))
