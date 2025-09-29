#!/usr/bin/env node
/**
 * Seed CLI - Generate deterministic OTLP seed data for testing
 */

import { Effect, Layer, Console, Exit } from 'effect'
import { Command } from 'commander'
import {
  SeedGeneratorTag,
  SeedGeneratorLive,
  OtlpCaptureServiceLive,
  type SeedConfig
} from '../otlp-capture/index.js'
import { S3StorageLive } from '../../storage/s3.js'

// Parse command line arguments
const program = new Command()
  .name('seed')
  .description('Generate deterministic OTLP seed data')
  .version('1.0.0')
  .option('--pattern <name>', 'Pattern name', 'basic-topology')
  .option('--duration <seconds>', 'Generation duration', '60')
  .option('--rate <traces/sec>', 'Traces per second', '10')
  .option('--error-rate <0-1>', 'Error rate (0-1)', '0.05')
  .option('--seed <number>', 'Deterministic seed (default: timestamp)')
  .option('--description <text>', 'Session description')
  .parse()

const options = program.opts()

// Build seed config
const config: SeedConfig = {
  patternName: options.pattern as string,
  duration: parseInt(options.duration, 10),
  tracesPerSecond: parseInt(options.rate, 10),
  errorRate: parseFloat(options.errorRate),
  ...(options.seed ? { seed: parseInt(options.seed, 10) } : {}),
  captureToMinIO: true,
  ...(options.description
    ? { metadata: { description: options.description as string, createdBy: 'seed-cli' } }
    : { metadata: { createdBy: 'seed-cli' } })
}

// Main program
const main = Effect.gen(function* () {
  const seedGenerator = yield* SeedGeneratorTag

  yield* Console.log('🌱 OTLP Seed Generator')
  yield* Console.log(`📋 Configuration:`)
  yield* Console.log(`   Pattern: ${config.patternName}`)
  yield* Console.log(`   Duration: ${config.duration}s`)
  yield* Console.log(`   Rate: ${config.tracesPerSecond} traces/sec`)
  yield* Console.log(`   Error rate: ${config.errorRate * 100}%`)
  yield* Console.log(`   Seed: ${config.seed || 'auto'}`)

  // List available patterns
  const patterns = yield* seedGenerator.listPatterns()
  yield* Console.log(`📚 Available patterns: ${patterns.map((p) => p.name).join(', ')}`)

  // Generate seed
  yield* Console.log(`\n🚀 Starting seed generation...`)
  const session = yield* seedGenerator.generateSeed(config)

  yield* Console.log(`\n✅ Seed generation complete!`)
  yield* Console.log(`   Session ID: ${session.sessionId}`)
  yield* Console.log(`   Traces: ${session.capturedTraces}`)
  yield* Console.log(`   Storage: sessions/${session.sessionId}/`)
  yield* Console.log(`\n💡 Replay this session with:`)
  yield* Console.log(`   pnpm replay --session ${session.sessionId}`)
})

// Compose layers - build from bottom up
const S3Layer = S3StorageLive
const CaptureLayer = OtlpCaptureServiceLive.pipe(Layer.provide(S3Layer))
const SeedLayer = SeedGeneratorLive.pipe(Layer.provide(CaptureLayer))

const SeedApplicationLayer = Layer.mergeAll(S3Layer, CaptureLayer, SeedLayer)

// Run the program
Effect.runPromiseExit(
  main.pipe(
    Effect.provide(SeedApplicationLayer),
    Effect.tapErrorCause((cause) =>
      Console.error('❌ Seed generation failed:', cause).pipe(Effect.flatMap(() => Effect.void))
    )
  )
).then((exit) => {
  if (Exit.isFailure(exit)) {
    console.error('❌ Seed generation exited with failure')
    process.exit(1)
  } else {
    console.log('✅ Seed generation exited successfully')
    process.exit(0)
  }
})
