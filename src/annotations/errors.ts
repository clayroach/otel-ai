/**
 * Error types for the annotation system
 */

import { Data } from 'effect'

// Annotation operation errors
export class AnnotationError extends Data.TaggedError('AnnotationError')<{
  readonly reason: 'StorageFailure' | 'InvalidAnnotation' | 'NotFound' | 'DuplicateAnnotation'
  readonly message: string
  readonly retryable: boolean
}> {}

// Validation errors
export class ValidationError extends Data.TaggedError('ValidationError')<{
  readonly field: string
  readonly message: string
  readonly value?: unknown
}> {}

// Anti-contamination errors
export class ContaminationError extends Data.TaggedError('ContaminationError')<{
  readonly detectedPrefixes: readonly string[]
  readonly affectedRecords: number
  readonly environment: 'production' | 'test' | 'development'
}> {}
