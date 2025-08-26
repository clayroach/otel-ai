/**
 * Production-Ready API Client with Effect-TS Error Channels
 * 
 * This client provides type-safe, effectful service-to-service communication
 * with proper error handling and schema validation.
 */

import { Effect, Layer, Context } from 'effect'
import { Schema } from '@effect/schema'

// Error types for API operations - using simple tagged union pattern
export type APIClientError =
  | { readonly _tag: 'APIError'; readonly status: number; readonly message: string; readonly details?: unknown }
  | { readonly _tag: 'NetworkError'; readonly message: string; readonly cause?: unknown }
  | { readonly _tag: 'ValidationError'; readonly message: string; readonly errors: readonly string[] }

// Base API client interface
export interface APIClient {
  readonly get: <A>(
    url: string,
    schema: Schema.Schema<A>
  ) => Effect.Effect<A, APIClientError, never>
  
  readonly post: <A, B>(
    url: string, 
    data: B,
    responseSchema: Schema.Schema<A>
  ) => Effect.Effect<A, APIClientError, never>
}

// Implementation using Effect.tryPromise pattern from working files
export const APIClientLive: APIClient = {
  get: <A>(url: string, schema: Schema.Schema<A>): Effect.Effect<A, APIClientError, never> => {
    return Effect.tryPromise({
      try: async () => {
        const response = await fetch(url)
        
        if (!response.ok) {
          throw {
            _tag: 'APIError' as const,
            status: response.status,
            message: `HTTP ${response.status}: ${response.statusText}`,
            details: { url }
          }
        }
        
        const json = await response.json()
        
        // Validate with schema
        const result = Schema.decodeUnknownEither(schema)(json)
        if (result._tag === 'Left') {
          throw {
            _tag: 'ValidationError' as const,
            message: 'Response validation failed',
            errors: [result.left.message]
          }
        }
        
        return result.right
      },
      catch: (error): APIClientError => {
        if (error && typeof error === 'object' && '_tag' in error) {
          return error as APIClientError // Return our typed errors
        }
        return {
          _tag: 'NetworkError',
          message: `Network request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          cause: error
        }
      }
    })
  },

  post: <A, B>(url: string, data: B, responseSchema: Schema.Schema<A>): Effect.Effect<A, APIClientError, never> => {
    return Effect.tryPromise({
      try: async () => {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        })
        
        if (!response.ok) {
          throw {
            _tag: 'APIError' as const,
            status: response.status,
            message: `HTTP ${response.status}: ${response.statusText}`,
            details: { url, data }
          }
        }
        
        const json = await response.json()
        
        // Validate with schema
        const result = Schema.decodeUnknownEither(responseSchema)(json)
        if (result._tag === 'Left') {
          throw {
            _tag: 'ValidationError' as const,
            message: 'Response validation failed',
            errors: [result.left.message]
          }
        }
        
        return result.right
      },
      catch: (error): APIClientError => {
        if (error && typeof error === 'object' && '_tag' in error) {
          return error as APIClientError // Return our typed errors
        }
        return {
          _tag: 'NetworkError',
          message: `Network request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          cause: error
        }
      }
    })
  }
}

// Context tag for dependency injection using proper Effect-TS patterns
export class APIClientService extends Context.Tag('APIClientService')<
  APIClientService,
  APIClient
>() {}

export const APIClientLayer = Layer.succeed(
  APIClientService,
  APIClientLive
)

