/**
 * UI Generator Error Types
 * Tagged error definitions for discriminated error handling
 */

import { Schema } from '@effect/schema'

/**
 * Invalid request error - malformed or missing required fields
 */
export class InvalidRequestError extends Schema.TaggedError<InvalidRequestError>()(
  'InvalidRequestError',
  {
    message: Schema.String,
    validation: Schema.Array(Schema.String),
    field: Schema.optional(Schema.String)
  }
) {}

/**
 * Query generation error - LLM or generation process failure
 */
export class QueryGenerationError extends Schema.TaggedError<QueryGenerationError>()(
  'QueryGenerationError',
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
    model: Schema.optional(Schema.String),
    retryable: Schema.optional(Schema.Boolean)
  }
) {}

/**
 * Query validation error - SQL safety or correctness issues
 */
export class ValidationError extends Schema.TaggedError<ValidationError>()('ValidationError', {
  message: Schema.String,
  errors: Schema.Array(Schema.String),
  sql: Schema.optional(Schema.String)
}) {}

/**
 * Service dependency error - missing or unavailable dependencies
 */
export class ServiceDependencyError extends Schema.TaggedError<ServiceDependencyError>()(
  'ServiceDependencyError',
  {
    message: Schema.String,
    service: Schema.String,
    operation: Schema.optional(Schema.String)
  }
) {}

/**
 * Model unavailable error - requested LLM model not available
 */
export class ModelUnavailableError extends Schema.TaggedError<ModelUnavailableError>()(
  'ModelUnavailableError',
  {
    message: Schema.String,
    model: Schema.String,
    provider: Schema.optional(Schema.String)
  }
) {}

/**
 * Union of all UI Generator error types
 */
export type UIGeneratorError =
  | InvalidRequestError
  | QueryGenerationError
  | ValidationError
  | ServiceDependencyError
  | ModelUnavailableError

/**
 * Helper functions for creating common errors
 */
export const UIGeneratorErrors = {
  invalidRequest: (message: string, validation: string[], field?: string) =>
    new InvalidRequestError({ message, validation, field }),

  queryGeneration: (message: string, cause?: unknown, model?: string, retryable?: boolean) =>
    new QueryGenerationError({ message, cause, model, retryable }),

  validation: (message: string, errors: string[], sql?: string) =>
    new ValidationError({ message, errors, sql }),

  serviceDependency: (message: string, service: string, operation?: string) =>
    new ServiceDependencyError({ message, service, operation }),

  modelUnavailable: (message: string, model: string, provider?: string) =>
    new ModelUnavailableError({ message, model, provider })
} as const
