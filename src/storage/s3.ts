/**
 * S3/MinIO storage implementation for raw data archival and retention
 */

import { Effect, Schedule } from 'effect'
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command
} from '@aws-sdk/client-s3'
import { type S3Config, type RetentionConfig } from './config.js'
import { type OTLPData } from './schemas.js'
import { type StorageError, StorageErrorConstructors } from './errors.js'

export interface S3Storage {
  readonly storeRawData: (data: Uint8Array, key: string) => Effect.Effect<void, StorageError>
  readonly retrieveRawData: (key: string) => Effect.Effect<Uint8Array, StorageError>
  readonly deleteRawData: (key: string) => Effect.Effect<void, StorageError>
  readonly archiveOTLPData: (data: OTLPData, timestamp: number) => Effect.Effect<void, StorageError>
  readonly applyRetentionPolicy: (retention: RetentionConfig) => Effect.Effect<void, StorageError>
  readonly listObjects: (prefix?: string) => Effect.Effect<string[], StorageError>
  readonly healthCheck: () => Effect.Effect<boolean, StorageError>
}

export const makeS3Storage = (config: S3Config): Effect.Effect<S3Storage, StorageError> =>
  Effect.gen(function* (_) {
    // Create S3 client
    const client = new S3Client({
      endpoint: config.endpoint,
      region: config.region || 'us-east-1',
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      },
      forcePathStyle: config.forcePathStyle ?? true // Required for MinIO
    })

    // Test connection by listing bucket
    yield* _(
      Effect.tryPromise({
        try: () =>
          client.send(
            new ListObjectsV2Command({
              Bucket: config.bucket,
              MaxKeys: 1
            })
          ),
        catch: (error) =>
          StorageErrorConstructors.ConnectionError(`Failed to connect to S3/MinIO: ${error}`, error)
      })
    )

    const storeRawData = (data: Uint8Array, key: string): Effect.Effect<void, StorageError> =>
      Effect.gen(function* (_) {
        yield* _(
          Effect.tryPromise({
            try: () =>
              client.send(
                new PutObjectCommand({
                  Bucket: config.bucket,
                  Key: key,
                  Body: data,
                  ContentType: 'application/octet-stream',
                  ...(config.enableEncryption && { ServerSideEncryption: 'AES256' })
                })
              ),
            catch: (error) =>
              StorageErrorConstructors.QueryError(
                `Failed to store data at key ${key}: ${error}`,
                `PUT ${key}`,
                error
              )
          }).pipe(
            Effect.retry(
              Schedule.exponential('100 millis').pipe(Schedule.compose(Schedule.recurs(3)))
            )
          )
        )
      })

    const retrieveRawData = (key: string): Effect.Effect<Uint8Array, StorageError> =>
      Effect.gen(function* (_) {
        const response = yield* _(
          Effect.tryPromise({
            try: () =>
              client.send(
                new GetObjectCommand({
                  Bucket: config.bucket,
                  Key: key
                })
              ),
            catch: (error) =>
              StorageErrorConstructors.QueryError(
                `Failed to retrieve data at key ${key}: ${error}`,
                `GET ${key}`,
                error
              )
          })
        )

        if (!response.Body) {
          return yield* _(
            Effect.fail(
              StorageErrorConstructors.QueryError(`No data found at key ${key}`, `GET ${key}`)
            )
          )
        }

        // Convert stream to Uint8Array - use Effect.tryPromise to handle async
        const bodyBytes = yield* _(
          Effect.tryPromise({
            try: () => {
              if (!response.Body) {
                throw new Error('Response body is null')
              }
              return response.Body.transformToByteArray()
            },
            catch: (error) =>
              StorageErrorConstructors.QueryError(
                `Failed to read response body: ${error}`,
                `READ ${key}`,
                error
              )
          })
        )

        return new Uint8Array(bodyBytes)
      })

    const deleteRawData = (key: string): Effect.Effect<void, StorageError> =>
      Effect.gen(function* (_) {
        yield* _(
          Effect.tryPromise({
            try: () =>
              client.send(
                new DeleteObjectCommand({
                  Bucket: config.bucket,
                  Key: key
                })
              ),
            catch: (error) =>
              StorageErrorConstructors.QueryError(
                `Failed to delete data at key ${key}: ${error}`,
                `DELETE ${key}`,
                error
              )
          })
        )
      })

    const archiveOTLPData = (
      data: OTLPData,
      timestamp: number
    ): Effect.Effect<void, StorageError> =>
      Effect.gen(function* (_) {
        const date = new Date(timestamp)
        const year = date.getUTCFullYear()
        const month = String(date.getUTCMonth() + 1).padStart(2, '0')
        const day = String(date.getUTCDate()).padStart(2, '0')
        const hour = String(date.getUTCHours()).padStart(2, '0')

        // Create hierarchical key structure for efficient querying
        const baseKey = `otel-data/${year}/${month}/${day}/${hour}`

        // Note: OTLP data serialization removed as it was unused in current implementation
        // Individual signal types are serialized separately below

        // Archive each signal type separately for better retention management
        if (data.traces && data.traces.length > 0) {
          const traceKey = `${baseKey}/traces/${timestamp}-${crypto.randomUUID()}.json`
          const traceData = JSON.stringify({ traces: data.traces, timestamp })
          yield* _(storeRawData(new TextEncoder().encode(traceData), traceKey))
        }

        if (data.metrics && data.metrics.length > 0) {
          const metricKey = `${baseKey}/metrics/${timestamp}-${crypto.randomUUID()}.json`
          const metricData = JSON.stringify({ metrics: data.metrics, timestamp })
          yield* _(storeRawData(new TextEncoder().encode(metricData), metricKey))
        }

        if (data.logs && data.logs.length > 0) {
          const logKey = `${baseKey}/logs/${timestamp}-${crypto.randomUUID()}.json`
          const logData = JSON.stringify({ logs: data.logs, timestamp })
          yield* _(storeRawData(new TextEncoder().encode(logData), logKey))
        }
      })

    const applyRetentionPolicy = (retention: RetentionConfig): Effect.Effect<void, StorageError> =>
      Effect.gen(function* (_) {
        const now = Date.now()

        // Parse retention policies
        const traceRetentionMs = parseRetentionPeriod(retention.traces.s3)
        const metricRetentionMs = parseRetentionPeriod(retention.metrics.s3)
        const logRetentionMs = parseRetentionPeriod(retention.logs.s3)

        // Apply retention for traces
        yield* _(applyRetentionForSignalType('traces', traceRetentionMs, now))

        // Apply retention for metrics
        yield* _(applyRetentionForSignalType('metrics', metricRetentionMs, now))

        // Apply retention for logs
        yield* _(applyRetentionForSignalType('logs', logRetentionMs, now))
      })

    const applyRetentionForSignalType = (
      signalType: string,
      retentionMs: number,
      now: number
    ): Effect.Effect<void, StorageError> =>
      Effect.gen(function* (_) {
        const cutoffDate = new Date(now - retentionMs)
        // Note: cutoffYear and cutoffMonth were unused, removed for ESLint compliance

        // List objects older than cutoff
        const objectsToDelete = yield* _(
          Effect.tryPromise({
            try: async () => {
              const objects: string[] = []
              let continuationToken: string | undefined

              do {
                const response = await client.send(
                  new ListObjectsV2Command({
                    Bucket: config.bucket,
                    Prefix: `otel-data/`,
                    ContinuationToken: continuationToken
                  })
                )

                if (response.Contents) {
                  for (const obj of response.Contents) {
                    if (obj.Key && obj.LastModified) {
                      // Check if object is for the signal type and older than cutoff
                      if (obj.Key.includes(`/${signalType}/`) && obj.LastModified < cutoffDate) {
                        objects.push(obj.Key)
                      }
                    }
                  }
                }

                continuationToken = response.NextContinuationToken
              } while (continuationToken)

              return objects
            },
            catch: (error) =>
              StorageErrorConstructors.QueryError(
                `Failed to list objects for retention: ${error}`,
                `LIST ${signalType}`,
                error
              )
          })
        )

        // Delete expired objects in batches
        const batchSize = 50
        for (let i = 0; i < objectsToDelete.length; i += batchSize) {
          const batch = objectsToDelete.slice(i, i + batchSize)

          yield* _(Effect.forEach(batch, (key) => deleteRawData(key), { concurrency: 10 }))
        }
      })

    const listObjects = (prefix?: string): Effect.Effect<string[], StorageError> =>
      Effect.gen(function* (_) {
        const objects = yield* _(
          Effect.tryPromise({
            try: async () => {
              const keys: string[] = []
              let continuationToken: string | undefined

              do {
                const response = await client.send(
                  new ListObjectsV2Command({
                    Bucket: config.bucket,
                    Prefix: prefix,
                    ContinuationToken: continuationToken
                  })
                )

                if (response.Contents) {
                  keys.push(
                    ...(response.Contents.map((obj) => obj.Key).filter(Boolean) as string[])
                  )
                }

                continuationToken = response.NextContinuationToken
              } while (continuationToken)

              return keys
            },
            catch: (error) =>
              StorageErrorConstructors.QueryError(
                `Failed to list objects: ${error}`,
                `LIST ${prefix || 'all'}`,
                error
              )
          })
        )

        return objects
      })

    const healthCheck = (): Effect.Effect<boolean, StorageError> =>
      Effect.gen(function* (_) {
        yield* _(
          Effect.tryPromise({
            try: () =>
              client.send(
                new ListObjectsV2Command({
                  Bucket: config.bucket,
                  MaxKeys: 1
                })
              ),
            catch: (error) =>
              StorageErrorConstructors.ConnectionError(`S3 health check failed: ${error}`, error)
          })
        )
        return true
      })

    return {
      storeRawData,
      retrieveRawData,
      deleteRawData,
      archiveOTLPData,
      applyRetentionPolicy,
      listObjects,
      healthCheck
    }
  })

// Helper function to parse retention period strings like "30d", "1y", etc.
const parseRetentionPeriod = (period: string): number => {
  const match = period.match(/^(\d+)([dwmy])$/)
  if (!match) {
    throw new Error(`Invalid retention period format: ${period}`)
  }

  const value = parseInt(match[1] ?? '0')
  const unit = match[2] ?? 'd'

  const millisecondsPerUnit = {
    d: 24 * 60 * 60 * 1000, // days
    w: 7 * 24 * 60 * 60 * 1000, // weeks
    m: 30 * 24 * 60 * 60 * 1000, // months (approximate)
    y: 365 * 24 * 60 * 60 * 1000 // years (approximate)
  }

  return value * millisecondsPerUnit[unit as keyof typeof millisecondsPerUnit]
}
