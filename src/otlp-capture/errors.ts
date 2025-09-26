/**
 * Error types for OTLP capture and replay operations
 */

import { Data } from 'effect'

export class CaptureError extends Data.TaggedError('CaptureError')<{
  readonly reason:
    | 'SessionNotFound'
    | 'SessionAlreadyActive'
    | 'StorageFailure'
    | 'CompressionFailure'
  readonly message: string
  readonly sessionId?: string
  readonly cause?: unknown
}> {}

export class ReplayError extends Data.TaggedError('ReplayError')<{
  readonly reason: 'SessionNotFound' | 'DataCorrupted' | 'DecompressionFailure' | 'IngestionFailure'
  readonly message: string
  readonly sessionId: string
  readonly cause?: unknown
}> {}

export const CaptureErrorConstructors = {
  SessionNotFound: (sessionId: string) =>
    new CaptureError({
      reason: 'SessionNotFound',
      message: `Capture session not found: ${sessionId}`,
      sessionId
    }),

  SessionAlreadyActive: (sessionId: string) =>
    new CaptureError({
      reason: 'SessionAlreadyActive',
      message: `Capture session already active: ${sessionId}`,
      sessionId
    }),

  StorageFailure: (message: string, sessionId?: string, cause?: unknown) =>
    new CaptureError({
      reason: 'StorageFailure',
      message: `Storage operation failed: ${message}`,
      ...(sessionId !== undefined && { sessionId }),
      ...(cause !== undefined && { cause })
    }),

  CompressionFailure: (message: string, cause?: unknown) =>
    new CaptureError({
      reason: 'CompressionFailure',
      message: `Compression failed: ${message}`,
      cause
    })
}

export const ReplayErrorConstructors = {
  SessionNotFound: (sessionId: string) =>
    new ReplayError({
      reason: 'SessionNotFound',
      message: `Replay session not found: ${sessionId}`,
      sessionId
    }),

  DataCorrupted: (sessionId: string, message: string) =>
    new ReplayError({
      reason: 'DataCorrupted',
      message: `Data corrupted for session ${sessionId}: ${message}`,
      sessionId
    }),

  DecompressionFailure: (sessionId: string, cause?: unknown) =>
    new ReplayError({
      reason: 'DecompressionFailure',
      message: `Failed to decompress data for session ${sessionId}`,
      sessionId,
      cause
    }),

  IngestionFailure: (sessionId: string, message: string, cause?: unknown) =>
    new ReplayError({
      reason: 'IngestionFailure',
      message: `Failed to ingest replayed data for session ${sessionId}: ${message}`,
      sessionId,
      cause
    })
}
