/**
 * Simple Manager Tests using Effect-TS Layers
 * 
 * Unit tests that use mocked Effect layers instead of real external LLM service calls.
 * For integration tests with real services, see simple-manager.integration.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Effect, Layer, Stream } from 'effect'
import { 
  LLMManagerService,
  ModelRouterService,
  LLMConfigService,
  LLMMetricsService,
  CacheService
} from '../../services.js'
import type { 
  LLMRequest, 
  LLMResponse, 
  LLMError,
  ModelType,
  LLMConfig,
  ModelHealthStatus
} from '../../types.js'

// Mock LLM Config Service
const MockSimpleConfigLive = Layer.succeed(LLMConfigService, {
  getConfig: () => Effect.succeed({
    providers: {
      openai: { enabled: false, apiKey: '', baseUrl: '', models: [] },
      anthropic: { enabled: false, apiKey: '', baseUrl: '', models: [] },
      local: {
        enabled: true,
        endpoint: 'http://mock-lm-studio:1234/v1',
        model: 'simple-llama-model',
        maxTokens: 2048,
        temperature: 0.7,
        contextLength: 4096,
        timeout: 30000
      }
    },
    routing: {
      defaultModel: 'llama',
      fallbackChain: ['llama'],
      taskModelMapping: {
        'general': 'llama',
        'analysis': 'llama',
        'code-generation': 'llama'
      }
    },
    features: {
      enableCaching: false, // Simple manager doesn't use cache
      enableMetrics: true,
      enableConversations: false
    }
  } as LLMConfig),

  updateConfig: (config: LLMConfig) => Effect.succeed(undefined),
  validateConfig: (config: unknown) => Effect.succeed(config as LLMConfig)
})

// Mock Model Router Service
const MockRouterLive = Layer.succeed(ModelRouterService, {
  selectModel: (request: LLMRequest) => 
    Effect.succeed('llama' as ModelType),
  
  routeRequest: (request: LLMRequest) =>
    Effect.gen(function* (_) {
      // Simple routing - always use llama
      yield* _(Effect.sleep(20)) // Simulate routing decision time
      
      return {
        content: `Simple manager routed response: ${request.prompt}`,
        model: 'llama',
        usage: {
          promptTokens: request.prompt.split(' ').length,
          completionTokens: 20,
          totalTokens: request.prompt.split(' ').length + 20,
          cost: 0 // Local model has no cost
        },
        metadata: {
          cached: false,
          latencyMs: 300,
          model: 'simple-llama-model',
          provider: 'local',
          timestamp: Date.now(),
          requestId: `simple-${Math.random().toString(36)}`
        }
      } as LLMResponse
    }),

  getFallbackChain: (failedModel: ModelType) => 
    Effect.succeed([]), // No fallbacks in simple manager

  updateModelPerformance: (model: ModelType, latencyMs: number, success: boolean) => 
    Effect.succeed(undefined)
})

// Mock LLM Manager Service
const MockLLMManagerLive = Layer.succeed(LLMManagerService, {
  generate: (request: LLMRequest) =>
    Effect.gen(function* (_) {
      yield* _(Effect.sleep(50)) // Simulate processing
      
      return {
        content: `Simple LLM Manager response to: "${request.prompt}". This is a straightforward response from the simple manager implementation.`,
        model: 'llama',
        usage: {
          promptTokens: request.prompt.split(' ').length,
          completionTokens: 25,
          totalTokens: request.prompt.split(' ').length + 25,
          cost: 0
        },
        metadata: {
          cached: false,
          latencyMs: 400,
          model: 'simple-llama-model',
          provider: 'local',
          timestamp: Date.now(),
          requestId: `mgr-${Math.random().toString(36)}`
        }
      } as LLMResponse
    }),

  generateStream: (request: LLMRequest) =>
    Stream.fromIterable(`Simple streaming response: ${request.prompt}. Basic streaming functionality.`.split(' '))
      .pipe(
        Stream.map(word => word + ' '),
        Stream.tap(() => Effect.sleep(15))
      ),

  startConversation: (systemPrompt?: string) =>
    Effect.succeed(`conv-${Math.random().toString(36)}`),

  continueConversation: (conversationId: string, message: string) =>
    Effect.succeed({
      content: `Conversation response: ${message}`,
      model: 'llama',
      usage: { promptTokens: 10, completionTokens: 15, totalTokens: 25, cost: 0 },
      metadata: {
        cached: false,
        latencyMs: 350,
        model: 'simple-llama-model',
        provider: 'local',
        timestamp: Date.now(),
        requestId: `conv-${conversationId}`
      }
    } satisfies LLMResponse),

  getConversation: (conversationId: string) =>
    Effect.succeed({
      id: conversationId,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }),

  getAvailableModels: () =>
    Effect.succeed(['llama'] as ModelType[]),

  getModelHealth: () =>
    Effect.succeed([{
      model: 'llama',
      healthy: true,
      latency: 400,
      lastChecked: new Date(),
      provider: 'local'
    }] as ModelHealthStatus[]),

  warmupModels: () =>
    Effect.succeed(undefined)
})

// Mock services
const MockMetricsLive = Layer.succeed(LLMMetricsService, {
  recordRequest: (_model: ModelType, _request: LLMRequest) => Effect.succeed(undefined),
  recordResponse: (_model: ModelType, _response: LLMResponse) => Effect.succeed(undefined),
  recordError: (_model: ModelType, _error: LLMError) => Effect.succeed(undefined),
  getMetrics: () => Effect.succeed({
    totalRequests: 42,
    totalErrors: 3,
    averageLatency: 400,
    totalCost: 0, // Local models are free
    requestsByModel: { llama: 42 }
  })
})

const MockCacheLive = Layer.succeed(CacheService, {
  get: (_key: string) => Effect.succeed(undefined), // Simple manager doesn't use cache
  set: (_key: string, _value: LLMResponse, _ttlSeconds: number) => Effect.succeed(undefined),
  invalidate: (_key: string) => Effect.succeed(undefined),
  clear: () => Effect.succeed(undefined),
  size: () => Effect.succeed(0)
})

// Combined test layer
const TestSimpleManagerLayer = Layer.mergeAll(
  MockSimpleConfigLive,
  MockCacheLive,
  MockMetricsLive,
  MockRouterLive,
  MockLLMManagerLive
)

describe('Simple LLM Manager (Effect-TS)', () => {
  // Helper to run effects with test layer
  const runTest = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.runPromise(effect.pipe(Effect.provide(TestSimpleManagerLayer)))

  beforeEach(() => {
    // No external setup needed with Effect layers
  })

  describe('Service Layer Configuration', () => {
    it('should provide LLM manager service through Effect layer', async () => {
      const result = await runTest(
        Effect.gen(function* (_) {
          const manager = yield* _(LLMManagerService)
          expect(manager).toBeDefined()
          expect(manager.generate).toBeDefined()
          expect(manager.generateStream).toBeDefined()
          expect(manager.getAvailableModels).toBeDefined()
          expect(manager.getModelHealth).toBeDefined()
          return true
        })
      )
      expect(result).toBe(true)
    })

    it('should provide simple configuration settings', async () => {
      const config = await runTest(
        Effect.gen(function* (_) {
          const configService = yield* _(LLMConfigService)
          return yield* _(configService.getConfig())
        })
      )
      expect(config.providers.local.enabled).toBe(true)
      expect(config.routing.defaultModel).toBe('llama')
      expect(config.features.enableCaching).toBe(false)
      expect(config.features.enableConversations).toBe(false)
    })
  })

  describe('Basic Generation', () => {
    it('should handle basic generation requests', async () => {
      const request: LLMRequest = {
        prompt: 'Hello, world!',
        taskType: 'general',
        preferences: {
          maxTokens: 50,
          temperature: 0.5
        }
      }

      const response = await runTest(
        Effect.gen(function* (_) {
          const manager = yield* _(LLMManagerService)
          return yield* _(manager.generate(request))
        })
      )
      
      expect(response).toHaveProperty('content')
      expect(response).toHaveProperty('model')
      expect(response).toHaveProperty('usage')
      expect(response).toHaveProperty('metadata')
      
      expect(typeof response.content).toBe('string')
      expect(response.content).toContain('Hello, world!')
      expect(response.model).toBe('llama')
      expect(response.usage.cost).toBe(0) // Local models have zero cost
      expect(response.metadata.provider).toBe('local')
      expect(response.metadata.model).toBe('simple-llama-model')
    })

    it('should handle different task types', async () => {
      const analysisRequest: LLMRequest = {
        prompt: 'Analyze this system architecture',
        taskType: 'analysis',
        preferences: {
          maxTokens: 100,
          temperature: 0.3
        }
      }

      const response = await runTest(
        Effect.gen(function* (_) {
          const manager = yield* _(LLMManagerService)
          return yield* _(manager.generate(analysisRequest))
        })
      )
      
      expect(response.content).toContain('Analyze this system architecture')
      expect(response.content).toContain('Simple LLM Manager')
      expect(response.usage.totalTokens).toBeGreaterThan(0)
    })
  })

  describe('Model Management', () => {
    it('should return available models', async () => {
      const models = await runTest(
        Effect.gen(function* (_) {
          const manager = yield* _(LLMManagerService)
          return yield* _(manager.getAvailableModels())
        })
      )
      
      expect(Array.isArray(models)).toBe(true)
      expect(models).toContain('llama')
      expect(models.length).toBe(1) // Simple manager only supports local
    })

    it('should check model health status', async () => {
      const health = await runTest(
        Effect.gen(function* (_) {
          const manager = yield* _(LLMManagerService)
          return yield* _(manager.getModelHealth())
        })
      )
      
      expect(Array.isArray(health)).toBe(true)
      expect(health.length).toBe(1)
      expect(health[0]).toHaveProperty('model')
      expect(health[0]).toHaveProperty('healthy')
      expect(health[0]).toHaveProperty('latency')
      expect(health[0].model).toBe('llama')
      expect(health[0].healthy).toBe(true)
      expect(health[0].provider).toBe('local')
    })

    it('should handle model warmup', async () => {
      const result = await runTest(
        Effect.gen(function* (_) {
          const manager = yield* _(LLMManagerService)
          yield* _(manager.warmupModels())
          return true
        })
      )
      expect(result).toBe(true)
    })
  })

  describe('Streaming Generation', () => {
    it('should handle streaming responses', async () => {
      const request: LLMRequest = {
        prompt: 'Count to three',
        taskType: 'general',
        streaming: true
      }

      const chunks = await runTest(
        Effect.gen(function* (_) {
          const manager = yield* _(LLMManagerService)
          const stream = manager.generateStream(request)
          
          return yield* _(stream.pipe(
            Stream.runCollect,
            Effect.map(chunks => Array.from(chunks))
          ))
        })
      )
      
      expect(chunks.length).toBeGreaterThan(0)
      expect(chunks.every(chunk => typeof chunk === 'string')).toBe(true)
      expect(chunks.join('')).toContain('Count to three')
      expect(chunks.join('')).toContain('Simple streaming')
    })
  })

  describe('Conversation Management', () => {
    it('should start new conversations', async () => {
      const conversationId = await runTest(
        Effect.gen(function* (_) {
          const manager = yield* _(LLMManagerService)
          return yield* _(manager.startConversation('You are a helpful assistant'))
        })
      )
      
      expect(typeof conversationId).toBe('string')
      expect(conversationId).toMatch(/^conv-/)
    })

    it('should continue conversations', async () => {
      const conversationId = 'test-conversation'
      
      const response = await runTest(
        Effect.gen(function* (_) {
          const manager = yield* _(LLMManagerService)
          return yield* _(manager.continueConversation(conversationId, 'Hello there'))
        })
      )
      
      expect(response.content).toContain('Hello there')
      expect(response.metadata.requestId).toContain('conv-')
    })

    it('should retrieve conversation context', async () => {
      const conversationId = 'test-conversation'
      
      const conversation = await runTest(
        Effect.gen(function* (_) {
          const manager = yield* _(LLMManagerService)
          return yield* _(manager.getConversation(conversationId))
        })
      )
      
      expect(conversation).toHaveProperty('id')
      expect(conversation).toHaveProperty('messages')
      expect(conversation).toHaveProperty('createdAt')
      expect(conversation.id).toBe(conversationId)
      expect(Array.isArray(conversation.messages)).toBe(true)
    })
  })

  describe('Performance and Metrics', () => {
    it('should integrate with metrics service', async () => {
      const metrics = await runTest(
        Effect.gen(function* (_) {
          const metricsService = yield* _(LLMMetricsService)
          return yield* _(metricsService.getMetrics())
        })
      )
      
      expect(metrics).toBeDefined()
      expect(metrics.totalRequests).toBe(42)
      expect(metrics.averageLatency).toBe(400)
      expect(metrics.totalCost).toBe(0) // Local models are free
      expect(metrics.requestsByModel.llama).toBe(42)
    })

    it('should handle concurrent requests', async () => {
      const requests = Array.from({ length: 3 }, (_, i) => ({
        prompt: `Request ${i + 1}`,
        taskType: 'general' as const
      }))

      const responses = await runTest(
        Effect.gen(function* (_) {
          const manager = yield* _(LLMManagerService)
          
          return yield* _(Effect.all(
            requests.map(request => manager.generate(request)),
            { concurrency: 'unbounded' }
          ))
        })
      )

      expect(responses).toHaveLength(3)
      responses.forEach((response, i) => {
        expect(response.content).toContain(`Request ${i + 1}`)
        expect(response.model).toBe('llama')
        expect(response.usage.cost).toBe(0)
        expect(response.metadata.provider).toBe('local')
      })
    })
  })

  describe('Router Integration', () => {
    it('should select appropriate model through router', async () => {
      const request: LLMRequest = {
        prompt: 'Test routing',
        taskType: 'general'
      }

      const model = await runTest(
        Effect.gen(function* (_) {
          const router = yield* _(ModelRouterService)
          return yield* _(router.selectModel(request))
        })
      )
      
      expect(model).toBe('llama')
    })

    it('should route requests through router service', async () => {
      const request: LLMRequest = {
        prompt: 'Route this request',
        taskType: 'analysis'
      }

      const response = await runTest(
        Effect.gen(function* (_) {
          const router = yield* _(ModelRouterService)
          return yield* _(router.routeRequest(request))
        })
      )
      
      expect(response.content).toContain('Route this request')
      expect(response.model).toBe('llama')
      expect(response.metadata.provider).toBe('local')
    })
  })
})

// Export test layers for potential reuse
export { 
  MockSimpleConfigLive, 
  MockRouterLive, 
  MockLLMManagerLive,
  MockMetricsLive, 
  MockCacheLive,
  TestSimpleManagerLayer 
}