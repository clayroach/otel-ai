/**
 * API Client Layer for Portkey Gateway Integration
 * Provides a simplified interface for server routes
 */

import { Context, Effect, Layer } from 'effect'
import type { LLMRequest, LLMResponse, LLMError } from './types.js'
import { LLMManagerServiceTag, type ManagerStatus } from './llm-manager-service.js'
import { PortkeyGatewayLive } from './portkey-gateway-client.js'
import type { ModelInfo } from './model-types.js'

// Server compatibility type that extends ModelInfo from model-types.ts
export interface ServerModelInfo extends ModelInfo {
  status: 'available' | 'unavailable' | 'error'
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
  readonly getLoadedModels: () => Effect.Effect<ServerModelInfo[], never, never>
  readonly getStatus: () => Effect.Effect<ManagerStatus, never, never>
  readonly selectBestModel: (taskType: string) => Effect.Effect<string, never, never>
  readonly selectModel: (
    taskType: string | { taskType: string; requirements?: Record<string, unknown> }
  ) => Effect.Effect<ServerModelInfo, never, never>
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
      Effect.map(manager.getAllModels(), (models) =>
        models.map(
          (model): ServerModelInfo => ({
            ...model,
            status:
              model.status === 'loading'
                ? 'unavailable'
                : (model.status as 'available' | 'unavailable' | 'error') || 'available',
            metrics: {
              totalRequests: 0,
              totalTokens: 0,
              averageLatency: 0,
              errorRate: 0
            }
          })
        )
      ).pipe(Effect.catchAll(() => Effect.succeed([]))),

    getStatus: () =>
      Effect.flatMap(manager.getStatus(), (status) =>
        Effect.map(manager.getAllModels(), (models) => ({
          ...status,
          status: 'operational' as const,
          loadedModels: models,
          systemMetrics: {
            totalRequests: 0,
            totalTokens: 0,
            averageLatency: 0,
            errorRate: 0
          }
        }))
      ).pipe(
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
      // Map taskType to manager's expected values
      const mappedTaskType =
        taskType === 'sql_generation'
          ? 'sql'
          : taskType === 'code_generation'
            ? 'code'
            : (taskType as 'sql' | 'general' | 'code')
      return manager
        .getDefaultModel(mappedTaskType)
        .pipe(Effect.catchAll(() => Effect.succeed('gpt-3.5-turbo')))
    },

    selectModel: (
      taskType: string | { taskType: string; requirements?: Record<string, unknown> }
    ) => {
      const task = typeof taskType === 'string' ? taskType : taskType.taskType

      // Map taskType to manager's expected values
      const mappedTaskType =
        task === 'sql_generation'
          ? 'sql'
          : task === 'code_generation'
            ? 'code'
            : (task as 'sql' | 'general' | 'code')

      return Effect.flatMap(manager.getDefaultModel(mappedTaskType), (modelId) =>
        Effect.map(
          manager.getModelInfo(modelId),
          (modelInfo): ServerModelInfo => ({
            ...modelInfo,
            status: 'available',
            metrics: {
              totalRequests: 0,
              totalTokens: 0,
              averageLatency: 0,
              errorRate: 0
            }
          })
        )
      ).pipe(
        Effect.catchAll(() =>
          Effect.succeed({
            id: 'gpt-3.5-turbo',
            name: 'gpt-3.5-turbo',
            provider: 'openai' as const,
            capabilities: ['general'] as ('general' | 'sql' | 'code' | 'embedding')[],
            metadata: {
              contextLength: 4096,
              maxTokens: 2048,
              temperature: 0.7
            },
            status: 'available' as const,
            metrics: {
              totalRequests: 0,
              totalTokens: 0,
              averageLatency: 0,
              errorRate: 0
            }
          })
        )
      )
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

// New convenience functions for rich manager APIs
export const getModelInfo = (modelId: string) =>
  Effect.flatMap(LLMManagerServiceTag, (manager) => manager.getModelInfo(modelId))

export const getModelsByCapability = (capability: string) =>
  Effect.flatMap(LLMManagerServiceTag, (manager) => manager.getModelsByCapability(capability))

export const getModelsByProvider = (provider: string) =>
  Effect.flatMap(LLMManagerServiceTag, (manager) => manager.getModelsByProvider(provider))

export const getAllModels = () =>
  Effect.flatMap(LLMManagerServiceTag, (manager) => manager.getAllModels())

export const getDefaultModel = (taskType?: 'sql' | 'general' | 'code') =>
  Effect.flatMap(LLMManagerServiceTag, (manager) => manager.getDefaultModel(taskType))
