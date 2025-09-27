#!/usr/bin/env tsx
/**
 * CLI script for capturing training data sessions with external orchestration
 * Usage: pnpm training:capture --flag <flagName> --baseline-value <value> --anomaly-value <value> --recovery-value <value> --phase-duration <seconds>
 */

import { Command } from 'commander'
import * as fs from 'fs/promises'
import { v4 as uuidv4 } from 'uuid'

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
  .option(
    '--flag-config <path>',
    'Path to flag config file',
    './demo/otel-demo-app/src/flagd/demo.flagd.json'
  )

program.parse()

const options = program.opts()

// Flag management functions (filesystem approach)
async function readFlagConfig() {
  const content = await fs.readFile(options.flagConfig, 'utf8')
  return JSON.parse(content)
}

async function writeFlagConfig(config: any) {
  await fs.writeFile(options.flagConfig, JSON.stringify(config, null, 2))
  await new Promise((resolve) => setTimeout(resolve, 100)) // Brief delay for file system
}

async function setFlagValue(flagName: string, value: number) {
  const config = await readFlagConfig()

  if (!config.flags[flagName]) {
    throw new Error(`Flag ${flagName} not found in configuration`)
  }

  const variants = config.flags[flagName].variants

  // Find the closest numeric variant to the desired value
  const numericVariants = Object.entries(variants)
    .filter(([_, variantValue]) => typeof variantValue === 'number')
    .map(([name, variantValue]) => ({ name, value: variantValue as number }))
    .sort((a, b) => Math.abs(a.value - value) - Math.abs(b.value - value))

  if (numericVariants.length > 0 && numericVariants[0]) {
    const closest = numericVariants[0]
    config.flags[flagName].defaultVariant = closest.name
    console.log(`   🎯 Flag ${flagName} set to ${closest.name} (value: ${closest.value})`)
  } else {
    // Fallback to boolean logic
    const targetVariant = value > 0 ? 'on' : 'off'
    if (targetVariant in variants) {
      config.flags[flagName].defaultVariant = targetVariant
    }
    console.log(`   🎯 Flag ${flagName} set to ${targetVariant} (boolean fallback)`)
  }

  await writeFlagConfig(config)
}

// API call helpers
async function callAPI(endpoint: string, method: string = 'GET', body?: any) {
  const requestInit: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json'
    }
  }

  if (body) {
    requestInit.body = JSON.stringify(body)
  }

  const response = await fetch(`${options.apiUrl}${endpoint}`, requestInit)

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`API ${method} ${endpoint} failed: ${response.status} - ${error}`)
  }

  return response.json()
}

async function sleep(seconds: number) {
  console.log(`   ⏱️  Waiting ${seconds}s...`)
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
}

