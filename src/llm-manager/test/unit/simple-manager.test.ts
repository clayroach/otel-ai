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
  ModelHealthStatus,
  ConversationContext
} from '../../types.js'

// Mock LLM Config Service
const MockSimpleConfigLive = Layer.succeed(LLMConfigService, {
  getConfig: () => Effect.succeed({
    models: {
      llama: {
        modelPath: 'simple-llama-model',
        contextLength: 4096,
        threads: 4,
        endpoint: 'http://mock-lm-studio:1234/v1'
      }
    },
    routing: {
      strategy: 'balanced' as const,
      fallbackOrder: ['llama'],
      maxRetries: 3,
      timeoutMs: 30000
    },
    cache: {
      enabled: false,
      ttlSeconds: 1800,
      maxSize: 100
    }
  } satisfies LLMConfig),

  updateConfig: (_config: LLMConfig) => Effect.succeed(undefined),
  validateConfig: (_config: unknown) => Effect.succeed(_config as LLMConfig)
})

// Mock Model Router Service
const MockRouterLive = Layer.succeed(ModelRouterService, {
  selectModel: (_request: LLMRequest) => 
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
          retryCount: 0,
          confidence: 0.9,
          modelChain: ['llama'],
          routingStrategy: 'simple',
          fallbackUsed: false
        }
      } satisfies LLMResponse
    }),

  getFallbackChain: (_failedModel: ModelType) => 
    Effect.succeed([]), // No fallbacks in simple manager

  updateModelPerformance: (_model: ModelType, _latencyMs: number, _success: boolean) => 
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
          latencyMs: 400,
          retryCount: 0,
          cached: false,
          confidence: 0.8,
          modelChain: ['llama'],
          routingStrategy: 'balanced',
          fallbackUsed: false
        }
      } satisfies LLMResponse
    }),

  generateStream: (request: LLMRequest) =>
    Stream.fromIterable(`Simple streaming response: ${request.prompt}. Basic streaming functionality.`.split(' '))
      .pipe(
        Stream.map(word => word + ' '),
        Stream.tap(() => Effect.sleep(15))
      ),

  startConversation: (_systemPrompt?: string) =>
    Effect.succeed(`conv-${Math.random().toString(36)}`),

  continueConversation: (conversationId: string, message: string) =>
    Effect.succeed({
      content: `Conversation response: ${message}`,
      model: 'llama',
      usage: { promptTokens: 10, completionTokens: 15, totalTokens: 25, cost: 0 },
      metadata: {
        latencyMs: 350,
        retryCount: 0,
        cached: false,
        confidence: 0.85,
        modelChain: ['llama'],
        routingStrategy: 'balanced',
        fallbackUsed: false
      }
    } satisfies LLMResponse),

  getConversation: (conversationId: string) =>
    Effect.succeed({
      id: conversationId,
      messages: [],
      metadata: {},
      createdAt: Date.now(),
      updatedAt: Date.now()
    } satisfies ConversationContext),

  getAvailableModels: () =>
    Effect.succeed(['llama'] as ModelType[]),

  getModelHealth: () =>
    Effect.succeed([{
      model: 'llama',
      status: 'healthy' as const,
      latencyMs: 400,
      errorRate: 0.0,
      lastChecked: Date.now()
    }] satisfies ModelHealthStatus[]),

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
    requestsByModel: { gpt: 0, claude: 0, llama: 42 }
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
  // Use direct Effect.runPromise with layer provision for type safety

  beforeEach(() => {
    // No external setup needed with Effect layers
  })

  describe('Service Layer Configuration', () => {
    it('should provide LLM manager service through Effect layer', async () => {
      const result = await Effect.runPromise(
        Effect.map(LLMManagerService, manager => {
          expect(manager).toBeDefined()
          expect(manager.generate).toBeDefined()
          expect(manager.generateStream).toBeDefined()
          expect(manager.getAvailableModels).toBeDefined()
          expect(manager.getModelHealth).toBeDefined()
          return true
        }).pipe(Effect.provide(TestSimpleManagerLayer))
      )
      expect(result).toBe(true)
    })

    it('should provide simple configuration settings', async () => {
      const config = await Effect.runPromise(
        Effect.flatMap(LLMConfigService, configService => configService.getConfig()).pipe(Effect.provide(TestSimpleManagerLayer))
      )
      expect(config.models.llama).toBeDefined()
      expect(config.routing.strategy).toBe('balanced')
      expect(config.cache.enabled).toBe(false)
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

      const response = await Effect.runPromise(
        Effect.flatMap(LLMManagerService, manager => manager.generate(request)).pipe(Effect.provide(TestSimpleManagerLayer))
      )
      
      expect(response).toHaveProperty('content')
      expect(response).toHaveProperty('model')
      expect(response).toHaveProperty('usage')
      expect(response).toHaveProperty('metadata')
      
      expect(typeof response.content).toBe('string')
      expect(response.content).toContain('Hello, world!')
      expect(response.model).toBe('llama')
      expect(response.usage.cost).toBe(0) // Local models have zero cost
      expect(response.metadata.latencyMs).toBeGreaterThan(0)
      expect(response.metadata.retryCount).toBe(0)
      expect(response.metadata.cached).toBe(false)
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

      const response = await Effect.runPromise(
        Effect.flatMap(LLMManagerService, manager => manager.generate(analysisRequest)).pipe(Effect.provide(TestSimpleManagerLayer))
      )
      
      expect(response.content).toContain('Analyze this system architecture')
      expect(response.content).toContain('Simple LLM Manager')
      expect(response.usage.totalTokens).toBeGreaterThan(0)
    })
  })

  describe('Model Management', () => {
    it('should return available models', async () => {
      const models = await Effect.runPromise(
        Effect.flatMap(LLMManagerService, manager => manager.getAvailableModels()).pipe(Effect.provide(TestSimpleManagerLayer))
      )
      
      expect(Array.isArray(models)).toBe(true)
      expect(models).toContain('llama')
      expect(models.length).toBe(1) // Simple manager only supports local
    })

    it('should check model health status', async () => {
      const health = await Effect.runPromise(
        Effect.flatMap(LLMManagerService, manager => manager.getModelHealth()).pipe(Effect.provide(TestSimpleManagerLayer))
      )
      
      expect(Array.isArray(health)).toBe(true)
      expect(health.length).toBe(1)
      expect(health[0]).toHaveProperty('model')
      expect(health[0]).toHaveProperty('status')
      expect(health[0]).toHaveProperty('latencyMs')
      expect(health[0]?.model).toBe('llama')
      expect(health[0]?.status).toBe('healthy')
      expect(health[0]?.latencyMs).toBe(400)
    })

    it('should handle model warmup', async () => {
      const result = await Effect.runPromise(
        Effect.flatMap(LLMManagerService, manager => Effect.map(manager.warmupModels(), () => true)).pipe(Effect.provide(TestSimpleManagerLayer))
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

      const chunks = await Effect.runPromise(
        Effect.flatMap(LLMManagerService, manager =>
          manager.generateStream(request).pipe(
            Stream.runCollect,
            Effect.map(chunks => Array.from(chunks))
          )
        ).pipe(Effect.provide(TestSimpleManagerLayer))
      )
      
      expect(chunks.length).toBeGreaterThan(0)
      expect(chunks.every(chunk => typeof chunk === 'string')).toBe(true)
      expect(chunks.join('')).toContain('Count to three')
      expect(chunks.join('')).toContain('Simple streaming')
    })
  })

  describe('Conversation Management', () => {
    it('should start new conversations', async () => {
      const conversationId = await Effect.runPromise(
        Effect.flatMap(LLMManagerService, manager => manager.startConversation('You are a helpful assistant')).pipe(Effect.provide(TestSimpleManagerLayer))
      )
      
      expect(typeof conversationId).toBe('string')
      expect(conversationId).toMatch(/^conv-/)
    })

    it('should continue conversations', async () => {
      const conversationId = 'test-conversation'
      
      const response = await Effect.runPromise(
        Effect.flatMap(LLMManagerService, manager => manager.continueConversation(conversationId, 'Hello there')).pipe(Effect.provide(TestSimpleManagerLayer))
      )
      
      expect(response.content).toContain('Hello there')
      expect(response.metadata.routingStrategy).toBe('balanced')
    })

    it('should retrieve conversation context', async () => {
      const conversationId = 'test-conversation'
      
      const conversation = await Effect.runPromise(
        Effect.flatMap(LLMManagerService, manager => manager.getConversation(conversationId)).pipe(Effect.provide(TestSimpleManagerLayer))
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
      const metrics = await Effect.runPromise(
        Effect.flatMap(LLMMetricsService, metricsService => metricsService.getMetrics()).pipe(Effect.provide(TestSimpleManagerLayer))
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

      const responses = await Effect.runPromise(
        Effect.flatMap(LLMManagerService, manager =>
          Effect.all(
            requests.map(request => manager.generate(request)),
            { concurrency: 'unbounded' }
          )
        ).pipe(Effect.provide(TestSimpleManagerLayer))
      )

      expect(responses).toHaveLength(3)
      responses.forEach((response, i) => {
        expect(response.content).toContain(`Request ${i + 1}`)
        expect(response.model).toBe('llama')
        expect(response.usage.cost).toBe(0)
        expect(response.metadata.retryCount).toBe(0)
      })
    })
  })

  describe('Router Integration', () => {
    it('should select appropriate model through router', async () => {
      const request: LLMRequest = {
        prompt: 'Test routing',
        taskType: 'general'
      }

      const model = await Effect.runPromise(
        Effect.flatMap(ModelRouterService, router => router.selectModel(request)).pipe(Effect.provide(TestSimpleManagerLayer))
      )
      
      expect(model).toBe('llama')
    })

    it('should route requests through router service', async () => {
      const request: LLMRequest = {
        prompt: 'Route this request',
        taskType: 'analysis'
      }

      const response = await Effect.runPromise(
        Effect.flatMap(ModelRouterService, router => router.routeRequest(request)).pipe(Effect.provide(TestSimpleManagerLayer))
      )
      
      expect(response.content).toContain('Route this request')
      expect(response.model).toBe('llama')
      expect(response.metadata.retryCount).toBe(0)
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