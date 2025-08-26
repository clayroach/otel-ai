/**
 * Integration test suite for SimpleStorage class with TestContainers
 * These tests require Docker and take longer to run
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ClickHouseContainer, type StartedClickHouseContainer } from '@testcontainers/clickhouse'
import { SimpleStorage, type SimpleStorageConfig, type SimpleOTLPData, type DatabaseTraceRecord, type DetailedTraceData } from '../../simple-storage.js'

describe('SimpleStorage Integration Tests', () => {
  let storage: SimpleStorage
  let config: SimpleStorageConfig
  let clickhouseContainer: StartedClickHouseContainer

  beforeAll(async () => {
    console.log('🧪 Starting ClickHouse TestContainer...')
    
    // Start ClickHouse container
    clickhouseContainer = await new ClickHouseContainer()
      .withDatabase('otel')
      .withUsername('otel')
      .withPassword('otel123')
      .start()

    console.log('✅ ClickHouse TestContainer started')

    // Configure storage to use the test container
    config = {
      clickhouse: {
        host: clickhouseContainer.getHost(),
        port: clickhouseContainer.getMappedPort(8123),
        database: 'otel',
        username: 'otel',
        password: 'otel123'
      }
    }

    storage = new SimpleStorage(config)
    
    // Verify connection
    const isHealthy = await storage.healthCheck()
    if (!isHealthy) {
      throw new Error('Failed to connect to ClickHouse TestContainer')
    }
    
    console.log('✅ ClickHouse connection verified')
    
    // Create the unified traces table for testing
    await storage['client'].command({
      query: `
        CREATE TABLE IF NOT EXISTS traces (
          trace_id String,
          span_id String,
          parent_span_id String,
          start_time DateTime64(9),
          end_time DateTime64(9),
          duration_ns UInt64,
          service_name LowCardinality(String),
          operation_name LowCardinality(String),
          span_kind LowCardinality(String),
          status_code LowCardinality(String),
          status_message String,
          trace_state String,
          scope_name String,
          scope_version String,
          span_attributes Map(String, String),
          resource_attributes Map(String, String),
          events String,
          links String,
          ingestion_time DateTime DEFAULT now(),
          processing_version UInt8 DEFAULT 1,
          encoding_type LowCardinality(String)
        ) ENGINE = MergeTree()
        PARTITION BY toDate(start_time)
        ORDER BY (service_name, operation_name, toUnixTimestamp(start_time), trace_id)
      `
    })
    
    // Also create the otel_traces table for collector path testing
    await storage['client'].command({
      query: `
        CREATE TABLE IF NOT EXISTS otel_traces (
          Timestamp DateTime64(9),
          TraceId String,
          SpanId String, 
          ParentSpanId String,
          SpanName String,
          SpanKind String,
          ServiceName String,
          ResourceAttributes Map(String, String),
          Duration UInt64,
          StatusCode String,
          StatusMessage String,
          SpanAttributes Map(String, String),
          Events String
        ) ENGINE = MergeTree() 
        ORDER BY (ServiceName, Timestamp)
      `
    })
    
    console.log('✅ Database schema created')
  }, 120000) // 2 minute timeout for container startup

  afterAll(async () => {
    if (storage) {
      await storage.close()
    }
    if (clickhouseContainer) {
      console.log('🧹 Stopping ClickHouse TestContainer...')
      await clickhouseContainer.stop()
      console.log('✅ ClickHouse TestContainer stopped')
    }
  }, 60000)

  describe('Health Check Integration', () => {
    it('should perform health check successfully with real database', async () => {
      const isHealthy = await storage.healthCheck()
      expect(isHealthy).toBe(true)
    })
  })

  describe('OTLP Data Integration', () => {
    const now = Date.now() * 1000000 // Convert to nanoseconds
    const testTraceData: SimpleOTLPData = {
      traces: [
        {
          traceId: 'integration-trace-123',
          spanId: 'integration-span-123',
          operationName: 'integration-test-operation',
          startTime: now,
          serviceName: 'integration-test-service',
          statusCode: 'STATUS_CODE_OK',
          attributes: { 'test.environment': 'integration', 'test.type': 'container' }
        }
      ],
      timestamp: Date.now()
    }

    it('should write and query OTLP data end-to-end', async () => {
      // Write data
      await storage.writeOTLP(testTraceData)
      
      // Query back the data
      const timeRange = {
        start: Date.now() - 60000, // 1 minute ago
        end: Date.now() + 60000    // 1 minute from now
      }
      
      const traces = await storage.queryTraces(timeRange)
      expect(Array.isArray(traces)).toBe(true)
      
      // Should find our trace
      const ourTrace = traces.find(t => t.traceId === 'integration-trace-123')
      expect(ourTrace).toBeDefined()
      
      if (ourTrace) {
        expect(ourTrace.spanId).toBe('integration-span-123')
        expect(ourTrace.operationName).toBe('integration-test-operation')
        expect(ourTrace.serviceName).toBe('integration-test-service')
        // The statusCode is stored as a string in the database
        expect(typeof ourTrace.statusCode).toBe('string')
        expect(ourTrace.statusCode).toMatch(/STATUS_CODE_OK|Ok/i)
      }
    })

    it('should handle large datasets in real database', async () => {
      const baseTime = Date.now() * 1000000
      const largeDataset: SimpleOTLPData = {
        traces: Array.from({ length: 50 }, (_, index) => {
          const startTime = baseTime - (index * 1000 * 1000000) // Each trace 1 second apart
          return {
            traceId: `bulk-trace-${index}`,
            spanId: `bulk-span-${index}`,
            parent_span_id: index > 0 ? `bulk-span-${index - 1}` : '',
            operationName: `bulk-operation-${index}`,
            startTime: startTime,
            endTime: startTime + (100 + index) * 1000000, // Variable duration
            serviceName: `bulk-service-${index % 5}`,
            statusCode: index % 2 === 0 ? 'STATUS_CODE_OK' : 'STATUS_CODE_ERROR',
            statusMessage: index % 2 === 0 ? 'OK' : 'Error',
            spanKind: 'SPAN_KIND_INTERNAL',
            attributes: { 
              index: index.toString(), 
              category: `cat-${index % 3}`,
              'test.bulk': 'true'
            },
            resourceAttributes: { 
              'service.name': `bulk-service-${index % 5}`,
              'service.version': '1.0.0'
            }
          }
        }),
        timestamp: Date.now()
      }

      await storage.writeOTLP(largeDataset)
      
      // Query to verify some of the data was written
      const timeRange = {
        start: Date.now() - 3600000, // 1 hour ago
        end: Date.now()
      }
      
      const traces = await storage.queryTraces(timeRange)
      expect(traces.length).toBeGreaterThan(0)
      
      // Should find some of our bulk traces
      const bulkTraces = traces.filter(t => t.attributes?.['test.bulk'] === 'true')
      expect(bulkTraces.length).toBeGreaterThan(0)
    })
  })

  describe('Query Performance Integration', () => {
    it('should handle time-based queries efficiently', async () => {
      const start = performance.now()
      
      const traces = await storage.queryTraces({
        start: Date.now() - 86400000, // 24 hours ago
        end: Date.now()
      })
      
      const duration = performance.now() - start
      
      expect(Array.isArray(traces)).toBe(true)
      expect(duration).toBeLessThan(5000) // Should complete in under 5 seconds
    })
  })

  describe('JSON OTLP Integration', () => {
    it('should handle JSON OTLP data and track encoding type correctly', async () => {
      const now = Date.now() * 1000000 // Convert to nanoseconds
      const jsonTraceData: SimpleOTLPData = {
        traces: [
          {
            traceId: 'json-trace-test-123',
            spanId: 'json-span-test-123',
            operationName: 'json-test-operation',
            startTime: now,
            serviceName: 'json-test-service',
            statusCode: 'STATUS_CODE_OK',
            attributes: { 'test.format': 'json', 'test.environment': 'integration' }
          }
        ],
        timestamp: Date.now()
      }

      // Write JSON data using writeOTLP (which should set encoding_type to 'json')
      await storage.writeOTLP(jsonTraceData)
      
      // Query the data back and verify encoding type
      const query = `
        SELECT 
          trace_id,
          service_name,
          operation_name,
          encoding_type,
          span_attributes,
          resource_attributes
        FROM traces 
        WHERE service_name = 'json-test-service'
        ORDER BY start_time DESC
        LIMIT 1
      `
      
      const result = await storage.queryWithResults(query)
      expect(result.data).toHaveLength(1)
      
      const trace = result.data[0] as unknown as DatabaseTraceRecord
      expect(trace).toBeDefined()
      expect(trace.trace_id).toBe('json-trace-test-123')
      expect(trace.service_name).toBe('json-test-service')
      expect(trace.operation_name).toBe('json-test-operation')
      expect(trace.encoding_type).toBe('json') // This is the key validation
    })

    it('should differentiate between JSON and protobuf encoding types in database', async () => {
      const now = Date.now() * 1000000
      
      // Create test data for JSON format
      const jsonData: SimpleOTLPData = {
        traces: [{
          traceId: 'format-test-json-456',
          spanId: 'format-test-json-span',
          operationName: 'format-comparison-test',
          startTime: now,
          serviceName: 'format-test-service-json',
          statusCode: 'STATUS_CODE_OK',
          attributes: {}
        }],
        timestamp: Date.now()
      }

      // Write JSON data
      await storage.writeOTLP(jsonData)

      // Also create a protobuf-style record directly for comparison
      const protobufRecord: DatabaseTraceRecord = {
        trace_id: 'format-test-protobuf-789',
        span_id: 'format-test-protobuf-span',
        parent_span_id: '',
        start_time: new Date(now / 1000000).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '.000000000'),
        end_time: new Date((now + 1000000) / 1000000).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '.000000000'),
        duration_ns: 1000000,
        service_name: 'format-test-service-protobuf',
        operation_name: 'format-comparison-test',
        span_kind: 'SPAN_KIND_INTERNAL',
        status_code: 'STATUS_CODE_OK',
        status_message: 'OK',
        trace_state: '',
        scope_name: '',
        scope_version: '',
        span_attributes: {},
        resource_attributes: { 'service.name': 'format-test-service-protobuf' },
        events: '[]',
        links: '[]',
        encoding_type: 'protobuf'
      }

      await storage.writeTracesToSimplifiedSchema([protobufRecord])

      // Query both and verify encoding types
      const query = `
        SELECT 
          service_name,
          encoding_type,
          COUNT(*) as count
        FROM traces 
        WHERE service_name LIKE 'format-test-service-%'
        GROUP BY service_name, encoding_type
        ORDER BY service_name
      `
      
      const result = await storage.queryWithResults(query)
      expect(result.data).toHaveLength(2)
      
      // Verify JSON service has encoding_type = 'json'
      const jsonRecord = result.data.find((r: any) => r.service_name === 'format-test-service-json')
      expect(jsonRecord).toBeDefined()
      expect(jsonRecord!.encoding_type).toBe('json')
      expect(Number(jsonRecord!.count)).toBe(1)
      
      // Verify protobuf service has encoding_type = 'protobuf'  
      const protobufRecord_result = result.data.find((r: any) => r.service_name === 'format-test-service-protobuf')
      expect(protobufRecord_result).toBeDefined()
      expect(protobufRecord_result!.encoding_type).toBe('protobuf')
      expect(Number(protobufRecord_result!.count)).toBe(1)
    })
  })
})