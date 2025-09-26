import { Context, Data, Effect, Layer, Schedule, pipe, Duration } from 'effect'
import * as Schema from '@effect/schema/Schema'
import { v4 as uuidv4 } from 'uuid'
import { AnnotationService } from './annotation-service.js'
import { type Annotation } from './annotation.schema.js'
import { FeatureFlagController } from './feature-flag-controller.js'
import { type TrainingSessionConfig } from '../otlp-capture/schemas.js'
import { OtlpCaptureServiceTag } from '../otlp-capture/index.js'

// Error types
export class DiagnosticsSessionError extends Data.TaggedError('DiagnosticsSessionError')<{
  readonly reason: 'SessionNotFound' | 'InvalidState' | 'OrchestrationFailure' | 'TimeoutError'
  readonly message: string
  readonly sessionId?: string
}> {}

// Schema definitions
const SessionPhaseSchema = Schema.Literal(
  'created',
  'started',
  'flag_enabled',
  'capturing',
  'flag_disabled',
  'analyzing',
  'completed',
  'failed'
)
export type SessionPhase = Schema.Schema.Type<typeof SessionPhaseSchema>

const DiagnosticsSessionSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  flagName: Schema.String,
  phase: SessionPhaseSchema,
  startTime: Schema.Date,
  endTime: Schema.optional(Schema.Date),
  captureInterval: Schema.Number, // milliseconds
  annotations: Schema.Array(Schema.String), // annotation IDs
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  error: Schema.optional(Schema.String)
})

export type DiagnosticsSession = Schema.Schema.Type<typeof DiagnosticsSessionSchema>

const SessionConfigSchema = Schema.Struct({
  flagName: Schema.String,
  name: Schema.optional(Schema.String),
  captureInterval: Schema.optional(Schema.Number), // milliseconds, default 30s
  warmupDelay: Schema.optional(Schema.Number), // milliseconds, default 5s
  testDuration: Schema.optional(Schema.Number), // milliseconds, default 60s
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Unknown))
})

export type SessionConfig = Schema.Schema.Type<typeof SessionConfigSchema>

// Service interface
export interface DiagnosticsSessionManagerImpl {
  readonly createSession: (
    config: SessionConfig
  ) => Effect.Effect<DiagnosticsSession, DiagnosticsSessionError, never>
  readonly startSession: (sessionId: string) => Effect.Effect<void, DiagnosticsSessionError, never>
  readonly getSession: (
    sessionId: string
  ) => Effect.Effect<DiagnosticsSession, DiagnosticsSessionError, never>
  readonly listSessions: () => Effect.Effect<readonly DiagnosticsSession[], never, never>
  readonly stopSession: (
    sessionId: string
  ) => Effect.Effect<DiagnosticsSession, DiagnosticsSessionError, never>
  readonly getSessionAnnotations: (
    sessionId: string
  ) => Effect.Effect<readonly Annotation[], DiagnosticsSessionError, never>
  readonly runTrainingSession: (
    config: TrainingSessionConfig
  ) => Effect.Effect<string, DiagnosticsSessionError, never>
}

export class DiagnosticsSessionManager extends Context.Tag('DiagnosticsSessionManager')<
  DiagnosticsSessionManager,
  DiagnosticsSessionManagerImpl
>() {}

