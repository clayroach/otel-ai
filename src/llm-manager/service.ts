/**
 * LLM Manager Service Layer
 *
 * Provides a service layer abstraction for the LLM Manager using Effect-TS patterns.
 * This enables dependency injection, better testability, and cleaner architecture.
 */

import { Context, Effect, Layer, Stream } from 'effect'
import { createSimpleLLMManager } from './simple-manager.js'
import type { LLMConfig, LLMRequest, LLMResponse } from './types.js'

/**
 * LLM Manager Service Interface
 * Defines the contract for LLM management operations
 */
export interface LLMManagerServiceInterface {
  /**
   * Generate a response using the configured LLM
   */
  readonly generate: (request: LLMRequest) => Effect.Effect<LLMResponse, Error>

  /**
   * Generate a streaming response
   */
  readonly generateStream: (request: LLMRequest) => Stream.Stream<string, Error>

  /**
   * Get the current status of the LLM manager
   */
  readonly getStatus: () => Effect.Effect<
    { models: string[]; config: Record<string, unknown> },
    Error
  >

  /**
   * Select the best model for a given task type
   */
  readonly selectModel: (taskType: LLMRequest['taskType']) => string

  /**
   * Check if the service is healthy
   */
  readonly isHealthy: () => Effect.Effect<boolean, Error>
}

/**
 * Service Tag for dependency injection
 */
export class LLMManagerService extends Context.Tag('LLMManagerService')<
  LLMManagerService,
  LLMManagerServiceInterface
>() {}

/**
 * Live implementation of the LLM Manager Service
 * Uses the actual LLM manager with real configurations
 */
export const LLMManagerServiceLive = Layer.effect(
  LLMManagerService,
  Effect.sync(() => {
    // Load configuration from environment or use defaults
    const config: Partial<LLMConfig> = {
      models: {
        llama: {
          modelPath: process.env.LLM_MODEL || 'default-model',
          contextLength: 2048,
          threads: 4,
          endpoint: process.env.LLM_ENDPOINT || 'http://localhost:1234/v1'
        },
        ...(process.env.OPENAI_API_KEY && {
          gpt: {
            apiKey: process.env.OPENAI_API_KEY,
            model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
            maxTokens: 1000,
            temperature: 0.7
          }
        }),
        ...(process.env.CLAUDE_API_KEY && {
          claude: {
            apiKey: process.env.CLAUDE_API_KEY,
            model: process.env.CLAUDE_MODEL || 'claude-3-haiku-20240307',
            maxTokens: 1000,
            temperature: 0.7
          }
        })
      }
    }

    // Create the manager instance
    const manager = createSimpleLLMManager(config)

    // Return the service implementation
    return LLMManagerService.of({
      generate: (request) =>
        manager
          .generate(request)
          .pipe(
            Effect.catchAll((error) => Effect.fail(new Error(`LLM generation failed: ${error}`)))
          ),

      generateStream: (request) => {
        const stream = manager.generateStream?.(request)
        if (!stream) {
          return Stream.fail(new Error('Streaming not supported'))
        }
        // Cast to the expected error type for the service interface
        return stream as unknown as Stream.Stream<string, Error>
      },

      getStatus: () =>
        manager
          .getStatus()
          .pipe(
            Effect.catchAll((error) => Effect.fail(new Error(`Failed to get status: ${error}`)))
          ),

      selectModel: (taskType) => {
        // Intelligent model selection based on task type and available models
        const hasOpenAI = !!process.env.OPENAI_API_KEY
        const hasClaude = !!process.env.CLAUDE_API_KEY

        switch (taskType) {
          case 'analysis':
            if (hasClaude) return 'claude'
            if (hasOpenAI) return 'gpt'
            return 'llama'

          case 'ui-generation':
          case 'config-management':
            if (hasOpenAI) return 'gpt'
            if (hasClaude) return 'claude'
            return 'llama'

          case 'anomaly-detection':
          case 'architectural-insights':
            if (hasClaude) return 'claude'
            if (hasOpenAI) return 'gpt'
            return 'llama'

          case 'market-intelligence':
            if (hasOpenAI) return 'gpt'
            if (hasClaude) return 'claude'
            return 'llama'

          case 'general':
          default:
            return 'llama' // Default to local model for cost efficiency
        }
      },

      isHealthy: () =>
        Effect.gen(function* () {
          try {
            const status = yield* manager.getStatus()
            return status.models.length > 0
          } catch {
            return false
          }
        })
    })
  })
)

