/**
 * Replay Orchestrator - High-level replay coordination with duration limits and graceful shutdown
 */

import { Effect, Context, Layer, Ref, Fiber, Duration } from 'effect'
import { OtlpReplayServiceTag } from './replay-service.js'
import {
  SessionManagerTag,
  type SessionSelectionStrategy,
  type SessionFilter
} from './session-manager.js'
import { type ReplayConfig, type ReplayStatus } from '../otlp-capture/schemas.js'
import { ReplayError, ReplayErrorConstructors } from '../otlp-capture/errors.js'

// Orchestrator configuration
export interface OrchestratorConfig {
  readonly sessionId: string | 'auto' // Specific session or auto-select
  readonly selectionStrategy?: SessionSelectionStrategy // Used if sessionId is 'auto'
  readonly sessionFilter?: SessionFilter // Filter for session selection
  readonly maxDuration: number // Maximum seconds to run
  readonly loopEnabled: boolean // Loop replay when complete
  readonly speedMultiplier: number // Speed up/slow down replay
  readonly targetEndpoint?: string // Override default endpoint
  readonly replayTraces?: boolean // Replay trace data
  readonly replayMetrics?: boolean // Replay metric data
  readonly replayLogs?: boolean // Replay log data
  readonly timestampAdjustment?: 'none' | 'relative' | 'current'
}

// Orchestrator status
export interface OrchestratorStatus {
  readonly sessionId: string
  readonly status: 'idle' | 'running' | 'paused' | 'stopping' | 'stopped'
  readonly startedAt?: Date
  readonly stoppedAt?: Date
  readonly replayStatus?: ReplayStatus
  readonly runDuration?: number // Seconds elapsed
  readonly remainingDuration?: number // Seconds remaining
}

// Service interface
export interface ReplayOrchestrator {
  readonly startReplay: (
    config: OrchestratorConfig
  ) => Effect.Effect<OrchestratorStatus, ReplayError, never>
  readonly stopReplay: (sessionId: string) => Effect.Effect<void, ReplayError, never>
  readonly getStatus: (sessionId: string) => Effect.Effect<OrchestratorStatus, ReplayError, never>
  readonly pauseReplay: (sessionId: string) => Effect.Effect<void, ReplayError, never>
  readonly resumeReplay: (sessionId: string) => Effect.Effect<void, ReplayError, never>
}

// Context tag
export class ReplayOrchestratorTag extends Context.Tag('ReplayOrchestrator')<
  ReplayOrchestratorTag,
  ReplayOrchestrator
>() {}

