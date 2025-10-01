/**
 * HTTP Client for OTLP Replay - Sends replayed OTLP data to target endpoints
 */

import { Effect, Context, Layer } from 'effect'
import { ReplayError, ReplayErrorConstructors } from '../otlp-capture/errors.js'

// Service interface
export interface OtlpHttpReplayClient {
  readonly sendTraces: (endpoint: string, data: unknown) => Effect.Effect<void, ReplayError, never>
  readonly sendMetrics: (endpoint: string, data: unknown) => Effect.Effect<void, ReplayError, never>
  readonly sendLogs: (endpoint: string, data: unknown) => Effect.Effect<void, ReplayError, never>
  readonly send: (
    endpoint: string,
    data: unknown,
    signalType: 'traces' | 'metrics' | 'logs'
  ) => Effect.Effect<void, ReplayError, never>
}

// Context tag for dependency injection
export class OtlpHttpReplayClientTag extends Context.Tag('OtlpHttpReplayClient')<
  OtlpHttpReplayClientTag,
  OtlpHttpReplayClient
>() {}

// Helper to determine the correct OTLP path for each signal type
const getOtlpPath = (signalType: 'traces' | 'metrics' | 'logs'): string => {
  switch (signalType) {
    case 'traces':
      return '/v1/traces'
    case 'metrics':
      return '/v1/metrics'
    case 'logs':
      return '/v1/logs'
  }
}

// Service implementation using native fetch
export const OtlpHttpReplayClientLive = Layer.succeed(
  OtlpHttpReplayClientTag,
  OtlpHttpReplayClientTag.of({
    send: (endpoint: string, data: unknown, signalType: 'traces' | 'metrics' | 'logs') =>
      Effect.tryPromise({
        try: async () => {
          // Build the full URL
          const baseUrl = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint
          const path = getOtlpPath(signalType)
          const url = baseUrl.includes('/v1/')
            ? endpoint // Already has signal path
            : `${baseUrl}${path}` // Add signal path

          // Send request using native fetch with timeout
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

          try {
            const response = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Replay-Session': 'true', // Mark as replay for potential filtering
                Accept: 'application/json'
              },
              body: JSON.stringify(data),
              signal: controller.signal
            })

            clearTimeout(timeoutId)

            // Check response status
            if (!response.ok) {
              const errorText = await response.text().catch(() => 'Unable to read error response')
              throw new Error(`HTTP ${response.status}: ${errorText}`)
            }

            return undefined // void
          } catch (error) {
            clearTimeout(timeoutId)
            if ((error as Error).name === 'AbortError') {
              throw new Error(`Request timeout after 10 seconds to ${url}`)
            }
            throw error
          }
        },
        catch: (error) =>
          ReplayErrorConstructors.IngestionFailure(
            'replay-http-client',
            `Failed to send ${signalType}`,
            error
          )
      }),

    sendTraces: (endpoint: string, data: unknown) =>
      Effect.tryPromise({
        try: async () => {
          const url = endpoint.includes('/v1/') ? endpoint : `${endpoint}/v1/traces`
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Replay-Session': 'true' },
            body: JSON.stringify(data)
          })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return undefined
        },
        catch: (error) =>
          ReplayErrorConstructors.IngestionFailure(
            'replay-http-client',
            'Failed to send traces',
            error
          )
      }),

    sendMetrics: (endpoint: string, data: unknown) =>
      Effect.tryPromise({
        try: async () => {
          const url = endpoint.includes('/v1/') ? endpoint : `${endpoint}/v1/metrics`
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Replay-Session': 'true' },
            body: JSON.stringify(data)
          })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return undefined
        },
        catch: (error) =>
          ReplayErrorConstructors.IngestionFailure(
            'replay-http-client',
            'Failed to send metrics',
            error
          )
      }),

    sendLogs: (endpoint: string, data: unknown) =>
      Effect.tryPromise({
        try: async () => {
          const url = endpoint.includes('/v1/') ? endpoint : `${endpoint}/v1/logs`
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Replay-Session': 'true' },
            body: JSON.stringify(data)
          })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return undefined
        },
        catch: (error) =>
          ReplayErrorConstructors.IngestionFailure(
            'replay-http-client',
            'Failed to send logs',
            error
          )
      })
  })
)