// Implementation
const makeSessionManager = Effect.gen(function* () {
  const annotationService = yield* AnnotationService
  const flagController = yield* FeatureFlagController
  const captureService = yield* OtlpCaptureServiceTag

  // In-memory session store (in production, use persistent storage)
  const sessions = new Map<string, DiagnosticsSession>()

  const updateSession = (sessionId: string, updates: Partial<DiagnosticsSession>) =>
    Effect.sync(() => {
      const session = sessions.get(sessionId)
      if (!session) {
        throw new DiagnosticsSessionError({
          reason: 'SessionNotFound',
          message: `Session ${sessionId} not found`,
          sessionId
        })
      }
      const updated = { ...session, ...updates }
      sessions.set(sessionId, updated)
      return updated
    })

  const createAnnotation = (sessionId: string, key: string, value: unknown) =>
    Effect.gen(function* () {
      console.log(`DEBUG: createAnnotation called for session ${sessionId}, key: ${key}`)
      const session = sessions.get(sessionId)
      if (!session) {
        console.log(`DEBUG: Session ${sessionId} not found in createAnnotation`)
        return yield* Effect.fail(
          new DiagnosticsSessionError({
            reason: 'SessionNotFound',
            message: `Session ${sessionId} not found`,
            sessionId
          })
        )
      }

      console.log(`DEBUG: About to call annotationService.annotate for session ${sessionId}`)
      const annotationId = yield* annotationService.annotate({
        signalType: 'any',
        timeRangeStart: session.startTime,
        timeRangeEnd: session.endTime ?? new Date(),
        serviceName: 'diagnostics-session',
        annotationType: 'diag',
        annotationKey: key,
        annotationValue: JSON.stringify(value),
        createdBy: `session-${sessionId}`
      })

      // Add annotation ID to session
      yield* updateSession(sessionId, {
        annotations: [...(session.annotations || []), annotationId]
      })

      return annotationId
    })

  const orchestrateSession = (sessionId: string, config: SessionConfig) =>
    Effect.gen(function* () {
      // CRITICAL: This should be the first thing we see if orchestration runs
      console.log(`🚀 ORCHESTRATION STARTED FOR SESSION ${sessionId}`)

      const warmupDelay = config.warmupDelay ?? 5000
      const testDuration = config.testDuration ?? 60000
      const captureInterval = config.captureInterval ?? 30000

      console.log(`DEBUG: About to update session ${sessionId} to 'started' phase`)
      // Phase 1: Start session
      yield* updateSession(sessionId, { phase: 'started' })
      // Add error handling for annotation creation
      yield* createAnnotation(sessionId, 'diag.session.started', {
        flagName: config.flagName,
        config
      }).pipe(
        Effect.catchAll((error) => {
          console.error('ERROR: Failed to create session annotation:', error)
          return Effect.void // Continue even if annotation fails
        })
      )

      // Phase 2: Enable flag
      yield* Effect.logInfo(`Enabling flag ${config.flagName} for session ${sessionId}`)
      yield* flagController.enableFlag(config.flagName)
      yield* updateSession(sessionId, { phase: 'flag_enabled' })
      yield* createAnnotation(sessionId, `test.flag.${config.flagName}.enabled`, {
        timestamp: new Date(),
        sessionId
      }).pipe(
        Effect.catchAll((error) => {
          console.error('ERROR: Failed to create flag enabled annotation:', error)
          return Effect.void // Continue even if annotation fails
        })
      )

      // Phase 3: Warmup delay
      yield* Effect.logInfo(`Waiting ${warmupDelay}ms for warmup`)
      yield* Effect.sleep(warmupDelay)

      // Phase 4: Capture phase with periodic annotations
      yield* updateSession(sessionId, { phase: 'capturing' })
      const captureEffect = pipe(
        createAnnotation(sessionId, 'diag.capture.checkpoint', {
          timestamp: new Date(),
          phase: 'capturing'
        }).pipe(
          Effect.catchAll((error) => {
            console.error('ERROR: Failed to create capture checkpoint annotation:', error)
            return Effect.void // Continue even if annotation fails
          })
        ),
        Effect.repeat(
          Schedule.fixed(captureInterval).pipe(
            Schedule.compose(Schedule.elapsed),
            Schedule.whileOutput((elapsed) =>
              Duration.lessThan(elapsed, Duration.millis(testDuration))
            )
          )
        )
      )
      yield* Effect.fork(captureEffect)

      // Wait for test duration
      yield* Effect.sleep(testDuration)

      // Phase 5: Disable flag
      yield* Effect.logInfo(`Disabling flag ${config.flagName}`)
      yield* flagController.disableFlag(config.flagName)
      yield* updateSession(sessionId, { phase: 'flag_disabled' })
      yield* createAnnotation(sessionId, `test.flag.${config.flagName}.disabled`, {
        timestamp: new Date(),
        sessionId
      }).pipe(
        Effect.catchAll((error) => {
          console.error('ERROR: Failed to create flag disabled annotation:', error)
          return Effect.void // Continue even if annotation fails
        })
      )

      // Phase 6: Analysis phase (placeholder for future analysis)
      yield* updateSession(sessionId, { phase: 'analyzing' })
      yield* Effect.sleep(2000) // Simulate analysis time

      // Phase 7: Complete session
      const finalSession = yield* updateSession(sessionId, {
        phase: 'completed',
        endTime: new Date()
      })

      yield* createAnnotation(sessionId, 'diag.session.completed', {
        duration:
          (finalSession.endTime?.getTime() ?? Date.now()) - finalSession.startTime.getTime(),
        annotationCount: finalSession.annotations.length
      }).pipe(
        Effect.catchAll((error) => {
          console.error('ERROR: Failed to create session completed annotation:', error)
          return Effect.void // Continue even if annotation fails
        })
      )

      return finalSession
    }).pipe(
      Effect.catchAll((error) =>
        pipe(
          updateSession(sessionId, {
            phase: 'failed',
            error: error instanceof Error ? error.message : String(error),
            endTime: new Date()
          }),
          Effect.flatMap(() =>
            Effect.fail(
              new DiagnosticsSessionError({
                reason: 'OrchestrationFailure',
                message: `Session orchestration failed: ${error instanceof Error ? error.message : String(error)}`,
                sessionId
              })
            )
          )
        )
      )
    )

  return {
    createSession: (config: SessionConfig) =>
      Effect.sync(() => {
        const session: DiagnosticsSession = {
          id: uuidv4(),
          name: config.name ?? `Diagnostics Session - ${config.flagName}`,
          flagName: config.flagName,
          phase: 'created',
          startTime: new Date(),
          captureInterval: config.captureInterval ?? 30000,
          annotations: [],
          metadata: config.metadata
        }
        sessions.set(session.id, session)
        return session
      }),

    startSession: (sessionId: string) =>
      Effect.gen(function* () {
        const session = sessions.get(sessionId)
        if (!session) {
          return yield* Effect.fail(
            new DiagnosticsSessionError({
              reason: 'SessionNotFound',
              message: `Session ${sessionId} not found`,
              sessionId
            })
          )
        }

        if (session.phase !== 'created') {
          return yield* Effect.fail(
            new DiagnosticsSessionError({
              reason: 'InvalidState',
              message: `Session ${sessionId} is in phase '${session.phase}', expected 'created'`,
              sessionId
            })
          )
        }

        // Fork the orchestration to run in background - Effect-TS layers work perfectly!
        console.log(`DEBUG: About to fork orchestration for session ${sessionId}`)
        yield* Effect.fork(
          orchestrateSession(sessionId, {
            flagName: session.flagName,
            name: session.name,
            captureInterval: session.captureInterval,
            metadata: session.metadata
          }).pipe(
            // Ensure errors in orchestration don't crash the fiber silently
            Effect.catchAll((error) => {
              // Log error for debugging
              console.error(`Session ${sessionId} orchestration failed:`, error)
              return Effect.void
            })
          )
        )
        console.log(`DEBUG: Successfully forked orchestration fiber for session ${sessionId}`)
      }),

    getSession: (sessionId: string) =>
      Effect.sync(() => {
        const session = sessions.get(sessionId)
        if (!session) {
          throw new DiagnosticsSessionError({
            reason: 'SessionNotFound',
            message: `Session ${sessionId} not found`,
            sessionId
          })
        }
        return session
      }),

    listSessions: () =>
      Effect.sync(() => Array.from(sessions.values()) as readonly DiagnosticsSession[]),

    stopSession: (sessionId: string) =>
      Effect.gen(function* () {
        const session = sessions.get(sessionId)
        if (!session) {
          return yield* Effect.fail(
            new DiagnosticsSessionError({
              reason: 'SessionNotFound',
              message: `Session ${sessionId} not found`,
              sessionId
            })
          )
        }

        // If flag is still enabled, disable it
        if (session.phase === 'flag_enabled' || session.phase === 'capturing') {
          yield* flagController.disableFlag(session.flagName).pipe(
            Effect.catchAll(() => Effect.succeed(undefined)) // Ignore flag errors during cleanup
          )
        }

        // Mark session as completed
        return yield* updateSession(sessionId, {
          phase: 'completed',
          endTime: new Date()
        })
      }),

    getSessionAnnotations: (sessionId: string) =>
      Effect.gen(function* () {
        const session = sessions.get(sessionId)
        if (!session) {
          return yield* Effect.fail(
            new DiagnosticsSessionError({
              reason: 'SessionNotFound',
              message: `Session ${sessionId} not found`,
              sessionId
            })
          )
        }

        // Retrieve all annotations for this session
        // For now, query by service name since we don't have direct ID lookup
        const annotations = yield* annotationService
          .query({
            serviceName: 'diagnostics-session',
            limit: 1000
          })
          .pipe(
            Effect.catchAll((error) =>
              Effect.fail(
                new DiagnosticsSessionError({
                  reason: 'OrchestrationFailure',
                  message: `Failed to get annotations: ${error.message}`,
                  sessionId
                })
              )
            )
          )

        return annotations as readonly Annotation[]
      }),

    runTrainingSession: (config: TrainingSessionConfig) =>
      Effect.gen(function* () {
        const sessionId = `training-${Date.now()}-${uuidv4().slice(0, 8)}`

        // Register the session in the sessions map
        const session: DiagnosticsSession = {
          id: sessionId,
          name: `Training: ${config.flagName}`,
          flagName: config.flagName,
          phase: 'created',
          startTime: new Date(),
          captureInterval: 30000,
          annotations: [],
          metadata: { trainingConfig: config }
        }
        sessions.set(sessionId, session)

        // Start OTLP capture session
        yield* captureService
          .startCapture({
            sessionId,
            description: `Training session for ${config.flagName}`,
            enabledFlags: [config.flagName],
            captureTraces: true,
            captureMetrics: true,
            captureLogs: false,
            compressionEnabled: true
          })
          .pipe(
            Effect.catchAll((error) =>
              Effect.fail(
                new DiagnosticsSessionError({
                  reason: 'OrchestrationFailure',
                  message: `Failed to start capture: ${error.message || String(error)}`,
                  sessionId
                })
              )
            )
          )

        console.log(`Started training capture session: ${sessionId}`)

        // Phase 1: Baseline
        yield* updateSession(sessionId, { phase: 'started' })
        const baselineStart = new Date()
        const baselineEnd = new Date(
          baselineStart.getTime() + config.phaseDurations.baseline * 1000
        )

        yield* annotationService
          .annotate({
            signalType: 'any',
            timeRangeStart: baselineStart,
            timeRangeEnd: baselineEnd,
            annotationType: 'test',
            annotationKey: 'test.phase.baseline',
            annotationValue: JSON.stringify({
              sessionId,
              flagName: config.flagName,
              flagValue: config.flagValues.baseline
            }),
            createdBy: 'system:training'
          })
          .pipe(
            Effect.catchAll((error: unknown) => {
              const errorMessage =
                error instanceof Error
                  ? error.message
                  : error && typeof error === 'object' && 'message' in error
                    ? String((error as { message: unknown }).message)
                    : typeof error === 'string'
                      ? error
                      : JSON.stringify(error)
              console.error('DEBUG: Error creating baseline annotation:', error)
              return Effect.fail(
                new DiagnosticsSessionError({
                  reason: 'OrchestrationFailure',
                  message: `Failed to create baseline annotation: ${errorMessage}`,
                  sessionId
                })
              )
            })
          )
        // For baseline, disable flag if value is 0, enable if > 0
        if (config.flagValues.baseline === 0) {
          yield* flagController
            .disableFlag(config.flagName)
            .pipe(Effect.catchAll(() => Effect.succeed(undefined)))
        } else {
          yield* flagController
            .enableFlag(config.flagName)
            .pipe(Effect.catchAll(() => Effect.succeed(undefined)))
        }
        console.log(`Phase 1: Baseline - flag set to ${config.flagValues.baseline}`)
        yield* Effect.sleep(Duration.seconds(config.phaseDurations.baseline))

        // Phase 2: Anomaly
        const anomalyStart = new Date()
        yield* annotationService
          .annotate({
            signalType: 'any',
            timeRangeStart: anomalyStart,
            timeRangeEnd: new Date(anomalyStart.getTime() + config.phaseDurations.anomaly * 1000),
            annotationType: 'test',
            annotationKey: 'test.phase.anomaly',
            annotationValue: JSON.stringify({
              sessionId,
              flagName: config.flagName,
              flagValue: config.flagValues.anomaly
            }),
            createdBy: 'system:training'
          })
          .pipe(
            Effect.catchAll((error: unknown) => {
              const errorMessage =
                error instanceof Error
                  ? error.message
                  : error && typeof error === 'object' && 'message' in error
                    ? String((error as { message: unknown }).message)
                    : typeof error === 'string'
                      ? error
                      : JSON.stringify(error)
              console.error('DEBUG: Error creating anomaly annotation:', error)
              return Effect.fail(
                new DiagnosticsSessionError({
                  reason: 'OrchestrationFailure',
                  message: `Failed to create anomaly annotation: ${errorMessage}`,
                  sessionId
                })
              )
            })
          )
        // For anomaly, typically enable the flag
        if (config.flagValues.anomaly > 0) {
          yield* flagController
            .enableFlag(config.flagName)
            .pipe(Effect.catchAll(() => Effect.succeed(undefined)))
        } else {
          yield* flagController
            .disableFlag(config.flagName)
            .pipe(Effect.catchAll(() => Effect.succeed(undefined)))
        }
        console.log(`Phase 2: Anomaly - flag set to ${config.flagValues.anomaly}`)
        yield* Effect.sleep(Duration.seconds(config.phaseDurations.anomaly))

        // Phase 3: Recovery
        const recoveryStart = new Date()
        yield* annotationService
          .annotate({
            signalType: 'any',
            timeRangeStart: recoveryStart,
            timeRangeEnd: new Date(recoveryStart.getTime() + config.phaseDurations.recovery * 1000),
            annotationType: 'test',
            annotationKey: 'test.phase.recovery',
            annotationValue: JSON.stringify({
              sessionId,
              flagName: config.flagName,
              flagValue: config.flagValues.recovery
            }),
            createdBy: 'system:training'
          })
          .pipe(
            Effect.catchAll((error: unknown) => {
              const errorMessage =
                error instanceof Error
                  ? error.message
                  : error && typeof error === 'object' && 'message' in error
                    ? String((error as { message: unknown }).message)
                    : typeof error === 'string'
                      ? error
                      : JSON.stringify(error)
              console.error('DEBUG: Error creating recovery annotation:', error)
              return Effect.fail(
                new DiagnosticsSessionError({
                  reason: 'OrchestrationFailure',
                  message: `Failed to create recovery annotation: ${errorMessage}`,
                  sessionId
                })
              )
            })
          )
        // For recovery, typically disable flag
        if (config.flagValues.recovery === 0) {
          yield* flagController
            .disableFlag(config.flagName)
            .pipe(Effect.catchAll(() => Effect.succeed(undefined)))
        } else {
          yield* flagController
            .enableFlag(config.flagName)
            .pipe(Effect.catchAll(() => Effect.succeed(undefined)))
        }
        console.log(`Phase 3: Recovery - flag set to ${config.flagValues.recovery}`)
        yield* Effect.sleep(Duration.seconds(config.phaseDurations.recovery))

        // Stop capture
        yield* captureService.stopCapture(sessionId).pipe(
          Effect.catchAll((error) =>
            Effect.fail(
              new DiagnosticsSessionError({
                reason: 'OrchestrationFailure',
                message: `Failed to stop capture: ${error.message || String(error)}`,
                sessionId
              })
            )
          )
        )

        // Mark session as completed
        yield* updateSession(sessionId, { phase: 'completed', endTime: new Date() })

        console.log(`Training session ${sessionId} completed`)
        return sessionId
      })
  }
})

