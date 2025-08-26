/**
 * LLM Interaction Logger
 * 
 * Comprehensive logging system for LLM interactions including:
 * - Request/response tracking with timestamps
 * - Model-specific conversation logs
 * - Real-time streaming interface for debugging
 * - Query analysis for understanding model differences
 */

import { Effect, Layer, Stream, Ref } from 'effect'
import { Schema } from '@effect/schema'
import { LLMRequest, LLMResponse, LLMError, ModelType } from './types.js'

/**
 * Interaction Log Entry Schema
 */
export const InteractionLogEntrySchema = Schema.Struct({
  id: Schema.String,
  timestamp: Schema.Number,
  model: Schema.String,
  request: Schema.Struct({
    prompt: Schema.String,
    taskType: Schema.String,
    preferences: Schema.optional(Schema.Record(Schema.String, Schema.Unknown))
  }),
  response: Schema.optional(Schema.Struct({
    content: Schema.String,
    model: Schema.String,
    usage: Schema.Struct({
      promptTokens: Schema.Number,
      completionTokens: Schema.Number,
      totalTokens: Schema.Number,
      cost: Schema.optional(Schema.Number)
    }),
    metadata: Schema.Record(Schema.String, Schema.Unknown)
  })),
  error: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  latencyMs: Schema.optional(Schema.Number),
  status: Schema.Literal('pending', 'success', 'error'),
  debugInfo: Schema.optional(Schema.Struct({
    routingReason: Schema.String,
    cacheHit: Schema.Boolean,
    retryCount: Schema.Number,
    fallbackUsed: Schema.optional(Schema.String)
  }))
})

export type InteractionLogEntry = Schema.Schema.Type<typeof InteractionLogEntrySchema>

/**
 * Live Interaction Event for Streaming
 */
export const LiveInteractionEventSchema = Schema.Struct({
  type: Schema.Literal('request_start', 'request_complete', 'request_error', 'stream_chunk'),
  entry: InteractionLogEntrySchema,
  streamChunk: Schema.optional(Schema.String)
})

export type LiveInteractionEvent = Schema.Schema.Type<typeof LiveInteractionEventSchema>

/**
 * Interaction Logger Service Interface
 */
export interface InteractionLoggerInterface {
  readonly logRequest: (
    model: ModelType,
    request: LLMRequest,
    debugInfo?: {
      routingReason?: string
      cacheHit?: boolean
      retryCount?: number
      fallbackUsed?: string
    }
  ) => Effect.Effect<string, never, never> // Returns interaction ID

  readonly logResponse: (
    interactionId: string,
    response: LLMResponse,
    latencyMs: number
  ) => Effect.Effect<void, never, never>

  readonly logError: (
    interactionId: string,
    error: LLMError,
    latencyMs: number
  ) => Effect.Effect<void, never, never>

  readonly logStreamChunk: (
    interactionId: string,
    chunk: string
  ) => Effect.Effect<void, never, never>

  readonly getLiveFeed: () => Stream.Stream<LiveInteractionEvent, never, never>

  readonly getRecentInteractions: (
    limit?: number,
    model?: ModelType
  ) => Effect.Effect<InteractionLogEntry[], never, never>

  readonly getInteractionById: (id: string) => Effect.Effect<InteractionLogEntry | null, never, never>

  readonly getModelComparison: (
    taskType?: string,
    timeWindowMs?: number
  ) => Effect.Effect<{
    model: ModelType
    interactions: InteractionLogEntry[]
    avgLatency: number
    successRate: number
    avgCost: number
  }[], never, never>

  readonly clearLogs: () => Effect.Effect<void, never, never>
}

/**
 * Interaction Logger Service Tag
 */
export const InteractionLoggerService = Effect.Service<InteractionLoggerInterface>()

/**
 * Generate Unique Interaction ID
 */
const generateInteractionId = (): string => {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `int_${timestamp}_${random}`
}

/**
 * In-Memory Interaction Logger Implementation
 */
