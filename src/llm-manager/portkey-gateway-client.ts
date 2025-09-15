/**
 * Portkey Gateway Client - Final Working Implementation
 *
 * This uses direct fetch calls to the Portkey gateway, bypassing SDK issues.
 * Proven to work with the self-hosted Portkey gateway.
 */

import { Effect, Layer, Stream } from 'effect'
import * as Schema from '@effect/schema/Schema'
import type { LLMRequest, LLMResponse, LLMError } from './types.js'
import { LLMManagerServiceTag } from './llm-manager-service.js'

// OpenAI-compatible response schema
const ChatCompletionSchema = Schema.Struct({
  id: Schema.String,
  object: Schema.String,
  created: Schema.Number,
  model: Schema.String,
  choices: Schema.Array(
    Schema.Struct({
      index: Schema.Number,
      message: Schema.Struct({
        role: Schema.String,
        content: Schema.String
      }),
      finish_reason: Schema.optional(Schema.String)
    })
  ),
  usage: Schema.Struct({
    prompt_tokens: Schema.Number,
    completion_tokens: Schema.Number,
    total_tokens: Schema.Number
  })
})

/**
 * Portkey Gateway Client using direct HTTP calls
 * This is the working implementation that properly routes through the gateway
 */
export const makePortkeyGatewayManager = (baseURL: string) => {
  return Effect.succeed({
    generate: (request: LLMRequest) => {
      const startTime = Date.now()
      const model = request.preferences?.model || 'gpt-3.5-turbo'

      // Determine provider type for routing
      const isAnthropic = model.includes('claude') || model.includes('anthropic')
      const isLocalModel =
        model.includes('codellama') ||
        model.includes('sqlcoder') ||
        model.includes('deepseek') ||
        model.includes('qwen') ||
        model.includes('llama') ||
        model.includes('mistral') ||
        model.includes('starcoder')

      // All requests go through Portkey for observability
      // Determine the provider to tell Portkey
      let provider: string
      let apiKey: string

      if (isLocalModel) {
        // Local models use openai provider but with custom base URL via Portkey
        provider = 'openai'
        apiKey = 'no-key-needed' // LM Studio doesn't need authentication
      } else if (isAnthropic) {
        provider = 'anthropic'
        apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || ''
      } else {
        provider = 'openai'
        apiKey = process.env.OPENAI_API_KEY || ''
      }

      // Check for missing API keys (except for local models)
      if (!apiKey && !isLocalModel) {
        return Effect.fail({
          _tag: 'ModelUnavailable' as const,
          model: provider,
          message: `No API key found for ${provider}`
        })
      }

      // Build request body
      const requestBody = {
        model,
        messages: [
          {
            role: 'user',
            content: request.prompt
          }
        ],
        max_tokens: request.preferences?.maxTokens || 2000,
        temperature: request.preferences?.temperature || 0.7
      }

      return Effect.tryPromise({
        try: async () => {
          const timings = {
            start: Date.now(),
            headerBuild: 0,
            fetchStart: 0,
            fetchEnd: 0,
            jsonParse: 0
          }

          // Build headers for Portkey routing
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'x-portkey-provider': provider
          }

          // For local models, add customHost header to point to LM Studio
          if (isLocalModel) {
            // Portkey runs in Docker, so it needs host.docker.internal to reach LM Studio on the host
            headers['x-portkey-custom-host'] = 'http://host.docker.internal:1234/v1'
            // Use a placeholder API key for local models (Portkey requirement)
            headers['Authorization'] = `Bearer sk-local-placeholder-key-for-portkey`
          } else {
            // For cloud models, use actual API key
            headers['Authorization'] = `Bearer ${apiKey}`
          }

          timings.headerBuild = Date.now() - timings.start

          try {
            timings.fetchStart = Date.now()
            const response = await fetch(`${baseURL}/v1/chat/completions`, {
              method: 'POST',
              headers,
              body: JSON.stringify(requestBody)
            })
            timings.fetchEnd = Date.now()

            if (!response.ok) {
              const errorText = await response.text()
              throw new Error(`Gateway error (${response.status}): ${errorText}`)
            }

            const jsonStart = Date.now()
            const jsonData = await response.json()
            timings.jsonParse = Date.now() - jsonStart

            // Log timing info only if explicitly debugging
            const totalTime = Date.now() - timings.start
            if (process.env.DEBUG_PORTKEY_TIMING) {
              console.log(
                `[Portkey Timing] Total: ${totalTime}ms, Fetch: ${timings.fetchEnd - timings.fetchStart}ms, JSON: ${timings.jsonParse}ms`
              )
            }

            return jsonData
          } catch (fetchError) {
            // Handle specific Portkey HTTP protocol issue where response data is actually available
            if (
              fetchError instanceof TypeError &&
              fetchError.message === 'fetch failed' &&
              fetchError.cause &&
              typeof fetchError.cause === 'object' &&
              'code' in fetchError.cause &&
              fetchError.cause.code === 'HPE_UNEXPECTED_CONTENT_LENGTH'
            ) {
              // Try to extract the JSON response from the error data
              try {
                const cause = fetchError.cause as { code: string; data?: string }
                const data = cause.data
                if (typeof data === 'string') {
                  // Parse chunked response data - look for JSON after hex length
                  const lines = data.split('\r\n')
                  const jsonLine = lines.find(
                    (line) => line.startsWith('{') && line.includes('"id"')
                  )
                  if (jsonLine) {
                    return JSON.parse(jsonLine)
                  }
                }
              } catch (parseError) {
                // Fall through to re-throw original error
              }
            }
            // Re-throw the original error if we can't extract the response
            throw fetchError
          }
        },
        catch: (error): LLMError => ({
          _tag: 'ModelUnavailable' as const,
          model: provider,
          message: String(error)
        })
      }).pipe(
        Effect.flatMap((rawResponse) =>
          Schema.decodeUnknown(ChatCompletionSchema)(rawResponse).pipe(
            Effect.mapError(
              (error): LLMError => ({
                _tag: 'InvalidRequest',
                message: `Invalid response format: ${error}`,
                request
              })
            ),
            Effect.map(
              (response): LLMResponse => ({
                content: response.choices[0]?.message?.content || '',
                model: response.model,
                usage: {
                  promptTokens: response.usage.prompt_tokens,
                  completionTokens: response.usage.completion_tokens,
                  totalTokens: response.usage.total_tokens
                },
                metadata: {
                  latencyMs: Date.now() - startTime,
                  retryCount: 0,
                  cached: false
                }
              })
            )
          )
        )
      )
    },

    generateStream: (_request: LLMRequest) =>
      Stream.fail({
        _tag: 'ModelUnavailable' as const,
        model: 'portkey',
        message: 'Streaming not implemented yet'
      }),

    isHealthy: () =>
      Effect.tryPromise({
        try: async () => {
          const response = await fetch(baseURL)
          return response.ok && (await response.text()).includes('Gateway')
        },
        catch: (): LLMError => ({
          _tag: 'ModelUnavailable' as const,
          model: 'portkey',
          message: 'Gateway health check failed'
        })
      }),

    getStatus: () =>
      Effect.succeed({
        availableModels: [
          'gpt-3.5-turbo',
          'gpt-4',
          'claude-3-haiku-20240307',
          'claude-3-sonnet-20240229',
          'codellama-7b-instruct',
          'sqlcoder-7b-2',
          'deepseek-coder-v2-lite-instruct',
          'qwen/qwen3-coder-30b'
        ],
        healthStatus: {
          'gpt-3.5-turbo': 'healthy' as const,
          'gpt-4': 'healthy' as const,
          'claude-3-haiku-20240307': 'healthy' as const,
          'codellama-7b-instruct': 'healthy' as const,
          'sqlcoder-7b-2': 'healthy' as const
        },
        config: {
          baseURL
        }
      }),

    getAvailableModels: () =>
      Effect.succeed([
        'gpt-3.5-turbo',
        'gpt-4',
        'claude-3-haiku-20240307',
        'claude-3-sonnet-20240229',
        'codellama-7b-instruct',
        'sqlcoder-7b-2',
        'deepseek-coder-v2-lite-instruct',
        'qwen/qwen3-coder-30b'
      ])
  })
}

/**
 * Portkey Gateway Manager Layer
 * This is the working implementation for the self-hosted Portkey gateway
 */
export const PortkeyGatewayLive = Layer.effect(
  LLMManagerServiceTag,
  makePortkeyGatewayManager(
    process.env.PORTKEY_GATEWAY_URL ||
      (process.env.NODE_ENV === 'production'
        ? 'http://portkey-gateway:8787'
        : 'http://localhost:8787')
  )
)
