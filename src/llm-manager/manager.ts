/**
 * LLM Manager Implementation
 * 
 * Main orchestration service for multi-model LLM management.
 * Handles intelligent routing, caching, conversation management, and fallback strategies.
 */

import { Effect, Layer, Stream, Option, Duration, Schedule } from 'effect'
import { Schema } from '@effect/schema'
import {
  LLMManagerService,
  ModelRouterService,
  ModelClientService,
  ConversationStorageService,
  CacheService,
  LLMConfigService,
  LLMMetricsService
} from './services.js'
import {
  LLMConfig,
  LLMRequest,
  LLMResponse,
  LLMError,
  ConversationContext,
  ModelHealthStatus,
  ModelType,
  LLMRequestSchema,
  ConversationContextSchema
} from './types.js'

/**
 * Generate Cache Key
 * 
 * Creates a deterministic cache key from an LLM request for response caching.
 */
const generateCacheKey = (request: LLMRequest): string => {
  const keyData = {
    prompt: request.prompt,
    taskType: request.taskType,
    maxTokens: request.preferences?.maxTokens,
    temperature: request.preferences?.temperature
  }
  return `llm:${Buffer.from(JSON.stringify(keyData)).toString('base64')}`
}

/**
 * Generate Conversation ID
 * 
 * Creates a unique identifier for conversation contexts.
 */
const generateConversationId = (): Effect.Effect<string, never, never> =>
  Effect.sync(() => `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`)

/**
 * Build Contextual Prompt
 * 
 * Constructs a prompt that includes conversation history for context-aware responses.
 */
const buildContextualPrompt = (context: ConversationContext): string => {
  if (context.messages.length === 0) {
    return ''
  }
  
  // Build conversation history
  const conversationHistory = context.messages
    .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join('\n\n')
    
  return conversationHistory
}

/**
 * Main LLM Manager Implementation
 * 
 * Orchestrates multi-model LLM operations with caching, routing, and conversation management.
 */
