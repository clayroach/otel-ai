/**
 * UI Generator Service Interface
 * Clean Effect-TS service contract with proper dependency declarations
 */

import { Context, Effect } from 'effect'
import type { QueryGenerationAPIRequest, QueryGenerationAPIResponse } from './api-client.js'
import type { UIGeneratorError } from './errors.js'

/**
 * UI Generator Service Interface
 *
 * Provides query generation and validation capabilities for building
 * dynamic UI components based on OpenTelemetry trace data.
 */
export interface UIGeneratorService {
  /**
   * Generate a single ClickHouse query from a critical path specification
   */
  readonly generateQuery: (
    request: QueryGenerationAPIRequest
  ) => Effect.Effect<QueryGenerationAPIResponse, UIGeneratorError, never>

  /**
   * Generate multiple queries for different analysis patterns
   */
  readonly generateMultipleQueries: (
    request: QueryGenerationAPIRequest & { patterns?: string[] }
  ) => Effect.Effect<QueryGenerationAPIResponse[], UIGeneratorError, never>

  /**
   * Validate a SQL query for safety and correctness
   */
  readonly validateQuery: (sql: string) => Effect.Effect<ValidationResult, UIGeneratorError, never>
}

/**
 * Query validation result
 */
export interface ValidationResult {
  readonly valid: boolean
  readonly errors: string[]
  readonly warnings?: string[]
}

/**
 * Context Tag for UI Generator Service
 */
export class UIGeneratorServiceTag extends Context.Tag('UIGeneratorService')<
  UIGeneratorServiceTag,
  UIGeneratorService
>() {}
