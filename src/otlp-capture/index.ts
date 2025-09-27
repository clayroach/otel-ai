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
  type TrainingSessionConfig,
  type TrainingDataset,
  type PhaseInfo,
  type PhaseLabels,
  type Phase,
  CaptureSessionMetadataSchema,
  CaptureConfigSchema,
  ReplayConfigSchema,
  CapturedDataReferenceSchema,
  ReplayStatusSchema,
  TrainingSessionConfigSchema,
  TrainingDatasetSchema,
  PhaseInfoSchema,
  PhaseLabelsSchema
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

export {
  type TrainingDataReader,
  TrainingDataReaderTag,
  TrainingDataReaderLive
} from './training-data-reader.js'

// Re-export Effect dependencies for convenience
export { Effect, Layer, Context } from 'effect'
