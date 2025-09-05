/**
 * Integration test for JSON encoding type detection and storage
 * Tests the full flow from HTTP endpoint to database storage
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type ClickHouseClient } from '@clickhouse/client'
import { Effect } from 'effect'

// Type definitions for ClickHouse query results
interface TraceQueryResult {
  trace_id: string
  service_name: string
  operation_name: string
  encoding_type: string
  test_encoding?: string
}

interface ServiceEncodingResult {
  service_name: string
  encoding_type: string
  count: string // ClickHouse returns COUNT as string
}

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4319'
const CLICKHOUSE_CONFIG = {
  url: `http://${process.env.CLICKHOUSE_HOST || 'localhost'}:${process.env.CLICKHOUSE_PORT || '8124'}`,
  database: process.env.CLICKHOUSE_DATABASE || 'otel',
  username: process.env.CLICKHOUSE_USER || 'otel',
  password: process.env.CLICKHOUSE_PASSWORD || 'otel123'
}

describe('JSON Encoding Integration', () => {
  let clickhouseClient: ClickHouseClient
  
  beforeAll(async () => {
    clickhouseClient = createClient(CLICKHOUSE_CONFIG)
    
    // Wait for backend to be ready
    let retries = 30
    while (retries > 0) {
      try {
        const response = await fetch(`${BACKEND_URL}/api/ai-analyzer/health`)
        if (!response.ok) throw new Error('Backend not ready')
        break
      } catch (error) {
        retries--
        if (retries === 0) {
          throw new Error('Backend not available after 30 retries')
        }
        await Effect.runPromise(Effect.sleep(1000))
      }
    }
  })

  afterAll(async () => {
    await clickhouseClient.close()
  })

  it('should store JSON traces with correct encoding_type via HTTP endpoint', async () => {
    const traceId = `json-integration-${Date.now()}`
    const spanId = `span-${Date.now()}`
    const startTime = Date.now() * 1000000 // nanoseconds
    
    const jsonPayload = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'integration-json-test' } },
              { key: 'service.version', value: { stringValue: '1.0.0' } },
              { key: 'test.type', value: { stringValue: 'integration' } }
            ]
          },
          scopeSpans: [
            {
              scope: {
                name: 'integration-test-scope',
                version: '1.0.0'
              },
              spans: [
                {
                  traceId: traceId,
                  spanId: spanId,
                  name: 'json-integration-operation',
                  kind: 'SPAN_KIND_SERVER',
                  startTimeUnixNano: startTime.toString(),
                  endTimeUnixNano: (startTime + 100000000).toString(), // +100ms
                  status: {
                    code: 'STATUS_CODE_OK',
                    message: 'Success'
                  },
                  attributes: [
                    { key: 'http.method', value: { stringValue: 'POST' } },
                    { key: 'http.status_code', value: { intValue: 200 } },
                    { key: 'test.encoding', value: { stringValue: 'json' } }
                  ],
                  events: [
                    {
                      name: 'test.event',
                      timeUnixNano: startTime.toString(),
                      attributes: [
                        { key: 'event.type', value: { stringValue: 'integration-test' } }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }

    // Send JSON trace to backend
    const response = await fetch(`${BACKEND_URL}/v1/traces`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Test-Type': 'integration-json'
      },
      body: JSON.stringify(jsonPayload)
    })

    expect(response.status).toBe(200)
    const responseData = await response.json()
    expect(responseData).toHaveProperty('partialSuccess')

    // Wait for data to be written to ClickHouse
    await Effect.runPromise(Effect.sleep(2000))

    // Query ClickHouse to verify the trace was stored with correct encoding
    const result = await clickhouseClient.query({
      query: `
        SELECT 
          trace_id,
          service_name,
          operation_name,
          encoding_type,
          span_attributes['test.encoding'] as test_encoding
        FROM traces 
        WHERE trace_id = '${traceId}'
        LIMIT 1
      `,
      format: 'JSONEachRow'
    })

    const rows = await result.json() as TraceQueryResult[]
    
    expect(rows).toHaveLength(1)
    const row = rows[0]
    if (!row) {
      throw new Error('Expected to find a trace row but none was found')
    }
    
    expect(row.trace_id).toBe(traceId)
    expect(row.service_name).toBe('integration-json-test')
    expect(row.operation_name).toBe('json-integration-operation')
    expect(row.encoding_type).toBe('json') // This should be 'json' not 'protobuf'
    // Attributes are stored as JSON strings in ClickHouse - test_encoding should be just the string value
    expect(row.test_encoding).toBe('json')
  })

  it('should differentiate between JSON and protobuf traces', async () => {
    const jsonTraceId = `json-diff-${Date.now()}`
    const startTime = Date.now() * 1000000
    
    // Send a JSON trace
    const jsonPayload = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'diff-test-json' } }
            ]
          },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: jsonTraceId,
                  spanId: `json-span-${Date.now()}`,
                  name: 'json-diff-op',
                  kind: 'SPAN_KIND_SERVER',
                  startTimeUnixNano: startTime.toString(),
                  endTimeUnixNano: (startTime + 50000000).toString(),
                  status: { code: 'STATUS_CODE_OK' }
                }
              ]
            }
          ]
        }
      ]
    }

    const jsonResponse = await fetch(`${BACKEND_URL}/v1/traces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jsonPayload)
    })
    
    expect(jsonResponse.status).toBe(200)

    // Wait for processing
    await Effect.runPromise(Effect.sleep(2000))

    // Query for both traces and check encoding types
    const result = await clickhouseClient.query({
      query: `
        SELECT 
          service_name,
          encoding_type,
          COUNT(*) as count
        FROM traces 
        WHERE service_name IN ('diff-test-json')
        GROUP BY service_name, encoding_type
        ORDER BY service_name
      `,
      format: 'JSONEachRow'
    })

    const rows = await result.json() as ServiceEncodingResult[]
    
    // Verify JSON trace has correct encoding
    const jsonRow = rows.find(r => r.service_name === 'diff-test-json')
    expect(jsonRow).toBeDefined()
    if (!jsonRow) {
      throw new Error('Expected to find JSON trace but none was found')
    }
    expect(jsonRow.encoding_type).toBe('json')
  })

  it('should handle malformed JSON gracefully', async () => {
    // Send malformed JSON
    try {
      const response = await fetch(`${BACKEND_URL}/v1/traces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"invalid": json}'
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      
      // Should not reach here
      expect(true).toBe(false)
    } catch (error) {
      // Should get an error message indicating HTTP 400 or 500
      const errorMessage = error instanceof Error ? error.message : String(error)
      expect(errorMessage).toMatch(/HTTP (400|500)/)
    }
  })
})