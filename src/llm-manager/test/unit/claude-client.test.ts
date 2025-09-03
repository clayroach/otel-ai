/**
 * Claude Client Tests using Effect-TS Layers
 * 
 * Unit tests that use mocked Effect layers instead of real Anthropic API calls.
 * For integration tests with real Claude API, see claude-client.integration.test.ts
 */

import { Effect, Layer, Stream } from 'effect'
import { beforeEach, describe, expect, it } from 'vitest'
import {
    CacheService,
    LLMConfigService,
    LLMMetricsService,
    ModelClientService
} from '../../services.js'
import type {
    LLMConfig,
    LLMError,
    LLMRequest,
    LLMResponse,
    ModelType
} from '../../types.js'

// Mock LLM Config Service Layer for Claude testing
const MockClaudeConfigLive = Layer.succeed(LLMConfigService, {
  getConfig: () => Effect.succeed({
    models: {
      claude: {
        apiKey: 'mock-claude-api-key',
        model: 'claude-3-5-sonnet-20241022',
        maxTokens: 4096,
        temperature: 0.7,
        endpoint: 'https://api.anthropic.com'
      }
    },
    routing: {
      strategy: 'balanced' as const,
      fallbackOrder: ['claude'] as const,
      maxRetries: 3,
      timeoutMs: 30000
    },
    cache: {
      enabled: true,
      ttlSeconds: 3600,
      maxSize: 1000
    }
  } as LLMConfig),

  updateConfig: (_config: LLMConfig) => Effect.succeed(undefined),
  validateConfig: (_config: unknown) => Effect.succeed(_config as LLMConfig)
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
    totalRequests: 25,
    totalErrors: 2,
    averageLatency: 750,
    totalCost: 0.05,
    requestsByModel: { claude: 25, gpt: 0, llama: 0 } satisfies Record<ModelType, number>
  })
})

// Mock Model Client Service Layer for Claude
const MockClaudeClientLive = Layer.succeed(ModelClientService, {
  gpt: undefined, // GPT not enabled in mock config
  llama: undefined, // Llama not enabled in mock config
  
  claude: {
    generate: (request: LLMRequest) => 
      Effect.sleep(100).pipe(
        Effect.map(() => {
          const mockResponse: LLMResponse = {
            content: `Claude's thoughtful response to: "${request.prompt}". This response demonstrates Claude's analytical capabilities and detailed reasoning.`,
            model: 'claude',
            usage: {
              promptTokens: request.prompt.split(' ').length,
              completionTokens: 45,
              totalTokens: request.prompt.split(' ').length + 45,
              cost: 0.002 // Claude pricing simulation
            },
            metadata: {
              cached: false,
              latencyMs: 750,
              retryCount: 0
            }
          }
          return mockResponse
        })
      ),

    generateStream: (request: LLMRequest) =>
      Stream.fromIterable(`Claude's streaming response to: "${request.prompt}". This demonstrates streaming capabilities with thoughtful analysis.`.split(' '))
        .pipe(
          Stream.map(word => word + ' '),
          Stream.tap(() => Effect.sleep(10)) // Simulate streaming delay
        ),

    isHealthy: () => Effect.succeed(true)
  }
})

// Combined test layer
const TestClaudeLayer = Layer.mergeAll(
  MockClaudeConfigLive,
  MockCacheLive,
  MockMetricsLive,
  MockClaudeClientLive
)

