/**
 * Integration test for trace ingestion using StorageAPIClient
 * Tests the full ingestion pipeline from OTLP data to ClickHouse storage
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { Effect, Layer } from 'effect'
import { 
  StorageAPIClientTag,
  ClickHouseConfigTag, 
  StorageAPIClientLayer,
  type OTLPData 
} from '../../storage/index.js'

// Test configuration
const testConfig = {
  host: process.env.CLICKHOUSE_HOST || 'localhost',
  port: parseInt(process.env.CLICKHOUSE_PORT || '8123'),
  database: process.env.CLICKHOUSE_DATABASE || 'otel',
  username: process.env.CLICKHOUSE_USERNAME || 'otel',
  password: process.env.CLICKHOUSE_PASSWORD || 'otel123'
}

// Create test layer
const TestStorageLayer = StorageAPIClientLayer.pipe(
  Layer.provide(Layer.succeed(ClickHouseConfigTag, testConfig))
)

// Helper to run storage operations
const runStorage = <A, E>(effect: Effect.Effect<A, E, StorageAPIClientTag>) =>
  Effect.runPromise(Effect.provide(effect, TestStorageLayer))

describe('Trace Ingestion Integration', () => {
  let traceId: string
  let spanId: string
  
  beforeAll(async () => {
    // Generate test IDs
    traceId = Array.from({ length: 16 }, () => 
      Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
    ).join('')
    
    spanId = Array.from({ length: 8 }, () => 
      Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
    ).join('')
  })

  it('should ingest and retrieve traces with JSON encoding', async () => {
    // Create test trace data
    const testData: OTLPData = {
      traces: [
        {
          traceId,
          spanId,
          operationName: 'test-operation',
          startTime: Date.now() * 1000000, // nanoseconds
          endTime: (Date.now() + 1000) * 1000000,
          duration: 1000 * 1000000, // 1 second in nanoseconds
          serviceName: 'test-service',
          statusCode: 0,
          spanKind: 'SPAN_KIND_INTERNAL',
          attributes: { 'test.key': 'test.value' },
          resourceAttributes: { 'service.version': '1.0.0' },
          events: [],
          links: []
        }
      ],
      timestamp: Date.now()
    }

    // Write trace data with JSON encoding
    await runStorage(
      Effect.gen(function* () {
        const storage = yield* StorageAPIClientTag
        yield* storage.writeOTLP(testData, 'json')
      })
    )

    // Query back the data using raw query to avoid schema issues
    const results = await runStorage(
      Effect.gen(function* () {
        const storage = yield* StorageAPIClientTag
        return yield* storage.queryRaw(`
          SELECT trace_id, service_name, operation_name, encoding_type
          FROM traces 
          WHERE trace_id = '${traceId}'
          AND service_name = 'test-service'
          LIMIT 5
        `)
      })
    )

    // Verify the data was stored and retrieved correctly
    expect(results).toBeDefined()
    expect(results.length).toBeGreaterThan(0)
    
    const retrievedTrace = results[0] as Record<string, unknown>
    expect(retrievedTrace).toBeDefined()
    expect(retrievedTrace.service_name).toBe('test-service')
    expect(retrievedTrace.operation_name).toBe('test-operation')
    expect(retrievedTrace.encoding_type).toBe('json')
  }, { timeout: 30000 })

  it('should ingest and retrieve traces with protobuf encoding', async () => {
    const protobufTraceId = Array.from({ length: 16 }, () => 
      Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
    ).join('')
    
    const protobufSpanId = Array.from({ length: 8 }, () => 
      Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
    ).join('')

    const testData: OTLPData = {
      traces: [
        {
          traceId: protobufTraceId,
          spanId: protobufSpanId,
          operationName: 'protobuf-test-operation',
          startTime: Date.now() * 1000000,
          endTime: (Date.now() + 1000) * 1000000,
          duration: 1000 * 1000000, // 1 second in nanoseconds
          serviceName: 'protobuf-test-service',
          statusCode: 0,
          spanKind: 'SPAN_KIND_SERVER',
          attributes: { 'protobuf.test': 'true' },
          resourceAttributes: { 'service.name': 'protobuf-test-service' },
          events: [],
          links: []
        }
      ],
      timestamp: Date.now()
    }

    // Write trace data with protobuf encoding
    await runStorage(
      Effect.gen(function* () {
        const storage = yield* StorageAPIClientTag
        yield* storage.writeOTLP(testData, 'protobuf')
      })
    )

    // Verify encoding type was stored correctly using raw query
    const encodingResults = await runStorage(
      Effect.gen(function* () {
        const storage = yield* StorageAPIClientTag
        return yield* storage.queryRaw(`
          SELECT encoding_type, trace_id
          FROM traces 
          WHERE trace_id = '${protobufTraceId}'
          LIMIT 1
        `)
      })
    )

    expect(encodingResults).toBeDefined()
    expect(encodingResults.length).toBeGreaterThan(0)
    expect(encodingResults[0]).toHaveProperty('encoding_type', 'protobuf')
  }, { timeout: 30000 })

  it('should handle health checks correctly', async () => {
    const healthResult = await runStorage(
      Effect.gen(function* () {
        const storage = yield* StorageAPIClientTag
        return yield* storage.healthCheck()
      })
    )

    expect(healthResult).toBeDefined()
    expect(healthResult.clickhouse).toBe(true)
    expect(typeof healthResult.s3).toBe('boolean')
  })

  it('should execute raw queries with proper data cleaning', async () => {
    // Test raw query functionality
    const rawResults = await runStorage(
      Effect.gen(function* () {
        const storage = yield* StorageAPIClientTag
        return yield* storage.queryRaw(`
          SELECT COUNT(*) as trace_count
          FROM traces
          WHERE service_name LIKE '%test%'
        `)
      })
    )

    expect(rawResults).toBeDefined()
    expect(Array.isArray(rawResults)).toBe(true)
    if (rawResults.length > 0) {
      expect(rawResults[0]).toHaveProperty('trace_count')
    }
  })

  // No cleanup needed - ClickHouse data will age out naturally
})