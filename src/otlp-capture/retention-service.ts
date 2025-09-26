/**
 * Retention Service - Manages data lifecycle for continuous and session OTLP data
 */

import { Effect, Context, Layer, Schedule, Duration } from 'effect'
import { Schema } from '@effect/schema'
import { S3StorageTag } from '../storage/index.js'
import { CaptureError, CaptureErrorConstructors } from './errors.js'

// Retention policy configuration
export const RetentionPolicySchema = Schema.Struct({
  continuous: Schema.Struct({
    retentionDays: Schema.Number,
    cleanupSchedule: Schema.String, // Cron expression
    enabled: Schema.Boolean
  }),
  sessions: Schema.Struct({
    defaultRetentionDays: Schema.Number,
    maxRetentionDays: Schema.Number,
    archiveAfterDays: Schema.optional(Schema.Number),
    cleanupEnabled: Schema.Boolean
  })
})

export type RetentionPolicy = Schema.Schema.Type<typeof RetentionPolicySchema>

// Cleanup result
export const CleanupResultSchema = Schema.Struct({
  deletedObjects: Schema.Number,
  freedSpaceBytes: Schema.Number,
  processedPaths: Schema.Array(Schema.String),
  errors: Schema.Array(Schema.String),
  duration: Schema.Number // milliseconds
})

export type CleanupResult = Schema.Schema.Type<typeof CleanupResultSchema>

// Storage metrics
export const StorageMetricsSchema = Schema.Struct({
  continuousPath: Schema.Struct({
    totalObjects: Schema.Number,
    totalSizeBytes: Schema.Number,
    oldestObjectDate: Schema.optional(Schema.Date),
    newestObjectDate: Schema.optional(Schema.Date)
  }),
  sessionsPath: Schema.Struct({
    totalObjects: Schema.Number,
    totalSizeBytes: Schema.Number,
    activeSessions: Schema.Number,
    completedSessions: Schema.Number
  }),
  totalSizeBytes: Schema.Number
})

export type StorageMetrics = Schema.Schema.Type<typeof StorageMetricsSchema>

// Service interface
export interface RetentionService {
  readonly cleanupContinuousData: (
    olderThanDays: number
  ) => Effect.Effect<CleanupResult, CaptureError>

  readonly manageSessionData: (
    sessionId: string,
    policy: RetentionPolicy['sessions']
  ) => Effect.Effect<void, CaptureError>

  readonly getStorageUsage: () => Effect.Effect<StorageMetrics, CaptureError>

  readonly scheduleRetentionJobs: (policy: RetentionPolicy) => Effect.Effect<void, CaptureError>

  readonly archiveOldSessions: (olderThanDays: number) => Effect.Effect<CleanupResult, CaptureError>
}

// Context tag for dependency injection
export class RetentionServiceTag extends Context.Tag('RetentionService')<
  RetentionServiceTag,
  RetentionService
>() {}