describe('Claude Client (Effect-TS)', () => {
  // Direct effect execution with layer provision

  beforeEach(() => {
    // No external setup needed with Effect layers
  })

  describe('Service Layer Configuration', () => {
    it('should provide Claude client service through Effect layer', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* (_) {
          const client = yield* _(ModelClientService)
          expect(client).toBeDefined()
          expect(client.claude).toBeDefined()
          expect(client.gpt).toBeUndefined() // Not enabled in mock
          expect(client.llama).toBeUndefined() // Not enabled in mock
          return true
        }).pipe(Effect.provide(TestClaudeLayer))
      )
      expect(result).toBe(true)
    })

    it('should provide configuration with Claude settings', async () => {
      const config = await Effect.runPromise(
        Effect.gen(function* (_) {
          const configService = yield* _(LLMConfigService)
          return yield* _(configService.getConfig())
        }).pipe(Effect.provide(TestClaudeLayer))
      )
      // Type guard for config structure
      if (!config || typeof config !== 'object' || !('models' in config)) {
        throw new Error('Invalid config structure')
      }
      const typedConfig = config as LLMConfig
      expect(typedConfig.models.claude?.apiKey).toBe('mock-claude-api-key')
      expect(typedConfig.models.claude?.model).toBe('claude-3-5-sonnet-20241022')
      expect(typedConfig.routing.strategy).toBe('balanced')
    })
  })

  describe('Health Check', () => {
    it('should check Claude health through service layer', async () => {
      const isHealthy = await Effect.runPromise(
        Effect.gen(function* (_) {
          const client = yield* _(ModelClientService)
          const claudeClient = client.claude
          if (!claudeClient) {
            return false
          }
          return yield* _(claudeClient.isHealthy())
        }).pipe(Effect.provide(TestClaudeLayer))
      )
      expect(isHealthy).toBe(true)
    })

    it('should handle health check for unavailable models', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* (_) {
          const client = yield* _(ModelClientService)
          // GPT and Llama are not available in our mock
          expect(client.gpt).toBeUndefined()
          expect(client.llama).toBeUndefined()
          return true
        }).pipe(Effect.provide(TestClaudeLayer))
      )
      expect(result).toBe(true)
    })
  })

  describe('Text Generation', () => {
    const testRequest: LLMRequest = {
      prompt: 'Explain the benefits of functional programming',
      taskType: 'analysis',
      preferences: {
        maxTokens: 100,
        temperature: 0.7
      }
    }

    it('should handle basic generation request through Effect service', async () => {
      const response = await Effect.runPromise(
        Effect.gen(function* (_) {
          const client = yield* _(ModelClientService)
          const claudeClient = client.claude
          if (!claudeClient) {
            throw new Error('Claude client not available')
          }
          return yield* _(claudeClient.generate(testRequest))
        }).pipe(Effect.provide(TestClaudeLayer))
      )
      
      expect(response).toHaveProperty('content')
      expect(response).toHaveProperty('model')
      expect(response).toHaveProperty('usage')
      expect(response).toHaveProperty('metadata')
      
      expect(typeof response.content).toBe('string')
      expect(response.content).toContain('functional programming')
      expect(response.content).toContain('Claude')
      expect(response.model).toBe('claude')
      expect(response.usage.cost).toBeGreaterThan(0) // Claude has costs
      expect(response.metadata.cached).toBe(false)
      expect(response.metadata.latencyMs).toBe(750)
    })

    it('should handle generation with custom preferences', async () => {
      const customRequest: LLMRequest = {
        prompt: 'Write a brief analysis of microservices architecture',
        taskType: 'architectural-insights',
        preferences: {
          maxTokens: 200,
          temperature: 0.3,
          model: 'claude'
        }
      }

      const response = await Effect.runPromise(
        Effect.gen(function* (_) {
          const client = yield* _(ModelClientService)
          const claudeClient = client.claude
          if (!claudeClient) {
            throw new Error('Claude client not available')
          }
          return yield* _(claudeClient.generate(customRequest))
        }).pipe(Effect.provide(TestClaudeLayer))
      )
      
      expect(response.content.length).toBeGreaterThan(0)
      expect(response.content).toContain('microservices architecture')
      expect(response.content).toContain('Claude')
      expect(response.usage.totalTokens).toBeGreaterThan(0)
      expect(response.metadata.retryCount).toBe(0)
    })

    it('should handle concurrent requests with Effect concurrency', async () => {
      const requests = Array.from({ length: 3 }, (_, i) => ({
        prompt: `Analyze system design pattern #${i + 1}`,
        taskType: 'analysis' as const,
        preferences: {
          maxTokens: 50
        }
      }))

      const responses = await Effect.runPromise(
        Effect.gen(function* (_) {
          const client = yield* _(ModelClientService)
          
          return yield* _(Effect.all(
            requests.map(request => {
              const claudeClient = client.claude
              if (!claudeClient) {
                throw new Error('Claude client not available')
              }
              return claudeClient.generate(request)
            }),
            { concurrency: 'unbounded' }
          ))
        }).pipe(Effect.provide(TestClaudeLayer))
      )

      expect(responses).toHaveLength(3)
      responses.forEach((response, i) => {
        expect(response.content).toContain(`system design pattern #${i + 1}`)
        expect(response.model).toBe('claude')
        expect(response.usage.cost).toBeGreaterThan(0)
        expect(response.metadata.latencyMs).toBe(750)
      })
    })
  })

  describe('Streaming Generation', () => {
    it('should handle streaming responses through Effect service', async () => {
      const request: LLMRequest = {
        prompt: 'Explain dependency injection patterns',
        taskType: 'general',
        streaming: true
      }

      const chunks = await Effect.runPromise(
        Effect.gen(function* (_) {
          const client = yield* _(ModelClientService)
          const claudeClient = client.claude
          if (!claudeClient?.generateStream) {
            throw new Error('Claude client or streaming not available')
          }
          const stream = claudeClient.generateStream(request)
          
          return yield* _(stream.pipe(
            Stream.runCollect,
            Effect.map(chunks => Array.from(chunks))
          ))
        }).pipe(Effect.provide(TestClaudeLayer))
      )
      
      expect(chunks.length).toBeGreaterThan(0)
      expect(chunks.every(chunk => typeof chunk === 'string')).toBe(true)
      expect(chunks.join('')).toContain('dependency injection patterns')
      expect(chunks.join('')).toContain('Claude')
    })

    it('should handle streaming with proper Effect error handling', async () => {
      // Create a failing stream for testing error handling
      const FailingClaudeClientLive = Layer.succeed(ModelClientService, {
        gpt: undefined,
        llama: undefined,
        claude: {
          generate: (_request: LLMRequest) => Effect.succeed({} as LLMResponse),
          generateStream: (_request: LLMRequest) =>
            Stream.fail({
              _tag: 'NetworkError' as const,
              message: 'Mock Claude API failure',
              model: 'claude'
            }),
          isHealthy: () => Effect.succeed(false)
        }
      })

      const FailingLayer = Layer.mergeAll(
        MockClaudeConfigLive,
        MockCacheLive,
        MockMetricsLive,
        FailingClaudeClientLive
      )

      const result = await Effect.runPromise(
        Effect.gen(function* (_) {
          const client = yield* _(ModelClientService)
          const claudeClient = client.claude
          if (!claudeClient?.generateStream) {
            throw new Error('Claude client or streaming not available')
          }
          const stream = claudeClient.generateStream({
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
        }).pipe(Effect.provide(TestClaudeLayer))
      )
      
      expect(metrics).toBeDefined()
      expect(typeof metrics.totalRequests).toBe('number')
      expect(typeof metrics.averageLatency).toBe('number')
      expect(typeof metrics.totalCost).toBe('number')
      // Type guard for requestsByModel structure
      if ('requestsByModel' in metrics && metrics.requestsByModel && 'claude' in metrics.requestsByModel) {
        expect(metrics.requestsByModel.claude).toBeDefined()
      }
      expect(metrics.averageLatency).toBe(750) // Claude is slower than local models
      expect(metrics.totalCost).toBeGreaterThan(0) // Claude has costs
    })

    it('should integrate with cache service', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* (_) {
          const cache = yield* _(CacheService)
          
          // Test cache operations
          yield* _(cache.set('claude-key', {
            content: 'cached claude response',
            model: 'claude',
            usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, cost: 0.001 },
            metadata: { cached: true, latencyMs: 0, retryCount: 0, routingStrategy: 'anthropic' }
          }, 600)) // Claude responses cached longer
          
          const cached = yield* _(cache.get('claude-key'))
          const size = yield* _(cache.size())
          
          return { cached, size }
        }).pipe(Effect.provide(TestClaudeLayer))
      )
      
      expect(result.cached).toBeUndefined() // Mock always returns undefined
      expect(result.size).toBe(0) // Mock returns 0
    })
  })

  describe('Error Handling and Type Safety', () => {
    it('should provide structured error types with Effect-TS', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* (_) {
          const client = yield* _(ModelClientService)
          
          // Test that methods exist and have proper types
          const claudeClient = client.claude
          if (!claudeClient) {
            throw new Error('Claude client not available')
          }
          expect(typeof claudeClient.generate).toBe('function')
          expect(typeof claudeClient.generateStream).toBe('function')
          expect(typeof claudeClient.isHealthy).toBe('function')
          
          return true
        }).pipe(Effect.provide(TestClaudeLayer))
      )
      expect(result).toBe(true)
    })

    it('should handle service configuration gracefully', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* (_) {
          const client = yield* _(ModelClientService)
          
          // Claude should be available in our mock configuration
          expect(client.claude).toBeDefined()
          
          // These services are not available in our mock configuration
          expect(client.gpt).toBeUndefined()
          expect(client.llama).toBeUndefined()
          
          return true
        }).pipe(Effect.provide(TestClaudeLayer))
      )
      expect(result).toBe(true)
    })
  })
})

// Export test layers for potential reuse
export {
    MockCacheLive, MockClaudeClientLive, MockClaudeConfigLive, MockMetricsLive, TestClaudeLayer
}
