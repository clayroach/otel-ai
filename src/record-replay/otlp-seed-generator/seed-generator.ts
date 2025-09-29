/**
 * Seed Generator Service - Generates deterministic OTLP test data
 */

import { Effect, Context, Layer, Duration } from 'effect'
import { execSync } from 'node:child_process'
import { OtlpCaptureServiceTag } from '../otlp-capture/index.js'
import { CaptureError } from '../otlp-capture/errors.js'
import type { CaptureSessionMetadata } from '../otlp-capture/schemas.js'
import { BasicTopologyPattern } from './patterns/basic-topology.js'

// Seed generation configuration
export interface SeedConfig {
  readonly patternName: string // Pattern to use
  readonly duration: number // Seconds to generate
  readonly tracesPerSecond: number // Generation rate
  readonly errorRate: number // Error percentage (0-1)
  readonly seed?: number // Deterministic seed (default: timestamp)
  readonly captureToMinIO: boolean // Auto-capture to storage
  readonly metadata?: {
    readonly description?: string
    readonly createdBy?: string
  }
}

// Pattern interface
export interface GenerationPattern {
  readonly name: string
  readonly version: string
  readonly description: string
  readonly generate: (config: {
    tracesPerSecond: number
    errorRate: number
    seed?: number
    sessionId?: string
  }) => Effect.Effect<unknown, never, never>
}

// Service interface
export interface SeedGenerator {
  readonly generateSeed: (
    config: SeedConfig
  ) => Effect.Effect<CaptureSessionMetadata, CaptureError, never>
  readonly listPatterns: () => Effect.Effect<ReadonlyArray<GenerationPattern>, never, never>
}

// Context tag
export class SeedGeneratorTag extends Context.Tag('SeedGenerator')<
  SeedGeneratorTag,
  SeedGenerator
>() {}

// Pattern registry
const PATTERNS: Record<string, GenerationPattern> = {
  'basic-topology': BasicTopologyPattern
}

// Service implementation
export const SeedGeneratorLive = Layer.effect(
  SeedGeneratorTag,
  Effect.gen(function* () {
    const captureService = yield* OtlpCaptureServiceTag

    const listPatterns = (): Effect.Effect<ReadonlyArray<GenerationPattern>, never, never> =>
      Effect.succeed(Object.values(PATTERNS))

    const generateSeed = (
      config: SeedConfig
    ): Effect.Effect<CaptureSessionMetadata, CaptureError, never> =>
      Effect.gen(function* () {
        // Get pattern
        const pattern = PATTERNS[config.patternName]
        if (!pattern) {
          return yield* Effect.fail(
            new CaptureError({
              reason: 'StorageFailure',
              message: `Pattern not found: ${config.patternName}`
            })
          )
        }

        // Determine seed
        const seed = config.seed || Date.now()

        // Get git commit for reproducibility
        let gitCommit = 'unknown'
        try {
          gitCommit = execSync('git rev-parse HEAD').toString().trim()
        } catch {
          // Git not available or not a repo
        }

        // Start capture session
        const sessionId = `seed-${pattern.name}-${seed}`
        yield* captureService.startCapture({
          sessionId,
          description:
            config.metadata?.description ||
            `Seed: ${pattern.name} v${pattern.version} (git: ${gitCommit.substring(0, 7)})`,
          enabledFlags: [],
          captureTraces: true,
          captureMetrics: false,
          captureLogs: false,
          compressionEnabled: true
        })

        yield* Effect.log(
          `🌱 Generating seed data with pattern: ${pattern.name} v${pattern.version}`
        )
        yield* Effect.log(`   Seed: ${seed}`)
        yield* Effect.log(`   Duration: ${config.duration}s`)
        yield* Effect.log(`   Rate: ${config.tracesPerSecond} traces/sec`)
        yield* Effect.log(`   Error rate: ${config.errorRate * 100}%`)

        // Generate data for the specified duration
        const startTime = Date.now()
        const delayMs = 1000 / config.tracesPerSecond
        let generatedCount = 0

        while ((Date.now() - startTime) / 1000 < config.duration) {
          // Generate one trace
          const traceData = yield* pattern.generate({
            tracesPerSecond: config.tracesPerSecond,
            errorRate: config.errorRate,
            seed: seed + generatedCount, // Vary seed slightly for each trace
            sessionId // Pass session ID for service naming
          })

          // Capture the trace
          yield* captureService.captureOTLPData(
            sessionId,
            new TextEncoder().encode(JSON.stringify(traceData)),
            'traces'
          )

          generatedCount++

          // Delay to maintain rate
          yield* Effect.sleep(Duration.millis(delayMs))
        }

        // Stop capture
        const finalSession = yield* captureService.stopCapture(sessionId)

        yield* Effect.log(`✅ Seed generation complete`)
        yield* Effect.log(`   Session: ${finalSession.sessionId}`)
        yield* Effect.log(`   Generated: ${generatedCount} traces`)
        yield* Effect.log(`   Stored in: sessions/${finalSession.sessionId}/`)

        return finalSession
      })

    return SeedGeneratorTag.of({
      generateSeed,
      listPatterns
    })
  })
)
