/**
 * Effect-TS Interop Module
 * 
 * Central module for Effect-TS patterns and external API integrations.
 * Provides common error types, Effect aliases, and Promise->Effect wrappers.
 * 
 * Following ADR-007: Migration from Promises to Effect-TS
 */

import { Effect, Data, Layer, Context, Schedule, Duration } from "effect";

// ============================================================================
// Common Error Types for the Application
// ============================================================================

export class NetworkError extends Data.TaggedError("NetworkError")<{
  readonly message: string;
  readonly cause?: unknown;
  readonly statusCode?: number;
}> {}

export class ParseError extends Data.TaggedError("ParseError")<{
  readonly message: string;
  readonly input?: unknown;
  readonly cause?: unknown;
}> {}

export class DatabaseError extends Data.TaggedError("DatabaseError")<{
  readonly message: string;
  readonly operation?: string;
  readonly cause?: unknown;
}> {}

export class ConfigurationError extends Data.TaggedError("ConfigurationError")<{
  readonly message: string;
  readonly property?: string;
  readonly expected?: string;
}> {}

export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly message: string;
  readonly field?: string;
  readonly value?: unknown;
}> {}

export class FileSystemError extends Data.TaggedError("FileSystemError")<{
  readonly message: string;
  readonly path?: string;
  readonly cause?: unknown;
}> {}

// ============================================================================
// Effect Type Aliases for Consistency
// ============================================================================

/** Effect with no environment requirements */
export type SafeEffect<E, A> = Effect.Effect<A, E, never>;

/** Effect that can fail with any application error */
export type AppEffect<A> = Effect.Effect<A, NetworkError | ParseError | DatabaseError | ConfigurationError | ValidationError, never>;

/** Effect for database operations */
export type DatabaseEffect<A> = Effect.Effect<A, DatabaseError, never>;

/** Effect for network operations */
export type NetworkEffect<A> = Effect.Effect<A, NetworkError | ParseError, never>;

// ============================================================================
// Promise->Effect Wrapper Functions
// ============================================================================

/**
 * Wraps fetch API calls in Effect with proper error handling
 */
export const fetchEffect = (input: RequestInfo | URL, init?: RequestInit): NetworkEffect<Response> =>
  Effect.tryPromise({
    try: () => fetch(input, init),
    catch: (cause) => new NetworkError({ 
      message: `Failed to fetch ${String(input)}`, 
      cause 
    })
  });

/**
 * Fetches JSON with type safety
 */
export const fetchJsonEffect = <T>(input: RequestInfo | URL, init?: RequestInit): NetworkEffect<T> =>
  fetchEffect(input, init).pipe(
    Effect.flatMap(response => 
      Effect.tryPromise({
        try: () => response.json() as Promise<T>,
        catch: (cause) => new ParseError({ 
          message: `Failed to parse JSON response from ${String(input)}`, 
          cause 
        })
      })
    )
  );

/**
 * Generic Promise wrapper with custom error mapping
 */
export const promiseToEffect = <A, E>(
  promise: () => Promise<A>,
  mapError: (cause: unknown) => E
): Effect.Effect<A, E, never> =>
  Effect.tryPromise({
    try: promise,
    catch: mapError
  });

/**
 * Wraps Node.js callback-style functions
 */
export const callbackToEffect = <A, E>(
  fn: (callback: (error: unknown, result: A) => void) => void,
  mapError: (cause: unknown) => E
): Effect.Effect<A, E, never> =>
  Effect.async<A, E>((resume) => {
    fn((error, result) => {
      if (error) {
        resume(Effect.fail(mapError(error)));
      } else {
        resume(Effect.succeed(result));
      }
    });
  });

// ============================================================================
// Helper Utilities for Common Effect Patterns
// ============================================================================

/**
 * Retry an Effect with exponential backoff
 */
export const retryWithBackoff = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  maxRetries = 3,
  baseDelay = 1000
): Effect.Effect<A, E, R> =>
  effect.pipe(
    Effect.retry(
      Schedule.exponential(Duration.millis(baseDelay)).pipe(
        Schedule.compose(Schedule.recurs(maxRetries))
      )
    )
  );

/**
 * Add timeout to an Effect
 */
export const withTimeout = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  duration: number
): Effect.Effect<A, E | NetworkError, R> =>
  effect.pipe(
    Effect.timeout(Duration.millis(duration)),
    Effect.catchTag("TimeoutException", () =>
      Effect.fail(new NetworkError({ 
        message: `Operation timed out after ${duration}ms` 
      }))
    )
  );

/**
 * Log and re-throw an error for debugging
 */
export const tapError = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  message: string
): Effect.Effect<A, E, R> =>
  effect.pipe(
    Effect.tapError((error) => 
      Effect.log(`${message}: ${String(error)}`)
    )
  );

/**
 * Convert undefined to an Effect failure
 */
export const fromNullable = <A>(
  value: A | null | undefined,
  error: () => unknown
): Effect.Effect<A, unknown, never> =>
  value != null ? Effect.succeed(value) : Effect.fail(error());

// ============================================================================
// Service Context Types and Layers
// ============================================================================

/**
 * Logger service interface
 */
export interface LoggerService {
  readonly info: (message: string) => Effect.Effect<void>;
  readonly error: (message: string, error?: unknown) => Effect.Effect<void>;
  readonly debug: (message: string) => Effect.Effect<void>;
}

export const Logger = Context.GenericTag<LoggerService>("Logger");

/**
 * Console-based Logger implementation
 */
export const ConsoleLogger = Layer.succeed(Logger, {
  info: (message: string) => Effect.sync(() => console.log(`[INFO] ${message}`)),
  error: (message: string, error?: unknown) => 
    Effect.sync(() => console.error(`[ERROR] ${message}`, error ? String(error) : '')),
  debug: (message: string) => Effect.sync(() => console.log(`[DEBUG] ${message}`))
});

// ============================================================================
// Testing Utilities
// ============================================================================

/**
 * Create a test Layer that provides all common services
 */
export const TestLayer = Layer.mergeAll(
  ConsoleLogger
);

/**
 * Run an Effect for testing with proper error handling
 */
export const runTest = <A>(effect: Effect.Effect<A, never, never>): Promise<A> =>
  Effect.runPromise(effect);

/**
 * Run an Effect for testing with a test layer
 */
export const runTestWithLayer = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  layer: Layer.Layer<R, never, never>
): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.provide(layer)));