// Layer
export const DiagnosticsSessionManagerLive = Layer.effect(
  DiagnosticsSessionManager,
  makeSessionManager
)

// Mock implementation for testing
export const DiagnosticsSessionManagerMock = Layer.succeed(DiagnosticsSessionManager, {
  createSession: (config) =>
    Effect.succeed({
      id: 'mock-session-id',
      name: config.name ?? 'Mock Session',
      flagName: config.flagName,
      phase: 'created',
      startTime: new Date(),
      captureInterval: 30000,
      annotations: []
    }),

  startSession: () => Effect.succeed(undefined),

  getSession: () =>
    Effect.succeed({
      id: 'mock-session-id',
      name: 'Mock Session',
      flagName: 'testFlag',
      phase: 'completed',
      startTime: new Date(),
      endTime: new Date(),
      captureInterval: 30000,
      annotations: ['mock-annotation-1', 'mock-annotation-2']
    }),

  listSessions: () =>
    Effect.succeed([
      {
        id: 'mock-session-1',
        name: 'Mock Session 1',
        flagName: 'testFlag1',
        phase: 'completed',
        startTime: new Date(),
        endTime: new Date(),
        captureInterval: 30000,
        annotations: []
      }
    ] as const),

  stopSession: () =>
    Effect.succeed({
      id: 'mock-session-id',
      name: 'Mock Session',
      flagName: 'testFlag',
      phase: 'completed',
      startTime: new Date(),
      endTime: new Date(),
      captureInterval: 30000,
      annotations: []
    }),

  getSessionAnnotations: () => Effect.succeed([]),

  runTrainingSession: () => Effect.succeed('mock-training-session-id')
})
