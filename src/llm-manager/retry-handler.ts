/**
 * Retry Handler for LLM API Requests
 *
 * Implements exponential backoff with jitter for handling 429 rate limit errors.
 * Respects retry-after headers including long delays (> 60 seconds) that Portkey cannot handle.
 */

import { Effect, Duration, Data } from 'effect'
import type { ClientRetryConfig } from './config-loader.js'

/**
 * Parse retry-after header value
 * Supports both seconds (e.g., "196") and HTTP date formats
 */
export const parseRetryAfter = (header: string | null): number | null => {
  if (!header) return null

  // Check if it's a number (seconds)
  const seconds = parseInt(header, 10)
  if (!isNaN(seconds)) {
    return seconds * 1000 // Convert to milliseconds
  }

  // Check if it's an HTTP date
  const date = new Date(header)
  if (!isNaN(date.getTime())) {
    const delayMs = Math.max(0, date.getTime() - Date.now())
    return delayMs
  }

  return null
}

/**
 * Calculate exponential backoff delay with jitter
 */
export const calculateBackoff = (attempt: number, config: ClientRetryConfig): number => {
  // Calculate base exponential delay
  const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1)

  // Add jitter to prevent thundering herd
  const jitter = exponentialDelay * config.jitterFactor * Math.random()
  const delayWithJitter = exponentialDelay + jitter

  // Cap at maximum delay
  return Math.min(delayWithJitter, config.maxDelayMs)
}

/**
 * Retryable error using proper Effect-TS patterns
 */
export class RetryableError extends Data.TaggedError('RetryableError')<{
  status?: number
  retryAfter?: number | null
  message: string
  attempt?: number
}> {}

/**
 * Effect-based retry with exponential backoff
 * Specifically handles 429 rate limit errors with retry-after headers
 */
export const retryWithBackoff = <R, E, A>(
  effect: Effect.Effect<A, E, R>,
  config: ClientRetryConfig,
  logRetries: boolean = true
): Effect.Effect<A, E | RetryableError, R> =>
  Effect.gen(function* () {
    let lastError: E | undefined
    let totalDelay = 0

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      // Try the effect
      const result = yield* Effect.either(effect)

      if (result._tag === 'Right') {
        // Success! Log if we had retries
        if (attempt > 1 && logRetries) {
          console.log(
            `[Retry] Request succeeded after ${attempt - 1} retries (total delay: ${totalDelay}ms)`
          )
        }
        return result.right
      }

      // Failed - check if we should retry
      lastError = result.left

      // Only retry on 429 status codes
      const hasStatus429 =
        lastError &&
        typeof lastError === 'object' &&
        'status' in lastError &&
        typeof (lastError as { status?: unknown }).status === 'number' &&
        (lastError as { status: number }).status === 429
      if (!hasStatus429 || attempt === config.maxAttempts) {
        if (logRetries && hasStatus429 && attempt === config.maxAttempts) {
          console.log(
            `[Retry] Max attempts (${config.maxAttempts}) reached. Failing with 429 error.`
          )
        }
        // Return the original error if it's not retryable
        return yield* Effect.fail(lastError)
      }

      // Calculate delay based on strategy
      let delayMs: number
      const strategy = config.strategy || 'prefer-retry-after'
      const exponentialDelay = calculateBackoff(attempt, config)
      const retryAfterDelay =
        lastError &&
        typeof lastError === 'object' &&
        'retryAfter' in lastError &&
        typeof (lastError as { retryAfter?: unknown }).retryAfter === 'number' &&
        (lastError as { retryAfter: number }).retryAfter !== null &&
        (lastError as { retryAfter: number }).retryAfter !== undefined
          ? (lastError as { retryAfter: number }).retryAfter
          : null

      if (strategy === 'exponential-backoff') {
        // Always use exponential backoff, ignore retry-after
        delayMs = exponentialDelay
        if (logRetries) {
          console.log(
            `[Retry] Attempt ${attempt}/${config.maxAttempts} failed with 429. Using exponential backoff: ${delayMs}ms`
          )
          if (retryAfterDelay !== null) {
            console.log(
              `[Retry] Note: Ignoring retry-after header (${retryAfterDelay}ms) due to exponential-backoff strategy`
            )
          }
        }
      } else if (strategy === 'adaptive' && retryAfterDelay !== null) {
        // Use the shorter of retry-after or exponential backoff
        delayMs = Math.min(retryAfterDelay, exponentialDelay)
        if (logRetries) {
          const source = delayMs === retryAfterDelay ? 'retry-after' : 'exponential backoff'
          console.log(
            `[Retry] Attempt ${attempt}/${config.maxAttempts} failed with 429. Using ${source}: ${delayMs}ms`
          )
          console.log(
            `[Retry] Adaptive strategy chose shorter delay (retry-after: ${retryAfterDelay}ms, exponential: ${exponentialDelay}ms)`
          )
        }
      } else if (retryAfterDelay !== null) {
        // Default: prefer-retry-after - Use retry-after if present
        delayMs = retryAfterDelay
        if (logRetries) {
          console.log(
            `[Retry] Attempt ${attempt}/${config.maxAttempts} failed with 429. Using retry-after: ${delayMs}ms`
          )
        }
      } else {
        // Fallback to exponential backoff when no retry-after header
        delayMs = exponentialDelay
        if (logRetries) {
          console.log(
            `[Retry] Attempt ${attempt}/${config.maxAttempts} failed with 429. Using exponential backoff: ${delayMs}ms (no retry-after header)`
          )
        }
      }

      // Always cap at maximum delay
      if (delayMs > config.maxDelayMs) {
        if (logRetries) {
          console.log(
            `[Retry] Note: Delay (${delayMs}ms) exceeds max delay (${config.maxDelayMs}ms), capping at max`
          )
        }
        delayMs = config.maxDelayMs
      }

      totalDelay += delayMs

      // Wait before retrying
      yield* Effect.sleep(Duration.millis(delayMs))
    }

    // Should never reach here due to loop logic, but TypeScript needs it
    // If we somehow reach here, lastError should be defined from the loop
    if (lastError) {
      return yield* Effect.fail(lastError)
    }
    // Ultimate fallback - create a generic error
    return yield* Effect.fail(
      new RetryableError({
        message: 'Unexpected retry failure - no error recorded'
      })
    )
  })

/**
 * Create a retry policy for use with Effect.retry
 * Alternative approach using Effect's built-in retry mechanism
 */
export const createRetryPolicy = (config: ClientRetryConfig) => {
  return {
    times: config.maxAttempts,
    // Note: This is a simplified version - full schedule implementation would be more complex
    while: (error: RetryableError) => error.status === 429
  }
}