export const makeInteractionLogger = (): Effect.Effect<InteractionLoggerInterface, never, never> =>
  Effect.gen(function* (_) {
    // In-memory storage for interactions
    const interactionsRef = yield* _(Ref.make(new Map<string, InteractionLogEntry>()))
    
    // Live feed subscribers
    const subscribersRef = yield* _(Ref.make(new Set<{
      emit: (event: LiveInteractionEvent) => void
      fail: (error: any) => void
      end: () => void
    }>()))

    // Helper to broadcast events to live feed subscribers
    const broadcastEvent = (event: LiveInteractionEvent) =>
      Effect.gen(function* (_) {
        const subscribers = yield* _(Ref.get(subscribersRef))
        const failedSubscribers: any[] = []
        
        subscribers.forEach(subscriber => {
          try {
            subscriber.emit(event)
          } catch (error) {
            // Mark subscriber for removal
            failedSubscribers.push(subscriber)
          }
        })
        
        // Remove failed subscribers
        if (failedSubscribers.length > 0) {
          yield* _(Ref.update(subscribersRef, subs => {
            failedSubscribers.forEach(sub => subs.delete(sub))
            return subs
          }))
        }
      })

    return {
      logRequest: (model: ModelType, request: LLMRequest, debugInfo = {}) =>
        Effect.gen(function* (_) {
          const id = generateInteractionId()
          const timestamp = Date.now()
          
          const entry: InteractionLogEntry = {
            id,
            timestamp,
            model,
            request: {
              prompt: request.prompt,
              taskType: request.taskType,
              preferences: request.preferences
            },
            status: 'pending',
            debugInfo: {
              routingReason: (debugInfo && typeof debugInfo === 'object' && 'routingReason' in debugInfo) ? debugInfo.routingReason as string : 'Unknown',
              cacheHit: (debugInfo && typeof debugInfo === 'object' && 'cacheHit' in debugInfo) ? debugInfo.cacheHit as boolean : false,
              retryCount: (debugInfo && typeof debugInfo === 'object' && 'retryCount' in debugInfo) ? debugInfo.retryCount as number : 0,
              fallbackUsed: (debugInfo && typeof debugInfo === 'object' && 'fallbackUsed' in debugInfo) ? debugInfo.fallbackUsed as string : undefined
            }
          }

          // Store the entry
          yield* _(Ref.update(interactionsRef, interactions => {
            interactions.set(id, entry)
            return interactions
          }))

          // Broadcast live event
          yield* _(broadcastEvent({
            type: 'request_start',
            entry
          }))

          // Log to console for immediate visibility
          yield* _(Effect.log(
            `🔹 LLM Request [${id}] → ${model} (${request.taskType})\n` +
            `   Prompt: ${request.prompt.substring(0, 100)}${request.prompt.length > 100 ? '...' : ''}\n` +
            `   Routing: ${(debugInfo && typeof debugInfo === 'object' && 'routingReason' in debugInfo) ? debugInfo.routingReason : 'Unknown'}`
          ))

          return id
        }),

      logResponse: (interactionId: string, response: LLMResponse, latencyMs: number) =>
        Effect.gen(function* (_) {
          yield* _(Ref.update(interactionsRef, interactions => {
            const existing = interactions.get(interactionId)
            if (existing) {
              const updated: InteractionLogEntry = {
                ...existing,
                response: {
                  content: response.content,
                  model: response.model,
                  usage: response.usage,
                  metadata: response.metadata
                },
                latencyMs,
                status: 'success'
              }
              interactions.set(interactionId, updated)
              
              // Broadcast live event (don't await to avoid blocking)
              Effect.runFork(broadcastEvent({
                type: 'request_complete',
                entry: updated
              }))
            }
            return interactions
          }))

          // Log to console
          yield* _(Effect.log(
            `✅ LLM Response [${interactionId}] ← ${response.model} (${latencyMs}ms)\n` +
            `   Content: ${response.content.substring(0, 200)}${response.content.length > 200 ? '...' : ''}\n` +
            `   Usage: ${response.usage.totalTokens} tokens, $${response.usage.cost?.toFixed(4) || '0.0000'}`
          ))
        }),

      logError: (interactionId: string, error: LLMError, latencyMs: number) =>
        Effect.gen(function* (_) {
          yield* _(Ref.update(interactionsRef, interactions => {
            const existing = interactions.get(interactionId)
            if (existing) {
              const updated: InteractionLogEntry = {
                ...existing,
                error: error as { readonly [x: string]: unknown },
                latencyMs,
                status: 'error'
              }
              interactions.set(interactionId, updated)
              
              // Broadcast live event
              Effect.runFork(broadcastEvent({
                type: 'request_error',
                entry: updated
              }))
            }
            return interactions
          }))

          // Log to console
          yield* _(Effect.log(
            `❌ LLM Error [${interactionId}] (${latencyMs}ms)\n` +
            `   Error: ${error._tag} - ${('message' in error) ? error.message as string : 'Unknown error'}`
          ))
        }),

      logStreamChunk: (interactionId: string, chunk: string) =>
        Effect.gen(function* (_) {
          const interactions = yield* _(Ref.get(interactionsRef))
          const entry = interactions.get(interactionId)
          
          if (entry) {
            // Broadcast stream chunk
            yield* _(broadcastEvent({
              type: 'stream_chunk',
              entry,
              streamChunk: chunk
            }))

            // Log chunk (abbreviated)
            yield* _(Effect.log(
              `🔄 Stream Chunk [${interactionId}]: ${chunk.substring(0, 50)}${chunk.length > 50 ? '...' : ''}`
            ))
          }
        }),

      getLiveFeed: () =>
        Stream.async<LiveInteractionEvent, never, never>((emit) => {
          const subscriber = {
            emit: (event: LiveInteractionEvent) => emit.single(event),
            fail: (_error: any) => {}, // No-op since we use never error type
            end: () => emit.end()
          }

          // Add subscriber
          Effect.runSync(
            Ref.update(subscribersRef, subs => {
              subs.add(subscriber)
              return subs
            })
          )

          // Return cleanup function
          return Effect.sync(() => {
            Effect.runSync(
              Ref.update(subscribersRef, subs => {
                subs.delete(subscriber)
                return subs
              })
            )
          })
        }),

      getRecentInteractions: (limit = 50, model?: ModelType) =>
        Effect.gen(function* (_) {
          const interactions = yield* _(Ref.get(interactionsRef))
          
          let entries = Array.from(interactions.values())
          
          if (model) {
            entries = entries.filter(entry => entry.model === model)
          }
          
          return entries
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit)
        }),

      getInteractionById: (id: string) =>
        Effect.gen(function* (_) {
          const interactions = yield* _(Ref.get(interactionsRef))
          return interactions.get(id) || null
        }),

      getModelComparison: (taskType?: string, timeWindowMs = 24 * 60 * 60 * 1000) =>
        Effect.gen(function* (_) {
          const interactions = yield* _(Ref.get(interactionsRef))
          const cutoff = Date.now() - timeWindowMs
          
          let entries = Array.from(interactions.values())
            .filter(entry => entry.timestamp > cutoff)
          
          if (taskType) {
            entries = entries.filter(entry => entry.request.taskType === taskType)
          }
          
          // Group by model
          const byModel = new Map<ModelType, InteractionLogEntry[]>()
          entries.forEach(entry => {
            const model = entry.model as ModelType
            if (!byModel.has(model)) {
              byModel.set(model, [])
            }
            byModel.get(model)!.push(entry)
          })
          
          // Calculate stats for each model
          return Array.from(byModel.entries()).map(([model, interactions]) => {
            const successful = interactions.filter(i => i.status === 'success')
            const avgLatency = successful.length > 0 
              ? successful.reduce((sum, i) => sum + (i.latencyMs || 0), 0) / successful.length 
              : 0
            const successRate = interactions.length > 0 
              ? successful.length / interactions.length 
              : 0
            const avgCost = successful.length > 0 
              ? successful.reduce((sum, i) => sum + (i.response?.usage.cost || 0), 0) / successful.length 
              : 0
            
            return {
              model,
              interactions,
              avgLatency: Math.round(avgLatency),
              successRate: Math.round(successRate * 100) / 100,
              avgCost: Math.round(avgCost * 10000) / 10000
            }
          }).sort((a, b) => b.interactions.length - a.interactions.length)
        }),

      clearLogs: () =>
        Effect.gen(function* (_) {
          yield* _(Ref.set(interactionsRef, new Map()))
          yield* _(Effect.log('🧹 Cleared all interaction logs'))
        })
    }
  })

