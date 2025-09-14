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

      // Determine provider and API key
      const isAnthropic = model.includes('claude') || model.includes('anthropic')
      const provider = isAnthropic ? 'anthropic' : 'openai'
      const apiKey = isAnthropic
        ? process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || ''
        : process.env.OPENAI_API_KEY || ''

      if (!apiKey) {
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
          const response = await fetch(`${baseURL}/v1/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-portkey-provider': provider,
              Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody)
          })

          if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`Gateway error (${response.status}): ${errorText}`)
          }

          return response.json()
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
          'codellama-7b-instruct'
        ],
        healthStatus: {
          'gpt-3.5-turbo': 'healthy' as const,
          'gpt-4': 'healthy' as const,
          'claude-3-haiku-20240307': 'healthy' as const
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
        'codellama-7b-instruct'
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
