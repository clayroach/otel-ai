/**
 * LLM Manager Service Layer
 *
 * Provides a service layer abstraction for the LLM Manager using Effect-TS patterns.
 * This enables dependency injection, better testability, and cleaner architecture.
 */

import { Context, Effect, Stream } from 'effect'
import type { LLMRequest, LLMResponse, LLMError } from './types.js'
import type { ModelInfo } from './model-types.js'

/**
 * Manager Status type with available models and health status
 */
export interface ManagerStatus {
  readonly availableModels: string[]
  readonly healthStatus: Record<string, 'healthy' | 'unhealthy' | 'unknown'>
  readonly config: Record<string, unknown>
  readonly status?: 'operational' | 'degraded' | 'offline'
  readonly loadedModels?: ModelInfo[]
  readonly systemMetrics?: Record<string, unknown>
}

/**
 * LLM Manager Service Interface
 * Defines the contract for LLM management operations
 */
export interface LLMManagerService {
  /**
   * Generate a response using the configured LLM
   */
  readonly generate: (request: LLMRequest) => Effect.Effect<LLMResponse, LLMError, never>

  /**
   * Generate a streaming response
   */
  readonly generateStream: (request: LLMRequest) => Stream.Stream<string, LLMError, never>

  /**
   * Check if the service is healthy
   */
  readonly isHealthy: () => Effect.Effect<boolean, LLMError, never>

  /**
   * Get the current status of the LLM manager
   */
  readonly getStatus: () => Effect.Effect<ManagerStatus, LLMError, never>

  /**
   * Get list of available models
   */
  readonly getAvailableModels: () => Effect.Effect<string[], LLMError, never>

  /**
   * Get default model for a specific task type
   */
  readonly getDefaultModel: (
    taskType?: 'sql' | 'general' | 'code'
  ) => Effect.Effect<string, LLMError, never>

  /**
   * Get detailed information about a specific model
   */
  readonly getModelInfo: (modelId: string) => Effect.Effect<ModelInfo, LLMError, never>

  /**
   * Get models filtered by capability
   */
  readonly getModelsByCapability: (
    capability: string
  ) => Effect.Effect<ModelInfo[], LLMError, never>

  /**
   * Get models filtered by provider
   */
  readonly getModelsByProvider: (provider: string) => Effect.Effect<ModelInfo[], LLMError, never>

  /**
   * Get all available models with detailed information
   */
  readonly getAllModels: () => Effect.Effect<ModelInfo[], LLMError, never>
}

/**
 * Service Tag for dependency injection
 */
export class LLMManagerServiceTag extends Context.Tag('LLMManagerService')<
  LLMManagerServiceTag,
  LLMManagerService
>() {}
