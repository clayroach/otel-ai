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

// Create API Client Layer
export const LLMManagerAPIClientLayer = Layer.effect(
  LLMManagerAPIClientTag,
  Effect.gen(function* () {
    const manager = yield* LLMManagerServiceTag

    return {
      getLoadedModels: () =>
        manager.getAvailableModels().pipe(
          Effect.map((models) =>
            models.map((modelId) => ({
              id: modelId,
              provider: modelId.includes('claude')
                ? 'anthropic'
                : modelId.includes('gpt')
                  ? 'openai'
                  : 'local',
              status: 'available' as const,
              capabilities: {
                supportsStreaming: true,
                supportsJSON: true,
                supportsSQL: modelId.includes('sql') || modelId.includes('coder'),
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
          ),
          Effect.catchAll(() => Effect.succeed([]))
        ),

      getStatus: () =>
        manager.getStatus().pipe(
          Effect.map((status) => ({
            ...status,
            status: 'operational' as const,
            loadedModels: status.availableModels.map((id) => ({
              id,
              provider: id.includes('claude')
                ? 'anthropic'
                : id.includes('gpt')
                  ? 'openai'
                  : 'local',
              status: 'available' as const
            })),
            systemMetrics: {
              totalRequests: 0,
              avgResponseTime: 0
            }
          })),
          Effect.catchAll(() =>
            Effect.succeed({
              availableModels: [],
              healthStatus: {},
              config: {},
              status: 'offline' as const,
              loadedModels: [],
              systemMetrics: {}
            } as ManagerStatus)
          )
        ),

      selectBestModel: (taskType: string) =>
        Effect.succeed(taskType === 'sql_generation' ? 'gpt-3.5-turbo' : 'claude-3-haiku-20240307'),

      selectModel: (
        taskTypeOrObj: string | { taskType: string; requirements?: Record<string, unknown> }
      ) => {
        const taskType = typeof taskTypeOrObj === 'string' ? taskTypeOrObj : taskTypeOrObj.taskType
        return Effect.succeed({
          id: taskType === 'sql_generation' ? 'gpt-3.5-turbo' : 'claude-3-haiku-20240307',
          provider: taskType === 'sql_generation' ? 'openai' : 'anthropic',
          status: 'available' as const,
          capabilities: {
            supportsStreaming: true,
            supportsJSON: true,
            supportsSQL: taskType === 'sql_generation',
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
    }
  })
).pipe(Layer.provide(PortkeyGatewayLive))

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
