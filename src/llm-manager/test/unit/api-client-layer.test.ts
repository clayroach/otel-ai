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
import { LLMManagerServiceTag } from '../../llm-manager-service.js'
import type { LLMRequest, LLMResponse } from '../../types.js'

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
      generateStream: vi.fn(() => Effect.fail({ _tag: 'ModelUnavailable' as const, model: 'mock', message: 'Not implemented' })),
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
        provider: 'openai',
        status: 'available',
        capabilities: {
          supportsStreaming: true,
          supportsJSON: true,
          contextLength: 4096,
          maxTokens: 2048
        }
      })
      expect(result[2]).toMatchObject({
        id: 'claude-3-haiku-20240307',
        provider: 'anthropic',
        status: 'available'
      })
    })

    it('should handle errors gracefully', async () => {
      const mockLayer = createMockManager({
        getAvailableModels: vi.fn(() => Effect.fail(new Error('Failed to get models')))
      })
      const layer = LLMManagerAPIClientLayerWithoutDeps.pipe(Layer.provide(mockLayer))

      const result = await Effect.runPromise(
        getLoadedModels.pipe(Effect.provide(layer))
      )

      expect(result).toEqual([])
    })

    it('should identify local models correctly', async () => {
      const mockLayer = createMockManager({
        getAvailableModels: vi.fn(() =>
          Effect.succeed(['codellama-7b-instruct', 'llama2-13b'])
        )
      })
      const layer = LLMManagerAPIClientLayerWithoutDeps.pipe(Layer.provide(mockLayer))

      const result = await Effect.runPromise(
        getLoadedModels.pipe(Effect.provide(layer))
      )

      expect(result).toHaveLength(2)
      expect(result[0]?.provider).toBe('local')
      expect(result[1]?.provider).toBe('local')
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
        provider: 'openai',
        status: 'available'
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
        provider: 'openai',
        status: 'available',
        capabilities: {
          supportsSQL: true
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
        id: 'claude-3-haiku-20240307',
        provider: 'anthropic',
        status: 'available'
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