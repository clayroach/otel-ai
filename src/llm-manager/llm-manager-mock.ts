/**
 * LLM Manager Mock Implementation Layer
 *
 * Provides mock implementations of the LLM Manager Service for testing
 * with configurable responses and behaviors.
 */

import { Layer, Effect, Stream, Duration } from 'effect'
import { LLMManagerServiceTag } from './llm-manager-service.js'
import type { LLMRequest, LLMResponse, LLMError } from './types.js'
import type { ManagerStatus } from './llm-manager-service.js'

/**
 * Mock configuration options
 */
export interface MockConfig {
  /**
   * Map of prompts to specific responses
   */
  responses?: Map<string, LLMResponse>

  /**
   * Default response when no specific response is mapped
   */
  defaultResponse?: LLMResponse

  /**
   * Whether the mock should fail
   */
  shouldFail?: boolean

  /**
   * Error message when failing
   */
  errorMessage?: string

  /**
   * Error tag when failing
   */
  errorTag?:
    | 'ModelUnavailable'
    | 'RateLimitExceeded'
    | 'InvalidRequest'
    | 'AuthenticationFailed'
    | 'TimeoutError'
    | 'ContextTooLarge'
    | 'ConfigurationError'
    | 'NetworkError'
    | 'AllModelsUnavailable'

  /**
   * Simulated latency in milliseconds
   */
  latency?: number

  /**
   * Available models for status
   */
  availableModels?: string[]

  /**
   * Health status for models
   */
  healthStatus?: Record<string, 'healthy' | 'unhealthy' | 'unknown'>
}

/**
 * Create a mock layer with custom configuration
 */
export const createMockLayer = (config: MockConfig = {}) => {
  const defaultResponse: LLMResponse = config.defaultResponse || {
    content: 'Mock LLM response for testing',
    model: 'mock-model',
    usage: {
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
      cost: 0
    },
    metadata: {
      latencyMs: config.latency || 100,
      retryCount: 0,
      cached: false
    }
  }

  const availableModels = config.availableModels || ['mock-model']
  const healthStatus = config.healthStatus || { 'mock-model': 'healthy' }

  return Layer.succeed(LLMManagerServiceTag, {
    generate: (request: LLMRequest) =>
      Effect.gen(function* () {
        // Simulate latency if configured
        if (config.latency) {
          yield* Effect.sleep(Duration.millis(config.latency))
        }

        // Fail if configured to do so
        if (config.shouldFail) {
          const error: LLMError =
            config.errorTag === 'ModelUnavailable'
              ? {
                  _tag: 'ModelUnavailable',
                  model: 'mock-model',
                  message: config.errorMessage || 'Mock error'
                }
              : config.errorTag === 'RateLimitExceeded'
                ? {
                    _tag: 'RateLimitExceeded',
                    model: 'mock-model',
                    retryAfter: 60
                  }
                : config.errorTag === 'InvalidRequest'
                  ? {
                      _tag: 'InvalidRequest',
                      message: config.errorMessage || 'Mock error',
                      request
                    }
                  : config.errorTag === 'AuthenticationFailed'
                    ? {
                        _tag: 'AuthenticationFailed',
                        model: 'mock-model',
                        message: config.errorMessage || 'Mock error'
                      }
                    : config.errorTag === 'TimeoutError'
                      ? {
                          _tag: 'TimeoutError',
                          model: 'mock-model',
                          timeoutMs: 30000
                        }
                      : config.errorTag === 'ContextTooLarge'
                        ? {
                            _tag: 'ContextTooLarge',
                            model: 'mock-model',
                            tokenCount: 10000,
                            maxTokens: 4096
                          }
                        : config.errorTag === 'NetworkError'
                          ? {
                              _tag: 'NetworkError',
                              model: 'mock-model',
                              message: config.errorMessage || 'Mock error'
                            }
                          : config.errorTag === 'AllModelsUnavailable'
                            ? {
                                _tag: 'AllModelsUnavailable',
                                message: config.errorMessage || 'Mock error'
                              }
                            : {
                                _tag: 'ConfigurationError',
                                message: config.errorMessage || 'Mock error'
                              }
          return yield* Effect.fail(error)
        }

        // Return specific response if mapped
        const customResponse = config.responses?.get(request.prompt)
        if (customResponse) {
          return customResponse
        }

        // If a defaultResponse is configured with custom content, use it
        if (config.defaultResponse) {
          return config.defaultResponse
        }

        // Otherwise generate dynamic mock response based on request
        return {
          ...defaultResponse,
          content: `Mock response for ${request.taskType || 'general'} task: ${request.prompt.substring(0, 50)}...`,
          model: request.preferences?.model || 'mock-model',
          metadata: {
            ...defaultResponse.metadata,
            taskType: request.taskType
          }
        }
      }),

    generateStream: (request: LLMRequest) =>
      config.shouldFail
        ? Stream.fail<LLMError>({
            _tag: 'NetworkError',
            model: 'mock-model',
            message: config.errorMessage || 'Mock stream error'
          } as LLMError)
        : Stream.make('Mock', 'streaming', 'response', 'for:', request.prompt.substring(0, 20)),

    isHealthy: () => Effect.succeed(!config.shouldFail),

    getStatus: () =>
      Effect.succeed({
        availableModels,
        healthStatus,
        config: { mock: true, ...config }
      } as ManagerStatus),

    getAvailableModels: () => Effect.succeed(availableModels)
  })
}

