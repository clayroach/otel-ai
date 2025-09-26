/**
 * Type definitions for OTLP capture and replay
 */

import { Schema } from '@effect/schema'

// Capture session metadata
export const CaptureSessionMetadataSchema = Schema.Struct({
  sessionId: Schema.String,
  diagnosticSessionId: Schema.optional(Schema.String),
  startTime: Schema.Date,
  endTime: Schema.optional(Schema.Date),
  status: Schema.Literal('active', 'completed', 'failed'),
  enabledFlags: Schema.Array(Schema.String),
  capturedTraces: Schema.Number,
  capturedMetrics: Schema.Number,
  capturedLogs: Schema.Number,
  totalSizeBytes: Schema.Number,
  s3Prefix: Schema.String,
  createdBy: Schema.String,
  description: Schema.optional(Schema.String)
})

export type CaptureSessionMetadata = Schema.Schema.Type<typeof CaptureSessionMetadataSchema>

// Capture configuration
export const CaptureConfigSchema = Schema.Struct({
  sessionId: Schema.String,
  diagnosticSessionId: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  enabledFlags: Schema.Array(Schema.String),
  captureTraces: Schema.Boolean,
  captureMetrics: Schema.Boolean,
  captureLogs: Schema.Boolean,
  compressionEnabled: Schema.Boolean,
  maxSizeMB: Schema.optional(Schema.Number),
  maxDurationMinutes: Schema.optional(Schema.Number)
})

export type CaptureConfig = Schema.Schema.Type<typeof CaptureConfigSchema>

// Replay configuration
export const ReplayConfigSchema = Schema.Struct({
  sessionId: Schema.String,
  targetEndpoint: Schema.optional(Schema.String), // Default to current collector
  timestampAdjustment: Schema.Literal('none', 'relative', 'current'),
  speedMultiplier: Schema.optional(Schema.Number), // 1.0 = realtime, 2.0 = 2x speed
  filterServices: Schema.optional(Schema.Array(Schema.String)),
  replayTraces: Schema.Boolean,
  replayMetrics: Schema.Boolean,
  replayLogs: Schema.Boolean
})

export type ReplayConfig = Schema.Schema.Type<typeof ReplayConfigSchema>

// Captured data reference
export const CapturedDataReferenceSchema = Schema.Struct({
  key: Schema.String,
  signalType: Schema.Literal('traces', 'metrics', 'logs'),
  timestamp: Schema.Date,
  sizeBytes: Schema.Number,
  recordCount: Schema.Number,
  compressed: Schema.Boolean
})

export type CapturedDataReference = Schema.Schema.Type<typeof CapturedDataReferenceSchema>

// Replay status
export const ReplayStatusSchema = Schema.Struct({
  sessionId: Schema.String,
  status: Schema.Literal('pending', 'running', 'completed', 'failed'),
  startedAt: Schema.optional(Schema.Date),
  completedAt: Schema.optional(Schema.Date),
  totalRecords: Schema.Number,
  processedRecords: Schema.Number,
  failedRecords: Schema.Number,
  currentFile: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String)
})

export type ReplayStatus = Schema.Schema.Type<typeof ReplayStatusSchema>
