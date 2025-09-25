/**
 * Diagnostics UI package exports
 * Universal annotation system for OpenTelemetry signals
 */

// Export schemas and types
export {
  type Annotation,
  type AnnotationFilter,
  type AnnotationType,
  type SignalType,
  type TimeRange,
  type ValidationResult,
  AnnotationSchema,
  AnnotationFilterSchema,
  AnnotationTypeSchema,
  SignalTypeSchema,
  TimeRangeSchema,
  ValidationResultSchema
} from './annotation.schema.js'

// Export error types
export { AnnotationError, ValidationError, ContaminationError } from './errors.js'

// Export service interfaces and implementations
export {
  type AnnotationServiceImpl,
  AnnotationService,
  AnnotationServiceLive,
  ClickhouseClient
} from './annotation-service.js'

export {
  type AntiContaminationServiceImpl,
  AntiContaminationService,
  AntiContaminationServiceLive
} from './anti-contamination-service.js'

// Re-export Effect dependencies for convenience
export { Effect, Layer, Context } from 'effect'
