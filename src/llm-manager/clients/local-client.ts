/**
 * Local Model Client (LM Studio / Local Llama)
 *
 * Implements local model integration with support for LM Studio's OpenAI-compatible API
 * and direct Llama model integration. Provides zero-cost inference with local hardware.
 */

import { Effect, Stream } from 'effect'
import { Schema } from '@effect/schema'
import type { LLMRequest, LLMResponse, LLMError, ModelClient } from '../types.js'

// LM Studio / Local model configuration
const LocalModelConfigSchema = Schema.Struct({
  endpoint: Schema.String, // e.g., "http://localhost:1234/v1"
  model: Schema.String, // Model name or path
  maxTokens: Schema.Number,
  temperature: Schema.Number,
  contextLength: Schema.Number,
  timeout: Schema.optional(Schema.Number)
})

type LocalModelConfig = Schema.Schema.Type<typeof LocalModelConfigSchema>

// OpenAI-compatible request/response types for LM Studio
interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface OpenAIRequest {
  model: string
  messages: OpenAIMessage[]
  max_tokens?: number
  temperature?: number
  stream?: boolean
}

interface OpenAIResponse {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

interface OpenAIStreamChunk {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    delta: {
      role?: string
      content?: string
    }
    finish_reason?: string
  }>
}

/**
 * Create Local Model Client
 *
 * Creates a client for local models with LM Studio OpenAI-compatible API support.
 * Handles both direct API calls and streaming responses.
 */
