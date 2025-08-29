/**
 * Local Model Client Tests using Effect-TS Layers
 * 
 * Unit tests that use mocked Effect layers instead of real external API calls.
 * For integration tests with real LM Studio, see local-client.integration.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Effect, Layer, Stream } from 'effect'
import { 
  ModelClientService,
  LLMConfigService,
  LLMMetricsService,
  CacheService
} from '../../services.js'
import type { 
  LLMRequest, 
  LLMResponse, 
  LLMError,
  ModelType,
  LLMConfig
} from '../../types.js'

// Mock LLM Config Service Layer for testing
const MockLLMConfigLive = Layer.succeed(LLMConfigService, {
  getConfig: () => Effect.succeed({
    models: {
      llama: {
        modelPath: 'mock-llama-model',
        contextLength: 8192,
        threads: 4,
        gpuLayers: 0,
        endpoint: 'http://mock-lm-studio:1234/v1'
      }
    },
    routing: {
      strategy: 'balanced' as const,
      fallbackOrder: ['llama'] as const,
      maxRetries: 3,
      timeoutMs: 10000
    },
    cache: {
      enabled: true,
      ttlSeconds: 300,
      maxSize: 100
    }
  } as LLMConfig),

  updateConfig: (_config: LLMConfig) => Effect.succeed(undefined),
  validateConfig: (config: unknown) => Effect.succeed(config as LLMConfig)
})

// Mock Cache Service Layer
const MockCacheLive = Layer.succeed(CacheService, {
  get: (_key: string) => Effect.succeed(undefined),
  set: (_key: string, _value: LLMResponse, _ttlSeconds: number) => Effect.succeed(undefined),
  invalidate: (_key: string) => Effect.succeed(undefined),
  clear: () => Effect.succeed(undefined),
  size: () => Effect.succeed(0)
})

// Mock Metrics Service Layer
const MockMetricsLive = Layer.succeed(LLMMetricsService, {
  recordRequest: (_model: ModelType, _request: LLMRequest) => Effect.succeed(undefined),
  recordResponse: (_model: ModelType, _response: LLMResponse) => Effect.succeed(undefined),
  recordError: (_model: ModelType, _error: LLMError) => Effect.succeed(undefined),
  getMetrics: () => Effect.succeed({
    totalRequests: 10,
    totalErrors: 1,
    averageLatency: 250,
    totalCost: 0,
    requestsByModel: (() => {
      const modelCounts: Record<ModelType, number> = { llama: 10, gpt: 0, claude: 0 }
      return modelCounts
    })()
  })
})

// Mock Model Client Service Layer
const MockModelClientLive = Layer.succeed(ModelClientService, {
  gpt: undefined, // GPT not enabled in mock config
  claude: undefined, // Claude not enabled in mock config
  
  llama: {
    generate: (request: LLMRequest) =>
      Effect.gen(function* (_) {
        // Simulate processing time
        yield* _(Effect.sleep(10))
        
        const mockResponse: LLMResponse = {
          content: `Mock response to: ${request.prompt}`,
          model: 'llama',
          usage: {
            promptTokens: request.prompt.split(' ').length,
            completionTokens: 15,
            totalTokens: request.prompt.split(' ').length + 15,
            cost: 0 // Local models are free
          },
          metadata: {
            cached: false,
            latencyMs: 250,
            retryCount: 0,
            routingStrategy: 'local'
          }
        }
        
        return mockResponse
      }),

    generateStream: (request: LLMRequest) =>
      Stream.fromIterable(`Mock streaming response to: ${request.prompt}`.split(' '))
        .pipe(
          Stream.map(word => word + ' '),
          Stream.tap(() => Effect.sleep(5)) // Simulate streaming delay
        ),

    isHealthy: () => Effect.succeed(true)
  }
})

// Combined test layer
const TestLLMLayer = Layer.mergeAll(
  MockLLMConfigLive,
  MockCacheLive,
  MockMetricsLive,
  MockModelClientLive
)

describe('Local Model Client (Effect-TS)', () => {
  // Direct effect execution with layer provision

  beforeEach(() => {
    // No external setup needed with Effect layers
  })

  describe('Service Layer Configuration', () => {
    it('should provide model client service through Effect layer', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* (_) {
          const client = yield* _(ModelClientService)
          expect(client).toBeDefined()
          expect(client.llama).toBeDefined()
          expect(client.gpt).toBeUndefined() // Not enabled in mock
          expect(client.claude).toBeUndefined() // Not enabled in mock
          return true
        }).pipe(Effect.provide(TestLLMLayer))
      )
      expect(result).toBe(true)
    })

    it('should provide configuration through Effect layer', async () => {
      const config = await Effect.runPromise(
        Effect.gen(function* (_) {
          const configService = yield* _(LLMConfigService)
          return yield* _(configService.getConfig())
        }).pipe(Effect.provide(TestLLMLayer))
      )
      // Type guard for config structure
      if (!config || typeof config !== 'object' || !('models' in config)) {
        throw new Error('Invalid config structure')
      }
      const typedConfig = config as LLMConfig
      expect(typedConfig.models.llama?.endpoint).toBe('http://mock-lm-studio:1234/v1')
      expect(typedConfig.models.llama?.modelPath).toBe('mock-llama-model')
      expect(typedConfig.routing.strategy).toBe('balanced')
    })
  })

  describe('Health Check', () => {
    it('should check local model health through service layer', async () => {
      const isHealthy = await Effect.runPromise(
        Effect.gen(function* (_) {
          const client = yield* _(ModelClientService)
          const llamaClient = client.llama
          if (!llamaClient) {
            return false
          }
          return yield* _(llamaClient.isHealthy())
        }).pipe(Effect.provide(TestLLMLayer))
      )
      expect(isHealthy).toBe(true)
    })

    it('should handle health check for unavailable models', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* (_) {
          const client = yield* _(ModelClientService)
          // GPT and Claude are not available in our mock
          expect(client.gpt).toBeUndefined()
          expect(client.claude).toBeUndefined()
          return true
        }).pipe(Effect.provide(TestLLMLayer))
      )
      expect(result).toBe(true)
    })
  })

  describe('Text Generation', () => {
    const testRequest: LLMRequest = {
      prompt: 'Hello, world!',
      taskType: 'general',
      preferences: {
        maxTokens: 50,
        temperature: 0.5
      }
    }

    it('should handle basic generation request through Effect service', async () => {
      const response = await Effect.runPromise(
        Effect.gen(function* (_) {
          const client = yield* _(ModelClientService)
          const llamaClient = client.llama
          if (!llamaClient) {
            throw new Error('Llama client not available')
          }
          return yield* _(llamaClient.generate(testRequest))
        }).pipe(Effect.provide(TestLLMLayer))
      )
      
      expect(response).toHaveProperty('content')
      expect(response).toHaveProperty('model')
      expect(response).toHaveProperty('usage')
      expect(response).toHaveProperty('metadata')
      
      expect(typeof response.content).toBe('string')
      expect(response.content).toContain('Mock response to: Hello, world!')
      expect(response.model).toBe('llama')
      expect(response.usage.cost).toBe(0) // Local models have zero cost
      expect(response.metadata.cached).toBe(false)
      expect(response.metadata.latencyMs).toBeGreaterThan(0)
      // Type guard for metadata with routingStrategy
      expect('routingStrategy' in response.metadata).toBe(true)
      if ('routingStrategy' in response.metadata) {
        expect(response.metadata.routingStrategy).toBeDefined()
      }
    })

    it('should handle generation with custom preferences', async () => {
      const customRequest: LLMRequest = {
        prompt: 'Explain quantum computing in simple terms.',
        taskType: 'analysis',
        preferences: {
          maxTokens: 200,
          temperature: 0.1,
          model: 'llama'
        }
      }

      const response = await Effect.runPromise(
        Effect.gen(function* (_) {
          const client = yield* _(ModelClientService)
          const llamaClient = client.llama
          if (!llamaClient) {
            throw new Error('Llama client not available')
          }
          return yield* _(llamaClient.generate(customRequest))
        }).pipe(Effect.provide(TestLLMLayer))
      )
      
      expect(response.content.length).toBeGreaterThan(0)
      expect(response.content).toContain('quantum computing')
      expect(response.usage.totalTokens).toBeGreaterThan(0)
      expect(response.metadata.cached).toBe(false)
    })

    it('should handle concurrent requests with Effect concurrency', async () => {
      const requests = Array.from({ length: 3 }, (_, i) => ({
        prompt: `Tell me a fact about the number ${i + 1}`,
        taskType: 'general' as const,
        preferences: {
          maxTokens: 30
        }
      }))

      const responses = await Effect.runPromise(
        Effect.gen(function* (_) {
          const client = yield* _(ModelClientService)
          
          return yield* _(Effect.all(
            requests.map(request => {
              const llamaClient = client.llama
              if (!llamaClient) {
                throw new Error('Llama client not available')
              }
              return llamaClient.generate(request)
            }),
            { concurrency: 'unbounded' }
          ))
        }).pipe(Effect.provide(TestLLMLayer))
      )

      expect(responses).toHaveLength(3)
      responses.forEach((response, i) => {
        expect(response.content).toContain(`number ${i + 1}`)
        expect(response.model).toBe('llama')
        expect(response.usage.cost).toBe(0)
      })
    })
  })

  describe('Streaming Generation', () => {
    it('should handle streaming responses through Effect service', async () => {
      const request: LLMRequest = {
        prompt: 'Count from 1 to 5',
        taskType: 'general',
        streaming: true
      }

      const chunks = await Effect.runPromise(
        Effect.gen(function* (_) {
          const client = yield* _(ModelClientService)
          const llamaClient = client.llama
          if (!llamaClient?.generateStream) {
            throw new Error('Llama client streaming not available')
          }
          const stream = llamaClient.generateStream(request)
          
          return yield* _(stream.pipe(
            Stream.runCollect,
            Effect.map(chunks => Array.from(chunks))
          ))
        }).pipe(Effect.provide(TestLLMLayer))
      )
      
      expect(chunks.length).toBeGreaterThan(0)
      expect(chunks.every(chunk => typeof chunk === 'string')).toBe(true)
      expect(chunks.join('')).toContain('Count from 1 to 5')
    })

    it('should handle streaming with proper Effect error handling', async () => {
      // Create a failing stream for testing error handling
      const FailingModelClientLive = Layer.succeed(ModelClientService, {
        gpt: undefined,
        claude: undefined,
        llama: {
          generate: (_request: LLMRequest) => Effect.succeed({} as LLMResponse),
          generateStream: (_request: LLMRequest) =>
            Stream.fail({
              _tag: 'NetworkError' as const,
              message: 'Mock streaming failure',
              cause: new Error('Stream error'),
              model: 'llama'
            } as LLMError),
          isHealthy: () => Effect.succeed(false)
        }
      })

      const FailingLayer = Layer.mergeAll(
        MockLLMConfigLive,
        MockCacheLive,
        MockMetricsLive,
        FailingModelClientLive
      )

      const result = await Effect.runPromise(
        Effect.gen(function* (_) {
          const client = yield* _(ModelClientService)
          const llamaClient = client.llama
          if (!llamaClient?.generateStream) {
            throw new Error('Llama client streaming not available')
          }
          const stream = llamaClient.generateStream({
            prompt: 'This should fail',
            taskType: 'general',
            streaming: true
          })
          
          return yield* _(stream.pipe(
            Stream.runCollect,
            Effect.option // Convert failure to None
          ))
        }).pipe(Effect.provide(FailingLayer))
      )

      expect(result._tag).toBe('None')
    })
  })

  describe('Integration with Other Services', () => {
    it('should integrate with metrics service', async () => {
      const metrics = await Effect.runPromise(
        Effect.gen(function* (_) {
          const metricsService = yield* _(LLMMetricsService)
          return yield* _(metricsService.getMetrics())
        }).pipe(Effect.provide(TestLLMLayer))
      )
      
      expect(metrics).toBeDefined()
      // Type guards for metrics structure
      if (!metrics || typeof metrics !== 'object') {
        throw new Error('Invalid metrics structure')
      }
      // Type-safe metrics validation
      if ('totalRequests' in metrics) {
        expect(typeof metrics.totalRequests).toBe('number')
      }
      if ('averageLatency' in metrics) {
        expect(typeof metrics.averageLatency).toBe('number')
      }
      if ('requestsByModel' in metrics && metrics.requestsByModel && 'llama' in metrics.requestsByModel) {
        expect(metrics.requestsByModel.llama).toBeDefined()
      }
    })

    it('should integrate with cache service', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* (_) {
          const cache = yield* _(CacheService)
          
          // Test cache operations
          yield* _(cache.set('test-key', {
            content: 'cached response',
            model: 'llama',
            usage: { promptTokens: 5, completionTokens: 10, totalTokens: 15, cost: 0 },
            metadata: { cached: true, latencyMs: 0, retryCount: 0, routingStrategy: 'local' }
          }, 300))
          
          const cached = yield* _(cache.get('test-key'))
          const size = yield* _(cache.size())
          
          return { cached, size }
        }).pipe(Effect.provide(TestLLMLayer))
      )
      
      // Type guards for result structure
      if (!result || typeof result !== 'object') {
        throw new Error('Invalid result structure')
      }
      // Type-safe result validation
      if ('cached' in result) {
        expect(result.cached).toBeUndefined() // Mock always returns undefined
      }
      if ('size' in result) {
        expect(result.size).toBe(0) // Mock returns 0
      }
    })
  })

  describe('Error Handling and Type Safety', () => {
    it('should provide structured error types with Effect-TS', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* (_) {
          const client = yield* _(ModelClientService)
          
          // Test that methods exist and have proper types
          const llamaClient = client.llama
          if (!llamaClient) {
            throw new Error('Llama client not available')
          }
          expect(typeof llamaClient.generate).toBe('function')
          expect(typeof llamaClient.generateStream).toBe('function')
          expect(typeof llamaClient.isHealthy).toBe('function')
          
          return true
        }).pipe(Effect.provide(TestLLMLayer))
      )
      expect(result).toBe(true)
    })

    it('should handle service unavailability gracefully', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* (_) {
          const client = yield* _(ModelClientService)
          
          // These services are not available in our mock configuration
          expect(client.gpt).toBeUndefined()
          expect(client.claude).toBeUndefined()
          
          // But llama should be available
          expect(client.llama).toBeDefined()
          
          return true
        }).pipe(Effect.provide(TestLLMLayer))
      )
      expect(result).toBe(true)
    })
  })
})

// Export test layers for potential reuse
export { 
  MockLLMConfigLive, 
  MockCacheLive, 
  MockMetricsLive, 
  MockModelClientLive, 
  TestLLMLayer 
}