/**
 * OpenAI Client Tests using Effect-TS Layers
 * 
 * Unit tests that use mocked Effect layers instead of real OpenAI API calls.
 * For integration tests with real OpenAI API, see openai-client.integration.test.ts
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

// Mock LLM Config Service Layer for OpenAI testing
const MockOpenAIConfigLive = Layer.succeed(LLMConfigService, {
  getConfig: () => Effect.succeed({
    models: {
      gpt: {
        apiKey: 'mock-openai-api-key',
        model: 'gpt-4',
        maxTokens: 4096,
        temperature: 0.7,
        endpoint: 'https://api.openai.com/v1'
      }
    },
    routing: {
      strategy: 'balanced' as const,
      fallbackOrder: ['gpt'] as const,
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
  validateConfig: (config: unknown) => Effect.succeed(config as LLMConfig)
})

// Mock Model Client Service Layer for OpenAI
const MockOpenAIClientLive = Layer.succeed(ModelClientService, {
  claude: undefined, // Claude not enabled in mock config
  llama: undefined, // Llama not enabled in mock config
  
  gpt: {
    generate: (request: LLMRequest) =>
      Effect.gen(function* (_) {
        // Simulate API call latency
        yield* _(Effect.sleep(80))
        
        const mockResponse: LLMResponse = {
          content: `GPT-4's comprehensive response to: "${request.prompt}". This showcases GPT's reasoning and structured output capabilities.`,
          model: 'gpt',
          usage: {
            promptTokens: request.prompt.split(' ').length,
            completionTokens: 50,
            totalTokens: request.prompt.split(' ').length + 50,
            cost: 0.003 // GPT-4 pricing simulation
          },
          metadata: {
            cached: false,
            latencyMs: 600,
            retryCount: 0
          }
        }
        
        return mockResponse
      }),

    generateStream: (request: LLMRequest) =>
      Stream.fromIterable(`GPT-4 streaming response to: "${request.prompt}". This demonstrates efficient streaming with structured reasoning.`.split(' '))
        .pipe(
          Stream.map(word => word + ' '),
          Stream.tap(() => Effect.sleep(8)) // GPT streaming is faster
        ),

    isHealthy: () => Effect.succeed(true)
  }
})

// Mock services with GPT-specific metrics
const MockMetricsLive = Layer.succeed(LLMMetricsService, {
  recordRequest: (_model: ModelType, _request: LLMRequest) => Effect.succeed(undefined),
  recordResponse: (_model: ModelType, _response: LLMResponse) => Effect.succeed(undefined),
  recordError: (_model: ModelType, _error: LLMError) => Effect.succeed(undefined),
  getMetrics: () => Effect.succeed({
    totalRequests: 150,
    totalErrors: 8,
    averageLatency: 600,
    totalCost: 0.45,
    requestsByModel: (() => {
      const modelCounts: Record<ModelType, number> = { gpt: 150, claude: 0, llama: 0 }
      return modelCounts
    })()
  })
})

const MockCacheLive = Layer.succeed(CacheService, {
  get: (_key: string) => Effect.succeed(undefined),
  set: (_key: string, _value: LLMResponse, _ttlSeconds: number) => Effect.succeed(undefined),
  invalidate: (_key: string) => Effect.succeed(undefined),
  clear: () => Effect.succeed(undefined),
  size: () => Effect.succeed(0)
})

// Combined test layer
const TestOpenAILayer = Layer.mergeAll(
  MockOpenAIConfigLive,
  MockCacheLive,
  MockMetricsLive,
  MockOpenAIClientLive
)

describe('OpenAI Client (Effect-TS)', () => {
  // Direct Effect.runPromise with explicit layer provision - no helper needed

  beforeEach(() => {
    // No external setup needed with Effect layers
  })

  describe('Service Layer Configuration', () => {
    it('should provide OpenAI client service through Effect layer', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* (_) {
          const client = yield* _(ModelClientService)
          expect(client).toBeDefined()
          
          // Safe access to client properties with proper typing
          const gptClient = client.gpt
          if (!gptClient) {
            throw new Error('GPT client should be available in test layer')
          }
          expect(gptClient).toBeDefined()
          expect(client.claude).toBeUndefined() // Not enabled in mock
          expect(client.llama).toBeUndefined() // Not enabled in mock
          return true
        }).pipe(Effect.provide(TestOpenAILayer))
      )
      expect(result).toBe(true)
    })

    it('should provide configuration with OpenAI settings', async () => {
      const config = await Effect.runPromise(
        Effect.gen(function* (_) {
          const configService = yield* _(LLMConfigService)
          return yield* _(configService.getConfig())
        }).pipe(Effect.provide(TestOpenAILayer))
      )
      // Type guard for config structure
      if (!config || typeof config !== 'object' || !('models' in config)) {
        throw new Error('Invalid config structure')
      }
      const typedConfig = config as LLMConfig
      
      // Safe property access for GPT config
      const gptConfig = typedConfig.models.gpt
      if (!gptConfig) {
        throw new Error('GPT config should be available in test layer')
      }
      expect(gptConfig.apiKey).toBe('mock-openai-api-key')
      expect(gptConfig.model).toBe('gpt-4')
      expect(typedConfig.routing.strategy).toBe('balanced')
    })
  })

  describe('Text Generation', () => {
    const testRequest: LLMRequest = {
      prompt: 'Analyze the trade-offs of microservices vs monolithic architecture',
      taskType: 'analysis',
      preferences: {
        maxTokens: 150,
        temperature: 0.3
      }
    }

    it('should handle basic generation request through Effect service', async () => {
      const response = await Effect.runPromise(
        Effect.gen(function* (_) {
          const client = yield* _(ModelClientService)
          
          // Extract client reference for safe access
          const gptClient = client.gpt
          if (!gptClient) {
            throw new Error('GPT client not available')
          }
          return yield* _(gptClient.generate(testRequest))
        }).pipe(Effect.provide(TestOpenAILayer))
      )
      
      expect(response).toHaveProperty('content')
      expect(response).toHaveProperty('model')
      expect(response).toHaveProperty('usage')
      expect(response).toHaveProperty('metadata')
      
      expect(typeof response.content).toBe('string')
      expect(response.content).toContain('microservices vs monolithic')
      expect(response.content).toContain('GPT-4')
      expect(response.model).toBe('gpt')
      expect(response.usage.cost).toBeGreaterThan(0) // GPT has costs
      expect(response.metadata.cached).toBe(false)
      expect(response.metadata.latencyMs).toBe(600)
      expect(response.metadata.cached).toBe(false)
      expect(response.metadata.latencyMs).toBe(600)
    })

    it('should handle different task types with appropriate responses', async () => {
      const codeRequest: LLMRequest = {
        prompt: 'Write a TypeScript interface for user authentication',
        taskType: 'ui-generation',
        preferences: {
          maxTokens: 100,
          temperature: 0.1
        }
      }

      const response = await Effect.runPromise(
        Effect.gen(function* (_) {
          const client = yield* _(ModelClientService)
          
          // Extract client reference for safe access
          const gptClient = client.gpt
          if (!gptClient) {
            throw new Error('GPT client not available')
          }
          return yield* _(gptClient.generate(codeRequest))
        }).pipe(Effect.provide(TestOpenAILayer))
      )
      
      expect(response.content).toContain('TypeScript interface')
      expect(response.content).toContain('user authentication')
      expect(response.usage.totalTokens).toBeGreaterThan(0)
      expect(response.content.toLowerCase()).toContain('gpt')
    })
  })

  describe('Streaming Generation', () => {
    it('should handle streaming responses efficiently', async () => {
      const request: LLMRequest = {
        prompt: 'Explain Event Sourcing pattern step by step',
        taskType: 'general',
        streaming: true
      }

      const chunks = await Effect.runPromise(
        Effect.gen(function* (_) {
          const client = yield* _(ModelClientService)
          
          // Extract client reference for safe streaming access
          const gptClient = client.gpt
          if (!gptClient) {
            throw new Error('GPT client not available')
          }
          if (!gptClient.generateStream) {
            throw new Error('GPT streaming not available')
          }
          const stream = gptClient.generateStream(request)
          
          return yield* _(stream.pipe(
            Stream.runCollect,
            Effect.map(chunks => Array.from(chunks))
          ))
        }).pipe(Effect.provide(TestOpenAILayer))
      )
      
      expect(chunks.length).toBeGreaterThan(0)
      expect(chunks.every(chunk => typeof chunk === 'string')).toBe(true)
      expect(chunks.join('')).toContain('Event Sourcing pattern')
      expect(chunks.join('')).toContain('GPT-4')
    })
  })

  describe('Health and Performance', () => {
    it('should report healthy status', async () => {
      const isHealthy = await Effect.runPromise(
        Effect.gen(function* (_) {
          const client = yield* _(ModelClientService)
          
          // Extract client reference for safe access
          const gptClient = client.gpt
          if (!gptClient) {
            throw new Error('GPT client not available')
          }
          return yield* _(gptClient.isHealthy())
        }).pipe(Effect.provide(TestOpenAILayer))
      )
      expect(isHealthy).toBe(true)
    })

    it('should integrate with metrics for cost tracking', async () => {
      const metrics = await Effect.runPromise(
        Effect.gen(function* (_) {
          const metricsService = yield* _(LLMMetricsService)
          return yield* _(metricsService.getMetrics())
        }).pipe(Effect.provide(TestOpenAILayer))
      )
      
      expect(metrics).toBeDefined()
      expect(metrics.totalRequests).toBe(150)
      expect(metrics.averageLatency).toBe(600) // GPT-4 latency
      expect(metrics.totalCost).toBe(0.45) // Significant cost for GPT-4
      
      // Safe property access for model-specific metrics
      const gptRequests = metrics.requestsByModel.gpt
      if (typeof gptRequests !== 'number') {
        throw new Error('GPT request count should be available')
      }
      expect(gptRequests).toBe(150)
    })
  })

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      const FailingGPTClientLive = Layer.succeed(ModelClientService, {
        claude: undefined,
        llama: undefined,
        gpt: {
          generate: (_request: LLMRequest) =>
            Effect.fail({
              _tag: 'NetworkError' as const,
              message: 'Mock OpenAI API quota exceeded',
              model: 'gpt'
            }),
          generateStream: (_request: LLMRequest) => Stream.empty,
          isHealthy: () => Effect.succeed(false)
        }
      })

      const FailingLayer = Layer.mergeAll(
        MockOpenAIConfigLive,
        MockCacheLive,
        MockMetricsLive,
        FailingGPTClientLive
      )

      const result = await Effect.runPromise(
        Effect.gen(function* (_) {
          const client = yield* _(ModelClientService)
          
          // Extract client reference for safe access
          const gptClient = client.gpt
          if (!gptClient) {
            throw new Error('GPT client not available')
          }
          
          return yield* _(gptClient.generate({
            prompt: 'This should fail',
            taskType: 'general'
          }).pipe(Effect.option))
        }).pipe(Effect.provide(FailingLayer))
      )

      expect(result._tag).toBe('None')
    })
  })
})

// Export test layers for potential reuse
export { 
  MockOpenAIConfigLive, 
  MockCacheLive, 
  MockMetricsLive, 
  MockOpenAIClientLive, 
  TestOpenAILayer 
}