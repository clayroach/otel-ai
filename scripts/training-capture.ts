#!/usr/bin/env tsx
/**
 * CLI script for capturing training data sessions
 * Usage: pnpm training:capture --flag <flagName> --baseline-value <value> --anomaly-value <value> --recovery-value <value> --phase-duration <seconds>
 */

import { Command } from 'commander'
import { type TrainingSessionConfig } from '../src/otlp-capture/schemas.js'

// Use global fetch (available in Node.js 18+)
const fetch = globalThis.fetch

const program = new Command()

program
  .name('training-capture')
  .description('Capture a training session with three phases for AI model fine-tuning')
  .requiredOption('--flag <flagName>', 'Feature flag name to control (e.g., paymentServiceFailure)')
  .option('--baseline-value <value>', 'Flag value during baseline phase', parseFloat, 0.0)
  .option('--anomaly-value <value>', 'Flag value during anomaly phase', parseFloat, 0.5)
  .option('--recovery-value <value>', 'Flag value during recovery phase', parseFloat, 0.0)
  .option('--phase-duration <seconds>', 'Duration of each phase in seconds', parseInt, 10)
  .option('--api-url <url>', 'API endpoint URL', 'http://localhost:4319')

program.parse()

const options = program.opts()

async function captureTrainingSession() {
  console.log('🚀 Starting training capture session')
  console.log('━'.repeat(60))
  console.log(`📊 Configuration:`)
  console.log(`   Flag: ${options.flag}`)
  console.log(`   Phase Duration: ${options.phaseDuration}s each`)
  console.log(`   Baseline Value: ${options.baselineValue}`)
  console.log(`   Anomaly Value: ${options.anomalyValue}`)
  console.log(`   Recovery Value: ${options.recoveryValue}`)
  console.log(`   Total Duration: ${options.phaseDuration * 3}s`)
  console.log('━'.repeat(60))

  const config: TrainingSessionConfig = {
    flagName: options.flag,
    flagValues: {
      baseline: options.baselineValue,
      anomaly: options.anomalyValue,
      recovery: options.recoveryValue
    },
    phaseDurations: {
      baseline: options.phaseDuration,
      anomaly: options.phaseDuration,
      recovery: options.phaseDuration
    }
  }

  try {
    console.log('\n🎬 Starting capture...')

    const response = await fetch(`${options.apiUrl}/api/diagnostics/training/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(config)
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`API request failed: ${response.status} - ${error}`)
    }

    const result = await response.json()

    console.log('\n✅ Training capture completed successfully!')
    console.log('━'.repeat(60))
    console.log(`Session ID: ${result.sessionId}`)
    console.log(`Data location: s3://otel-data/sessions/${result.sessionId}`)
    console.log('━'.repeat(60))

    console.log('\n📋 Next steps:')
    console.log(`1. Verify capture:`)
    console.log(`   curl ${options.apiUrl}/api/diagnostics/training/sessions/${result.sessionId}`)
    console.log(`\n2. Stream OTLP data for a phase:`)
    console.log(
      `   curl ${options.apiUrl}/api/diagnostics/training/sessions/${result.sessionId}/stream/baseline`
    )
    console.log(`\n3. Check MinIO storage:`)
    console.log(
      `   docker exec -it otel-ai-minio mc ls local/otel-data/sessions/${result.sessionId}/`
    )
    console.log(`\n4. Query annotations:`)
    console.log(
      `   docker exec -it otel-ai-clickhouse clickhouse-client --query "SELECT * FROM otel.annotations WHERE annotation_value LIKE '%${result.sessionId}%'"`
    )

    process.exit(0)
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

// Run the capture
captureTrainingSession()
