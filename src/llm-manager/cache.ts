/**
 * Cache Service Implementation
 *
 * Simple in-memory cache for LLM responses with TTL support.
 */

import { Effect, Layer } from 'effect'
import { LLMResponse } from './types.js'
import { CacheService } from './services.js'

interface CacheEntry {
  value: LLMResponse
  timestamp: number
  ttl: number
}

/**
 * In-Memory Cache Implementation
 */
export const makeCacheService = () =>
  Effect.succeed((() => {
    const cache = new Map<string, CacheEntry>()

    return {
      get: (key: string) =>
        Effect.sync(() => {
          const entry = cache.get(key)

          if (!entry) {
            return undefined
          }

          // Check if entry has expired
          const now = Date.now()
          if (now > entry.timestamp + entry.ttl * 1000) {
            cache.delete(key)
            return undefined
          }

          return entry.value
        }),

      set: (key: string, value: LLMResponse, ttlSeconds: number) =>
        Effect.sync(() => {
          cache.set(key, {
            value,
            timestamp: Date.now(),
            ttl: ttlSeconds
          })
        }),

      invalidate: (key: string) =>
        Effect.sync(() => {
          cache.delete(key)
        }),

      clear: () =>
        Effect.sync(() => {
          cache.clear()
        }),

      size: () => Effect.succeed(cache.size)
    }
  })())

/**
 * Cache Service Layer
 */
export const CacheLayer = Layer.effect(CacheService, makeCacheService())
