/**
 * Conversation Storage Service Implementation
 * 
 * Simple in-memory storage for conversation contexts.
 */

import { Effect, Layer } from 'effect'
import { ConversationContext } from './types.js'
import { ConversationStorageService } from './services.js'

/**
 * In-Memory Conversation Storage Implementation
 */
export const makeConversationStorageService = () =>
  Effect.gen(function* (_) {
    const conversations = new Map<string, ConversationContext>()

    return {
      save: (context: ConversationContext) =>
        Effect.gen(function* (_) {
          conversations.set(context.id, context)
        }),

      load: (conversationId: string) =>
        Effect.gen(function* (_) {
          const context = conversations.get(conversationId)
          if (!context) {
            return yield* _(Effect.fail({
              _tag: 'ConfigurationError' as const,
              message: `Conversation ${conversationId} not found`
            }))
          }
          return context
        }),

      delete: (conversationId: string) =>
        Effect.gen(function* (_) {
          conversations.delete(conversationId)
        }),

      list: (limit?: number) =>
        Effect.gen(function* (_) {
          const contexts = Array.from(conversations.values())
          return limit ? contexts.slice(0, limit) : contexts
        })
    }
  })

/**
 * Conversation Storage Layer
 */
export const ConversationStorageLayer = Layer.effect(
  ConversationStorageService,
  makeConversationStorageService()
)