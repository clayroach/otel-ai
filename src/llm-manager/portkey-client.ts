/**
 * Portkey Gateway Client
 * Implements LLM routing through Portkey gateway based on ADR-014
 */

import { Effect, Layer, Stream } from 'effect'
import * as Schema from '@effect/schema/Schema'
import Portkey from 'portkey-ai'
import type { LLMRequest, LLMResponse, LLMError } from './types'
import { LLMManagerServiceTag } from './llm-manager-service'

// Portkey client configuration schema
const PortkeyConfigSchema = Schema.Struct({
  baseURL: Schema.String,
  configPath: Schema.optional(Schema.String),
  apiKey: Schema.optional(Schema.String),
})

type PortkeyConfig = Schema.Schema.Type<typeof PortkeyConfigSchema>

// Portkey API response schemas for type safety
const PortkeyUsageSchema = Schema.Struct({
  prompt_tokens: Schema.Number,
  completion_tokens: Schema.Number,
  total_tokens: Schema.Number,
  cost: Schema.optional(Schema.Number),
})

const PortkeyChoiceSchema = Schema.Struct({
  message: Schema.Struct({
    content: Schema.String,
    role: Schema.String,
  }),
  finish_reason: Schema.optional(Schema.String),
})

const PortkeyResponseSchema = Schema.Struct({
  choices: Schema.Array(PortkeyChoiceSchema),
  model: Schema.String,
  usage: PortkeyUsageSchema,
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
})

/**
 * Create a Portkey client instance
 */
const createPortkeyClient = (config: PortkeyConfig) => {
  const portkeyConfig: {
    baseURL: string
    config?: string | null
    apiKey?: string | null
  } = {
    baseURL: config.baseURL,
  }
  
  if (config.configPath) {
    portkeyConfig.config = config.configPath
  }
  
  if (config.apiKey) {
    portkeyConfig.apiKey = config.apiKey
  }
  
  return new Portkey(portkeyConfig)
}

/**
 * Map LLM request to Portkey format
 */
const mapToPortkeyRequest = (request: LLMRequest) => {
  // Determine priority based on task type
  const priority = request.taskType === 'analysis' || 
                   request.taskType === 'ui-generation' 
                   ? 'high' : 'normal'

  // Convert context to string for Portkey metadata compatibility
  const contextString = request.context ? JSON.stringify(request.context) : undefined

  return {
    messages: [
      {
        role: 'user' as const,
        content: request.prompt,
      }
    ],
    max_tokens: request.preferences?.maxTokens ?? 2000,
    temperature: request.preferences?.temperature ?? 0.7,
    // Portkey metadata must be Record<string, string>
    ...(contextString && {
      metadata: {
        task: request.taskType,
        context: contextString,
      },
    }),
    // Use custom headers for additional metadata
    headers: {
      'x-priority': priority,
      'x-task-type': request.taskType,
    },
  }
}

/**
 * Map Portkey response to LLM response format with validation
 */
const mapFromPortkeyResponse = (
  rawResponse: unknown,
  startTime: number
): Effect.Effect<LLMResponse, LLMError, never> => {
  const latencyMs = Date.now() - startTime
  
  return Schema.decodeUnknown(PortkeyResponseSchema)(rawResponse).pipe(
    Effect.mapError((error): LLMError => {
      const emptyRequest: LLMRequest = {
        prompt: '',
        taskType: 'general',
      }
      return {
        _tag: 'InvalidRequest',
        message: `Invalid Portkey response format: ${error}`,
        request: emptyRequest,
      }
    }),
    Effect.map((response) => ({
      content: response.choices[0]?.message?.content ?? '',
      model: response.model,
      usage: {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
        cost: response.usage.cost,
      },
      metadata: {
        latencyMs,
        retryCount: 0,
        cached: response.metadata?.cached === true,
        confidence: typeof response.metadata?.confidence === 'number' ? response.metadata.confidence : undefined,
      },
    }))
  )
}

/**
 * Portkey-based LLM Manager implementation
 */
export const makePortkeyLLMManager = (config: PortkeyConfig) => {
  const client = createPortkeyClient(config)

  return Effect.succeed({
    generate: (request: LLMRequest) => {
      const startTime = Date.now()
      const portkeyRequest = mapToPortkeyRequest(request)
      
      return Effect.tryPromise({
        try: () => client.chat.completions.create(portkeyRequest),
        catch: (error) => ({
          _tag: 'ModelUnavailable' as const,
          model: 'portkey',
          message: String(error),
        }),
      }).pipe(
        Effect.flatMap((response) => mapFromPortkeyResponse(response, startTime))
      )
    },

    generateStream: (_request: LLMRequest) =>
      Stream.fail({
        _tag: 'ModelUnavailable' as const,
        model: 'portkey', 
        message: 'Streaming not yet implemented for Portkey client',
      }),

    isHealthy: () =>
      Effect.tryPromise({
        try: () => fetch(`${config.baseURL}/health`),
        catch: () => null,
      }).pipe(
        Effect.map((response) => response !== null && response.ok),
        Effect.orElse(() => Effect.succeed(false))
      ),

    getStatus: () =>
      Effect.succeed({
        availableModels: ['codellama-7b-instruct', 'sqlcoder-7b-2', 'gpt-3.5-turbo', 'claude-3-haiku'],
        healthStatus: {
          'codellama-7b-instruct': 'healthy' as const,
          'sqlcoder-7b-2': 'healthy' as const,
          'gpt-3.5-turbo': 'healthy' as const,
          'claude-3-haiku': 'healthy' as const,
        },
        config: {
          baseURL: config.baseURL,
          configPath: config.configPath,
        },
      }),

    getAvailableModels: () =>
      Effect.succeed([
        'codellama-7b-instruct',
        'sqlcoder-7b-2', 
        'gpt-3.5-turbo',
        'claude-3-haiku-20240307',
      ]),
  })
}

/**
 * Portkey LLM Manager Layer
 * Can be used as a drop-in replacement for the existing LLM Manager
 */
export const PortkeyLLMManagerLive = Layer.effect(
  LLMManagerServiceTag,
  makePortkeyLLMManager({
    baseURL: process.env.PORTKEY_GATEWAY_URL || 'http://localhost:8787',
    configPath: '/config/routing.yaml',
  })
)

/**
 * Create a custom Portkey layer with specific configuration
 */
export const createPortkeyLLMManagerLive = (config: PortkeyConfig) =>
  Layer.effect(
    LLMManagerServiceTag,
    makePortkeyLLMManager(config)
  )