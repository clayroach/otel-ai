/**
 * Effect-native HTTP client wrapper
 * 
 * Provides a pure Effect interface for HTTP operations, wrapping fetch at the boundary.
 * Following ADR-007 principles - converts Promises once at the boundary.
 */

import { Effect, Layer, Context, Duration, Schedule, pipe } from 'effect'
import { NetworkError, ParseError } from './effect-interop.js'

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface HttpRequest {
  readonly url: string
  readonly method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  readonly headers?: Record<string, string>
  readonly body?: unknown
  readonly timeout?: Duration.Duration
  readonly retries?: number
}

export interface HttpResponse<T = unknown> {
  readonly status: number
  readonly statusText: string
  readonly headers: Headers
  readonly data: T
}

export interface EffectHttpClient {
  readonly request: <T = unknown>(
    request: HttpRequest
  ) => Effect.Effect<HttpResponse<T>, NetworkError | ParseError>
  
  readonly get: <T = unknown>(
    url: string,
    options?: Omit<HttpRequest, 'url' | 'method'>
  ) => Effect.Effect<T, NetworkError | ParseError>
  
  readonly post: <T = unknown>(
    url: string,
    body?: unknown,
    options?: Omit<HttpRequest, 'url' | 'method' | 'body'>
  ) => Effect.Effect<T, NetworkError | ParseError>
  
  readonly put: <T = unknown>(
    url: string,
    body?: unknown,
    options?: Omit<HttpRequest, 'url' | 'method' | 'body'>
  ) => Effect.Effect<T, NetworkError | ParseError>
  
  readonly delete: <T = unknown>(
    url: string,
    options?: Omit<HttpRequest, 'url' | 'method'>
  ) => Effect.Effect<T, NetworkError | ParseError>
  
  readonly stream: (
    url: string,
    options?: Omit<HttpRequest, 'url'>
  ) => Effect.Effect<ReadableStream<Uint8Array>, NetworkError>
}

export class EffectHttpClientTag extends Context.Tag('EffectHttpClient')<
  EffectHttpClientTag,
  EffectHttpClient
>() {}

// ============================================================================
// Implementation
// ============================================================================

class EffectHttpClientImpl implements EffectHttpClient {
  constructor(
    private readonly baseUrl?: string,
    private readonly defaultHeaders?: Record<string, string>,
    private readonly defaultTimeout?: Duration.Duration
  ) {}

  request<T = unknown>(
    request: HttpRequest
  ): Effect.Effect<HttpResponse<T>, NetworkError | ParseError> {
    const self = this
    return Effect.gen(function* (_) {
      const url = self.baseUrl ? `${self.baseUrl}${request.url}` : request.url
      const headers = {
        ...self.defaultHeaders,
        ...request.headers
      }
      
      // Prepare fetch options
      const fetchOptions: RequestInit = {
        method: request.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      }

      // Add body if present
      if (request.body !== undefined) {
        fetchOptions.body = typeof request.body === 'string' 
          ? request.body 
          : JSON.stringify(request.body)
      }

      // Create abort controller for timeout
      const controller = new AbortController()
      fetchOptions.signal = controller.signal

      // Execute fetch with timeout
      const timeout = request.timeout || self.defaultTimeout || Duration.seconds(30)
      
      const responseEffect = Effect.gen(function* () {
        try {
          const response = yield* _(
            Effect.promise(() => fetch(url, fetchOptions))
          )

          if (!response.ok) {
            return yield* _(Effect.fail(
              new NetworkError({
                message: `HTTP ${response.status}: ${response.statusText}`,
                statusCode: response.status
              })
            ))
          }

          // Parse response based on content type
          const contentType = response.headers.get('content-type') || ''
          let data: T
          
          if (contentType.includes('application/json')) {
            try {
              data = yield* _(Effect.promise(() => response.json() as Promise<T>))
            } catch (error) {
              return yield* _(Effect.fail(
                new ParseError({
                  message: `Failed to parse JSON response`,
                  cause: error
                })
              ))
            }
          } else if (contentType.includes('text/')) {
            data = (yield* _(Effect.promise(() => response.text()))) as T
          } else {
            data = (yield* _(Effect.promise(() => response.blob()))) as T
          }

          return {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            data
          }
        } catch (error) {
          if (error instanceof NetworkError || error instanceof ParseError) {
            return yield* _(Effect.fail(error))
          }
          return yield* _(Effect.fail(
            new NetworkError({
              message: `Request to ${url} failed`,
              cause: error
            })
          ))
        }
      })

      // Apply timeout
      const withTimeout = pipe(
        responseEffect,
        Effect.timeout(timeout),
        Effect.catchTag('TimeoutException' as any, () =>
          Effect.fail(new NetworkError({
            message: `Request to ${url} timed out after ${Duration.toMillis(timeout)}ms`
          }))
        )
      )

      // Apply retries if specified
      if (request.retries && request.retries > 0) {
        return yield* _(
          withTimeout.pipe(
            Effect.retry(
              Schedule.exponential(Duration.seconds(1)).pipe(
                Schedule.compose(Schedule.recurs(request.retries))
              )
            )
          )
        )
      }

      return yield* _(withTimeout)
    })
  }