export const makeLLMManager = (config: LLMConfig) =>
  Effect.gen(function* (_) {
    const router = yield* _(ModelRouterService)
    const clients = yield* _(ModelClientService)
    const cache = yield* _(CacheService)
    const conversationStorage = yield* _(ConversationStorageService)
    const metrics = yield* _(LLMMetricsService)

    return {
      generate: (request: LLMRequest): Effect.Effect<LLMResponse, LLMError, never> =>
        Effect.gen(function* (_) {
          // Record request metrics
          yield* _(metrics.recordRequest('llama', request)) // Default to llama for local-first
          
          // Validate request
          const validatedRequest = yield* _(
            Schema.decodeUnknown(LLMRequestSchema)(request).pipe(
              Effect.mapError((error) => ({
                _tag: 'InvalidRequest' as const,
                message: `Request validation failed: ${error.message}`,
                request
              }))
            )
          )

          // Check cache first if enabled
          if (config.cache.enabled) {
            const cacheKey = generateCacheKey(validatedRequest)
            const cached = yield* _(cache.get(cacheKey))
            
            if (cached) {
              // Note: cached response, no model-specific recording needed
              return { ...cached, metadata: { ...cached.metadata, cached: true } }
            }
          }

          // Route to appropriate model with fallback and retry
          const response: LLMResponse = yield* _(
            router.routeRequest(validatedRequest).pipe(
              Effect.retry(
                Schedule.exponential('1 second').pipe(
                  Schedule.compose(Schedule.recurs(config.routing.maxRetries))
                )
              ),
              Effect.timeout(Duration.millis(config.routing.timeoutMs)),
              Effect.mapError((error): LLMError => {
                if ((error as any)?._tag === 'TimeoutException') {
                  return {
                    _tag: 'TimeoutError',
                    model: 'unknown',
                    timeoutMs: config.routing.timeoutMs
                  }
                }
                return error as LLMError
              }),
              Effect.tapError((error) =>
                Effect.gen(function* (_) {
                  // Note: error occurred during routing, no specific model to record
                  yield* _(Effect.log(`LLM request failed: ${JSON.stringify(error)}`))
                })
              )
            )
          )

          // Cache successful response
          if (config.cache.enabled && !response.metadata.cached) {
            const cacheKey = generateCacheKey(validatedRequest)
            yield* _(cache.set(cacheKey, response, config.cache.ttlSeconds))
          }

          // Record successful response metrics
          yield* _(metrics.recordResponse('llama', response))
          
          return response
        }),

      generateStream: (request: LLMRequest) =>
        Stream.unwrap(
          Effect.gen(function* (_) {
            // Validate request
            const validatedRequest = yield* _(
              Schema.decodeUnknown(LLMRequestSchema)(request).pipe(
                Effect.mapError((error) => ({
                  _tag: 'InvalidRequest' as const,
                  message: `Request validation failed: ${error.message}`,
                  request
                }))
              )
            )

            // Select model for streaming (cache doesn't apply to streaming)
            const selectedModel = yield* _(router.selectModel(validatedRequest))
            
            // Record request metrics
            yield* _(metrics.recordRequest(selectedModel, validatedRequest))

            // Get appropriate client
            const modelClient = selectedModel === 'gpt' ? clients.gpt :
                              selectedModel === 'claude' ? clients.claude :
                              clients.llama

            if (!modelClient) {
              return Stream.fail({
                _tag: 'ModelUnavailable' as const,
                model: selectedModel,
                message: `Model ${selectedModel} is not configured`
              })
            }

            if (!modelClient.generateStream) {
              return Stream.fail({
                _tag: 'ModelUnavailable' as const,
                model: selectedModel,
                message: `Model ${selectedModel} does not support streaming`
              })
            }

            return modelClient.generateStream(validatedRequest).pipe(
              Stream.tap((chunk) =>
                Effect.log(`Streaming chunk from ${selectedModel}: ${chunk.length} chars`)
              ),
              Stream.tapError((error) =>
                metrics.recordError(selectedModel, error)
              )
            )
          })
        ),

      startConversation: (systemPrompt?: string) =>
        Effect.gen(function* (_) {
          const conversationId = yield* _(generateConversationId())
          
          const context: ConversationContext = {
            id: conversationId,
            messages: systemPrompt
              ? [{ role: 'system', content: systemPrompt, timestamp: Date.now() }]
              : [],
            metadata: {
              systemPrompt: systemPrompt ?? null,
              totalTokens: 0,
              totalCost: 0
            },
            createdAt: Date.now(),
            updatedAt: Date.now()
          }

          yield* _(conversationStorage.save(context))
          return conversationId
        }),

      continueConversation: (conversationId: string, message: string) =>
        Effect.gen(function* (_) {
          // Load existing conversation
          const context = yield* _(conversationStorage.load(conversationId))

          // Add user message
          const updatedContext: ConversationContext = {
            ...context,
            messages: [
              ...context.messages,
              { role: 'user', content: message, timestamp: Date.now() }
            ],
            updatedAt: Date.now()
          }

          // Generate response with conversation context
          const contextualPrompt = buildContextualPrompt(updatedContext)
          const request: LLMRequest = {
            prompt: contextualPrompt,
            taskType: 'general',
            context: { conversationId },
            preferences: {
              // Use higher temperature for conversations to be more engaging
              temperature: 0.8
            }
          }

          const response = yield* _(router.routeRequest(request))

          // Add assistant message and save
          const finalContext: ConversationContext = {
            ...updatedContext,
            messages: [
              ...updatedContext.messages,
              { role: 'assistant', content: response.content, timestamp: Date.now() }
            ],
            metadata: {
              ...updatedContext.metadata,
              totalTokens: (updatedContext.metadata.totalTokens as number || 0) + response.usage.totalTokens,
              totalCost: (updatedContext.metadata.totalCost as number || 0) + (response.usage.cost || 0)
            },
            updatedAt: Date.now()
          }

          yield* _(conversationStorage.save(finalContext))
          return response
        }),

      getConversation: (conversationId: string) =>
        conversationStorage.load(conversationId),

      getAvailableModels: () =>
        Effect.gen(function* (_) {
          const models: ModelType[] = []
          
          // Check which models are configured
          if (config.models.gpt && clients.gpt) models.push('gpt')
          if (config.models.claude && clients.claude) models.push('claude') 
          if (config.models.llama && clients.llama) models.push('llama')
          
          return models
        }),

      getModelHealth: () =>
        Effect.gen(function* (_) {
          const healthStatuses: ModelHealthStatus[] = []
          const startTime = Date.now()

          // Check GPT health
          if (clients.gpt) {
            const healthy = yield* _(clients.gpt.isHealthy().pipe(
              Effect.orElse(() => Effect.succeed(false))
            ))
            healthStatuses.push({
              model: 'gpt',
              status: healthy ? 'healthy' : 'unavailable',
              latencyMs: healthy ? Date.now() - startTime : undefined,
              errorRate: 0, // TODO: Get from metrics
              lastChecked: Date.now()
            })
          }

          // Check Claude health  
          if (clients.claude) {
            const healthy = yield* _(clients.claude.isHealthy().pipe(
              Effect.orElse(() => Effect.succeed(false))
            ))
            healthStatuses.push({
              model: 'claude',
              status: healthy ? 'healthy' : 'unavailable',
              latencyMs: healthy ? Date.now() - startTime : undefined,
              errorRate: 0,
              lastChecked: Date.now()
            })
          }

          // Check Llama health
          if (clients.llama) {
            const healthy = yield* _(clients.llama.isHealthy().pipe(
              Effect.orElse(() => Effect.succeed(false))
            ))
            healthStatuses.push({
              model: 'llama',
              status: healthy ? 'healthy' : 'unavailable',
              latencyMs: healthy ? Date.now() - startTime : undefined,
              errorRate: 0,
              lastChecked: Date.now()
            })
          }

          return healthStatuses
        }),

      warmupModels: () =>
        Effect.gen(function* (_) {
          const warmupRequest: LLMRequest = {
            prompt: 'Hello, this is a warmup request.',
            taskType: 'general',
            preferences: { maxTokens: 10 }
          }

          // Attempt to warm up all available models
          const models = yield* _(Effect.succeed(['gpt', 'claude', 'llama'] as ModelType[]))
          
          yield* _(
            Effect.forEach(models, (model) =>
              Effect.gen(function* (_) {
                const client = model === 'gpt' ? clients.gpt :
                             model === 'claude' ? clients.claude :
                             clients.llama

                if (client) {
                  yield* _(
                    client.generate(warmupRequest).pipe(
                      Effect.tap(() => Effect.log(`Warmed up ${model} model`)),
                      Effect.orElse(() => 
                        Effect.log(`Failed to warm up ${model} model`)
                      )
                    )
                  )
                }
              }),
              { concurrency: 3 }
            )
          )
        })
    }
  })

/**
 * LLM Manager Layer
 * 
 * Effect-TS Layer for dependency injection of the LLM Manager service.
 */
export const LLMManagerLayer = Layer.effect(
  LLMManagerService,
  Effect.gen(function* (_) {
    const configService = yield* _(LLMConfigService)
    const config = yield* _(configService.getConfig())
    return yield* _(makeLLMManager(config))
  })
)