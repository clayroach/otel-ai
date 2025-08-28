/**
 * Unit test for JSON trace storage
 * Tests the encoding_type issue where JSON traces are marked as protobuf
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Effect } from 'effect'
import { ClickHouseClient, createClient } from '@clickhouse/client'
import { makeClickHouseStorage } from '../../clickhouse.js'
import { ClickHouseConfig } from '../../config.js'
import { 
  type OTLPData,
  type TraceData
} from '../../schemas.js'

// Test configuration
const testConfig: ClickHouseConfig = {
  host: process.env.CLICKHOUSE_HOST || 'localhost',
  port: parseInt(process.env.CLICKHOUSE_PORT || '8124'),
  database: process.env.CLICKHOUSE_DATABASE || 'otel',
  username: process.env.CLICKHOUSE_USER || 'otel',
  password: process.env.CLICKHOUSE_PASSWORD || 'otel123'
}

describe('JSON Trace Storage', () => {
  let clickhouseClient: ClickHouseClient
  
  beforeAll(async () => {
    clickhouseClient = createClient({
      url: `http://${testConfig.host}:${testConfig.port}`,
      database: testConfig.database,
      username: testConfig.username,
      password: testConfig.password
    })
    
    // Clear test data
    await clickhouseClient.command({
      query: `TRUNCATE TABLE IF EXISTS traces`
    }).catch(() => {
      // Table might not exist yet
    })
  })

  afterAll(async () => {
    await clickhouseClient.close()
  })

  it('should store JSON traces with correct encoding_type', async () => {
    // Create test data - JSON encoded trace
    const jsonTrace: TraceData = {
      traceId: 'json-trace-123',
      spanId: 'json-span-456',
      parentSpanId: '',
      operationName: 'test-json-operation',
      serviceName: 'json-test-service',
      startTime: Date.now() * 1000000, // nanoseconds
      endTime: (Date.now() + 100) * 1000000,
      duration: 100000000, // 100ms in nanoseconds
      statusCode: 1, // 1=OK
      statusMessage: 'Success',
      spanKind: 'SPAN_KIND_SERVER',
      attributes: {
        'http.method': 'POST',
        'http.status_code': '200',
        'encoding.source': 'json-direct'
      },
      resourceAttributes: {
        'service.version': '1.0.0',
        'telemetry.sdk.name': 'test-sdk'
      },
      events: [],
      links: []
    }

    const otlpData: OTLPData = {
      traces: [jsonTrace],
      metrics: [],
      logs: [],
      timestamp: Date.now()
    }

    // Use the ClickHouse storage directly
    const storage = await Effect.runPromise(
      makeClickHouseStorage(testConfig)
    )

    // Write the JSON trace
    await Effect.runPromise(
      storage.writeOTLP(otlpData, 'json') // Pass encoding type explicitly
    )

    // Query the database to verify
    const result = await clickhouseClient.query({
      query: `
        SELECT 
          trace_id,
          service_name,
          operation_name,
          encoding_type
        FROM traces 
        WHERE trace_id = 'json-trace-123'
        LIMIT 1
      `,
      format: 'JSONEachRow'
    })

    const rows = await result.json() as Array<{
      trace_id: string
      service_name: string
      operation_name: string
      encoding_type: string
    }>
    
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row).toBeDefined()
    
    // This test will FAIL if encoding_type is hardcoded to 'protobuf'
    expect(row!.encoding_type).toBe('json')
    expect(row!.service_name).toBe('json-test-service')
    expect(row!.operation_name).toBe('test-json-operation')
  })

  it('should store protobuf traces with correct encoding_type', async () => {
    // Create test data - Protobuf encoded trace
    const protobufTrace: TraceData = {
      traceId: 'proto-trace-789',
      spanId: 'proto-span-012',
      parentSpanId: '',
      operationName: 'test-proto-operation',
      serviceName: 'proto-test-service',
      startTime: Date.now() * 1000000,
      endTime: (Date.now() + 200) * 1000000,
      duration: 200000000, // 200ms in nanoseconds
      statusCode: 1, // 1=OK
      statusMessage: 'Success',
      spanKind: 'SPAN_KIND_CLIENT',
      attributes: {
        'http.method': 'GET',
        'http.status_code': '200',
        'encoding.source': 'protobuf-collector'
      },
      resourceAttributes: {
        'service.version': '2.0.0',
        'telemetry.sdk.name': 'otel-collector'
      },
      events: [],
      links: []
    }

    const otlpData: OTLPData = {
      traces: [protobufTrace],
      metrics: [],
      logs: [],
      timestamp: Date.now()
    }

    // Use the ClickHouse storage directly
    const storage = await Effect.runPromise(
      makeClickHouseStorage(testConfig)
    )
    
    // Write the protobuf trace
    await Effect.runPromise(
      storage.writeOTLP(otlpData, 'protobuf') // Pass encoding type explicitly
    )

    // Query the database to verify
    const result = await clickhouseClient.query({
      query: `
        SELECT 
          trace_id,
          service_name,
          operation_name,
          encoding_type
        FROM traces 
        WHERE trace_id = 'proto-trace-789'
        LIMIT 1
      `,
      format: 'JSONEachRow'
    })

    const rows = await result.json() as Array<{
      trace_id: string
      service_name: string
      operation_name: string
      encoding_type: string
    }>
    
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row).toBeDefined()
    
    expect(row!.encoding_type).toBe('protobuf')
    expect(row!.service_name).toBe('proto-test-service')
    expect(row!.operation_name).toBe('test-proto-operation')
  })

  it('should detect hardcoded encoding_type bug', async () => {
    // This test specifically checks for the hardcoded encoding_type bug
    // It should FAIL in the current implementation where line 147 of clickhouse.ts
    // has: encoding_type: 'protobuf' hardcoded
    
    const mixedData: OTLPData = {
      traces: [
        {
          traceId: 'mixed-trace-1',
          spanId: 'mixed-span-1',
          parentSpanId: '',
          operationName: 'json-op',
          serviceName: 'mixed-service',
          startTime: Date.now() * 1000000,
          endTime: (Date.now() + 50) * 1000000,
          duration: 50000000,
          statusCode: 1, // 1=OK
          statusMessage: '',
          spanKind: 'SPAN_KIND_SERVER',
          attributes: { source: 'json' },
          resourceAttributes: {},
          events: [],
          links: []
        }
      ],
      metrics: [],
      logs: [],
      timestamp: Date.now()
    }

    const storage = await Effect.runPromise(
      makeClickHouseStorage(testConfig)
    )

    // Write with explicit JSON encoding
    await Effect.runPromise(
      storage.writeOTLP(mixedData, 'json')
    )

    // Query back
    const result = await clickhouseClient.query({
      query: `
        SELECT encoding_type 
        FROM traces 
        WHERE trace_id = 'mixed-trace-1'
      `,
      format: 'JSONEachRow'
    })

    const rows = await result.json() as Array<{
      trace_id: string
      service_name: string
      operation_name: string
      encoding_type: string
    }>
    
    // This assertion will FAIL if the bug exists
    // Expected: 'json'
    // Actual (with bug): 'protobuf'
    expect(rows[0]?.encoding_type).toBe('json')
  })
})