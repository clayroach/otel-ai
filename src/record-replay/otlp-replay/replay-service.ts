/**
 * OTLP Replay Service - Replays captured OTLP data with timestamp adjustments
 */

import { Effect, Context, Layer, Ref, Stream, Chunk } from 'effect'
import * as zlib from 'node:zlib'
import { S3StorageTag } from '../../storage/index.js'
import { ReplayError, ReplayErrorConstructors } from '../otlp-capture/errors.js'
import {
  type ReplayConfig,
  type ReplayStatus,
  type CaptureSessionMetadata,
  CaptureSessionMetadataSchema
} from '../otlp-capture/schemas.js'
import { Schema } from '@effect/schema'
import { OtlpHttpReplayClientTag } from './http-client.js'

// Effect wrapper for gunzip decompression
const gunzipEffect = (data: Uint8Array): Effect.Effect<Buffer, Error> =>
  Effect.async<Buffer, Error>((resume) => {
    zlib.gunzip(data, (error, result) => {
      if (error) {
        resume(Effect.fail(error))
      } else {
        resume(Effect.succeed(result))
      }
    })
  })

// Service interface
export interface OtlpReplayService {
  readonly startReplay: (config: ReplayConfig) => Effect.Effect<ReplayStatus, ReplayError>
  readonly getReplayStatus: (sessionId: string) => Effect.Effect<ReplayStatus, ReplayError>
  readonly listAvailableReplays: () => Effect.Effect<
    ReadonlyArray<CaptureSessionMetadata>,
    ReplayError
  >
  readonly replayDataStream: (
    sessionId: string,
    signalType: 'traces' | 'metrics' | 'logs'
  ) => Stream.Stream<Uint8Array, ReplayError>
}

// Context tag for dependency injection
export class OtlpReplayServiceTag extends Context.Tag('OtlpReplayService')<
  OtlpReplayServiceTag,
  OtlpReplayService
>() {}