/**
 * Pre-configured mock layers for common test scenarios
 */

/**
 * Basic mock layer with default responses
 */
export const LLMManagerMock = createMockLayer()

/**
 * Mock layer that always fails
 */
export const LLMManagerMockWithError = createMockLayer({
  shouldFail: true,
  errorTag: 'AllModelsUnavailable',
  errorMessage: 'Service unavailable'
})

/**
 * Mock layer with network timeout simulation
 */
export const LLMManagerMockWithTimeout = createMockLayer({
  shouldFail: true,
  errorTag: 'NetworkError',
  errorMessage: 'Request timeout',
  latency: 5000
})

/**
 * Mock layer with simulated latency
 */
export const LLMManagerMockWithLatency = createMockLayer({
  latency: 1000 // 1 second delay
})

/**
 * Mock layer with custom responses for specific prompts
 */
export const LLMManagerMockWithCustomResponses = createMockLayer({
  responses: new Map([
    [
      'Generate SQL',
      {
        content: 'SELECT * FROM traces WHERE service_name = "test" AND status_code = "ERROR"',
        model: 'mock-sql-model',
        usage: { promptTokens: 5, completionTokens: 15, totalTokens: 20, cost: 0 },
        metadata: { latencyMs: 50, retryCount: 0, cached: false }
      }
    ],
    [
      'Analyze error',
      {
        content: 'Error analysis: High latency detected in database queries',
        model: 'mock-analysis-model',
        usage: { promptTokens: 8, completionTokens: 12, totalTokens: 20, cost: 0 },
        metadata: { latencyMs: 75, retryCount: 0, cached: false }
      }
    ],
    [
      'Generate dashboard',
      {
        content: JSON.stringify({
          type: 'LineChart',
          data: { series: [{ name: 'Latency', data: [100, 120, 95] }] },
          config: { title: 'System Latency' }
        }),
        model: 'mock-ui-model',
        usage: { promptTokens: 10, completionTokens: 30, totalTokens: 40, cost: 0 },
        metadata: { latencyMs: 100, retryCount: 0, cached: false }
      }
    ]
  ])
})

/**
 * Mock layer simulating multiple models
 */
export const LLMManagerMockMultiModel = createMockLayer({
  availableModels: ['gpt-4', 'claude-3', 'llama-2'],
  healthStatus: {
    'gpt-4': 'healthy',
    'claude-3': 'healthy',
    'llama-2': 'unhealthy'
  },
  defaultResponse: {
    content: 'Multi-model mock response',
    model: 'gpt-4',
    usage: { promptTokens: 15, completionTokens: 25, totalTokens: 40, cost: 0.001 },
    metadata: { latencyMs: 200, retryCount: 0, cached: false }
  }
})

/**
 * Mock layer for rate limit testing
 */
export const LLMManagerMockRateLimit = createMockLayer({
  shouldFail: true,
  errorTag: 'RateLimitExceeded',
  errorMessage: 'Rate limit exceeded. Please try again later.'
})

/**
 * Mock layer for authentication error testing
 */
export const LLMManagerMockAuthError = createMockLayer({
  shouldFail: true,
  errorTag: 'AuthenticationFailed',
  errorMessage: 'Invalid API key'
})

/**
 * Create a dynamic mock that can be configured at runtime
 */
export class DynamicMock {
  private config: MockConfig = {}

  setConfig(config: MockConfig) {
    this.config = config
  }

  getLayer() {
    return createMockLayer(this.config)
  }

  // Helper methods for common test scenarios
  simulateSuccess(response?: LLMResponse) {
    this.config = response
      ? {
          shouldFail: false,
          defaultResponse: response
        }
      : {
          shouldFail: false
        }
  }

  simulateError(errorTag: LLMError['_tag'], message: string) {
    this.config = {
      shouldFail: true,
      errorTag,
      errorMessage: message
    }
  }

  simulateLatency(ms: number) {
    this.config = {
      ...this.config,
      latency: ms
    }
  }

  addCustomResponse(prompt: string, response: LLMResponse) {
    if (!this.config.responses) {
      this.config.responses = new Map()
    }
    this.config.responses.set(prompt, response)
  }
}