/**
 * Interaction Logger Layer
 */
export const InteractionLoggerLayer = Layer.effect(
  InteractionLoggerService,
  makeInteractionLogger()
)

/**
 * Type guard for LLM Error objects
 */
function isLLMError(error: unknown): error is LLMError {
  return (
    error !== null &&
    typeof error === 'object' &&
    '_tag' in error &&
    typeof error._tag === 'string'
  )
}

/**
 * Extract error message from LLMError union type
 */
function getLLMErrorMessage(error: LLMError): string {
  switch (error._tag) {
    case 'ModelUnavailable':
    case 'AuthenticationFailed':
    case 'NetworkError':
      return error.message
    case 'InvalidRequest':
    case 'ConfigurationError':
    case 'AllModelsUnavailable':
      return error.message
    case 'RateLimitExceeded':
      return `Rate limit exceeded, retry after ${error.retryAfter}s`
    case 'TimeoutError':
      return `Request timeout after ${error.timeoutMs}ms`
    case 'ContextTooLarge':
      return `Context too large: ${error.tokenCount} tokens (max: ${error.maxTokens})`
    default:
      return 'Unknown error'
  }
}

/**
 * Console Helper for Pretty-Printing Interactions
 */
export const formatInteractionForConsole = (entry: InteractionLogEntry): string => {
  const status = entry.status === 'success' ? '✅' : 
                entry.status === 'error' ? '❌' : '⏳'
  
  const timestamp = new Date(entry.timestamp).toLocaleTimeString()
  
  let output = `${status} [${entry.id}] ${entry.model.toUpperCase()} @ ${timestamp}\n`
  output += `   Task: ${entry.request.taskType}\n`
  output += `   Prompt: "${entry.request.prompt.substring(0, 150)}${entry.request.prompt.length > 150 ? '...' : ''}"\n`
  
  if (entry.response) {
    output += `   Response: "${entry.response.content.substring(0, 150)}${entry.response.content.length > 150 ? '...' : ''}"\n`
    output += `   Usage: ${entry.response.usage.totalTokens} tokens ($${entry.response.usage.cost?.toFixed(4) || '0.0000'})\n`
  }
  
  if (entry.error) {
    if (isLLMError(entry.error)) {
      output += `   Error: ${entry.error._tag} - ${getLLMErrorMessage(entry.error)}\n`
    } else {
      output += `   Error: ${String(entry.error)}\n`
    }
  }
  
  if (entry.latencyMs) {
    output += `   Latency: ${entry.latencyMs}ms\n`
  }
  
  if (entry.debugInfo) {
    output += `   Debug: ${entry.debugInfo.routingReason}, cache=${entry.debugInfo.cacheHit}, retries=${entry.debugInfo.retryCount}\n`
  }
  
  return output
}