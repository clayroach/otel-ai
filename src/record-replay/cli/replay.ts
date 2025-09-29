#!/usr/bin/env node
/**
 * Replay CLI - Standalone CLI tool for OTLP replay orchestration
 */

import { Command } from 'commander'
import { Console, Duration, Effect, Exit, Layer, Schedule } from 'effect'
import { S3StorageLive } from '../../storage/s3.js'
import {
  OtlpHttpReplayClientLive,
  OtlpReplayServiceLive,
  ReplayOrchestratorLive,
  ReplayOrchestratorTag,
  SessionManagerLive,
  type OrchestratorConfig,
  type ReplayOrchestrator,
  type SessionSelectionStrategy
} from '../otlp-capture/index.js'

// Parse command line arguments
const program = new Command()
  .name('replay')
  .description('Replay OTLP data from MinIO sessions')
  .version('1.0.0')
  .option('--session <id>', 'Session ID or "auto" for auto-selection', 'auto')
  .option('--strategy <strategy>', 'Selection strategy: latest|random|largest|smallest', 'latest')
  .option('--duration <seconds>', 'Maximum duration in seconds', '3600')
  .option('--loop', 'Enable loop mode for continuous replay', false)
  .option('--speed <multiplier>', 'Speed multiplier (1.0 = realtime)', '1.0')
  .option('--endpoint <url>', 'Target OTLP endpoint', 'http://otel-collector:4318')
  .option('--traces', 'Replay traces', true)
  .option('--metrics', 'Replay metrics', true)
  .option('--logs', 'Replay logs', true)
  .option('--filter-type <type>', 'Filter sessions by type: seed|capture|training')
  .option('--log-interval <seconds>', 'Status log interval', '60')
  .parse()

const options = program.opts()

// Build orchestrator config from CLI options
const config: OrchestratorConfig = {
  sessionId: options.session as string,
  selectionStrategy: options.strategy as SessionSelectionStrategy,
  ...(options.filterType
    ? { sessionFilter: { sessionType: options.filterType as 'seed' | 'capture' | 'training' } }
    : {}),
  maxDuration: parseInt(options.duration, 10),
  loopEnabled: Boolean(options.loop),
  speedMultiplier: parseFloat(options.speed),
  targetEndpoint: options.endpoint as string,
  replayTraces: Boolean(options.traces),
  replayMetrics: Boolean(options.metrics),
  replayLogs: Boolean(options.logs),
  timestampAdjustment: 'current'
}

// Setup signal handlers for graceful shutdown
let isShuttingDown = false
let currentSessionId: string | null = null
let orchestratorService: ReplayOrchestrator | null = null

