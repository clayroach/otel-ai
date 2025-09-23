/**
 * Retry Strategy Test
 *
 * Tests different retry strategies: prefer-retry-after, exponential-backoff, and adaptive
 */

import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import { retryWithBackoff, parseRetryAfter, calculateBackoff, RetryableError } from '../../retry-handler.js'
import type { ClientRetryConfig } from '../../config-loader.js'

describe('Retry Strategy Tests', () => {
  describe('parseRetryAfter', () => {
    it('should parse numeric seconds', () => {
      expect(parseRetryAfter('60')).toBe(60000) // 60 seconds = 60000ms
      expect(parseRetryAfter('196')).toBe(196000) // 196 seconds = 196000ms
      expect(parseRetryAfter('0')).toBe(0)
    })

    it('should parse HTTP date formats', () => {
      const futureDate = new Date(Date.now() + 30000) // 30 seconds from now
      const dateString = futureDate.toUTCString()
      const result = parseRetryAfter(dateString)
      // Should be approximately 30000ms (allow some variance for execution time)
      expect(result).toBeGreaterThan(29000)
      expect(result).toBeLessThan(31000)
    })

    it('should return null for invalid values', () => {
      expect(parseRetryAfter(null)).toBe(null)
      expect(parseRetryAfter('')).toBe(null)
      expect(parseRetryAfter('invalid')).toBe(null)
      expect(parseRetryAfter('abc123')).toBe(null)
    })
  })

  describe('calculateBackoff', () => {
    const config: ClientRetryConfig = {
      enabled: true,
      maxAttempts: 5,
      maxDelayMs: 60000,
      initialDelayMs: 1000,
      backoffMultiplier: 2,
      jitterFactor: 0.1
    }

    it('should calculate exponential backoff', () => {
      // Without jitter, delays would be: 1000, 2000, 4000, 8000, 16000
      const delay1 = calculateBackoff(1, { ...config, jitterFactor: 0 })
      const delay2 = calculateBackoff(2, { ...config, jitterFactor: 0 })
      const delay3 = calculateBackoff(3, { ...config, jitterFactor: 0 })

      expect(delay1).toBe(1000)
      expect(delay2).toBe(2000)
      expect(delay3).toBe(4000)
    })

    it('should add jitter', () => {
      // With jitter, delays should vary
      const delays = Array.from({ length: 10 }, () => calculateBackoff(2, config))
      const uniqueDelays = new Set(delays)

      // Should have different values due to jitter
      expect(uniqueDelays.size).toBeGreaterThan(1)

      // All should be within expected range (2000 ± 10%)
      delays.forEach(delay => {
        expect(delay).toBeGreaterThanOrEqual(2000)
        expect(delay).toBeLessThanOrEqual(2200)
      })
    })

    it('should cap at maxDelayMs', () => {
      const config: ClientRetryConfig = {
        enabled: true,
        maxAttempts: 10,
        maxDelayMs: 5000,
        initialDelayMs: 1000,
        backoffMultiplier: 2,
        jitterFactor: 0
      }

      // Attempt 10 would be 512000ms without cap
      const delay = calculateBackoff(10, config)
      expect(delay).toBe(5000)
    })
  })

  describe('retryWithBackoff strategies', () => {
    const makeFailingEffect = (failures: number, retryAfter?: number) => {
      let attempts = 0
      return Effect.gen(function* () {
        attempts++
        if (attempts <= failures) {
          const error = new RetryableError({
            status: 429,
            retryAfter: retryAfter ?? null,
            message: 'Rate limit exceeded'
          })
          return yield* Effect.fail(error)
        }
        return { success: true, attempts }
      })
    }

    describe('prefer-retry-after strategy (default)', () => {
      it('should use retry-after header when present', async () => {
        const config: ClientRetryConfig = {
          enabled: true,
          maxAttempts: 3,
          maxDelayMs: 60000,
          initialDelayMs: 1000,
          backoffMultiplier: 2,
          jitterFactor: 0,
          strategy: 'prefer-retry-after'
        }

        const startTime = Date.now()
        const effect = makeFailingEffect(1, 2000) // Fail once with 2-second retry-after
        const result = await Effect.runPromise(
          retryWithBackoff(effect, config, false)
        )
        const duration = Date.now() - startTime

        expect(result).toEqual({ success: true, attempts: 2 })
        // Should wait ~2000ms (retry-after value)
        expect(duration).toBeGreaterThan(1900)
        expect(duration).toBeLessThan(2500)
      })

      it('should fallback to exponential when no retry-after', async () => {
        const config: ClientRetryConfig = {
          enabled: true,
          maxAttempts: 3,
          maxDelayMs: 60000,
          initialDelayMs: 500,
          backoffMultiplier: 2,
          jitterFactor: 0,
          strategy: 'prefer-retry-after'
        }

        const startTime = Date.now()
        const effect = makeFailingEffect(1) // No retry-after header
        const result = await Effect.runPromise(
          retryWithBackoff(effect, config, false)
        )
        const duration = Date.now() - startTime

        expect(result).toEqual({ success: true, attempts: 2 })
        // Should wait ~500ms (initial delay)
        expect(duration).toBeGreaterThan(400)
        expect(duration).toBeLessThan(700)
      })
    })

    describe('exponential-backoff strategy', () => {
      it('should ignore retry-after header', async () => {
        const config: ClientRetryConfig = {
          enabled: true,
          maxAttempts: 3,
          maxDelayMs: 60000,
          initialDelayMs: 500,
          backoffMultiplier: 2,
          jitterFactor: 0,
          strategy: 'exponential-backoff'
        }

        const startTime = Date.now()
        const effect = makeFailingEffect(1, 5000) // 5-second retry-after (should be ignored)
        const result = await Effect.runPromise(
          retryWithBackoff(effect, config, false)
        )
        const duration = Date.now() - startTime

        expect(result).toEqual({ success: true, attempts: 2 })
        // Should wait ~500ms (exponential backoff), NOT 5000ms
        expect(duration).toBeGreaterThan(400)
        expect(duration).toBeLessThan(700)
      })
    })

    describe('adaptive strategy', () => {
      it('should use shorter delay between retry-after and exponential', async () => {
        const config: ClientRetryConfig = {
          enabled: true,
          maxAttempts: 3,
          maxDelayMs: 60000,
          initialDelayMs: 1000,
          backoffMultiplier: 2,
          jitterFactor: 0,
          strategy: 'adaptive'
        }

        // Test 1: retry-after is shorter
        const startTime1 = Date.now()
        const effect1 = makeFailingEffect(1, 500) // 500ms retry-after < 1000ms exponential
        const result1 = await Effect.runPromise(
          retryWithBackoff(effect1, config, false)
        )
        const duration1 = Date.now() - startTime1

        expect(result1).toEqual({ success: true, attempts: 2 })
        // Should use 500ms (shorter)
        expect(duration1).toBeGreaterThan(400)
        expect(duration1).toBeLessThan(700)

        // Test 2: exponential is shorter
        const startTime2 = Date.now()
        const effect2 = makeFailingEffect(1, 2000) // 2000ms retry-after > 1000ms exponential
        const result2 = await Effect.runPromise(
          retryWithBackoff(effect2, config, false)
        )
        const duration2 = Date.now() - startTime2

        expect(result2).toEqual({ success: true, attempts: 2 })
        // Should use 1000ms (shorter)
        expect(duration2).toBeGreaterThan(900)
        expect(duration2).toBeLessThan(1200)
      })
    })

    describe('max delay enforcement', () => {
      it('should cap delays at maxDelayMs', async () => {
        const config: ClientRetryConfig = {
          enabled: true,
          maxAttempts: 3,
          maxDelayMs: 1000, // Low max delay
          initialDelayMs: 500,
          backoffMultiplier: 2,
          jitterFactor: 0,
          strategy: 'prefer-retry-after'
        }

        const startTime = Date.now()
        const effect = makeFailingEffect(1, 5000) // 5-second retry-after
        const result = await Effect.runPromise(
          retryWithBackoff(effect, config, false)
        )
        const duration = Date.now() - startTime

        expect(result).toEqual({ success: true, attempts: 2 })
        // Should wait ~1000ms (maxDelayMs), not 5000ms
        expect(duration).toBeGreaterThan(900)
        expect(duration).toBeLessThan(1200)
      })
    })

    describe('non-429 errors', () => {
      it('should not retry on non-429 errors', async () => {
        const config: ClientRetryConfig = {
          enabled: true,
          maxAttempts: 3,
          maxDelayMs: 60000,
          initialDelayMs: 1000,
          backoffMultiplier: 2,
          jitterFactor: 0
        }

        let attempts = 0
        const effect = Effect.gen(function* () {
          attempts++
          const error = new RetryableError({
            status: 500, // Not 429
            message: 'Internal server error'
          })
          return yield* Effect.fail(error)
        })

        try {
          await Effect.runPromise(retryWithBackoff(effect, config, false))
          expect.fail('Should have thrown error')
        } catch (error: unknown) {
          // The error is wrapped by Effect, check the actual error properties
          expect(error).toBeDefined()
          expect(attempts).toBe(1) // Should only try once - this is the key assertion
        }
      })
    })

    describe('max attempts enforcement', () => {
      it('should fail after max attempts', async () => {
        const config: ClientRetryConfig = {
          enabled: true,
          maxAttempts: 2,
          maxDelayMs: 60000,
          initialDelayMs: 100,
          backoffMultiplier: 2,
          jitterFactor: 0
        }

        let attempts = 0
        const effect = Effect.gen(function* () {
          attempts++
          const error = new RetryableError({
            status: 429,
            message: 'Rate limit exceeded'
          })
          return yield* Effect.fail(error)
        })

        try {
          await Effect.runPromise(retryWithBackoff(effect, config, false))
          expect.fail('Should have thrown error')
        } catch (error: unknown) {
          // The error is wrapped by Effect, check the actual error properties
          expect(error).toBeDefined()
          expect(attempts).toBe(2) // Should have tried maxAttempts times
        }
      })
    })
  })
})