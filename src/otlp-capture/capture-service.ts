/**
 * OTLP Capture Service - Captures raw OTLP data to MinIO/S3 storage
 */

import { Effect, Context, Layer, Ref } from 'effect'
import { Schema } from '@effect/schema'
import * as zlib from 'node:zlib'
import { S3StorageTag } from '../storage/index.js'
import { CaptureError, CaptureErrorConstructors } from './errors.js'
import {
  type CaptureConfig,
  type CaptureSessionMetadata,
  CaptureSessionMetadataSchema,
  type CapturedDataReference
} from './schemas.js'

// Effect wrapper for gzip compression
const gzipEffect = (data: Uint8Array): Effect.Effect<Buffer, Error> =>
  Effect.async<Buffer, Error>((resume) => {
    zlib.gzip(data, (error, result) => {
      if (error) {
        resume(Effect.fail(error))
      } else {
        resume(Effect.succeed(result))
      }
    })
  })

// Service interface
export interface OtlpCaptureService {
  readonly startCapture: (
    config: CaptureConfig
  ) => Effect.Effect<CaptureSessionMetadata, CaptureError>
  readonly stopCapture: (sessionId: string) => Effect.Effect<CaptureSessionMetadata, CaptureError>
  readonly captureOTLPData: (
    sessionId: string,
    data: Uint8Array,
    signalType: 'traces' | 'metrics' | 'logs'
  ) => Effect.Effect<CapturedDataReference, CaptureError>
  readonly getCaptureStatus: (
    sessionId: string
  ) => Effect.Effect<CaptureSessionMetadata, CaptureError>
  readonly listCaptureSessions: () => Effect.Effect<
    ReadonlyArray<CaptureSessionMetadata>,
    CaptureError
  >
}

// Context tag for dependency injection
export class OtlpCaptureServiceTag extends Context.Tag('OtlpCaptureService')<
  OtlpCaptureServiceTag,
  OtlpCaptureService
>() {}

