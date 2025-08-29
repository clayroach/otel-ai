/**
 * OpenAI GPT Client Implementation
 *
 * Integrates with OpenAI's API for GPT models with streaming support.
 * Provides full feature parity with local client including error handling.
 */

import { Effect, Stream, Schedule, Duration } from 'effect'
import { Schema } from '@effect/schema'
import type { ModelClient, LLMRequest, LLMResponse, LLMError } from '../types.js'
import { withLLMError } from './error-utils.js'

/**
 * OpenAI Configuration Schema
 */
export const OpenAIConfigSchema = Schema.Struct({
  apiKey: Schema.String,
  model: Schema.String, // "gpt-4", "gpt-3.5-turbo", etc.
  maxTokens: Schema.Number,
  temperature: Schema.Number,
  timeout: Schema.Number,
  endpoint: Schema.optional(Schema.String), // For custom endpoints
  organization: Schema.optional(Schema.String),
  retryAttempts: Schema.optional(Schema.Number)
})

export type OpenAIConfig = Schema.Schema.Type<typeof OpenAIConfigSchema>

/**
 * Default OpenAI Configuration
 */
export const defaultOpenAIConfig: OpenAIConfig = {
  apiKey: process.env.OPENAI_API_KEY || '',
  model: 'gpt-3.5-turbo',
  maxTokens: 4096,
  temperature: 0.7,
  timeout: 30000,
  endpoint: 'https://api.openai.com/v1',
  retryAttempts: 3
}

/**
 * OpenAI API Response Types
 */
interface OpenAIMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface OpenAIChoice {
  message?: OpenAIMessage
  delta?: { content?: string }
  finish_reason?: string
}