const setupSignalHandlers = () => {
  const shutdown = () => {
    if (isShuttingDown || !currentSessionId || !orchestratorService) return
    isShuttingDown = true

    // Capture values to avoid non-null assertions
    const sessionId = currentSessionId
    const orchestrator = orchestratorService

    Effect.runPromise(
      Console.log('🛑 Received shutdown signal, stopping replay gracefully...').pipe(
        Effect.flatMap(() => orchestrator.stopReplay(sessionId)),
        Effect.flatMap(() => Console.log('✅ Replay stopped successfully')),
        Effect.catchAll((error) => Console.error('❌ Error during shutdown:', error))
      )
    )
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

// Main program
const main = Effect.gen(function* () {
  const orchestrator = yield* ReplayOrchestratorTag

  // Store orchestrator for signal handlers
  orchestratorService = orchestrator

  yield* Console.log('🎬 Starting OTLP Replay Orchestrator')
  yield* Console.log(`📋 Configuration:`)
  yield* Console.log(`   Session: ${config.sessionId}`)
  yield* Console.log(`   Strategy: ${config.selectionStrategy}`)
  yield* Console.log(`   Duration: ${config.maxDuration}s`)
  yield* Console.log(`   Loop: ${config.loopEnabled}`)
  yield* Console.log(`   Speed: ${config.speedMultiplier}x`)
  yield* Console.log(`   Endpoint: ${config.targetEndpoint}`)

  // Start replay
  const status = yield* orchestrator.startReplay(config)

  // Store session ID for signal handlers
  currentSessionId = status.sessionId

  yield* Console.log(`✅ Replay started for session: ${status.sessionId}`)
  yield* Console.log(`📊 Total records: ${status.replayStatus?.totalRecords || 0}`)

  // Setup graceful shutdown
  setupSignalHandlers()

  // Log status periodically
  const logInterval = parseInt(options.logInterval, 10)
  const statusLogger = Effect.gen(function* () {
    const currentStatus = yield* orchestrator.getStatus(status.sessionId)

    yield* Console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    yield* Console.log(`📊 Replay Status Update [${new Date().toISOString()}]`)
    yield* Console.log(`   Session: ${currentStatus.sessionId}`)
    yield* Console.log(`   Status: ${currentStatus.status}`)
    yield* Console.log(
      `   Processed: ${currentStatus.replayStatus?.processedRecords || 0}/${currentStatus.replayStatus?.totalRecords || 0}`
    )
    yield* Console.log(`   Failed: ${currentStatus.replayStatus?.failedRecords || 0}`)
    if (currentStatus.runDuration) {
      yield* Console.log(`   Runtime: ${currentStatus.runDuration}s`)
    }
    if (currentStatus.remainingDuration) {
      yield* Console.log(`   Remaining: ${currentStatus.remainingDuration}s`)
    }
    yield* Console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  })

  // Schedule status logging
  yield* Effect.repeat(statusLogger, Schedule.spaced(Duration.seconds(logInterval))).pipe(
    Effect.catchAll((error) =>
      Console.log(`⚠️  Status logging error: ${error}`).pipe(Effect.flatMap(() => Effect.void))
    ),
    Effect.fork
  )

  // Wait for completion or duration limit
  const waitForCompletion = Effect.gen(function* () {
    while (!isShuttingDown) {
      yield* Effect.sleep(Duration.seconds(5))

      const currentStatus = yield* orchestrator
        .getStatus(status.sessionId)
        .pipe(Effect.catchAll(() => Effect.succeed(null)))

      if (!currentStatus) break

      if (currentStatus.status === 'stopped' || currentStatus.status === 'idle') {
        yield* Console.log(`✅ Replay completed for session: ${status.sessionId}`)
        break
      }

      // Check duration limit
      if (currentStatus.startedAt && config.maxDuration > 0 && !config.loopEnabled) {
        const elapsed = Math.floor((Date.now() - currentStatus.startedAt.getTime()) / 1000)
        const remaining = Math.max(0, config.maxDuration - elapsed)

        if (remaining <= 0) {
          yield* Console.log('⏱️  Duration limit reached, stopping replay')
          yield* orchestrator.stopReplay(status.sessionId)
          break
        }
      }
    }
  })

  yield* waitForCompletion

  yield* Console.log('👋 Replay orchestrator shutdown complete')
})

// Compose all layers
const ReplayApplicationLayer = Layer.mergeAll(
  S3StorageLive,
  OtlpHttpReplayClientLive,
  OtlpReplayServiceLive.pipe(
    Layer.provide(Layer.mergeAll(S3StorageLive, OtlpHttpReplayClientLive))
  ),
  SessionManagerLive.pipe(Layer.provide(S3StorageLive)),
  ReplayOrchestratorLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        S3StorageLive,
        OtlpHttpReplayClientLive,
        OtlpReplayServiceLive.pipe(
          Layer.provide(Layer.mergeAll(S3StorageLive, OtlpHttpReplayClientLive))
        ),
        SessionManagerLive.pipe(Layer.provide(S3StorageLive))
      )
    )
  )
)

// Run the program
Effect.runPromiseExit(
  main.pipe(
    Effect.provide(ReplayApplicationLayer),
    Effect.tapErrorCause((cause) =>
      Console.error('❌ Replay orchestrator failed:', cause).pipe(Effect.flatMap(() => Effect.void))
    )
  )
).then((exit) => {
  if (Exit.isFailure(exit)) {
    console.error('❌ Replay orchestrator exited with failure')
    process.exit(1)
  } else {
    console.log('✅ Replay orchestrator exited successfully')
    process.exit(0)
  }
})