  get<T = unknown>(
    url: string,
    options?: Omit<HttpRequest, 'url' | 'method'>
  ): Effect.Effect<T, NetworkError | ParseError> {
    return this.request<T>({ ...options, url, method: 'GET' }).pipe(
      Effect.map(response => response.data)
    )
  }

  post<T = unknown>(
    url: string,
    body?: unknown,
    options?: Omit<HttpRequest, 'url' | 'method' | 'body'>
  ): Effect.Effect<T, NetworkError | ParseError> {
    return this.request<T>({ ...options, url, method: 'POST', body }).pipe(
      Effect.map(response => response.data)
    )
  }

  put<T = unknown>(
    url: string,
    body?: unknown,
    options?: Omit<HttpRequest, 'url' | 'method' | 'body'>
  ): Effect.Effect<T, NetworkError | ParseError> {
    return this.request<T>({ ...options, url, method: 'PUT', body }).pipe(
      Effect.map(response => response.data)
    )
  }

  delete<T = unknown>(
    url: string,
    options?: Omit<HttpRequest, 'url' | 'method'>
  ): Effect.Effect<T, NetworkError | ParseError> {
    return this.request<T>({ ...options, url, method: 'DELETE' }).pipe(
      Effect.map(response => response.data)
    )
  }

  stream(
    url: string,
    options?: Omit<HttpRequest, 'url'>
  ): Effect.Effect<ReadableStream<Uint8Array>, NetworkError> {
    const self = this
    return Effect.gen(function* (_) {
      const fullUrl = self.baseUrl ? `${self.baseUrl}${url}` : url
      
      try {
        const response = yield* _(
          Effect.promise(() => fetch(fullUrl, {
            method: options?.method || 'GET',
            headers: {
              ...self.defaultHeaders,
              ...options?.headers
            },
            body: options?.body ? JSON.stringify(options.body) : null
          }))
        )

        if (!response.ok) {
          return yield* _(Effect.fail(
            new NetworkError({
              message: `Stream request failed: HTTP ${response.status}`,
              statusCode: response.status
            })
          ))
        }

        if (!response.body) {
          return yield* _(Effect.fail(
            new NetworkError({
              message: `Response has no body to stream`
            })
          ))
        }

        return response.body
      } catch (error) {
        return yield* _(Effect.fail(
          new NetworkError({
            message: `Stream request to ${fullUrl} failed`,
            cause: error
          })
        ))
      }
    })
  }
}

// ============================================================================
// Layer Construction
// ============================================================================

export interface HttpClientConfig {
  readonly baseUrl?: string
  readonly headers?: Record<string, string>
  readonly timeout?: Duration.Duration
}

export const makeEffectHttpClientLayer = (
  config?: HttpClientConfig
): Layer.Layer<EffectHttpClientTag, never, never> =>
  Layer.succeed(
    EffectHttpClientTag,
    new EffectHttpClientImpl(
      config?.baseUrl,
      config?.headers,
      config?.timeout
    )
  )

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create an Effect-native HTTP client
 */
export const createEffectHttpClient = (
  config?: HttpClientConfig
): EffectHttpClient =>
  new EffectHttpClientImpl(
    config?.baseUrl,
    config?.headers,
    config?.timeout
  )

/**
 * Make a simple GET request
 */
export const httpGet = <T = unknown>(
  url: string,
  options?: HttpClientConfig
): Effect.Effect<T, NetworkError | ParseError> => {
  const client = createEffectHttpClient(options)
  return client.get<T>(url)
}

/**
 * Make a simple POST request
 */
export const httpPost = <T = unknown>(
  url: string,
  body?: unknown,
  options?: HttpClientConfig
): Effect.Effect<T, NetworkError | ParseError> => {
  const client = createEffectHttpClient(options)
  return client.post<T>(url, body)
}