/**
 * Unit tests for LLM Manager Service interfaces and exports
 */

import { describe, it, expect } from 'vitest'
import { Effect, Layer, Stream, Cause, Chunk } from 'effect'
import { LLMManagerServiceTag, type LLMManagerService, type ManagerStatus } from '../../llm-manager-service.js'
import type { ModelInfo } from '../../model-types.js'
import { LLMManagerLive, LLMManagerDev } from '../../llm-manager-live.js'
import { PortkeyGatewayLive } from '../../portkey-gateway-client.js'
import type { LLMRequest, LLMResponse, LLMError } from '../../types.js'
import { ModelUnavailable } from '../../types.js'

describe('LLMManagerService', () => {
  describe('Service Interface', () => {
    it('should define all required methods', () => {
      // Create a mock implementation to verify interface
      const mockService: LLMManagerService = {
        generate: (_request: LLMRequest) =>
          Effect.succeed<LLMResponse>({
            content: 'test',
            model: 'test-model',
            usage: {
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0
            },
            metadata: {
              latencyMs: 0,
              retryCount: 0,
              cached: false
            }
          }),
        generateStream: (_request: LLMRequest) =>
          Stream.make('test'),
        isHealthy: () => Effect.succeed(true),
        getStatus: () =>
          Effect.succeed<ManagerStatus>({
            availableModels: [],
            healthStatus: {},
            config: {}
          }),
        getAvailableModels: () => Effect.succeed([]),
        getDefaultModel: () => Effect.succeed('gpt-3.5-turbo'),
        getModelInfo: () => Effect.succeed<ModelInfo>({
          id: 'test-model',
          name: 'test-model',
          provider: 'openai',
          capabilities: ['general'],
          metadata: {
            contextLength: 4096,
            maxTokens: 2048,
            temperature: 0.7
          }
        }),
        getModelsByCapability: () => Effect.succeed([]),
        getModelsByProvider: () => Effect.succeed([]),
        getAllModels: () => Effect.succeed([])
      }

      // Verify all methods exist
      expect(mockService.generate).toBeDefined()
      expect(mockService.generateStream).toBeDefined()
      expect(mockService.isHealthy).toBeDefined()
      expect(mockService.getStatus).toBeDefined()
      expect(mockService.getAvailableModels).toBeDefined()
      expect(mockService.getDefaultModel).toBeDefined()
      expect(mockService.getModelInfo).toBeDefined()
      expect(mockService.getModelsByCapability).toBeDefined()
      expect(mockService.getModelsByProvider).toBeDefined()
      expect(mockService.getAllModels).toBeDefined()
    })

    it('should be usable with Effect Layer', async () => {
      const mockService: LLMManagerService = {
        generate: (request: LLMRequest) =>
          Effect.succeed<LLMResponse>({
            content: `Response to: ${request.prompt}`,
            model: 'mock-model',
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
          }),
        generateStream: () => Stream.empty,
        isHealthy: () => Effect.succeed(true),
        getStatus: () =>
          Effect.succeed<ManagerStatus>({
            availableModels: ['mock-model'],
            healthStatus: { 'mock-model': 'healthy' },
            config: { test: true }
          }),
        getAvailableModels: () => Effect.succeed(['mock-model']),
        getDefaultModel: () => Effect.succeed('mock-model'),
        getModelInfo: () => Effect.succeed<ModelInfo>({
          id: 'mock-model',
          name: 'mock-model',
          provider: 'openai',
          capabilities: ['general'],
          metadata: {
            contextLength: 4096,
            maxTokens: 2048,
            temperature: 0.7
          }
        }),
        getModelsByCapability: () => Effect.succeed([]),
        getModelsByProvider: () => Effect.succeed([]),
        getAllModels: () => Effect.succeed([])
      }

      const layer = Layer.succeed(LLMManagerServiceTag, mockService)

      // Test using the service through the layer
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* LLMManagerServiceTag
          return yield* service.generate({ prompt: 'test', taskType: 'general' as const })
        }).pipe(Effect.provide(layer))
      )

      expect(result.content).toBe('Response to: test')
      expect(result.model).toBe('mock-model')
    })

    it('should handle errors properly', async () => {
      const mockService: LLMManagerService = {
        generate: () =>
          Effect.fail<LLMError>(new ModelUnavailable({
            model: 'test-model',
            message: 'Test error'
          })),
        generateStream: () =>
          Stream.fail(new ModelUnavailable({
            model: 'test-model',
            message: 'Stream error'
          })),
        isHealthy: () =>
          Effect.fail(new ModelUnavailable({
            model: 'test-model',
            message: 'Health check failed'
          })),
        getStatus: () =>
          Effect.fail(new ModelUnavailable({
            model: 'test-model',
            message: 'Status error'
          })),
        getAvailableModels: () =>
          Effect.fail(new ModelUnavailable({
            model: 'test-model',
            message: 'Models error'
          })),
        getDefaultModel: () =>
          Effect.fail(new ModelUnavailable({
            model: 'test-model',
            message: 'Default model error'
          })),
        getModelInfo: () =>
          Effect.fail(new ModelUnavailable({
            model: 'test-model',
            message: 'Model info error'
          })),
        getModelsByCapability: () =>
          Effect.fail(new ModelUnavailable({
            model: 'test-model',
            message: 'Models by capability error'
          })),
        getModelsByProvider: () =>
          Effect.fail(new ModelUnavailable({
            model: 'test-model',
            message: 'Models by provider error'
          })),
        getAllModels: () =>
          Effect.fail(new ModelUnavailable({
            model: 'test-model',
            message: 'All models error'
          }))
      }

      const layer = Layer.succeed(LLMManagerServiceTag, mockService)

      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const service = yield* LLMManagerServiceTag
          return yield* service.generate({ prompt: 'test', taskType: 'general' as const })
        }).pipe(Effect.provide(layer))
      )

      expect(result._tag).toBe('Failure')
      if (result._tag === 'Failure') {
        const failures = Cause.failures(result.cause)
        const error = Chunk.unsafeGet(failures, 0)
        expect(error).toMatchObject({
          _tag: 'ModelUnavailable',
          message: 'Test error'
        })
      }
    })
  })

  describe('ManagerStatus', () => {
    it('should have required fields', () => {
      const status: ManagerStatus = {
        availableModels: ['model1', 'model2'],
        healthStatus: {
          'model1': 'healthy',
          'model2': 'unhealthy'
        },
        config: {
          baseURL: 'http://test',
          timeout: 5000
        }
      }

      expect(status.availableModels).toHaveLength(2)
      expect(status.healthStatus['model1']).toBe('healthy')
      expect(status.config.baseURL).toBe('http://test')
    })

    it('should support optional fields', () => {
      const status: ManagerStatus = {
        availableModels: [],
        healthStatus: {},
        config: {},
        status: 'operational',
        loadedModels: [{
          id: 'model1',
          name: 'model1',
          provider: 'openai',
          capabilities: ['general'],
          metadata: {
            contextLength: 4096,
            maxTokens: 2048,
            temperature: 0.7
          }
        }],
        systemMetrics: {
          totalRequests: 100,
          avgResponseTime: 250
        }
      }

      expect(status.status).toBe('operational')
      expect(status.loadedModels).toHaveLength(1)
      expect(status.systemMetrics?.totalRequests).toBe(100)
    })
  })

  describe('LLMManagerLive exports', () => {
    it('should export PortkeyGatewayLive as LLMManagerLive', () => {
      expect(LLMManagerLive).toBe(PortkeyGatewayLive)
    })

    it('should export PortkeyGatewayLive as LLMManagerDev', () => {
      expect(LLMManagerDev).toBe(PortkeyGatewayLive)
    })

    it('should be the same Layer instance', () => {
      expect(LLMManagerLive).toEqual(LLMManagerDev)
      expect(LLMManagerLive).toBe(LLMManagerDev)
    })
  })

  describe('Service Tag', () => {
    it('should have correct tag identifier', () => {
      expect(LLMManagerServiceTag.key).toBe('LLMManagerService')
    })

    it('should work with Layer.provide', async () => {
      const mockService: LLMManagerService = {
        generate: () => Effect.succeed({
          content: 'Tagged response',
          model: 'tagged-model',
          usage: { promptTokens: 5, completionTokens: 10, totalTokens: 15 },
          metadata: { latencyMs: 50, retryCount: 0, cached: false }
        }),
        generateStream: () => Stream.empty,
        isHealthy: () => Effect.succeed(true),
        getStatus: () => Effect.succeed({
          availableModels: [],
          healthStatus: {},
          config: {}
        }),
        getAvailableModels: () => Effect.succeed([]),
        getDefaultModel: () => Effect.succeed('tagged-model'),
        getModelInfo: () => Effect.succeed<ModelInfo>({
          id: 'tagged-model',
          name: 'tagged-model',
          provider: 'openai',
          capabilities: ['general'],
          metadata: {
            contextLength: 4096,
            maxTokens: 2048,
            temperature: 0.7
          }
        }),
        getModelsByCapability: () => Effect.succeed([]),
        getModelsByProvider: () => Effect.succeed([]),
        getAllModels: () => Effect.succeed([])
      }

      const layer = Layer.succeed(LLMManagerServiceTag, mockService)

      const program = Effect.gen(function* () {
        const service = yield* LLMManagerServiceTag
        const health = yield* service.isHealthy()
        const response = yield* service.generate({ prompt: 'test', taskType: 'general' as const })
        return { health, response }
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(layer))
      )

      expect(result.health).toBe(true)
      expect(result.response.content).toBe('Tagged response')
    })
  })
})