/**
 * Mock implementation for testing
 * Provides predictable responses without actual LLM calls
 */
export const LLMManagerServiceMock = Layer.succeed(
  LLMManagerService,
  LLMManagerService.of({
    generate: (request) =>
      Effect.succeed({
        content: `Mock response for: ${request.prompt}`,
        model: 'mock-model',
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
          cost: 0
        },
        metadata: {
          latencyMs: 100,
          retryCount: 0,
          cached: false
        }
      }),

    generateStream: (request) =>
      Stream.make(`Mock`, `stream`, `for:`, request.prompt.substring(0, 20)),

    getStatus: () =>
      Effect.succeed({
        models: ['mock-model'],
        config: { test: true }
      }),

    selectModel: (taskType) => `mock-${taskType}-model`,

    isHealthy: () => Effect.succeed(true)
  })
)

/**
 * Test implementation with configurable responses
 * Allows tests to define specific behaviors
 */
export const createTestLLMManagerService = (options?: {
  generateResponse?: LLMResponse
  streamResponse?: string[]
  status?: { models: string[]; config: Record<string, unknown> }
  modelSelection?: Record<string, string>
  healthy?: boolean
  shouldFail?: boolean
  errorMessage?: string
}) =>
  Layer.succeed(
    LLMManagerService,
    LLMManagerService.of({
      generate: (request) =>
        options?.shouldFail
          ? Effect.fail(new Error(options.errorMessage || 'Test error'))
          : Effect.succeed(
              options?.generateResponse || {
                content: `Test response: ${request.prompt}`,
                model: 'test-model',
                usage: {
                  promptTokens: 5,
                  completionTokens: 10,
                  totalTokens: 15,
                  cost: 0
                },
                metadata: {
                  latencyMs: 50,
                  retryCount: 0,
                  cached: true
                }
              }
            ),

      generateStream: (_request) =>
        options?.shouldFail
          ? Stream.fail(new Error(options.errorMessage || 'Stream test error'))
          : Stream.make(...(options?.streamResponse || ['test', 'stream'])),

      getStatus: () =>
        options?.shouldFail
          ? Effect.fail(new Error(options.errorMessage || 'Status test error'))
          : Effect.succeed(
              options?.status || {
                models: ['test-model'],
                config: { test: true }
              }
            ),

      selectModel: (taskType) => options?.modelSelection?.[taskType] || 'test-model',

      isHealthy: () => Effect.succeed(options?.healthy ?? true)
    })
  )

/**
 * Development configuration with enhanced logging
 */
export const LLMManagerServiceDev = Layer.effect(
  LLMManagerService,
  Effect.gen(function* () {
    const baseService = yield* Effect.provide(LLMManagerService, LLMManagerServiceLive)

    // Wrap with logging
    return LLMManagerService.of({
      ...baseService,
      generate: (request) =>
        Effect.gen(function* () {
          console.log('[LLM] Generating response for:', request.taskType)
          const start = Date.now()
          const response = yield* baseService.generate(request)
          console.log(`[LLM] Generated in ${Date.now() - start}ms`)
          return response
        }),

      selectModel: (taskType) => {
        const model = baseService.selectModel(taskType)
        console.log(`[LLM] Selected model '${model}' for task '${taskType}'`)
        return model
      }
    })
  })
)