// Implementation
export const RetentionServiceLive = Layer.effect(
  RetentionServiceTag,
  Effect.gen(function* () {
    // Dependencies
    const s3Storage = yield* S3StorageTag

    const cleanupContinuousData = (
      olderThanDays: number
    ): Effect.Effect<CleanupResult, CaptureError> =>
      Effect.gen(function* () {
        const startTime = Date.now()
        const cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)

        // List objects in continuous path (with reasonable limit for cleanup)
        const objectsResult = yield* s3Storage
          .getObjectsCount('continuous/', 5000) // Limit to 5000 objects for cleanup batch
          .pipe(
            Effect.mapError((error) =>
              CaptureErrorConstructors.StorageFailure(
                'Failed to list continuous data objects',
                undefined,
                error
              )
            )
          )
        const allObjects = objectsResult.objects

        // Filter objects older than cutoff
        const objectsToDelete: { key: string; size: number }[] = []
        let totalSize = 0

        // Extract date from path pattern: continuous/YYYY-MM-DD/
        for (const key of allObjects) {
          const dateMatch = key.match(/continuous\/(\d{4}-\d{2}-\d{2})\//)
          if (dateMatch) {
            const objectDate = new Date(dateMatch[1] || '')
            if (objectDate < cutoffDate) {
              // Get object size (simplified - in real implementation, would batch this)
              const size = 1024 // Placeholder - would get actual size
              objectsToDelete.push({ key, size })
              totalSize += size
            }
          }
        }

        // Delete objects in batches
        const errors: string[] = []
        let deletedCount = 0

        for (const obj of objectsToDelete) {
          const deleteResult = yield* s3Storage.deleteRawData(obj.key).pipe(
            Effect.catchAll((error) => {
              errors.push(`Failed to delete ${obj.key}: ${error}`)
              return Effect.succeed(false)
            })
          )

          if (deleteResult !== false) {
            deletedCount++
          }
        }

        const result: CleanupResult = {
          deletedObjects: deletedCount,
          freedSpaceBytes: totalSize,
          processedPaths: ['continuous/'],
          errors,
          duration: Date.now() - startTime
        }

        return result
      })

    const manageSessionData = (
      sessionId: string,
      policy: RetentionPolicy['sessions']
    ): Effect.Effect<void, CaptureError> =>
      Effect.gen(function* () {
        // Load session metadata
        const metadataKey = `sessions/${sessionId}/metadata.json`

        // Check if metadata exists by trying to retrieve it
        const metadataExists = yield* s3Storage.retrieveRawData(metadataKey).pipe(
          Effect.map(() => true),
          Effect.catchAll(() => Effect.succeed(false))
        )

        if (!metadataExists) {
          return yield* Effect.fail(CaptureErrorConstructors.SessionNotFound(sessionId))
        }

        // We already checked existence, so retrieve the metadata
        const metadataBytes = yield* s3Storage
          .retrieveRawData(metadataKey)
          .pipe(
            Effect.mapError((error) =>
              CaptureErrorConstructors.StorageFailure(
                'Failed to load session metadata',
                sessionId,
                error
              )
            )
          )

        const metadata = JSON.parse(new TextDecoder().decode(metadataBytes))

        // Apply retention policy based on session age and completion status
        const sessionDate = new Date(metadata.startTime || Date.now())
        const daysSinceCreation = (Date.now() - sessionDate.getTime()) / (1000 * 60 * 60 * 24)

        // Archive if needed
        if (policy.archiveAfterDays && daysSinceCreation > policy.archiveAfterDays) {
          // In future: move to archive tier (e.g., Glacier)
          console.log(`Session ${sessionId} eligible for archival`)
        }

        // Delete if beyond retention period
        if (daysSinceCreation > policy.maxRetentionDays) {
          if (policy.cleanupEnabled) {
            yield* deleteSessionData(sessionId)
          }
        }
      })

    const deleteSessionData = (sessionId: string): Effect.Effect<void, CaptureError> =>
      Effect.gen(function* () {
        // List all objects for this session
        const sessionObjects = yield* s3Storage
          .listObjects(`sessions/${sessionId}/`)
          .pipe(
            Effect.mapError((error) =>
              CaptureErrorConstructors.StorageFailure(
                `Failed to list session objects for ${sessionId}`,
                sessionId,
                error
              )
            )
          )

        // Delete all session objects
        yield* Effect.forEach(
          sessionObjects,
          (key) =>
            s3Storage
              .deleteRawData(key)
              .pipe(
                Effect.mapError((error) =>
                  CaptureErrorConstructors.StorageFailure(
                    `Failed to delete session object ${key}`,
                    sessionId,
                    error
                  )
                )
              ),
          { concurrency: 10 }
        )
      })

    const getStorageUsage = (): Effect.Effect<StorageMetrics, CaptureError> =>
      Effect.gen(function* () {
        // Get continuous path metrics (limited sample for performance)
        const continuousResult = yield* s3Storage
          .getObjectsCount('continuous/', 1000) // Only sample first 1000 objects
          .pipe(
            Effect.orElse(() => Effect.succeed({ objects: [], totalCount: 0, isTruncated: false }))
          )

        // Get sessions path metrics (limited sample)
        const sessionResult = yield* s3Storage
          .getObjectsCount('sessions/', 1000) // Only sample first 1000 objects
          .pipe(
            Effect.orElse(() => Effect.succeed({ objects: [], totalCount: 0, isTruncated: false }))
          )

        // Calculate metrics (simplified - in production would get actual sizes)
        const continuousMetrics = {
          totalObjects: continuousResult.totalCount,
          totalSizeBytes: continuousResult.totalCount * 1024, // Placeholder
          oldestObjectDate: continuousResult.totalCount > 0 ? new Date() : undefined,
          newestObjectDate: continuousResult.totalCount > 0 ? new Date() : undefined
        }

        // Count active vs completed sessions
        const metadataFiles = sessionResult.objects.filter((key) => key.endsWith('/metadata.json'))
        let activeSessions = 0
        let completedSessions = 0

        // In production, would batch-load metadata to check status
        // Simplified - assume half are active based on file count
        activeSessions = Math.floor(metadataFiles.length / 2)
        completedSessions = metadataFiles.length - activeSessions

        const sessionsMetrics = {
          totalObjects: sessionResult.totalCount,
          totalSizeBytes: sessionResult.totalCount * 2048, // Placeholder
          activeSessions,
          completedSessions
        }

        const metrics: StorageMetrics = {
          continuousPath: continuousMetrics,
          sessionsPath: sessionsMetrics,
          totalSizeBytes: continuousMetrics.totalSizeBytes + sessionsMetrics.totalSizeBytes
        }

        return metrics
      })

    const scheduleRetentionJobs = (policy: RetentionPolicy): Effect.Effect<void, CaptureError> =>
      Effect.gen(function* () {
        if (!policy.continuous.enabled) {
          return
        }

        // Schedule continuous data cleanup
        const cleanupSchedule = Schedule.fixed(Duration.hours(24)) // Daily cleanup

        const continuousCleanupJob = Effect.gen(function* () {
          console.log('Running scheduled continuous data cleanup...')
          const result = yield* cleanupContinuousData(policy.continuous.retentionDays)
          console.log(
            `Cleanup completed: ${result.deletedObjects} objects deleted, ${result.freedSpaceBytes} bytes freed`
          )
        }).pipe(
          Effect.catchAll((error) => {
            console.error('Continuous cleanup failed:', error)
            return Effect.void
          })
        )

        // Start the scheduled job
        yield* Effect.fork(Effect.schedule(continuousCleanupJob, cleanupSchedule))

        // Schedule session data management
        if (policy.sessions.cleanupEnabled) {
          const sessionCleanupJob = Effect.gen(function* () {
            console.log('Running scheduled session data cleanup...')
            // In production, would list all sessions and apply policies
            yield* Effect.void
          }).pipe(
            Effect.catchAll((error) => {
              console.error('Session cleanup failed:', error)
              return Effect.void
            })
          )

          yield* Effect.fork(Effect.schedule(sessionCleanupJob, Schedule.fixed(Duration.hours(24))))
        }
      })

    const archiveOldSessions = (
      _olderThanDays: number
    ): Effect.Effect<CleanupResult, CaptureError> =>
      Effect.succeed({
        deletedObjects: 0,
        freedSpaceBytes: 0,
        processedPaths: ['sessions/'],
        errors: [],
        duration: 0
      } satisfies CleanupResult)

    return RetentionServiceTag.of({
      cleanupContinuousData,
      manageSessionData,
      getStorageUsage,
      scheduleRetentionJobs,
      archiveOldSessions
    })
  })
)
