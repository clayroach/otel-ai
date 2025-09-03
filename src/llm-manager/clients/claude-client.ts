/**
 * Claude (Anthropic) Client Implementation
 *
 * Integrates with Anthropic's API for Claude models with streaming support.
 * Provides full feature parity with OpenAI and local clients.
 */

import { Schema } from '@effect/schema'
import { Duration, Effect, Schedule, Stream } from 'effect'
import type { LLMError, LLMRequest, LLMResponse, ModelClient } from '../types.js'
import { withLLMError } from './error-utils.js'

/**
 * Claude Configuration Schema
 */
export const ClaudeConfigSchema = Schema.Struct({
  apiKey: Schema.String,
  model: Schema.String, // "claude-3-opus-20240229", "claude-3-7-sonnet-20250219", etc.
  maxTokens: Schema.Number,
  temperature: Schema.Number,
  timeout: Schema.Number,
  endpoint: Schema.optional(Schema.String),
  retryAttempts: Schema.optional(Schema.Number)
})

export type ClaudeConfig = Schema.Schema.Type<typeof ClaudeConfigSchema>

/**
 * Default Claude Configuration
 */
export const defaultClaudeConfig: ClaudeConfig = {
  apiKey: process.env.CLAUDE_API_KEY || '',
  model: 'claude-3-7-sonnet-20250219',
  maxTokens: 4096,
  temperature: 0.7,
  timeout: 30000,
  endpoint: 'https://api.anthropic.com',
  retryAttempts: 3
}

/**
 * Claude API Response Types
 */

interface ClaudeUsage {
  input_tokens: number
  output_tokens: number
}

interface ClaudeResponse {
  id: string
  type: 'message'
  role: 'assistant'
  content: Array<{
    type: 'text'
    text: string
  }>
  model: string
  stop_reason: string
  stop_sequence?: string
  usage: ClaudeUsage
}

interface ClaudeStreamChunk {
  type:
    | 'message_start'
    | 'content_block_start'
    | 'content_block_delta'
    | 'content_block_stop'
    | 'message_delta'
    | 'message_stop'
  message?: ClaudeResponse
  content_block?: {
    type: 'text'
    text: string
  }
  delta?: {
    type: 'text_delta'
    text: string
  }
  usage?: ClaudeUsage
}

/**
 * Calculate Claude API Costs
 *
 * Based on current Anthropic pricing (approximate).
 */