interface OpenAIResponse {
  choices: OpenAIChoice[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
  model: string
}

interface OpenAIStreamChunk {
  choices: OpenAIChoice[]
  model: string
}

/**
 * Calculate OpenAI API Costs
 *
 * Based on current OpenAI pricing (approximate).
 */
const calculateCost = (model: string, promptTokens: number, completionTokens: number): number => {
  const pricing: Record<string, { input: number; output: number }> = {
    'gpt-4': { input: 0.03 / 1000, output: 0.06 / 1000 },
    'gpt-4-turbo': { input: 0.01 / 1000, output: 0.03 / 1000 },
    'gpt-3.5-turbo': { input: 0.0005 / 1000, output: 0.0015 / 1000 }
  }

  const modelPricing = pricing[model] || pricing['gpt-3.5-turbo']
  if (!modelPricing) {
    return 0 // Default cost if pricing not found
  }
  return promptTokens * modelPricing.input + completionTokens * modelPricing.output
}

/**
 * Map HTTP Status to LLM Error
 */
const mapHttpErrorToLLMError = (status: number, message: string, model: string): LLMError => {
  switch (status) {
    case 401:
      return { _tag: 'AuthenticationFailed', model, message: 'Invalid API key' }
    case 429:
      return { _tag: 'RateLimitExceeded', model, retryAfter: 60000 }
    case 400: {
      const emptyRequest: LLMRequest = {
        prompt: '',
        taskType: 'general' as const,
        streaming: false
      }
      return { _tag: 'InvalidRequest', message, request: emptyRequest }
    }
    default:
      return { _tag: 'NetworkError', model, message: `HTTP ${status}: ${message}` }
  }
}

/**
 * Check OpenAI API Health
 */
export const checkOpenAIHealth = (config?: Partial<OpenAIConfig>) =>
  Effect.gen(function* (_) {
    const finalConfig = { ...defaultOpenAIConfig, ...config }

    const validatedConfig = yield* _(
      Schema.decodeUnknown(OpenAIConfigSchema)(finalConfig).pipe(
        Effect.mapError(
          (error): LLMError => ({
            _tag: 'ConfigurationError',
            message: `OpenAI config validation failed: ${error.message}`
          })
        )
      )
    )

    if (!validatedConfig.apiKey) {
      return {
        endpoint: validatedConfig.endpoint ?? defaultOpenAIConfig.endpoint ?? 'https://api.openai.com/v1',
        healthy: false,
        timestamp: Date.now(),
        error: 'No API key configured'
      }
    }

    const startTime = Date.now()

    try {
      const response = yield* _(
        Effect.tryPromise({
          try: () =>
            fetch(`${validatedConfig.endpoint}/models`, {
              headers: {
                Authorization: `Bearer ${validatedConfig.apiKey}`,
                'Content-Type': 'application/json',
                ...(validatedConfig.organization && {
                  'OpenAI-Organization': validatedConfig.organization
                })
              },
              signal: AbortSignal.timeout(validatedConfig.timeout)
            }),
          catch: (error) => ({
            _tag: 'NetworkError' as const,
            model: 'openai',
            message: error instanceof Error ? error.message : 'Network request failed'
          })
        })
      )

      const latency = Date.now() - startTime

      if (!response.ok) {
        const errorText = yield* _(
          Effect.tryPromise({
            try: () => response.text(),
            catch: () => 'Unknown error'
          })
        )
        return {
          endpoint: validatedConfig.endpoint ?? defaultOpenAIConfig.endpoint ?? 'https://api.openai.com/v1',
          healthy: false,
          timestamp: Date.now(),
          latency,
          error: `HTTP ${response.status}: ${errorText}`
        }
      }

      return {
        endpoint: validatedConfig.endpoint ?? defaultOpenAIConfig.endpoint ?? 'https://api.openai.com/v1',
        healthy: true,
        timestamp: Date.now(),
        latency
      }
    } catch (error) {
      return {
        endpoint: validatedConfig.endpoint ?? defaultOpenAIConfig.endpoint ?? 'https://api.openai.com/v1',
        healthy: false,
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

/**
 * Create OpenAI Model Client
 */
export const makeOpenAIClient = (config: OpenAIConfig): ModelClient => ({
  generate: (request: LLMRequest): Effect.Effect<LLMResponse, LLMError, never> =>
    withLLMError(
      Effect.gen(function* (_) {
        const validatedConfig = yield* _(
          Schema.decodeUnknown(OpenAIConfigSchema)(config).pipe(
            Effect.mapError(
              (error): LLMError => ({
                _tag: 'ConfigurationError',
                message: `OpenAI configuration validation failed: ${error.message}`
              })
            )
          )
        )

        if (!validatedConfig.apiKey) {
          return yield* _(
            Effect.fail({
              _tag: 'AuthenticationFailed' as const,
              model: 'openai',
              message: 'No API key provided'
            })
          )
        }

        const startTime = Date.now()

        const payload = {
          model: validatedConfig.model,
          messages: [{ role: 'user' as const, content: request.prompt }],
          max_tokens: request.preferences?.maxTokens || validatedConfig.maxTokens,
          temperature: request.preferences?.temperature || validatedConfig.temperature,
          stream: false
        }

        const response = yield* _(
          Effect.tryPromise({
            try: () =>
              fetch(`${validatedConfig.endpoint}/chat/completions`, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${validatedConfig.apiKey}`,
                  'Content-Type': 'application/json',
                  ...(validatedConfig.organization && {
                    'OpenAI-Organization': validatedConfig.organization
                  })
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(validatedConfig.timeout)
              }),
            catch: (error) => ({
              _tag: 'NetworkError' as const,
              model: 'openai',
              message: error instanceof Error ? error.message : 'Network request failed'
            })
          })
        )

        if (!response.ok) {
          const errorText = yield* _(
            Effect.tryPromise({
              try: () => response.text(),
              catch: () => 'Unknown error'
            })
          )

          return yield* _(Effect.fail(mapHttpErrorToLLMError(response.status, errorText, 'openai')))
        }

        const data = yield* _(
          Effect.tryPromise({
            try: () => response.json() as Promise<OpenAIResponse>,
            catch: (error) => ({
              _tag: 'NetworkError' as const,
              model: 'openai',
              message: `Failed to parse response: ${error instanceof Error ? error.message : 'Unknown error'}`
            })
          })
        )

        const latency = Date.now() - startTime
        const choice = data.choices[0]

        if (!choice?.message?.content) {
          return yield* _(
            Effect.fail({
              _tag: 'ModelUnavailable' as const,
              model: 'openai',
              message: 'No content in response'
            })
          )
        }

        const usage = data.usage || {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        }

        const cost = calculateCost(
          validatedConfig.model,
          usage.prompt_tokens,
          usage.completion_tokens
        )

        return {
          content: choice.message.content,
          model: data.model,
          usage: {
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens,
            cost
          },
          metadata: {
            latencyMs: latency,
            retryCount: 0,
            cached: false
          }
        }
      }),
      'openai'
    ).pipe(
      Effect.retry(
        Schedule.exponential(Duration.millis(1000)).pipe(
          Schedule.compose(Schedule.recurs(config.retryAttempts || 3))
        )
      )
    ),

  generateStream: (request: LLMRequest): Stream.Stream<string, LLMError, never> =>
    Stream.unwrap(
      withLLMError(
        Effect.gen(function* (_) {
          const validatedConfig = yield* _(
            Schema.decodeUnknown(OpenAIConfigSchema)(config).pipe(
              Effect.mapError(
                (error): LLMError => ({
                  _tag: 'ConfigurationError',
                  message: `OpenAI configuration validation failed: ${error.message}`
                })
              )
            )
          )

          if (!validatedConfig.apiKey) {
            return Stream.fail({
              _tag: 'AuthenticationFailed' as const,
              model: 'openai',
              message: 'No API key provided'
            })
          }

          const payload = {
            model: validatedConfig.model,
            messages: [{ role: 'user' as const, content: request.prompt }],
            max_tokens: request.preferences?.maxTokens || validatedConfig.maxTokens,
            temperature: request.preferences?.temperature || validatedConfig.temperature,
            stream: true
          }

          const response = yield* _(
            Effect.tryPromise({
              try: () =>
                fetch(`${validatedConfig.endpoint}/chat/completions`, {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${validatedConfig.apiKey}`,
                    'Content-Type': 'application/json',
                    ...(validatedConfig.organization && {
                      'OpenAI-Organization': validatedConfig.organization
                    })
                  },
                  body: JSON.stringify(payload),
                  signal: AbortSignal.timeout(validatedConfig.timeout)
                }),
              catch: (error) => ({
                _tag: 'NetworkError' as const,
                model: 'openai',
                message: error instanceof Error ? error.message : 'Network request failed'
              })
            })
          )

          if (!response.ok) {
            const errorText = yield* _(
              Effect.tryPromise({
                try: () => response.text(),
                catch: () => 'Unknown error'
              })
            )

            return Stream.fail(mapHttpErrorToLLMError(response.status, errorText, 'openai'))
          }

          if (!response.body) {
            return Stream.fail({
              _tag: 'NetworkError' as const,
              model: 'openai',
              message: 'No response body'
            })
          }

          const reader = response.body.getReader()
          const decoder = new TextDecoder()

          return Stream.async<string, LLMError>((emit) => {
            // Use Effect.runPromise to handle the async operation
            Effect.runPromise(
              Effect.gen(function* (_) {
                try {
                  while (true) {
                    const { done, value } = yield* _(
                      Effect.tryPromise({
                        try: () => reader.read(),
                        catch: (error) => ({
                          _tag: 'NetworkError' as const,
                          model: 'openai',
                          message: `Stream read error: ${error instanceof Error ? error.message : 'Unknown error'}`
                        })
                      })
                    )

                    if (done) break

                    const chunk = decoder.decode(value)
                    const lines = chunk.split('\n').filter((line) => line.trim() !== '')

                    for (const line of lines) {
                      if (line.startsWith('data: ')) {
                        const data = line.slice(6)

                        if (data === '[DONE]') {
                          continue
                        }

                        try {
                          const parsed: OpenAIStreamChunk = JSON.parse(data)
                          const content = parsed.choices[0]?.delta?.content

                          if (content) {
                            emit.single(content)
                          }
                        } catch (error) {
                          // Skip malformed chunks
                          continue
                        }
                      }
                    }
                  }

                  emit.end()
                } catch (error) {
                  emit.fail({
                    _tag: 'NetworkError' as const,
                    model: 'openai',
                    message: `Stream processing error: ${error instanceof Error ? error.message : 'Unknown error'}`
                  })
                }
              })
            ).catch((error) => {
              emit.fail({
                _tag: 'NetworkError' as const,
                model: 'openai',
                message: `Stream setup error: ${error instanceof Error ? error.message : 'Unknown error'}`
              })
            })
          })
        }),
        'openai'
      )
    ),

  isHealthy: (): Effect.Effect<boolean, LLMError, never> =>
    withLLMError(
      Effect.gen(function* (_) {
        const health = yield* _(checkOpenAIHealth(config))
        return health.healthy
      }),
      'openai'
    )
})
