/**
 * Storage-specific error types using Effect-TS tagged union pattern
 */

import { Schema } from '@effect/schema'
import { Data } from 'effect'

// Base storage error schema
export const StorageErrorSchema = Schema.Union(
  Schema.Struct({
    _tag: Schema.Literal('ConnectionError'),
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown)
  }),
  Schema.Struct({
    _tag: Schema.Literal('ValidationError'),
    message: Schema.String,
    errors: Schema.Array(Schema.String)
  }),
  Schema.Struct({
    _tag: Schema.Literal('QueryError'),
    message: Schema.String,
    query: Schema.String,
    cause: Schema.optional(Schema.Unknown)
  }),
  Schema.Struct({
    _tag: Schema.Literal('RetentionError'),
    message: Schema.String,
    policy: Schema.String
  }),
  Schema.Struct({
    _tag: Schema.Literal('ConfigurationError'),
    message: Schema.String,
    field: Schema.String
  }),
  Schema.Struct({
    _tag: Schema.Literal('StorageFullError'),
    message: Schema.String,
    availableSpace: Schema.Number,
    requiredSpace: Schema.Number
  }),
  Schema.Struct({
    _tag: Schema.Literal('TimeoutError'),
    message: Schema.String,
    timeoutMs: Schema.Number
  })
)

export type StorageError = Schema.Schema.Type<typeof StorageErrorSchema>

// Error constructors using Effect Data for better error handling
export const StorageErrorConstructors = {
  ConnectionError: (message: string, cause?: unknown) =>
    Data.tagged<StorageError>('ConnectionError')({ message, cause }),

  ValidationError: (message: string, errors: string[]) =>
    Data.tagged<StorageError>('ValidationError')({ message, errors }),

  QueryError: (message: string, query: string, cause?: unknown) =>
    Data.tagged<StorageError>('QueryError')({ message, query, cause }),

  RetentionError: (message: string, policy: string) =>
    Data.tagged<StorageError>('RetentionError')({ message, policy }),

  ConfigurationError: (message: string, field: string) =>
    Data.tagged<StorageError>('ConfigurationError')({ message, field }),

  StorageFullError: (message: string, availableSpace: number, requiredSpace: number) =>
    Data.tagged<StorageError>('StorageFullError')({ message, availableSpace, requiredSpace }),

  TimeoutError: (message: string, timeoutMs: number) =>
    Data.tagged<StorageError>('TimeoutError')({ message, timeoutMs })
}

// Error matchers for pattern matching
export const matchStorageError = <A>(
  error: StorageError,
  cases: {
    ConnectionError: (error: Extract<StorageError, { _tag: 'ConnectionError' }>) => A
    ValidationError: (error: Extract<StorageError, { _tag: 'ValidationError' }>) => A
    QueryError: (error: Extract<StorageError, { _tag: 'QueryError' }>) => A
    RetentionError: (error: Extract<StorageError, { _tag: 'RetentionError' }>) => A
    ConfigurationError: (error: Extract<StorageError, { _tag: 'ConfigurationError' }>) => A
    StorageFullError: (error: Extract<StorageError, { _tag: 'StorageFullError' }>) => A
    TimeoutError: (error: Extract<StorageError, { _tag: 'TimeoutError' }>) => A
  }
): A => {
  switch (error._tag) {
    case 'ConnectionError':
      return cases.ConnectionError(error)
    case 'ValidationError':
      return cases.ValidationError(error)
    case 'QueryError':
      return cases.QueryError(error)
    case 'RetentionError':
      return cases.RetentionError(error)
    case 'ConfigurationError':
      return cases.ConfigurationError(error)
    case 'StorageFullError':
      return cases.StorageFullError(error)
    case 'TimeoutError':
      return cases.TimeoutError(error)
  }
}

