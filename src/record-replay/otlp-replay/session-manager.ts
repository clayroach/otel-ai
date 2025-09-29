/**
 * Session Manager - Manages session selection and metadata for replay
 */

import { Effect, Context, Layer } from 'effect'
import { Schema } from '@effect/schema'
import { S3StorageTag } from '../../storage/index.js'
import { ReplayError, ReplayErrorConstructors } from '../otlp-capture/errors.js'
import {
  type CaptureSessionMetadata,
  CaptureSessionMetadataSchema
} from '../otlp-capture/schemas.js'

// Session selection strategies
export type SessionSelectionStrategy = 'latest' | 'random' | 'largest' | 'smallest'

// Session filter criteria
export interface SessionFilter {
  readonly sessionType?: 'seed' | 'capture' | 'training'
  readonly minSize?: number
  readonly maxSize?: number
  readonly afterDate?: Date
  readonly beforeDate?: Date
}

// Service interface
export interface SessionManager {
  readonly selectSession: (
    strategy: SessionSelectionStrategy,
    filter?: SessionFilter
  ) => Effect.Effect<CaptureSessionMetadata, ReplayError, never>
  readonly getSession: (
    sessionId: string
  ) => Effect.Effect<CaptureSessionMetadata, ReplayError, never>
  readonly listSessions: (
    filter?: SessionFilter
  ) => Effect.Effect<ReadonlyArray<CaptureSessionMetadata>, ReplayError, never>
}

// Context tag
export class SessionManagerTag extends Context.Tag('SessionManager')<
  SessionManagerTag,
  SessionManager
>() {}

// Helper to determine session type from metadata
const getSessionType = (metadata: CaptureSessionMetadata): 'seed' | 'capture' | 'training' => {
  if (metadata.sessionId.startsWith('seed-')) return 'seed'
  if (metadata.sessionId.startsWith('training-')) return 'training'
  return 'capture'
}

// Helper to calculate session size
const getSessionSize = (metadata: CaptureSessionMetadata): number => {
  return metadata.capturedTraces + metadata.capturedMetrics + metadata.capturedLogs
}

// Service implementation
export const SessionManagerLive = Layer.effect(
  SessionManagerTag,
  Effect.gen(function* () {
    const s3Storage = yield* S3StorageTag

    // Load session metadata by ID
    const getSession = (
      sessionId: string
    ): Effect.Effect<CaptureSessionMetadata, ReplayError, never> =>
      Effect.gen(function* () {
        const metadataKey = `sessions/${sessionId}/metadata.json`

        const dataBytes = yield* s3Storage
          .retrieveRawData(metadataKey)
          .pipe(Effect.mapError(() => ReplayErrorConstructors.SessionNotFound(sessionId)))

        const dataJson = new TextDecoder().decode(dataBytes)
        const metadata = yield* Schema.decodeUnknown(CaptureSessionMetadataSchema)(
          JSON.parse(dataJson)
        ).pipe(
          Effect.mapError(() =>
            ReplayErrorConstructors.DataCorrupted(sessionId, 'Invalid session metadata')
          )
        )

        return metadata
      })

    // List all sessions with optional filtering
    const listSessions = (
      filter?: SessionFilter
    ): Effect.Effect<ReadonlyArray<CaptureSessionMetadata>, ReplayError, never> =>
      Effect.gen(function* () {
        // List all session metadata files
        const keys = yield* s3Storage
          .listObjects('sessions/')
          .pipe(Effect.mapError(() => ReplayErrorConstructors.SessionNotFound('all')))

        // Filter for metadata files
        const metadataKeys = keys.filter((key) => key.endsWith('/metadata.json'))

        // Load all metadata
        const allSessions = yield* Effect.forEach(
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

              return metadata && metadata.status === 'completed' ? metadata : null
            }),
          { concurrency: 10 }
        )

        // Filter out nulls
        let sessions = allSessions.filter((s): s is CaptureSessionMetadata => s !== null)

        // Apply filters if provided
        if (filter) {
          sessions = sessions.filter((session) => {
            // Filter by session type
            if (filter.sessionType && getSessionType(session) !== filter.sessionType) {
              return false
            }

            // Filter by size
            const size = getSessionSize(session)
            if (filter.minSize && size < filter.minSize) return false
            if (filter.maxSize && size > filter.maxSize) return false

            // Filter by date
            if (filter.afterDate && session.startTime < filter.afterDate) return false
            if (filter.beforeDate && session.startTime > filter.beforeDate) return false

            return true
          })
        }

        return sessions
      })

    // Select a session based on strategy
    const selectSession = (
      strategy: SessionSelectionStrategy,
      filter?: SessionFilter
    ): Effect.Effect<CaptureSessionMetadata, ReplayError, never> =>
      Effect.gen(function* () {
        const sessions = yield* listSessions(filter)

        if (sessions.length === 0) {
          return yield* Effect.fail(
            ReplayErrorConstructors.SessionNotFound('No sessions matching criteria')
          )
        }

        switch (strategy) {
          case 'latest': {
            // Sort by start time descending and pick first
            const sorted = [...sessions].sort(
              (a, b) => b.startTime.getTime() - a.startTime.getTime()
            )
            const selected = sorted[0]
            if (!selected) {
              return yield* Effect.fail(
                ReplayErrorConstructors.SessionNotFound('No sessions available')
              )
            }
            return selected
          }

          case 'random': {
            // Pick random session
            const randomIndex = Math.floor(Math.random() * sessions.length)
            const selected = sessions[randomIndex]
            if (!selected) {
              return yield* Effect.fail(
                ReplayErrorConstructors.SessionNotFound('No sessions available')
              )
            }
            return selected
          }

          case 'largest': {
            // Sort by size descending and pick first
            const sorted = [...sessions].sort((a, b) => getSessionSize(b) - getSessionSize(a))
            const selected = sorted[0]
            if (!selected) {
              return yield* Effect.fail(
                ReplayErrorConstructors.SessionNotFound('No sessions available')
              )
            }
            return selected
          }

          case 'smallest': {
            // Sort by size ascending and pick first
            const sorted = [...sessions].sort((a, b) => getSessionSize(a) - getSessionSize(b))
            const selected = sorted[0]
            if (!selected) {
              return yield* Effect.fail(
                ReplayErrorConstructors.SessionNotFound('No sessions available')
              )
            }
            return selected
          }

          default: {
            const _exhaustive: never = strategy
            return _exhaustive
          }
        }
      })

    return SessionManagerTag.of({
      selectSession,
      getSession,
      listSessions
    })
  })
)
