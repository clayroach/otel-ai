/**
 * Unit tests for API Client Layer
 */

import { describe, it, expect, vi } from 'vitest'
import { Effect, Layer, Cause, Chunk } from 'effect'
import {
  LLMManagerAPIClientTag,
  LLMManagerAPIClientLayerWithoutDeps,
  getLoadedModels,
  getLLMManagerStatus,
  selectBestModel,
  generateLLMResponse
} from '../../api-client-layer.js'
import type { ModelInfo } from '../../model-types.js'
import { LLMManagerServiceTag } from '../../llm-manager-service.js'
import type { LLMRequest, LLMResponse } from '../../types.js'
import { ModelUnavailable } from '../../types.js'

// Create a mock manager service
const createMockManager = (overrides = {}) => {
  return Layer.succeed(
    LLMManagerServiceTag,
    {
      generate: vi.fn((request: LLMRequest) =>
        Effect.succeed<LLMResponse>({
          content: 'Mock response',
          model: request.preferences?.model || 'gpt-3.5-turbo',
          usage: {
            promptTokens: 10,
            completionTokens: 20,
            totalTokens: 30
          },
          metadata: {
            latencyMs: 100,
            retryCount: 0,
            cached: false
          }
        })
      ),
      generateStream: vi.fn(() => Effect.fail(new ModelUnavailable({ model: 'mock', message: 'Not implemented' }))),
      isHealthy: vi.fn(() => Effect.succeed(true)),
      getStatus: vi.fn(() =>
        Effect.succeed({
          availableModels: ['gpt-3.5-turbo', 'gpt-4', 'claude-3-haiku-20240307'],
          healthStatus: {
            'gpt-3.5-turbo': 'healthy' as const,
            'gpt-4': 'healthy' as const,
            'claude-3-haiku-20240307': 'healthy' as const
          },
          config: {
            baseURL: 'http://test'
          }
        })
      ),
      getAvailableModels: vi.fn(() =>
        Effect.succeed(['gpt-3.5-turbo', 'gpt-4', 'claude-3-haiku-20240307'])
      ),
      getDefaultModel: vi.fn((taskType?: 'sql' | 'general' | 'code') => {
        if (taskType === 'sql') return Effect.succeed('gpt-3.5-turbo')
        if (taskType === 'general') return Effect.succeed('claude-3-haiku-20240307')
        if (taskType === 'code') return Effect.succeed('codellama-7b-instruct')
        return Effect.succeed('gpt-3.5-turbo')
      }),
      getModelInfo: vi.fn((modelId: string) =>
        Effect.succeed<ModelInfo>({
          id: modelId,
          name: modelId,
          provider: modelId.includes('gpt') ? 'openai' :
                    modelId.includes('claude') ? 'anthropic' :
                    modelId.includes('codellama') ? 'lm-studio' : 'openai',
          capabilities: modelId.includes('sql') || modelId.includes('codellama') ? ['sql', 'code'] : ['general'],
          metadata: {
            contextLength: modelId.includes('claude') ? 200000 : 4096,
            maxTokens: modelId.includes('gpt-4') ? 4096 : 2048,
            temperature: 0.7
          }
        })
      ),
      getModelsByCapability: vi.fn(() => Effect.succeed([])),
      getModelsByProvider: vi.fn(() => Effect.succeed([])),
      getAllModels: vi.fn(() =>
        Effect.succeed([
          {
            id: 'gpt-3.5-turbo',
            name: 'gpt-3.5-turbo',
            provider: 'openai',
            capabilities: ['general'],
            metadata: { contextLength: 4096, maxTokens: 2048, temperature: 0.7 }
          },
          {
            id: 'gpt-4',
            name: 'gpt-4',
            provider: 'openai',
            capabilities: ['general'],
            metadata: { contextLength: 8192, maxTokens: 4096, temperature: 0.7 }
          },
          {
            id: 'claude-3-haiku-20240307',
            name: 'claude-3-haiku-20240307',
            provider: 'anthropic',
            capabilities: ['general'],
            metadata: { contextLength: 200000, maxTokens: 4096, temperature: 0.7 }
          }
        ] as ModelInfo[])
      ),
      ...overrides
    }
  )
}