// Helper to adjust timestamps in OTLP data
const adjustOtlpTimestamps = (
  data: unknown,
  adjustment: 'none' | 'relative' | 'current',
  baseTimeOffset?: bigint
): unknown => {
  if (adjustment === 'none') return data

  const now = BigInt(Date.now()) * BigInt(1_000_000) // Convert to nanoseconds
  const offset = adjustment === 'current' ? now : baseTimeOffset || BigInt(0)

  // Deep clone and adjust timestamps
  const adjusted = JSON.parse(JSON.stringify(data))

  // Adjust trace timestamps
  if (adjusted.resourceSpans) {
    for (const rs of adjusted.resourceSpans) {
      if (rs.scopeSpans) {
        for (const ss of rs.scopeSpans) {
          if (ss.spans) {
            for (const span of ss.spans) {
              if (span.startTimeUnixNano) {
                const originalStart = BigInt(span.startTimeUnixNano)
                const originalEnd = BigInt(span.endTimeUnixNano || span.startTimeUnixNano)
                const duration = originalEnd - originalStart

                if (adjustment === 'current') {
                  span.startTimeUnixNano = now.toString()
                  span.endTimeUnixNano = (now + duration).toString()
                } else if (adjustment === 'relative' && baseTimeOffset) {
                  span.startTimeUnixNano = (originalStart + offset).toString()
                  span.endTimeUnixNano = (originalEnd + offset).toString()
                }
              }

              // Adjust event timestamps
              if (span.events) {
                for (const event of span.events) {
                  if (event.timeUnixNano) {
                    if (adjustment === 'current') {
                      event.timeUnixNano = now.toString()
                    } else if (adjustment === 'relative' && baseTimeOffset) {
                      event.timeUnixNano = (BigInt(event.timeUnixNano) + offset).toString()
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return adjusted
}

// Implementation
export const OtlpReplayServiceLive = Layer.effect(
  OtlpReplayServiceTag,
  Effect.gen(function* () {
    // Dependencies
    const s3Storage = yield* S3StorageTag
    const httpClient = yield* OtlpHttpReplayClientTag

    // In-memory replay status storage
    const replayStatuses = yield* Ref.make<Map<string, ReplayStatus>>(new Map())

    const startReplay = (config: ReplayConfig): Effect.Effect<ReplayStatus, ReplayError> =>
      Effect.gen(function* () {
        // Load session metadata
        const metadataKey = `sessions/${config.sessionId}/metadata.json`

        const metadataBytes = yield* s3Storage
          .retrieveRawData(metadataKey)
          .pipe(Effect.mapError(() => ReplayErrorConstructors.SessionNotFound(config.sessionId)))

        const metadataJson = new TextDecoder().decode(metadataBytes)
        const metadata = yield* Schema.decodeUnknown(CaptureSessionMetadataSchema)(
          JSON.parse(metadataJson)
        ).pipe(
          Effect.mapError(() =>
            ReplayErrorConstructors.DataCorrupted(
              config.sessionId,
              'Failed to parse session metadata'
            )
          )
        )

        // Calculate total records to process
        let totalRecords = 0
        if (config.replayTraces) totalRecords += metadata.capturedTraces
        if (config.replayMetrics) totalRecords += metadata.capturedMetrics
        if (config.replayLogs) totalRecords += metadata.capturedLogs

        // Create replay status
        const status: ReplayStatus = {
          sessionId: config.sessionId,
          status: 'pending',
          startedAt: new Date(),
          totalRecords,
          processedRecords: 0,
          failedRecords: 0
        }

        // Store status
        yield* Ref.update(replayStatuses, (map) => {
          const newMap = new Map(map)
          newMap.set(config.sessionId, status)
          return newMap
        })

        // Start async replay process
        yield* Effect.fork(
          performReplay(config, metadata).pipe(
            Effect.catchAll((error) =>
              Ref.update(replayStatuses, (map) => {
                const newMap = new Map(map)
                const current = newMap.get(config.sessionId)
                if (current) {
                  newMap.set(config.sessionId, {
                    ...current,
                    status: 'failed',
                    completedAt: new Date(),
                    error: error.message
                  })
                }
                return newMap
              })
            )
          )
        )

        return status
      })

    const performReplay = (
      config: ReplayConfig,
      metadata: CaptureSessionMetadata
    ): Effect.Effect<void, ReplayError> =>
      Effect.gen(function* () {
        // Update status to running
        yield* Ref.update(replayStatuses, (map) => {
          const newMap = new Map(map)
          const current = newMap.get(config.sessionId)
          if (current) {
            newMap.set(config.sessionId, { ...current, status: 'running' })
          }
          return newMap
        })

        // List all captured files
        const prefix = `${metadata.s3Prefix}/raw/`
        const allKeys = yield* s3Storage
          .listObjects(prefix)
          .pipe(
            Effect.mapError((_error) => ReplayErrorConstructors.SessionNotFound(config.sessionId))
          )

        // Filter by signal types
        const filesToReplay = allKeys.filter((key) => {
          if (config.replayTraces && key.includes('/traces-')) return true
          if (config.replayMetrics && key.includes('/metrics-')) return true
          if (config.replayLogs && key.includes('/logs-')) return true
          return false
        })

        // Calculate time offset for relative timestamp adjustment
        const baseTimeOffset =
          config.timestampAdjustment === 'relative'
            ? BigInt(Date.now()) * BigInt(1_000_000) -
              BigInt(metadata.startTime.getTime()) * BigInt(1_000_000)
            : undefined

        // Process each file
        for (const key of filesToReplay) {
          yield* Ref.update(replayStatuses, (map) => {
            const newMap = new Map(map)
            const current = newMap.get(config.sessionId)
            if (current) {
              newMap.set(config.sessionId, { ...current, currentFile: key })
            }
            return newMap
          })

          // Retrieve and decompress data
          const compressedData = yield* s3Storage
            .retrieveRawData(key)
            .pipe(
              Effect.mapError((_error) =>
                ReplayErrorConstructors.DataCorrupted(
                  config.sessionId,
                  `Failed to retrieve file: ${key}`
                )
              )
            )

          const decompressedData = yield* gunzipEffect(compressedData).pipe(
            Effect.mapError((error) =>
              ReplayErrorConstructors.DecompressionFailure(config.sessionId, error)
            )
          )

          // Parse OTLP data (assuming JSON format for simplicity)
          let otlpData
          try {
            otlpData = JSON.parse(decompressedData.toString('utf8'))
          } catch {
            yield* Effect.fail(
              ReplayErrorConstructors.DataCorrupted(
                config.sessionId,
                `Failed to parse OTLP data from ${key}`
              )
            )
          }

          // Adjust timestamps
          const adjustedData = adjustOtlpTimestamps(
            otlpData,
            config.timestampAdjustment,
            baseTimeOffset
          )

          // Send to target endpoint using HTTP client
          const endpoint = config.targetEndpoint || 'http://localhost:4318'

          // Determine signal type from filename
          const signalType: 'traces' | 'metrics' | 'logs' = key.includes('/traces-')
            ? 'traces'
            : key.includes('/metrics-')
              ? 'metrics'
              : 'logs'

          // Send via HTTP client
          yield* httpClient.send(endpoint, adjustedData, signalType)

          // Apply speed multiplier delay if needed
          if (config.speedMultiplier && config.speedMultiplier !== 1.0) {
            const delay = 100 / config.speedMultiplier
            yield* Effect.sleep(`${delay} millis`)
          }

          // Update processed count
          yield* Ref.update(replayStatuses, (map) => {
            const newMap = new Map(map)
            const current = newMap.get(config.sessionId)
            if (current) {
              newMap.set(config.sessionId, {
                ...current,
                processedRecords: current.processedRecords + 1
              })
            }
            return newMap
          })
        }

        // Mark as completed
        yield* Ref.update(replayStatuses, (map) => {
          const newMap = new Map(map)
          const current = newMap.get(config.sessionId)
          if (current) {
            newMap.set(config.sessionId, {
              ...current,
              status: 'completed',
              completedAt: new Date(),
              currentFile: undefined
            })
          }
          return newMap
        })
      })

    const getReplayStatus = (sessionId: string): Effect.Effect<ReplayStatus, ReplayError> =>
      Effect.gen(function* () {
        const statuses = yield* Ref.get(replayStatuses)
        const status = statuses.get(sessionId)

        if (!status) {
          return yield* Effect.fail(ReplayErrorConstructors.SessionNotFound(sessionId))
        }

        return status
      })

    const listAvailableReplays = (): Effect.Effect<
      ReadonlyArray<CaptureSessionMetadata>,
      ReplayError
    > =>
      Effect.gen(function* () {
        // List all session metadata files
        const keys = yield* s3Storage
          .listObjects('sessions/')
          .pipe(Effect.mapError((_error) => ReplayErrorConstructors.SessionNotFound('all')))

        // Filter for completed sessions
        const metadataKeys = keys.filter((key) => key.endsWith('/metadata.json'))

        // Load metadata for completed sessions
        const sessions = yield* Effect.forEach(
          metadataKeys,
          (key) =>
            Effect.gen(function* () {
              const dataBytes = yield* s3Storage
                .retrieveRawData(key)
                .pipe(Effect.catchAll(() => Effect.succeed(null)))

              if (!dataBytes) return null

              const dataJson = new TextDecoder().decode(dataBytes)
              const metadata = yield* Schema.decodeUnknown(CaptureSessionMetadataSchema)(
                JSON.parse(dataJson)
              ).pipe(Effect.catchAll(() => Effect.succeed(null)))

              // Only return completed sessions
              return metadata && metadata.status === 'completed' ? metadata : null
            }),
          { concurrency: 10 }
        )

        return sessions.filter((s): s is CaptureSessionMetadata => s !== null)
      })

    const replayDataStream = (
      sessionId: string,
      signalType: 'traces' | 'metrics' | 'logs'
    ): Stream.Stream<Uint8Array, ReplayError> =>
      Stream.fromEffect(
        Effect.gen(function* () {
          const prefix = `sessions/${sessionId}/raw/`
          const keys = yield* s3Storage
            .listObjects(prefix)
            .pipe(Effect.mapError(() => ReplayErrorConstructors.SessionNotFound(sessionId)))

          // Filter for specific signal type
          const signalKeys = keys.filter((key) => key.includes(`/${signalType}-`))

          const chunks = yield* Effect.forEach(
            signalKeys,
            (key) =>
              Effect.gen(function* () {
                const data = yield* s3Storage
                  .retrieveRawData(key)
                  .pipe(
                    Effect.mapError(() =>
                      ReplayErrorConstructors.DataCorrupted(sessionId, `Failed to read ${key}`)
                    )
                  )

                return data
              }),
            { concurrency: 3 }
          )

          return Chunk.fromIterable(chunks)
        })
      ).pipe(Stream.flattenChunks)

    return OtlpReplayServiceTag.of({
      startReplay,
      getReplayStatus,
      listAvailableReplays,
      replayDataStream
    })
  })
)