export const makeLocalModelClient = (config: LocalModelConfig | Record<string, unknown>): ModelClient => ({
  generate: (request: LLMRequest) =>
    Effect.gen(function* (_) {
      const startTime = Date.now()

      // Handle both 'model' and 'modelPath' properties for compatibility
      const configAny = config as Record<string, unknown>
      const configWithModel = {
        ...config,
        model: configAny.model || configAny.modelPath || 'sqlcoder-7b-2'
      }

      // Validate configuration
      const validatedConfig = yield* _(
        Schema.decodeUnknown(LocalModelConfigSchema)(configWithModel).pipe(
          Effect.mapError(
            (error): LLMError => ({
              _tag: 'ConfigurationError',
              message: `Configuration validation failed: ${error.message}`
            })
          )
        )
      )

      // Prepare OpenAI-compatible request
      const openAIRequest: OpenAIRequest = {
        model: validatedConfig.model,
        messages: [{ role: 'user', content: request.prompt }],
        max_tokens: request.preferences?.maxTokens ?? validatedConfig.maxTokens,
        temperature: request.preferences?.temperature ?? validatedConfig.temperature
      }

      // Make API call to local model
      const response = yield* _(
        Effect.tryPromise({
          try: async () => {
            const fetchResponse = await fetch(`${validatedConfig.endpoint}/chat/completions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(openAIRequest),
              signal: AbortSignal.timeout(validatedConfig.timeout ?? 30000)
            })

            if (!fetchResponse.ok) {
              throw new Error(
                `Local model API error: ${fetchResponse.status} ${fetchResponse.statusText}`
              )
            }

            return fetchResponse.json() as Promise<OpenAIResponse>
          },
          catch: (error) => ({
            _tag: 'ModelUnavailable' as const,
            model: 'llama',
            message: error instanceof Error ? error.message : 'Unknown error'
          })
        })
      )

      const endTime = Date.now()
      const latencyMs = endTime - startTime

      // Transform to LLMResponse format
      const llmResponse: LLMResponse = {
        content: response.choices[0]?.message?.content ?? '',
        model: `llama-${response.model}`,
        usage: {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
          cost: 0 // Local models have zero cost
        },
        metadata: {
          latencyMs,
          retryCount: 0,
          cached: false,
          confidence: 0.9 // Local models generally consistent
        }
      }

      return llmResponse
    }),

  generateStream: (request: LLMRequest) =>
    Stream.unwrap(
      Effect.gen(function* (_) {
        // Handle both 'model' and 'modelPath' properties for compatibility
        const configAny = config as Record<string, unknown>
        const configWithModel = {
          ...config,
          model: configAny.model || configAny.modelPath || 'openai/gpt-oss-20b'
        }

        const validatedConfig = yield* _(
          Schema.decodeUnknown(LocalModelConfigSchema)(configWithModel).pipe(
            Effect.mapError(
              (error): LLMError => ({
                _tag: 'ConfigurationError',
                message: `Configuration validation failed: ${error.message}`
              })
            )
          )
        )

        // Prepare streaming request
        const openAIRequest: OpenAIRequest = {
          model: validatedConfig.model,
          messages: [{ role: 'user', content: request.prompt }],
          max_tokens: request.preferences?.maxTokens ?? validatedConfig.maxTokens,
          temperature: request.preferences?.temperature ?? validatedConfig.temperature,
          stream: true
        }

        // Create streaming response
        return Stream.async<string, LLMError>((emit) => {
          // Use Effect.runPromise to handle the async operation
          Effect.runPromise(
            Effect.gen(function* (_) {
              const fetchResponse = yield* _(
                Effect.tryPromise({
                  try: () =>
                    fetch(`${validatedConfig.endpoint}/chat/completions`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify(openAIRequest),
                      signal: AbortSignal.timeout(validatedConfig.timeout ?? 30000)
                    }),
                  catch: (error) => ({
                    _tag: 'ModelUnavailable' as const,
                    model: 'llama',
                    message: error instanceof Error ? error.message : 'Unknown error'
                  })
                })
              )

              if (!fetchResponse.ok) {
                emit.fail({
                  _tag: 'ModelUnavailable',
                  model: 'llama',
                  message: `Local model API error: ${fetchResponse.status}`
                })
                return
              }

              const reader = fetchResponse.body?.getReader()
              if (!reader) {
                emit.fail({
                  _tag: 'ModelUnavailable',
                  model: 'llama',
                  message: 'No response body available'
                })
                return
              }

              // Process the stream within the Effect context
              yield* _(
                Effect.tryPromise({
                  try: async () => {
                    const decoder = new TextDecoder()

                    // eslint-disable-next-line no-constant-condition
                    while (true) {
                      const { done, value } = await reader.read()
                      if (done) break

                      const chunk = decoder.decode(value, { stream: true })
                      const lines = chunk.split('\n').filter((line) => line.trim())

                      for (const line of lines) {
                        if (line.startsWith('data: ')) {
                          const data = line.slice(6).trim()
                          if (data === '[DONE]') {
                            emit.end()
                            return
                          }

                          try {
                            const parsed: OpenAIStreamChunk = JSON.parse(data)
                            const content = parsed.choices[0]?.delta?.content
                            if (content) {
                              emit.single(content)
                            }
                          } catch (parseError) {
                            // Skip invalid JSON chunks
                            continue
                          }
                        }
                      }
                    }

                    emit.end()
                  },
                  catch: (error) => ({
                    _tag: 'NetworkError' as const,
                    model: 'llama',
                    message: error instanceof Error ? error.message : 'Streaming error'
                  })
                })
              )
            })
          ).catch((error) => {
            // Handle any Effect errors
            emit.fail(error as LLMError)
          })
        })
      })
    ),

  isHealthy: () =>
    Effect.gen(function* (_) {
      // Handle both 'model' and 'modelPath' properties for compatibility
      const configAny = config as Record<string, unknown>
      const configWithModel = {
        ...config,
        model: configAny.model || configAny.modelPath || 'sqlcoder-7b-2'
      }

      const validatedConfig = yield* _(
        Schema.decodeUnknown(LocalModelConfigSchema)(configWithModel).pipe(
          Effect.mapError(
            (error): LLMError => ({
              _tag: 'ConfigurationError',
              message: `Configuration validation failed: ${error.message}`
            })
          )
        )
      )

      return yield* _(
        Effect.tryPromise({
          try: async () => {
            const response = await fetch(`${validatedConfig.endpoint}/models`, {
              method: 'GET',
              signal: AbortSignal.timeout(5000) // 5 second health check timeout
            })
            return response.ok
          },
          catch: (error): LLMError => ({
            _tag: 'ModelUnavailable',
            model: 'llama',
            message: error instanceof Error ? error.message : 'Health check failed'
          })
        }).pipe(Effect.catchAll(() => Effect.succeed(false)))
      )
    })
})

/**
 * Default Local Model Configuration
 *
 * Provides sensible defaults for LM Studio setup with openai/gpt-oss-20b or similar models.
 */
export const defaultLocalConfig: LocalModelConfig = {
  endpoint: 'http://localhost:1234/v1', // LM Studio default
  model: 'sqlcoder-7b-2', // Default model (fast SQL generation)
  maxTokens: 4096,
  temperature: 0.7,
  contextLength: 4096,
  timeout: 30000
}

/**
 * Create Local Model Client with Defaults
 *
 * Convenience function to create a local model client with reasonable defaults.
 */
export const createDefaultLocalClient = (): ModelClient => makeLocalModelClient(defaultLocalConfig)

/**
 * Health Check Utility
 *
 * Checks if LM Studio or local model endpoint is available and responsive.
 */
export const checkLocalModelHealth = (endpoint: string = 'http://localhost:1234/v1') =>
  Effect.gen(function* (_) {
    const isHealthy = yield* _(
      Effect.tryPromise({
        try: async () => {
          const response = await fetch(`${endpoint}/models`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000)
          })
          return response.ok
        },
        catch: () => false
      })
    )

    return {
      endpoint,
      healthy: isHealthy,
      timestamp: Date.now()
    }
  })
