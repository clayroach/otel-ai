/**
 * Annotations package exports
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
  AnnotationServiceLive
} from './annotation-service.js'

export {
  type AntiContaminationServiceImpl,
  AntiContaminationService,
  AntiContaminationServiceLive
} from './anti-contamination-service.js'

// Export Annotations Router
export type { AnnotationsRouter } from './router.js'
export { AnnotationsRouterTag, AnnotationsRouterLive } from './router.js'

// Export Diagnostics Session Manager
export {
  type DiagnosticsSession,
  type SessionPhase,
  type SessionConfig,
  type DiagnosticsSessionManagerImpl,
  DiagnosticsSessionError,
  DiagnosticsSessionManager,
  DiagnosticsSessionManagerLive,
  DiagnosticsSessionManagerMock
} from './diagnostics-session.js'

// Re-export Effect dependencies for convenience
export { Effect, Layer, Context } from 'effect'