async function captureTrainingSession() {
  console.log('🚀 Starting External Training Session Orchestration')
  console.log('━'.repeat(60))
  console.log(`📊 Configuration:`)
  console.log(`   Flag: ${options.flag}`)
  console.log(`   Phase Duration: ${options.phaseDuration}s each`)
  console.log(`   Baseline Value: ${options.baselineValue}`)
  console.log(`   Anomaly Value: ${options.anomalyValue}`)
  console.log(`   Recovery Value: ${options.recoveryValue}`)
  console.log(`   Total Duration: ${options.phaseDuration * 3}s`)
  console.log(`   Flag Config: ${options.flagConfig}`)
  console.log('━'.repeat(60))

  const sessionId = `training-${Date.now()}-${uuidv4().slice(0, 8)}`

  try {
    // 1. Start OTLP capture session via API
    console.log('\n📡 Phase 0: Starting OTLP capture session')
    await callAPI('/api/capture/sessions', 'POST', {
      sessionId,
      description: `Training session for ${options.flag}`,
      enabledFlags: [options.flag],
      captureTraces: true,
      captureMetrics: true,
      captureLogs: false,
      compressionEnabled: true
    })
    console.log(`   ✅ OTLP capture started for session: ${sessionId}`)

    // 2. Phase 1: Baseline
    console.log('\n📊 Phase 1: Baseline')
    const baselineStart = new Date()

    // Set flag to baseline value
    await setFlagValue(options.flag, options.baselineValue)

    // Create baseline annotation via API
    await callAPI('/api/annotations', 'POST', {
      signalType: 'any',
      timeRangeStart: baselineStart,
      timeRangeEnd: new Date(baselineStart.getTime() + options.phaseDuration * 1000),
      annotationType: 'test',
      annotationKey: 'test.phase.baseline',
      annotationValue: JSON.stringify({
        sessionId,
        flagName: options.flag,
        flagValue: options.baselineValue
      }),
      createdBy: 'system:training'
    })
    console.log(`   ✅ Baseline annotation created`)

    await sleep(options.phaseDuration)

    // 3. Phase 2: Anomaly
    console.log('\n🚨 Phase 2: Anomaly')
    const anomalyStart = new Date()

    // Set flag to anomaly value
    await setFlagValue(options.flag, options.anomalyValue)

    // Create anomaly annotation via API
    await callAPI('/api/annotations', 'POST', {
      signalType: 'any',
      timeRangeStart: anomalyStart,
      timeRangeEnd: new Date(anomalyStart.getTime() + options.phaseDuration * 1000),
      annotationType: 'test',
      annotationKey: 'test.phase.anomaly',
      annotationValue: JSON.stringify({
        sessionId,
        flagName: options.flag,
        flagValue: options.anomalyValue
      }),
      createdBy: 'system:training'
    })
    console.log(`   ✅ Anomaly annotation created`)

    await sleep(options.phaseDuration)

    // 4. Phase 3: Recovery
    console.log('\n🔄 Phase 3: Recovery')
    const recoveryStart = new Date()

    // Set flag to recovery value
    await setFlagValue(options.flag, options.recoveryValue)

    // Create recovery annotation via API
    await callAPI('/api/annotations', 'POST', {
      signalType: 'any',
      timeRangeStart: recoveryStart,
      timeRangeEnd: new Date(recoveryStart.getTime() + options.phaseDuration * 1000),
      annotationType: 'test',
      annotationKey: 'test.phase.recovery',
      annotationValue: JSON.stringify({
        sessionId,
        flagName: options.flag,
        flagValue: options.recoveryValue
      }),
      createdBy: 'system:training'
    })
    console.log(`   ✅ Recovery annotation created`)

    await sleep(options.phaseDuration)

    // 5. Stop OTLP capture session via API
    console.log('\n🛑 Phase 4: Stopping OTLP capture')
    await callAPI(`/api/capture/sessions/${sessionId}`, 'DELETE')
    console.log(`   ✅ OTLP capture stopped`)

    console.log('\n✅ Training Session Completed Successfully!')
    console.log('━'.repeat(60))
    console.log(`Session ID: ${sessionId}`)
    console.log(`Data location: s3://otel-data/sessions/${sessionId}`)
    console.log('━'.repeat(60))

    console.log('\n📋 Next steps:')
    console.log(`1. Query training data:`)
    console.log(`   curl ${options.apiUrl}/api/diagnostics/training/sessions/${sessionId}`)
    console.log(`\n2. Stream OTLP data for a phase:`)
    console.log(
      `   curl ${options.apiUrl}/api/diagnostics/training/sessions/${sessionId}/stream/baseline`
    )
    console.log(`\n3. Check MinIO storage:`)
    console.log(`   docker exec -it otel-ai-minio mc ls local/otel-data/sessions/${sessionId}/`)
    console.log(`\n4. Query annotations:`)
    console.log(
      `   docker exec -it otel-ai-clickhouse clickhouse-client --query "SELECT * FROM otel.annotations WHERE annotation_value LIKE '%${sessionId}%'"`
    )

    console.log('\n🎉 External training orchestration complete!')
    console.log('🏗️ Core application had zero demo dependencies!')

    process.exit(0)
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error)

    // Attempt cleanup
    try {
      console.log('\n🧹 Attempting cleanup...')
      await callAPI(`/api/capture/sessions/${sessionId}`, 'DELETE')
      console.log('   ✅ Cleanup completed')
    } catch (cleanupError) {
      console.error(
        '   ⚠️ Cleanup failed:',
        cleanupError instanceof Error ? cleanupError.message : cleanupError
      )
    }

    process.exit(1)
  }
}

// Run the capture
captureTrainingSession()
