/**
 * OTLP Capture & Replay Package
 *
 * Captures raw OTLP data to MinIO/S3 storage during diagnostic sessions
 * and provides replay functionality with timestamp adjustment.
 */

// Export errors
export {
  CaptureError,
  ReplayError,
  CaptureErrorConstructors,
  ReplayErrorConstructors
} from './errors.js'

// Export schemas and types
export {
  type CaptureSessionMetadata,
  type CaptureConfig,
  type ReplayConfig,
  type CapturedDataReference,
  type ReplayStatus,
  CaptureSessionMetadataSchema,
  CaptureConfigSchema,
  ReplayConfigSchema,
  CapturedDataReferenceSchema,
  ReplayStatusSchema
} from './schemas.js'

// Export services
export {
  type OtlpCaptureService,
  OtlpCaptureServiceTag,
  OtlpCaptureServiceLive
} from './capture-service.js'

export {
  type OtlpReplayService,
  OtlpReplayServiceTag,
  OtlpReplayServiceLive
} from './replay-service.js'

export {
  type RetentionService,
  RetentionServiceTag,
  RetentionServiceLive,
  type RetentionPolicy,
  type CleanupResult,
  type StorageMetrics,
  RetentionPolicySchema,
  CleanupResultSchema,
  StorageMetricsSchema
} from './retention-service.js'

// Re-export Effect dependencies for convenience
export { Effect, Layer, Context } from 'effect'