describe('LLMManagerAPIClientLayer', () => {
  describe('getLoadedModels', () => {
    it('should return formatted model info', async () => {
      const mockLayer = createMockManager()
      const layer = LLMManagerAPIClientLayerWithoutDeps.pipe(Layer.provide(mockLayer))

      const result = await Effect.runPromise(
        getLoadedModels.pipe(Effect.provide(layer))
      )

      expect(result).toHaveLength(3)
      expect(result[0]).toMatchObject({
        id: 'gpt-3.5-turbo',
        name: 'gpt-3.5-turbo',
        provider: 'openai',
        capabilities: ['general'],
        metadata: {
          contextLength: 4096,
          maxTokens: 2048,
          temperature: 0.7
        },
        status: 'available',
        metrics: {
          totalRequests: 0,
          totalTokens: 0,
          averageLatency: 0,
          errorRate: 0
        }
      })
      expect(result[2]).toMatchObject({
        id: 'claude-3-haiku-20240307',
        name: 'claude-3-haiku-20240307',
        provider: 'anthropic',
        capabilities: ['general'],
        status: 'available'
      })
    })

    it('should handle errors gracefully', async () => {
      const mockLayer = createMockManager({
        getAllModels: vi.fn(() => Effect.fail(new Error('Failed to get models')))
      })
      const layer = LLMManagerAPIClientLayerWithoutDeps.pipe(Layer.provide(mockLayer))

      const result = await Effect.runPromise(
        getLoadedModels.pipe(Effect.provide(layer))
      )

      expect(result).toEqual([])
    })

    it('should identify local models correctly', async () => {
      const mockLayer = createMockManager({
        getAllModels: vi.fn(() =>
          Effect.succeed([
            {
              id: 'codellama-7b-instruct',
              name: 'codellama-7b-instruct',
              provider: 'lm-studio',
              capabilities: ['code'],
              metadata: { contextLength: 4096, maxTokens: 2048, temperature: 0.7 }
            },
            {
              id: 'llama2-13b',
              name: 'llama2-13b',
              provider: 'ollama',
              capabilities: ['general'],
              metadata: { contextLength: 4096, maxTokens: 2048, temperature: 0.7 }
            }
          ] as ModelInfo[])
        )
      })
      const layer = LLMManagerAPIClientLayerWithoutDeps.pipe(Layer.provide(mockLayer))

      const result = await Effect.runPromise(
        getLoadedModels.pipe(Effect.provide(layer))
      )

      expect(result).toHaveLength(2)
      expect(result[0]?.provider).toBe('lm-studio')
      expect(result[1]?.provider).toBe('ollama')
    })
  })

  describe('getStatus', () => {
    it('should return formatted status', async () => {
      const mockLayer = createMockManager()
      const layer = LLMManagerAPIClientLayerWithoutDeps.pipe(Layer.provide(mockLayer))

      const result = await Effect.runPromise(
        getLLMManagerStatus.pipe(Effect.provide(layer))
      )

      expect(result.status).toBe('operational')
      expect(result.loadedModels).toHaveLength(3)
      expect(result.systemMetrics).toBeDefined()
      expect(result.loadedModels?.[0]).toMatchObject({
        id: 'gpt-3.5-turbo',
        name: 'gpt-3.5-turbo',
        provider: 'openai',
        capabilities: ['general'],
        metadata: {
          contextLength: 4096,
          maxTokens: 2048,
          temperature: 0.7
        }
      })
    })

    it('should handle errors with offline status', async () => {
      const mockLayer = createMockManager({
        getStatus: vi.fn(() => Effect.fail(new Error('Connection failed')))
      })
      const layer = LLMManagerAPIClientLayerWithoutDeps.pipe(Layer.provide(mockLayer))

      const result = await Effect.runPromise(
        getLLMManagerStatus.pipe(Effect.provide(layer))
      )

      expect(result.status).toBe('offline')
      expect(result.loadedModels).toEqual([])
      expect(result.availableModels).toEqual([])
    })
  })

  describe('selectBestModel', () => {
    it('should select GPT for SQL tasks', async () => {
      const mockLayer = createMockManager()
      const layer = LLMManagerAPIClientLayerWithoutDeps.pipe(Layer.provide(mockLayer))

      const result = await Effect.runPromise(
        selectBestModel('sql_generation').pipe(Effect.provide(layer))
      )

      expect(result).toBe('gpt-3.5-turbo')
    })

    it('should select Claude for general tasks', async () => {
      const mockLayer = createMockManager()
      const layer = LLMManagerAPIClientLayerWithoutDeps.pipe(Layer.provide(mockLayer))

      const result = await Effect.runPromise(
        selectBestModel('general').pipe(Effect.provide(layer))
      )

      expect(result).toBe('claude-3-haiku-20240307')
    })
  })

  describe('selectModel', () => {
    it('should return model info for string task type', async () => {
      const mockLayer = createMockManager()
      const layer = LLMManagerAPIClientLayerWithoutDeps.pipe(Layer.provide(mockLayer))

      const client = await Effect.runPromise(
        LLMManagerAPIClientTag.pipe(Effect.provide(layer))
      )

      const result = await Effect.runPromise(
        client.selectModel('sql_generation')
      )

      expect(result).toMatchObject({
        id: 'gpt-3.5-turbo',
        name: 'gpt-3.5-turbo',
        provider: 'openai',
        status: 'available',
        capabilities: ['general'],
        metadata: {
          contextLength: 4096,
          maxTokens: 2048,
          temperature: 0.7
        },
        metrics: {
          totalRequests: 0,
          totalTokens: 0,
          averageLatency: 0,
          errorRate: 0
        }
      })
    })

    it('should handle object task type with requirements', async () => {
      const mockLayer = createMockManager()
      const layer = LLMManagerAPIClientLayerWithoutDeps.pipe(Layer.provide(mockLayer))

      const client = await Effect.runPromise(
        LLMManagerAPIClientTag.pipe(Effect.provide(layer))
      )

      const result = await Effect.runPromise(
        client.selectModel({
          taskType: 'code_generation',
          requirements: { language: 'python' }
        })
      )

      expect(result).toMatchObject({
        id: 'codellama-7b-instruct',
        name: 'codellama-7b-instruct',
        provider: 'lm-studio',
        capabilities: ['sql', 'code'],
        status: 'available',
        metrics: {
          totalRequests: 0,
          totalTokens: 0,
          averageLatency: 0,
          errorRate: 0
        }
      })
    })
  })

  describe('generateLLMResponse', () => {
    it('should delegate to manager.generate', async () => {
      const mockGenerate = vi.fn(() =>
        Effect.succeed<LLMResponse>({
          content: 'Test response',
          model: 'gpt-3.5-turbo',
          usage: {
            promptTokens: 10,
            completionTokens: 20,
            totalTokens: 30
          },
          metadata: {
            latencyMs: 100,
            retryCount: 0,
            cached: false
          }
        })
      )

      const mockLayer = createMockManager({
        generate: mockGenerate
      })
      const layer = LLMManagerAPIClientLayerWithoutDeps.pipe(Layer.provide(mockLayer))

      const request: LLMRequest = {
        prompt: 'Test prompt',
        taskType: 'general' as const,
        preferences: { model: 'gpt-3.5-turbo' }
      }

      const result = await Effect.runPromise(
        generateLLMResponse(request).pipe(Effect.provide(layer))
      )

      expect(result.content).toBe('Test response')
      expect(mockGenerate).toHaveBeenCalledWith(request)
    })

    it('should handle generation errors', async () => {
      const mockLayer = createMockManager({
        generate: vi.fn(() =>
          Effect.fail({
            _tag: 'ModelUnavailable' as const,
            model: 'gpt-3.5-turbo',
            message: 'Service unavailable'
          })
        )
      })
      const layer = LLMManagerAPIClientLayerWithoutDeps.pipe(Layer.provide(mockLayer))

      const request: LLMRequest = {
        prompt: 'Test prompt',
        taskType: 'general' as const
      }

      const result = await Effect.runPromiseExit(
        generateLLMResponse(request).pipe(Effect.provide(layer))
      )

      expect(result._tag).toBe('Failure')
      if (result._tag === 'Failure') {
        const failures = Cause.failures(result.cause)
        const error = Chunk.unsafeGet(failures, 0)
        expect(error).toMatchObject({
          _tag: 'ModelUnavailable',
          message: 'Service unavailable'
        })
      }
    })
  })

  describe('reloadModels', () => {
    it('should succeed without doing anything', async () => {
      const mockLayer = createMockManager()
      const layer = LLMManagerAPIClientLayerWithoutDeps.pipe(Layer.provide(mockLayer))

      const client = await Effect.runPromise(
        LLMManagerAPIClientTag.pipe(Effect.provide(layer))
      )

      const result = await Effect.runPromise(client.reloadModels())
      expect(result).toBeUndefined()
    })
  })

  describe('getModelCategories', () => {
    it('should return predefined categories', async () => {
      const mockLayer = createMockManager()
      const layer = LLMManagerAPIClientLayerWithoutDeps.pipe(Layer.provide(mockLayer))

      const client = await Effect.runPromise(
        LLMManagerAPIClientTag.pipe(Effect.provide(layer))
      )

      const result = await Effect.runPromise(client.getModelCategories())
      expect(result).toEqual(['general', 'sql', 'code'])
    })
  })

  describe('generate method', () => {
    it('should delegate to manager.generate', async () => {
      const mockGenerate = vi.fn(() =>
        Effect.succeed<LLMResponse>({
          content: 'Direct generate response',
          model: 'gpt-4',
          usage: {
            promptTokens: 15,
            completionTokens: 25,
            totalTokens: 40
          },
          metadata: {
            latencyMs: 150,
            retryCount: 0,
            cached: false
          }
        })
      )

      const mockLayer = createMockManager({
        generate: mockGenerate
      })
      const layer = LLMManagerAPIClientLayerWithoutDeps.pipe(Layer.provide(mockLayer))

      const client = await Effect.runPromise(
        LLMManagerAPIClientTag.pipe(Effect.provide(layer))
      )

      const request: LLMRequest = {
        prompt: 'Direct test',
        taskType: 'general' as const,
        preferences: { model: 'gpt-4' }
      }

      const result = await Effect.runPromise(client.generate(request))

      expect(result.content).toBe('Direct generate response')
      expect(result.model).toBe('gpt-4')
      expect(mockGenerate).toHaveBeenCalledWith(request)
    })
  })
})