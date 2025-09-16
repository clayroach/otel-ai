/**
 * API Client Layer for Portkey Gateway Integration
 * Provides a simplified interface for server routes
 */

import { Context, Effect, Layer } from 'effect'
import type { LLMRequest, LLMResponse, LLMError } from './types.js'
import { LLMManagerServiceTag, type ManagerStatus } from './llm-manager-service.js'
import { PortkeyGatewayLive } from './portkey-gateway-client.js'

// Model info type for server compatibility
export interface ModelInfo {
  id: string
  provider: string
  status: 'available' | 'unavailable' | 'error'
  capabilities?: {
    supportsStreaming?: boolean
    supportsJSON?: boolean
    supportsSQL?: boolean
    contextLength?: number
    maxTokens?: number
    sql?: boolean
    json?: boolean
    reasoning?: boolean
    [key: string]: unknown
  }
  config?: Record<string, unknown>
  metrics?: {
    totalRequests: number
    totalTokens: number
    averageLatency: number
    errorRate: number
  }
}

// API Client Service Interface
export interface LLMManagerAPIClientService {
  readonly getLoadedModels: () => Effect.Effect<ModelInfo[], never, never>
  readonly getStatus: () => Effect.Effect<ManagerStatus, never, never>
  readonly selectBestModel: (taskType: string) => Effect.Effect<string, never, never>
  readonly selectModel: (
    taskType: string | { taskType: string; requirements?: Record<string, unknown> }
  ) => Effect.Effect<ModelInfo, never, never>
  readonly generateLLMResponse: (request: LLMRequest) => Effect.Effect<LLMResponse, LLMError, never>
  readonly generate: (request: LLMRequest) => Effect.Effect<LLMResponse, LLMError, never>
  readonly reloadModels: () => Effect.Effect<void, never, never>
  readonly getModelCategories: () => Effect.Effect<string[], never, never>
}

// Service Tag
export class LLMManagerAPIClientTag extends Context.Tag('LLMManagerAPIClientTag')<
  LLMManagerAPIClientTag,
  LLMManagerAPIClientService
>() {}

// NOTE: LLMManagerAPIClientLayer is defined below after LLMManagerAPIClientLayerWithoutDeps

// Create the layer that REQUIRES the LLMManagerServiceTag
export const LLMManagerAPIClientServiceLive = Layer.effect(
  LLMManagerAPIClientTag,
  Effect.map(LLMManagerServiceTag, (manager) => ({
    getLoadedModels: () =>
      Effect.map(manager.getAvailableModels(), (models) =>
        models.map((modelName) => ({
          id: modelName,
          provider: modelName.includes('gpt')
            ? 'openai'
            : modelName.includes('claude')
              ? 'anthropic'
              : 'local',
          status: 'available' as const,
          capabilities: {
            supportsStreaming: true,
            supportsJSON: modelName.includes('gpt') || modelName.includes('claude'),
            supportsSQL: modelName.includes('sql') || modelName.includes('coder'),
            contextLength: 4096,
            maxTokens: 2048
          },
          metrics: {
            totalRequests: 0,
            totalTokens: 0,
            averageLatency: 0,
            errorRate: 0
          }
        }))
      ).pipe(Effect.catchAll(() => Effect.succeed([]))),

    getStatus: () =>
      Effect.map(manager.getStatus(), (status) => ({
        ...status,
        status: 'operational' as const,
        loadedModels: status.availableModels.map((modelName) => ({
          id: modelName,
          provider: modelName.includes('gpt')
            ? 'openai'
            : modelName.includes('claude')
              ? 'anthropic'
              : 'local',
          status: 'available'
        })),
        systemMetrics: {
          totalRequests: 0,
          totalTokens: 0,
          averageLatency: 0,
          errorRate: 0
        }
      })).pipe(
        Effect.catchAll(() =>
          Effect.succeed({
            availableModels: [],
            healthStatus: {},
            config: {},
            status: 'offline' as const,
            loadedModels: [],
            systemMetrics: {
              totalRequests: 0,
              totalTokens: 0,
              averageLatency: 0,
              errorRate: 0
            }
          })
        )
      ),

    selectBestModel: (taskType: string) => {
      // Simple model selection logic
      if (taskType === 'sql' || taskType === 'sql_generation') {
        return Effect.succeed('gpt-3.5-turbo')
      } else if (taskType === 'code') {
        return Effect.succeed('codellama-7b-instruct')
      } else if (taskType === 'general') {
        return Effect.succeed('claude-3-haiku-20240307')
      }
      return Effect.succeed('gpt-3.5-turbo')
    },

    selectModel: (
      taskType: string | { taskType: string; requirements?: Record<string, unknown> }
    ) => {
      const task = typeof taskType === 'string' ? taskType : taskType.taskType
      // Return a ModelInfo object based on the task type
      let modelId = 'gpt-3.5-turbo'
      let provider = 'openai'

      if (task === 'sql' || task === 'sql_generation') {
        modelId = 'gpt-3.5-turbo'
        provider = 'openai'
      } else if (task === 'code' || task === 'code_generation') {
        modelId = 'claude-3-haiku-20240307'
        provider = 'anthropic'
      } else if (task.includes('claude') || task === 'general') {
        modelId = 'claude-3-haiku-20240307'
        provider = 'anthropic'
      }

      return Effect.succeed({
        id: modelId,
        provider,
        status: 'available' as const,
        capabilities: {
          supportsStreaming: true,
          supportsJSON: provider !== 'local',
          supportsSQL:
            modelId.includes('sql') || modelId.includes('coder') || modelId === 'gpt-3.5-turbo',
          contextLength: 4096,
          maxTokens: 2048
        },
        metrics: {
          totalRequests: 0,
          totalTokens: 0,
          averageLatency: 0,
          errorRate: 0
        }
      })
    },

    generateLLMResponse: (request: LLMRequest) => manager.generate(request),

    generate: (request: LLMRequest) => manager.generate(request),

    reloadModels: () => Effect.succeed(undefined),

    getModelCategories: () => Effect.succeed(['general', 'sql', 'code'])
  }))
)

// Export the layer WITHOUT the Portkey dependency for testing
export const LLMManagerAPIClientLayerWithoutDeps = LLMManagerAPIClientServiceLive

// The main layer with Portkey dependency for production use
export const LLMManagerAPIClientLayer = LLMManagerAPIClientLayerWithoutDeps.pipe(
  Layer.provide(PortkeyGatewayLive)
)

// Convenience functions for direct use
export const getLoadedModels = Effect.flatMap(LLMManagerAPIClientTag, (client) =>
  client.getLoadedModels()
)

export const getLLMManagerStatus = Effect.flatMap(LLMManagerAPIClientTag, (client) =>
  client.getStatus()
)

export const selectBestModel = (taskType: string) =>
  Effect.flatMap(LLMManagerAPIClientTag, (client) => client.selectBestModel(taskType))

export const generateLLMResponse = (request: LLMRequest) =>
  Effect.flatMap(LLMManagerAPIClientTag, (client) => client.generateLLMResponse(request))
