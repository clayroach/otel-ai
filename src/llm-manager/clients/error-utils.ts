/**
 * Error handling utilities for LLM clients
 */

import { Effect } from 'effect'
import type { LLMError } from '../types.js'

/**
 * Ensures an error is converted to LLMError type
 */
export const ensureLLMError = (error: unknown, model: string): LLMError => {
  if (error && typeof error === 'object' && '_tag' in error) {
    // Already an LLMError
    return error as LLMError
  }

  if (error instanceof Error) {
    return {
      _tag: 'NetworkError',
      model,
      message: error.message
    }
  }

  if (typeof error === 'string') {
    return {
      _tag: 'NetworkError',
      model,
      message: error
    }
  }

  return {
    _tag: 'NetworkError',
    model,
    message: 'Unknown error occurred'
  }
}

/**
 * Wraps an Effect to ensure it always returns LLMError
 */
export const withLLMError = <A, R>(
  effect: Effect.Effect<A, unknown, R>,
  model: string
): Effect.Effect<A, LLMError, R> =>
  effect.pipe(Effect.mapError((error) => ensureLLMError(error, model)))
