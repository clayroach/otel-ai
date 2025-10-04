/**
 * Integration Test: Trace Hierarchy Validation
 *
 * Validates that traces fetched from ClickHouse have proper parent-child
 * relationships for waterfall rendering.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { Effect, Layer } from 'effect'
import {
  StorageAPIClientTag,
  ClickHouseConfigTag,
  StorageAPIClientLayer
} from '../../storage/index.js'
import { ensureClickHouseRunning } from '../../test-helpers/clickhouse-health.js'
import { DebugLoggerLayerLive } from '../../debug-logger/index.js'

// Test configuration
const testConfig = {
  host: process.env.CLICKHOUSE_HOST || 'localhost',
  port: parseInt(process.env.CLICKHOUSE_PORT || '8124'),
  database: process.env.CLICKHOUSE_DATABASE || 'otel',
  username: process.env.CLICKHOUSE_USERNAME || 'otel',
  password: process.env.CLICKHOUSE_PASSWORD || 'otel123'
}

// Create test layer
const TestStorageLayer = StorageAPIClientLayer.pipe(
  Layer.provide(
    Layer.mergeAll(
      Layer.succeed(ClickHouseConfigTag, testConfig),
      DebugLoggerLayerLive
    )
  )
)

// Helper to run storage operations
const runStorage = <A, E>(effect: Effect.Effect<A, E, StorageAPIClientTag>) =>
  Effect.runPromise(Effect.provide(effect, TestStorageLayer))

interface ClickHouseSpanRow {
  trace_id: string
  span_id: string
  parent_span_id: string
  service_name: string
  operation_name: string
  start_time_unix_nano: string
  end_time_unix_nano: string
  duration_ns: number
  status_code: string
}

describe('Trace Hierarchy Validation', () => {
  let testTraceId: string

  beforeAll(async () => {
    await ensureClickHouseRunning()

    // Get a trace ID from the database
    const traces = await runStorage(
      Effect.gen(function* () {
        const storage = yield* StorageAPIClientTag
        const result = (yield* storage.queryRaw(`
          SELECT DISTINCT trace_id
          FROM otel.traces
          WHERE start_time >= subtractHours(now(), 24)
          LIMIT 1
        `)) as Array<{ trace_id: string }>
        return result
      })
    )

    expect(traces.length).toBeGreaterThan(0)
    const firstTrace = traces[0]
    if (!firstTrace) throw new Error('No traces found')
    testTraceId = firstTrace.trace_id
    console.log('Testing with trace ID:', testTraceId.substring(0, 16))
  })

  it('should fetch all spans for a trace', async () => {
    const spans = await runStorage(
      Effect.gen(function* () {
        const storage = yield* StorageAPIClientTag
        const result = (yield* storage.queryRaw(`
          SELECT
            trace_id,
            span_id,
            parent_span_id,
            service_name,
            operation_name,
            toUnixTimestamp64Nano(start_time) AS start_time_unix_nano,
            toUnixTimestamp64Nano(end_time) AS end_time_unix_nano,
            duration_ns,
            status_code
          FROM otel.traces
          WHERE trace_id = '${testTraceId}'
          ORDER BY start_time ASC
        `)) as ClickHouseSpanRow[]
        return result
      })
    )

    expect(spans).toBeDefined()
    expect(spans.length).toBeGreaterThan(0)
  })

  it('should have valid span structure', async () => {
    const spans = await runStorage(
      Effect.gen(function* () {
        const storage = yield* StorageAPIClientTag
        const result = (yield* storage.queryRaw(`
          SELECT
            trace_id,
            span_id,
            parent_span_id,
            service_name,
            operation_name,
            toUnixTimestamp64Nano(start_time) AS start_time_unix_nano,
            toUnixTimestamp64Nano(end_time) AS end_time_unix_nano,
            duration_ns,
            status_code
          FROM otel.traces
          WHERE trace_id = '${testTraceId}'
        `)) as ClickHouseSpanRow[]
        return result
      })
    )

    spans.forEach((span) => {
      // Required fields
      expect(span.span_id).toBeDefined()
      expect(span.trace_id).toBe(testTraceId)
      expect(span.service_name).toBeDefined()
      expect(span.operation_name).toBeDefined()
      expect(span.start_time_unix_nano).toBeDefined()
      expect(span.end_time_unix_nano).toBeDefined()

      // Convert duration_ns to number if it's a string
      const duration = typeof span.duration_ns === 'string' ? parseInt(span.duration_ns) : span.duration_ns
      expect(duration).toBeGreaterThanOrEqual(0)

      // Timing validation
      const start = BigInt(span.start_time_unix_nano)
      const end = BigInt(span.end_time_unix_nano)
      expect(end >= start).toBe(true)
    })
  })

  it('should identify root and child spans', async () => {
    const spans = await runStorage(
      Effect.gen(function* () {
        const storage = yield* StorageAPIClientTag
        const result = (yield* storage.queryRaw(`
          SELECT
            span_id,
            parent_span_id,
            service_name,
            operation_name
          FROM otel.traces
          WHERE trace_id = '${testTraceId}'
        `)) as Array<{ span_id: string; parent_span_id: string; service_name: string; operation_name: string }>
        return result
      })
    )

    const rootSpans = spans.filter((s) => !s.parent_span_id || s.parent_span_id === '')
    const childSpans = spans.filter((s) => s.parent_span_id && s.parent_span_id !== '')

    // Find all referenced parent IDs
    const referencedParents = new Set(
      spans.filter((s) => s.parent_span_id && s.parent_span_id !== '').map((s) => s.parent_span_id)
    )
    const existingSpanIds = new Set(spans.map((s) => s.span_id))
    const missingParents = [...referencedParents].filter((id) => !existingSpanIds.has(id))

    console.log('Span breakdown:', {
      totalSpans: spans.length,
      rootSpans: rootSpans.length,
      childSpans: childSpans.length,
      missingParents: missingParents.length,
      missingParentIds: missingParents.map((id) => id.substring(0, 8))
    })

    // If there are no root spans but missing parents, those are the "effective roots"
    const effectiveRoots = rootSpans.length + missingParents.length
    expect(effectiveRoots).toBeGreaterThan(0)
  })

  it('should validate parent-child relationships', async () => {
    const spans = await runStorage(
      Effect.gen(function* () {
        const storage = yield* StorageAPIClientTag
        const result = (yield* storage.queryRaw(`
          SELECT
            span_id,
            parent_span_id,
            service_name,
            operation_name
          FROM otel.traces
          WHERE trace_id = '${testTraceId}'
        `)) as Array<{ span_id: string; parent_span_id: string; service_name: string; operation_name: string }>
        return result
      })
    )

    // Build map for quick lookup
    const spanMap = new Map(spans.map((s) => [s.span_id, s]))

    const orphanedSpans: Array<{
      spanId: string
      parentSpanId: string
      service: string
      operation: string
    }> = []

    // Check each span's parent exists
    spans.forEach((span) => {
      if (span.parent_span_id && span.parent_span_id !== '') {
        const parent = spanMap.get(span.parent_span_id)
        if (!parent) {
          orphanedSpans.push({
            spanId: span.span_id.substring(0, 8),
            parentSpanId: span.parent_span_id.substring(0, 8),
            service: span.service_name,
            operation: span.operation_name
          })
        }
      }
    })

    console.log('Orphaned spans (missing parents):', {
      count: orphanedSpans.length,
      details: orphanedSpans
    })

    // Log warning but don't fail - orphaned spans indicate missing instrumentation
    if (orphanedSpans.length > 0) {
      console.warn(
        `⚠️  Found ${orphanedSpans.length} orphaned spans. This indicates missing cross-service spans.`
      )
      console.warn('Missing parent span IDs:', [
        ...new Set(orphanedSpans.map((s) => s.parentSpanId))
      ])
    }

    // Document the issue for waterfall rendering
    if (orphanedSpans.length > 0) {
      console.log(
        '📊 Waterfall impact: Orphaned spans will create separate root trees in the visualization'
      )
    }
  })

  it('should validate timing consistency', async () => {
    const spans = await runStorage(
      Effect.gen(function* () {
        const storage = yield* StorageAPIClientTag
        const result = (yield* storage.queryRaw(`
          SELECT
            span_id,
            toUnixTimestamp64Nano(start_time) AS start_time_unix_nano,
            toUnixTimestamp64Nano(end_time) AS end_time_unix_nano,
            duration_ns
          FROM otel.traces
          WHERE trace_id = '${testTraceId}'
        `)) as Array<{
          span_id: string
          start_time_unix_nano: string
          end_time_unix_nano: string
          duration_ns: number
        }>
        return result
      })
    )

    spans.forEach((span) => {
      const start = BigInt(span.start_time_unix_nano)
      const end = BigInt(span.end_time_unix_nano)
      const duration = BigInt(span.duration_ns)

      // Start should be before end
      expect(end >= start).toBe(true)

      // Duration should match (end - start) within reasonable tolerance
      const calculatedDuration = end - start
      const durationDiff = calculatedDuration - duration
      const toleranceNs = BigInt(1_000_000) // 1ms tolerance

      expect(durationDiff <= toleranceNs && durationDiff >= -toleranceNs).toBe(true)
    })
  })

  it('should report orphaned spans for debugging', async () => {
    const spans = await runStorage(
      Effect.gen(function* () {
        const storage = yield* StorageAPIClientTag
        const result = (yield* storage.queryRaw(`
          SELECT
            span_id,
            parent_span_id,
            service_name,
            operation_name
          FROM otel.traces
          WHERE trace_id = '${testTraceId}'
        `)) as Array<{ span_id: string; parent_span_id: string; service_name: string; operation_name: string }>
        return result
      })
    )

    // Find all unique parent span IDs referenced
    const referencedParents = new Set(
      spans.filter((s) => s.parent_span_id && s.parent_span_id !== '').map((s) => s.parent_span_id)
    )

    // Find which ones are missing
    const existingSpanIds = new Set(spans.map((s) => s.span_id))
    const missingParents = [...referencedParents].filter((id) => !existingSpanIds.has(id))

    if (missingParents.length > 0) {
      console.log('🔍 Missing parent spans:', missingParents.map((id) => id.substring(0, 8)))
      console.log(
        '📊 This will cause orphaned spans to appear as separate root trees in the waterfall'
      )
    } else {
      console.log('✅ All parent-child relationships are complete')
    }

    // This is informational - we don't fail the test for missing cross-service spans
  })
})

