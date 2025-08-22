/**
 * LLM Manager Service Definitions
 * 
 * Effect-TS service definitions for multi-model LLM orchestration.
 * Provides clean dependency injection and testable interfaces.
 */

import { Context, Effect, Stream } from 'effect'
import type {
  LLMRequest,
  LLMResponse,
  LLMError,
  ConversationContext,
  ModelHealthStatus,
  ModelType,
  LLMConfig
} from './types.js'

/**
 * Main LLM Manager Service
 * 
 * Orchestrates multiple LLM models with intelligent routing, caching,
 * and conversation management.
 */
export class LLMManagerService extends Context.Tag('LLMManagerService')<
  LLMManagerService,
  {
    // Core LLM operations
    readonly generate: (request: LLMRequest) => Effect.Effect<LLMResponse, LLMError, never>
    readonly generateStream: (request: LLMRequest) => Stream.Stream<string, LLMError, never>

    // Conversation management
    readonly startConversation: (systemPrompt?: string) => Effect.Effect<string, LLMError, never>
    readonly continueConversation: (
      conversationId: string,
      message: string
    ) => Effect.Effect<LLMResponse, LLMError, never>
    readonly getConversation: (conversationId: string) => Effect.Effect<ConversationContext, LLMError, never>

    // Model management
    readonly getAvailableModels: () => Effect.Effect<ModelType[], LLMError, never>
    readonly getModelHealth: () => Effect.Effect<ModelHealthStatus[], LLMError, never>
    readonly warmupModels: () => Effect.Effect<void, LLMError, never>
  }
>() {}

/**
 * Model Router Service
 * 
 * Handles intelligent routing of requests to optimal models based on
 * task type, performance, cost, and availability.
 */
export class ModelRouterService extends Context.Tag('ModelRouterService')<
  ModelRouterService,
  {
    readonly selectModel: (request: LLMRequest) => Effect.Effect<ModelType, LLMError, never>
    readonly routeRequest: (request: LLMRequest) => Effect.Effect<LLMResponse, LLMError, never>
    readonly getFallbackChain: (failedModel: ModelType) => Effect.Effect<ModelType[], never, never>
    readonly updateModelPerformance: (model: ModelType, latencyMs: number, success: boolean) => Effect.Effect<void, never, never>
  }
>() {}

/**
 * Model Client Service
 * 
 * Abstract interface for individual model clients (GPT, Claude, Llama).
 * Allows for consistent interaction patterns across different models.
 */
export class ModelClientService extends Context.Tag('ModelClientService')<
  ModelClientService,
  {
    readonly gpt: {
      readonly generate: (request: LLMRequest) => Effect.Effect<LLMResponse, LLMError, never>
      readonly generateStream: (request: LLMRequest) => Stream.Stream<string, LLMError, never>
      readonly isHealthy: () => Effect.Effect<boolean, LLMError, never>
    } | undefined
    
    readonly claude: {
      readonly generate: (request: LLMRequest) => Effect.Effect<LLMResponse, LLMError, never>
      readonly generateStream: (request: LLMRequest) => Stream.Stream<string, LLMError, never>
      readonly isHealthy: () => Effect.Effect<boolean, LLMError, never>
    } | undefined
    
    readonly llama: {
      readonly generate: (request: LLMRequest) => Effect.Effect<LLMResponse, LLMError, never>
      readonly generateStream: (request: LLMRequest) => Stream.Stream<string, LLMError, never>
      readonly isHealthy: () => Effect.Effect<boolean, LLMError, never>
    } | undefined
  }
>() {}

/**
 * Conversation Storage Service
 * 
 * Handles persistence and retrieval of conversation contexts.
 * Integrates with the storage package for data persistence.
 */
export class ConversationStorageService extends Context.Tag('ConversationStorageService')<
  ConversationStorageService,
  {
    readonly save: (context: ConversationContext) => Effect.Effect<void, LLMError, never>
    readonly load: (conversationId: string) => Effect.Effect<ConversationContext, LLMError, never>
    readonly delete: (conversationId: string) => Effect.Effect<void, LLMError, never>
    readonly list: (limit?: number) => Effect.Effect<ConversationContext[], LLMError, never>
  }
>() {}

/**
 * Cache Service
 * 
 * Provides response caching with TTL and size limits to improve
 * performance and reduce API costs.
 */
export class CacheService extends Context.Tag('CacheService')<
  CacheService,
  {
    readonly get: (key: string) => Effect.Effect<LLMResponse | undefined, LLMError, never>
    readonly set: (key: string, value: LLMResponse, ttlSeconds: number) => Effect.Effect<void, LLMError, never>
    readonly invalidate: (key: string) => Effect.Effect<void, never, never>
    readonly clear: () => Effect.Effect<void, never, never>
    readonly size: () => Effect.Effect<number, never, never>
  }
>() {}

/**
 * Configuration Service
 * 
 * Manages LLM configuration with validation and hot-reloading support.
 */
export class LLMConfigService extends Context.Tag('LLMConfigService')<
  LLMConfigService,
  {
    readonly getConfig: () => Effect.Effect<LLMConfig, LLMError, never>
    readonly updateConfig: (config: LLMConfig) => Effect.Effect<void, LLMError, never>
    readonly validateConfig: (config: unknown) => Effect.Effect<LLMConfig, LLMError, never>
  }
>() {}

/**
 * Metrics Service
 * 
 * Collects and reports metrics for LLM operations, performance,
 * and cost tracking.
 */
export class LLMMetricsService extends Context.Tag('LLMMetricsService')<
  LLMMetricsService,
  {
    readonly recordRequest: (model: ModelType, request: LLMRequest) => Effect.Effect<void, never, never>
    readonly recordResponse: (model: ModelType, response: LLMResponse) => Effect.Effect<void, never, never>
    readonly recordError: (model: ModelType, error: LLMError) => Effect.Effect<void, never, never>
    readonly getMetrics: () => Effect.Effect<{
      totalRequests: number
      totalErrors: number
      averageLatency: number
      totalCost: number
      requestsByModel: Record<ModelType, number>
    }, never, never>
  }
>() {}