const calculateCost = (model: string, inputTokens: number, outputTokens: number): number => {
  const pricing: Record<string, { input: number; output: number }> = {
    'claude-3-opus-20240229': { input: 15 / 1000000, output: 75 / 1000000 },
    'claude-3-7-sonnet-20250219': { input: 3 / 1000000, output: 15 / 1000000 },
    'claude-3-haiku-20240307': { input: 0.25 / 1000000, output: 1.25 / 1000000 }
  }

  const modelPricing = pricing[model] ||
    pricing['claude-3-7-sonnet-20250219'] || { input: 3 / 1000000, output: 15 / 1000000 }
  return inputTokens * modelPricing.input + outputTokens * modelPricing.output
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
      // Create minimal empty request for error context
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
 * Check Claude API Health
 */
export const checkClaudeHealth = (config?: Partial<ClaudeConfig>) =>
  Effect.gen(function* (_) {
    const finalConfig = { ...defaultClaudeConfig, ...config }

    const validatedConfig = yield* _(
      Schema.decodeUnknown(ClaudeConfigSchema)(finalConfig).pipe(
        Effect.mapError(
          (error): LLMError => ({
            _tag: 'ConfigurationError',
            message: `Claude config validation failed: ${error.message}`
          })
        )
      )
    )

    if (!validatedConfig.apiKey) {
      return {
        endpoint:
          validatedConfig.endpoint ?? defaultClaudeConfig.endpoint ?? 'https://api.anthropic.com',
        healthy: false,
        timestamp: Date.now(),
        error: 'No API key configured'
      }
    }

    const startTime = Date.now()

    try {
      // Claude doesn't have a simple health endpoint, so we'll use a minimal message
      const response = yield* _(
        Effect.tryPromise({
          try: () =>
            fetch(`${validatedConfig.endpoint}/v1/messages`, {
              method: 'POST',
              headers: {
                'x-api-key': validatedConfig.apiKey,
                'Content-Type': 'application/json',
                'anthropic-version': '2023-06-01'
              },
              body: JSON.stringify({
                model: validatedConfig.model,
                max_tokens: 10,
                messages: [{ role: 'user', content: 'Hi' }]
              }),
              signal: AbortSignal.timeout(validatedConfig.timeout)
            }),
          catch: (error) => ({
            _tag: 'NetworkError' as const,
            model: 'claude',
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
          endpoint:
            validatedConfig.endpoint ?? defaultClaudeConfig.endpoint ?? 'https://api.anthropic.com',
          healthy: false,
          timestamp: Date.now(),
          latency,
          error: `HTTP ${response.status}: ${errorText}`
        }
      }

      return {
        endpoint:
          validatedConfig.endpoint ?? defaultClaudeConfig.endpoint ?? 'https://api.anthropic.com',
        healthy: true,
        timestamp: Date.now(),
        latency
      }
    } catch (error) {
      return {
        endpoint:
          validatedConfig.endpoint ?? defaultClaudeConfig.endpoint ?? 'https://api.anthropic.com',
        healthy: false,
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

/**
 * Create Claude Model Client
 */
export const makeClaudeClient = (config: ClaudeConfig): ModelClient => ({
  generate: (request: LLMRequest): Effect.Effect<LLMResponse, LLMError, never> =>
    withLLMError(
      Effect.gen(function* (_) {
        const validatedConfig = yield* _(
          Schema.decodeUnknown(ClaudeConfigSchema)(config).pipe(
            Effect.mapError(
              (error): LLMError => ({
                _tag: 'ConfigurationError',
                message: `Claude configuration validation failed: ${error.message}`
              })
            )
          )
        )

        if (!validatedConfig.apiKey) {
          return yield* _(
            Effect.fail({
              _tag: 'AuthenticationFailed' as const,
              model: 'claude',
              message: 'No API key provided'
            })
          )
        }

        const startTime = Date.now()

        const payload = {
          model: validatedConfig.model,
          max_tokens: request.preferences?.maxTokens || validatedConfig.maxTokens,
          temperature: request.preferences?.temperature || validatedConfig.temperature,
          messages: [{ role: 'user' as const, content: request.prompt }]
        }

        const response = yield* _(
          Effect.tryPromise({
            try: () =>
              fetch(`${validatedConfig.endpoint}/v1/messages`, {
                method: 'POST',
                headers: {
                  'x-api-key': validatedConfig.apiKey,
                  'Content-Type': 'application/json',
                  'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(validatedConfig.timeout)
              }),
            catch: (error) => ({
              _tag: 'NetworkError' as const,
              model: 'claude',
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

          return yield* _(Effect.fail(mapHttpErrorToLLMError(response.status, errorText, 'claude')))
        }

        const data = yield* _(
          Effect.tryPromise({
            try: () => response.json() as Promise<ClaudeResponse>,
            catch: (error) => ({
              _tag: 'NetworkError' as const,
              model: 'claude',
              message: `Failed to parse response: ${error instanceof Error ? error.message : 'Unknown error'}`
            })
          })
        )

        const latency = Date.now() - startTime
        const content = data.content[0]?.text || ''

        if (!content) {
          return yield* _(
            Effect.fail({
              _tag: 'ModelUnavailable' as const,
              model: 'claude',
              message: 'No content in response'
            })
          )
        }

        const usage = data.usage || {
          input_tokens: 0,
          output_tokens: 0
        }

        const cost = calculateCost(validatedConfig.model, usage.input_tokens, usage.output_tokens)

        return {
          content,
          model: data.model,
          usage: {
            promptTokens: usage.input_tokens,
            completionTokens: usage.output_tokens,
            totalTokens: usage.input_tokens + usage.output_tokens,
            cost
          },
          metadata: {
            latencyMs: latency,
            retryCount: 0,
            cached: false
          }
        }
      }),
      'claude'
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
            Schema.decodeUnknown(ClaudeConfigSchema)(config).pipe(
              Effect.mapError(
                (error): LLMError => ({
                  _tag: 'ConfigurationError',
                  message: `Claude configuration validation failed: ${error.message}`
                })
              )
            )
          )

          if (!validatedConfig.apiKey) {
            return Stream.fail({
              _tag: 'AuthenticationFailed' as const,
              model: 'claude',
              message: 'No API key provided'
            })
          }

          const payload = {
            model: validatedConfig.model,
            max_tokens: request.preferences?.maxTokens || validatedConfig.maxTokens,
            temperature: request.preferences?.temperature || validatedConfig.temperature,
            messages: [{ role: 'user' as const, content: request.prompt }],
            stream: true
          }

          const response = yield* _(
            Effect.tryPromise({
              try: () =>
                fetch(`${validatedConfig.endpoint}/v1/messages`, {
                  method: 'POST',
                  headers: {
                    'x-api-key': validatedConfig.apiKey,
                    'Content-Type': 'application/json',
                    'anthropic-version': '2023-06-01'
                  },
                  body: JSON.stringify(payload),
                  signal: AbortSignal.timeout(validatedConfig.timeout)
                }),
              catch: (error) => ({
                _tag: 'NetworkError' as const,
                model: 'claude',
                message: error instanceof Error ? error.message : 'Network request failed'
              })
            })
          )

          if (!response.ok) {
            const errorTextResult = yield* _(
              Effect.tryPromise({
                try: () => response.text(),
                catch: () => 'Failed to read error response'
              })
            )

            return Stream.fail(mapHttpErrorToLLMError(response.status, errorTextResult, 'claude'))
          }

          if (!response.body) {
            return Stream.fail({
              _tag: 'NetworkError' as const,
              model: 'claude',
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
                          model: 'claude',
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
                          const parsed: ClaudeStreamChunk = JSON.parse(data)

                          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                            emit.single(parsed.delta.text)
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
                    model: 'claude',
                    message: `Stream processing error: ${error instanceof Error ? error.message : 'Unknown error'}`
                  })
                }
              })
            ).catch((error) => {
              emit.fail({
                _tag: 'NetworkError' as const,
                model: 'claude',
                message: `Stream setup error: ${error instanceof Error ? error.message : 'Unknown error'}`
              })
            })
          })
        }),
        'claude'
      )
    ),

  isHealthy: (): Effect.Effect<boolean, LLMError, never> =>
    withLLMError(
      Effect.gen(function* (_) {
        const health = yield* _(checkClaudeHealth(config))
        return health.healthy
      }),
      'claude'
    )
})