// Service implementation
export const ReplayOrchestratorLive = Layer.effect(
  ReplayOrchestratorTag,
  Effect.gen(function* () {
    const replayService = yield* OtlpReplayServiceTag
    const sessionManager = yield* SessionManagerTag

    // In-memory orchestrator state
    const orchestratorStates = yield* Ref.make<Map<string, OrchestratorStatus>>(new Map())
    const replayFibers = yield* Ref.make<Map<string, Fiber.RuntimeFiber<void, ReplayError>>>(
      new Map()
    )

    const startReplay = (
      config: OrchestratorConfig
    ): Effect.Effect<OrchestratorStatus, ReplayError, never> =>
      Effect.gen(function* () {
        // Select or validate session
        const session =
          config.sessionId === 'auto'
            ? yield* sessionManager.selectSession(
                config.selectionStrategy || 'latest',
                config.sessionFilter
              )
            : yield* sessionManager.getSession(config.sessionId)

        const sessionId = session.sessionId

        // Check if already running
        const states = yield* Ref.get(orchestratorStates)
        const existing = states.get(sessionId)
        if (existing && existing.status === 'running') {
          yield* Effect.fail(
            ReplayErrorConstructors.DataCorrupted(
              sessionId,
              'Replay already running for this session'
            )
          )
        }

        // Build replay config
        const replayConfig: ReplayConfig = {
          sessionId,
          targetEndpoint: config.targetEndpoint,
          replayTraces: config.replayTraces ?? true,
          replayMetrics: config.replayMetrics ?? true,
          replayLogs: config.replayLogs ?? true,
          timestampAdjustment: config.timestampAdjustment || 'current',
          speedMultiplier: config.speedMultiplier
        }

        // Start replay
        const replayStatus = yield* replayService.startReplay(replayConfig)

        // Create orchestrator status
        const status: OrchestratorStatus = {
          sessionId,
          status: 'running',
          startedAt: new Date(),
          replayStatus,
          remainingDuration: config.maxDuration
        }

        yield* Ref.update(orchestratorStates, (map) => {
          const newMap = new Map(map)
          newMap.set(sessionId, status)
          return newMap
        })

        // If duration limit is set, schedule stop
        if (config.maxDuration > 0) {
          const durationFiber = yield* Effect.fork(
            Effect.gen(function* () {
              yield* Effect.sleep(Duration.seconds(config.maxDuration))
              yield* stopReplay(sessionId)
            })
          )

          yield* Ref.update(replayFibers, (map) => {
            const newMap = new Map(map)
            newMap.set(`${sessionId}-duration`, durationFiber)
            return newMap
          })
        }

        // If loop is enabled, restart on completion
        if (config.loopEnabled) {
          const loopFiber = yield* Effect.fork(
            Effect.gen(function* () {
              while (true) {
                yield* Effect.sleep(Duration.seconds(5)) // Check every 5 seconds

                const currentStatus = yield* replayService
                  .getReplayStatus(sessionId)
                  .pipe(Effect.catchAll(() => Effect.succeed(null as ReplayStatus | null)))

                if (currentStatus && currentStatus.status === 'completed') {
                  // Restart replay
                  yield* replayService.startReplay(replayConfig)
                }

                // Check if we should stop looping
                const orchState = yield* Ref.get(orchestratorStates)
                const state = orchState.get(sessionId)
                if (!state || state.status === 'stopping' || state.status === 'stopped') {
                  break
                }
              }
            })
          )

          yield* Ref.update(replayFibers, (map) => {
            const newMap = new Map(map)
            newMap.set(`${sessionId}-loop`, loopFiber)
            return newMap
          })
        }

        return status
      })

    const stopReplay = (sessionId: string): Effect.Effect<void, ReplayError, never> =>
      Effect.gen(function* () {
        // Update status to stopping
        yield* Ref.update(orchestratorStates, (map) => {
          const newMap = new Map(map)
          const current = newMap.get(sessionId)
          if (current) {
            newMap.set(sessionId, { ...current, status: 'stopping' })
          }
          return newMap
        })

        // Interrupt all fibers for this session
        const fibers = yield* Ref.get(replayFibers)
        for (const [key, fiber] of fibers.entries()) {
          if (key.startsWith(sessionId)) {
            yield* Fiber.interrupt(fiber)
          }
        }

        // Clean up fiber map
        yield* Ref.update(replayFibers, (map) => {
          const newMap = new Map(map)
          for (const key of newMap.keys()) {
            if (key.startsWith(sessionId)) {
              newMap.delete(key)
            }
          }
          return newMap
        })

        // Update final status
        yield* Ref.update(orchestratorStates, (map) => {
          const newMap = new Map(map)
          const current = newMap.get(sessionId)
          if (current) {
            newMap.set(sessionId, {
              ...current,
              status: 'stopped',
              stoppedAt: new Date(),
              runDuration: current.startedAt
                ? Math.floor((Date.now() - current.startedAt.getTime()) / 1000)
                : 0
            })
          }
          return newMap
        })
      })

    const getStatus = (sessionId: string): Effect.Effect<OrchestratorStatus, ReplayError, never> =>
      Effect.gen(function* () {
        const states = yield* Ref.get(orchestratorStates)
        const status = states.get(sessionId)

        if (!status) {
          return yield* Effect.fail(ReplayErrorConstructors.SessionNotFound(sessionId))
        }

        // Update replay status if running
        if (status.status === 'running') {
          const replayStatus = yield* replayService
            .getReplayStatus(sessionId)
            .pipe(Effect.catchAll(() => Effect.succeed(null as ReplayStatus | null)))

          if (replayStatus) {
            return { ...status, replayStatus }
          }
        }

        return status
      })

    const pauseReplay = (sessionId: string): Effect.Effect<void, ReplayError, never> =>
      Effect.gen(function* () {
        yield* Ref.update(orchestratorStates, (map) => {
          const newMap = new Map(map)
          const current = newMap.get(sessionId)
          if (current) {
            newMap.set(sessionId, { ...current, status: 'paused' })
          }
          return newMap
        })
      })

    const resumeReplay = (sessionId: string): Effect.Effect<void, ReplayError, never> =>
      Effect.gen(function* () {
        yield* Ref.update(orchestratorStates, (map) => {
          const newMap = new Map(map)
          const current = newMap.get(sessionId)
          if (current && current.status === 'paused') {
            newMap.set(sessionId, { ...current, status: 'running' })
          }
          return newMap
        })
      })

    return ReplayOrchestratorTag.of({
      startReplay,
      stopReplay,
      getStatus,
      pauseReplay,
      resumeReplay
    })
  })
)
