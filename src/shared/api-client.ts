/**
 * Production-Ready API Client with Effect-TS Error Channels
 *
 * This client provides type-safe, effectful service-to-service communication
 * with proper error handling and schema validation.
 */

import { Effect, Layer, Context } from 'effect'
import { Schema } from '@effect/schema'
import { fetchEffect, parseJsonResponse } from './effect-interop.js'

// Error types for API operations - using simple tagged union pattern
export type APIClientError =
  | {
      readonly _tag: 'APIError'
      readonly status: number
      readonly message: string
      readonly details?: unknown
    }
  | { readonly _tag: 'NetworkError'; readonly message: string; readonly cause?: unknown }
  | {
      readonly _tag: 'ValidationError'
      readonly message: string
      readonly errors: readonly string[]
    }

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

// Implementation using centralized Effect patterns
export const APIClientLive: APIClient = {
  get: <A>(url: string, schema: Schema.Schema<A>): Effect.Effect<A, APIClientError, never> =>
    Effect.gen(function* (_) {
      // Fetch with proper error handling
      const response = yield* _(
        fetchEffect(url).pipe(
          Effect.mapError(
            (error): APIClientError => ({
              _tag: 'NetworkError',
              message: error.message,
              cause: error.cause
            })
          )
        )
      )

      // Check response status
      if (!response.ok) {
        return yield* _(
          Effect.fail<APIClientError>({
            _tag: 'APIError',
            status: response.status,
            message: `HTTP ${response.status}: ${response.statusText}`,
            details: { url }
          })
        )
      }

      // Parse JSON response
      const json = yield* _(
        parseJsonResponse<unknown>(response).pipe(
          Effect.mapError(
            (error): APIClientError => ({
              _tag: 'NetworkError',
              message: `Failed to parse response: ${error.message}`,
              cause: error.cause
            })
          )
        )
      )

      // Validate with schema
      const validated = yield* _(
        Schema.decodeUnknown(schema)(json).pipe(
          Effect.mapError(
            (error): APIClientError => ({
              _tag: 'ValidationError',
              message: 'Response validation failed',
              errors: [error.message]
            })
          )
        )
      )

      return validated
    }),

  post: <A, B>(
    url: string,
    data: B,
    responseSchema: Schema.Schema<A>
  ): Effect.Effect<A, APIClientError, never> =>
    Effect.gen(function* (_) {
      // Fetch with proper error handling
      const response = yield* _(
        fetchEffect(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        }).pipe(
          Effect.mapError(
            (error): APIClientError => ({
              _tag: 'NetworkError',
              message: error.message,
              cause: error.cause
            })
          )
        )
      )

      // Check response status
      if (!response.ok) {
        return yield* _(
          Effect.fail<APIClientError>({
            _tag: 'APIError',
            status: response.status,
            message: `HTTP ${response.status}: ${response.statusText}`,
            details: { url, data }
          })
        )
      }

      // Parse JSON response
      const json = yield* _(
        parseJsonResponse<unknown>(response).pipe(
          Effect.mapError(
            (error): APIClientError => ({
              _tag: 'NetworkError',
              message: `Failed to parse response: ${error.message}`,
              cause: error.cause
            })
          )
        )
      )

      // Validate with schema
      const validated = yield* _(
        Schema.decodeUnknown(responseSchema)(json).pipe(
          Effect.mapError(
            (error): APIClientError => ({
              _tag: 'ValidationError',
              message: 'Response validation failed',
              errors: [error.message]
            })
          )
        )
      )

      return validated
    })
}

// Context tag for dependency injection using proper Effect-TS patterns
export class APIClientService extends Context.Tag('APIClientService')<
  APIClientService,
  APIClient
>() {}

export const APIClientLayer = Layer.succeed(APIClientService, APIClientLive)
