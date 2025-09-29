/**
 * Training Data Reader Service - Reads captured OTLP data with phase annotations for AI model training
 */

import { Effect, Context, Layer, Stream, Chunk } from 'effect'
import { Schema } from '@effect/schema'
import * as zlib from 'node:zlib'
import { S3StorageTag, StorageAPIClientTag } from '../../storage/index.js'
import { ReplayError, ReplayErrorConstructors } from '../otlp-capture/errors.js'
import {
  type TrainingDataset,
  type PhaseInfo,
  type PhaseLabels,
  type Phase,
  CaptureSessionMetadataSchema
} from '../otlp-capture/schemas.js'

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
export interface TrainingDataReader {
  readonly getTrainingData: (sessionId: string) => Effect.Effect<TrainingDataset, ReplayError>
  readonly streamOtlpData: (
    sessionId: string,
    phase: Phase
  ) => Stream.Stream<Uint8Array, ReplayError>
  readonly getPhaseLabels: (sessionId: string) => Effect.Effect<PhaseLabels, ReplayError>
}

// Context tag for dependency injection
export class TrainingDataReaderTag extends Context.Tag('TrainingDataReader')<
  TrainingDataReaderTag,
  TrainingDataReader
>() {}

// Helper to extract anomaly type from flag name
const extractAnomalyType = (flagName: string): string => {
  // Extract the service or component name from the flag
  // e.g., "paymentServiceFailure" -> "payment_service"
  const match = flagName.match(/^([a-z]+)Service/i)
  if (match && match[1]) {
    return `${match[1].toLowerCase()}_service`
  }
  return flagName.toLowerCase()
}

// Helper to group files by phase based on timestamps
const groupFilesByPhase = (
  files: ReadonlyArray<string>,
  phases: {
    baseline: PhaseInfo
    anomaly: PhaseInfo
    recovery: PhaseInfo
  }
): { baseline: string[]; anomaly: string[]; recovery: string[] } => {
  const result = {
    baseline: [] as string[],
    anomaly: [] as string[],
    recovery: [] as string[]
  }

  for (const file of files) {
    // Extract timestamp from filename (format: traces-YYYY-MM-DDTHH-MM-SS-uuid.otlp.gz)
    const match = file.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/)
    if (!match || !match[1]) continue

    const fileTime = new Date(match[1].replace(/T/, ' ').replace(/-/g, ':'))

    // Determine which phase this file belongs to
    if (
      phases.baseline &&
      fileTime >= phases.baseline.startTime &&
      fileTime < phases.baseline.endTime
    ) {
      result.baseline.push(file)
    } else if (
      phases.anomaly &&
      fileTime >= phases.anomaly.startTime &&
      fileTime < phases.anomaly.endTime
    ) {
      result.anomaly.push(file)
    } else if (
      phases.recovery &&
      fileTime >= phases.recovery.startTime &&
      fileTime <= phases.recovery.endTime
    ) {
      result.recovery.push(file)
    }
  }

  return result
}