// Implementation
export const OtlpCaptureServiceLive = Layer.effect(
  OtlpCaptureServiceTag,
  Effect.gen(function* () {
    // Dependencies
    const s3Storage = yield* S3StorageTag

    // In-memory session storage (could be moved to database)
    const activeSessions = yield* Ref.make<Map<string, CaptureSessionMetadata>>(new Map())

    const startCapture = (
      config: CaptureConfig
    ): Effect.Effect<CaptureSessionMetadata, CaptureError> =>
      Effect.gen(function* () {
        const sessions = yield* Ref.get(activeSessions)

        // Check if session already exists
        if (sessions.has(config.sessionId)) {
          return yield* Effect.fail(CaptureErrorConstructors.SessionAlreadyActive(config.sessionId))
        }

        // Create session metadata
        const metadata: CaptureSessionMetadata = {
          sessionId: config.sessionId,
          diagnosticSessionId: config.diagnosticSessionId,
          startTime: new Date(),
          status: 'active',
          enabledFlags: config.enabledFlags,
          capturedTraces: 0,
          capturedMetrics: 0,
          capturedLogs: 0,
          totalSizeBytes: 0,
          s3Prefix: `sessions/${config.sessionId}`,
          createdBy: 'system:otlp-capture',
          description: config.description
        }

        // Store metadata in S3
        const metadataKey = `${metadata.s3Prefix}/metadata.json`
        const metadataJson = JSON.stringify(metadata, null, 2)

        yield* s3Storage
          .storeRawData(new TextEncoder().encode(metadataJson), metadataKey)
          .pipe(
            Effect.mapError((error) =>
              CaptureErrorConstructors.StorageFailure(
                'Failed to store session metadata',
                config.sessionId,
                error
              )
            )
          )

        // Add to active sessions
        yield* Ref.update(activeSessions, (map) => {
          const newMap = new Map(map)
          newMap.set(config.sessionId, metadata)
          return newMap
        })

        return metadata
      })

    const stopCapture = (sessionId: string): Effect.Effect<CaptureSessionMetadata, CaptureError> =>
      Effect.gen(function* () {
        const sessions = yield* Ref.get(activeSessions)
        let metadata = sessions.get(sessionId)

        // If not in memory, try to load from S3
        if (!metadata) {
          const metadataKey = `sessions/${sessionId}/metadata.json`

          const metadataBytes = yield* s3Storage
            .retrieveRawData(metadataKey)
            .pipe(Effect.mapError(() => CaptureErrorConstructors.SessionNotFound(sessionId)))

          const metadataJson = new TextDecoder().decode(metadataBytes)
          metadata = JSON.parse(metadataJson) as CaptureSessionMetadata

          // Only allow stopping if session is still active
          if (metadata.status !== 'active') {
            return yield* Effect.fail(
              CaptureErrorConstructors.SessionAlreadyActive(
                `Session ${sessionId} is already ${metadata.status}`
              )
            )
          }
        }

        // Update metadata
        const updatedMetadata: CaptureSessionMetadata = {
          ...metadata,
          endTime: new Date(),
          status: 'completed'
        }

        // Update metadata in S3
        const metadataKey = `${metadata.s3Prefix}/metadata.json`
        const metadataJson = JSON.stringify(updatedMetadata, null, 2)

        yield* s3Storage
          .storeRawData(new TextEncoder().encode(metadataJson), metadataKey)
          .pipe(
            Effect.mapError((error) =>
              CaptureErrorConstructors.StorageFailure(
                'Failed to update session metadata',
                sessionId,
                error
              )
            )
          )

        // Remove from active sessions
        yield* Ref.update(activeSessions, (map) => {
          const newMap = new Map(map)
          newMap.delete(sessionId)
          return newMap
        })

        return updatedMetadata
      })

    const captureOTLPData = (
      sessionId: string,
      data: Uint8Array,
      signalType: 'traces' | 'metrics' | 'logs'
    ): Effect.Effect<CapturedDataReference, CaptureError> =>
      Effect.gen(function* () {
        const sessions = yield* Ref.get(activeSessions)
        const metadata = sessions.get(sessionId)

        if (!metadata || metadata.status !== 'active') {
          return yield* Effect.fail(CaptureErrorConstructors.SessionNotFound(sessionId))
        }

        // Compress data
        const compressedData = yield* gzipEffect(data).pipe(
          Effect.mapError((error) =>
            CaptureErrorConstructors.CompressionFailure(
              `Failed to compress ${signalType} data`,
              error
            )
          )
        )

        // Create storage key with timestamp and directory structure
        const now = new Date()
        const year = now.getUTCFullYear()
        const month = String(now.getUTCMonth() + 1).padStart(2, '0')
        const day = String(now.getUTCDate()).padStart(2, '0')
        const hour = String(now.getUTCHours()).padStart(2, '0')
        const timestamp = now.getTime()
        const uuid = crypto.randomUUID()

        const storageKey = `${metadata.s3Prefix}/raw/${year}-${month}-${day}/${hour}/${signalType}-${timestamp}-${uuid}.otlp.gz`

        // Store in S3
        yield* s3Storage
          .storeRawData(Buffer.from(compressedData), storageKey)
          .pipe(
            Effect.mapError((error) =>
              CaptureErrorConstructors.StorageFailure(
                `Failed to store ${signalType} data`,
                sessionId,
                error
              )
            )
          )

        // Create reference
        const reference: CapturedDataReference = {
          key: storageKey,
          signalType,
          timestamp: now,
          sizeBytes: compressedData.length,
          recordCount: 1, // TODO: Parse actual record count from OTLP data
          compressed: true
        }

        // Update session metadata counters
        yield* Ref.update(activeSessions, (map) => {
          const newMap = new Map(map)
          const currentMetadata = newMap.get(sessionId)
          if (currentMetadata) {
            const updated = { ...currentMetadata }
            if (signalType === 'traces') updated.capturedTraces++
            else if (signalType === 'metrics') updated.capturedMetrics++
            else if (signalType === 'logs') updated.capturedLogs++
            updated.totalSizeBytes += compressedData.length
            newMap.set(sessionId, updated)
          }
          return newMap
        })

        return reference
      })

    const getCaptureStatus = (
      sessionId: string
    ): Effect.Effect<CaptureSessionMetadata, CaptureError> =>
      Effect.gen(function* () {
        const sessions = yield* Ref.get(activeSessions)
        const metadata = sessions.get(sessionId)

        if (!metadata) {
          // Try to load from S3 if not in memory
          const metadataKey = `sessions/${sessionId}/metadata.json`

          const metadataBytes = yield* s3Storage
            .retrieveRawData(metadataKey)
            .pipe(Effect.mapError(() => CaptureErrorConstructors.SessionNotFound(sessionId)))

          const metadataJson = new TextDecoder().decode(metadataBytes)
          const loadedMetadata = yield* Schema.decodeUnknown(CaptureSessionMetadataSchema)(
            JSON.parse(metadataJson)
          ).pipe(
            Effect.mapError(() =>
              CaptureErrorConstructors.StorageFailure('Failed to parse session metadata', sessionId)
            )
          )

          return loadedMetadata
        }

        return metadata
      })

    const listCaptureSessions = (): Effect.Effect<
      ReadonlyArray<CaptureSessionMetadata>,
      CaptureError
    > =>
      Effect.gen(function* () {
        // List all session metadata files
        const keys = yield* s3Storage
          .listObjects('sessions/')
          .pipe(
            Effect.mapError((error) =>
              CaptureErrorConstructors.StorageFailure(
                'Failed to list capture sessions',
                undefined,
                error
              )
            )
          )

        // Filter for metadata.json files
        const metadataKeys = keys.filter((key) => key.endsWith('/metadata.json'))

        // Load all metadata files
        const sessions = yield* Effect.forEach(
          metadataKeys,
          (key) =>
            Effect.gen(function* () {
              const dataBytes = yield* s3Storage.retrieveRawData(key).pipe(
                Effect.catchAll(() => Effect.succeed(null)) // Ignore failed reads
              )

              if (!dataBytes) return null

              const dataJson = new TextDecoder().decode(dataBytes)
              return yield* Schema.decodeUnknown(CaptureSessionMetadataSchema)(
                JSON.parse(dataJson)
              ).pipe(Effect.catchAll(() => Effect.succeed(null)))
            }),
          { concurrency: 10 }
        )

        return sessions.filter((s): s is CaptureSessionMetadata => s !== null)
      })

    return OtlpCaptureServiceTag.of({
      startCapture,
      stopCapture,
      captureOTLPData,
      getCaptureStatus,
      listCaptureSessions
    })
  })
)