// Implementation
export const TrainingDataReaderLive = Layer.effect(
  TrainingDataReaderTag,
  Effect.gen(function* () {
    // Dependencies
    const s3Storage = yield* S3StorageTag
    const storageClient = yield* StorageAPIClientTag

    const getTrainingData = (sessionId: string): Effect.Effect<TrainingDataset, ReplayError> =>
      Effect.gen(function* () {
        // 1. Get session metadata from S3
        const metadataKey = `sessions/${sessionId}/metadata.json`
        const metadataBytes = yield* s3Storage
          .retrieveRawData(metadataKey)
          .pipe(Effect.mapError(() => ReplayErrorConstructors.SessionNotFound(sessionId)))

        const metadataJson = new TextDecoder().decode(metadataBytes)
        const metadata = yield* Schema.decodeUnknown(CaptureSessionMetadataSchema)(
          JSON.parse(metadataJson)
        ).pipe(
          Effect.mapError(() =>
            ReplayErrorConstructors.DataCorrupted(sessionId, 'Failed to parse session metadata')
          )
        )

        // 2. Query phase annotations from ClickHouse (structured approach)
        const phaseQuery = `
          SELECT
            annotation_key,
            annotation_value,
            confidence,
            time_range_start,
            annotation_id
          FROM annotations
          WHERE annotation_key LIKE 'test.phase.%'
            AND session_id = '${sessionId}'
          ORDER BY time_range_start
        `

        const phaseResults = yield* storageClient.queryRaw(phaseQuery).pipe(
          Effect.map(
            (results) =>
              results as Array<{
                annotation_key: string
                annotation_value: string
                confidence: number | null
                time_range_start: Date
                annotation_id: string
              }>
          ),
          Effect.mapError(() => ReplayErrorConstructors.SessionNotFound(sessionId))
        )

        // Parse phase annotations (structured approach)
        const phases: Record<string, PhaseInfo> = {}

        for (const row of phaseResults) {
          const phaseType = row.annotation_key.split('.').pop() as Phase

          // Structured approach: flagName in annotation_value, flagValue in confidence
          const flagName = row.annotation_value
          const flagValue = row.confidence ?? 0

          // Calculate phase end time (start of next phase or session end)
          const phaseIndex = phaseResults.indexOf(row)
          const nextPhase = phaseResults[phaseIndex + 1]
          const endTime =
            phaseIndex < phaseResults.length - 1 && nextPhase
              ? nextPhase.time_range_start
              : metadata.endTime || new Date()

          phases[phaseType] = {
            startTime: row.time_range_start,
            endTime,
            flagName: flagName,
            flagValue: flagValue,
            annotationId: row.annotation_id
          }
        }

        // Ensure we have all three phases
        if (!phases.baseline || !phases.anomaly || !phases.recovery) {
          return yield* Effect.fail(
            ReplayErrorConstructors.DataCorrupted(
              sessionId,
              'Missing phase annotations for training session'
            )
          )
        }

        // 3. List OTLP files from S3
        const filesPrefix = `${metadata.s3Prefix}/raw/`
        const allFiles = yield* s3Storage
          .listObjects(filesPrefix)
          .pipe(Effect.mapError(() => ReplayErrorConstructors.SessionNotFound(sessionId)))

        // 4. Group files by phase
        const groupedFiles = groupFilesByPhase(allFiles, {
          baseline: phases.baseline,
          anomaly: phases.anomaly,
          recovery: phases.recovery
        })

        return {
          sessionId,
          startTime: metadata.startTime,
          endTime: metadata.endTime || new Date(),
          enabledFlags: metadata.enabledFlags,
          s3Prefix: metadata.s3Prefix,
          phases: {
            baseline: phases.baseline,
            anomaly: phases.anomaly,
            recovery: phases.recovery
          },
          otlpFiles: groupedFiles
        }
      })

    const streamOtlpData = (
      sessionId: string,
      phase: Phase
    ): Stream.Stream<Uint8Array, ReplayError> =>
      Stream.fromEffect(
        Effect.gen(function* () {
          const dataset = yield* getTrainingData(sessionId)
          const files = dataset.otlpFiles[phase]

          const chunks = yield* Effect.forEach(
            files,
            (file) =>
              Effect.gen(function* () {
                const data = yield* s3Storage
                  .retrieveRawData(file)
                  .pipe(
                    Effect.mapError(() =>
                      ReplayErrorConstructors.DataCorrupted(sessionId, `Failed to read ${file}`)
                    )
                  )

                // Decompress if needed
                if (file.endsWith('.gz')) {
                  return yield* gunzipEffect(data).pipe(
                    Effect.mapError((error) =>
                      ReplayErrorConstructors.DecompressionFailure(sessionId, error)
                    )
                  )
                }

                return data
              }),
            { concurrency: 3 }
          )

          return Chunk.fromIterable(chunks)
        })
      ).pipe(Stream.flattenChunks)

    const getPhaseLabels = (sessionId: string): Effect.Effect<PhaseLabels, ReplayError> =>
      Effect.gen(function* () {
        const dataset = yield* getTrainingData(sessionId)

        return {
          baseline: {
            has_anomaly: false,
            anomaly_severity: 0.0,
            flag_value: dataset.phases.baseline.flagValue
          },
          anomaly: {
            has_anomaly: true,
            anomaly_severity: dataset.phases.anomaly.flagValue,
            flag_value: dataset.phases.anomaly.flagValue,
            anomaly_type: extractAnomalyType(dataset.phases.anomaly.flagName)
          },
          recovery: {
            has_anomaly: false,
            anomaly_severity: 0.0,
            flag_value: dataset.phases.recovery.flagValue
          }
        }
      })

    return TrainingDataReaderTag.of({
      getTrainingData,
      streamOtlpData,
      getPhaseLabels
    })
  })
)
