/**
 * Integration test suite for SimpleStorage class with TestContainers
 * These tests require Docker and take longer to run
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ClickHouseContainer, type StartedClickHouseContainer } from '@testcontainers/clickhouse'
import { SimpleStorage, type SimpleStorageConfig, type SimpleOTLPData } from './simple-storage.js'

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
    
    // Create the ai_traces_direct table for testing (used by writeOTLP method)
    await storage['client'].command({
      query: `
        CREATE TABLE IF NOT EXISTS ai_traces_direct (
          trace_id String,
          span_id String,
          parent_span_id String,
          operation_name LowCardinality(String),
          start_time DateTime64(9),
          end_time DateTime64(9),
          duration UInt64,
          service_name LowCardinality(String),
          service_version LowCardinality(String),
          status_code LowCardinality(String),
          status_message String,
          span_kind LowCardinality(String),
          attributes Map(String, String),
          resource_attributes Map(String, String)
        ) ENGINE = MergeTree()
        ORDER BY (service_name, start_time, trace_id)
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
          StatusCode UInt8,
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
          parentSpanId: '',
          operationName: 'integration-test-operation',
          startTime: now,
          endTime: now + 1000000, // 1ms later
          serviceName: 'integration-test-service',
          statusCode: 'STATUS_CODE_OK',
          statusMessage: 'OK',
          spanKind: 'SPAN_KIND_SERVER',
          attributes: { 'test.environment': 'integration', 'test.type': 'container' },
          resourceAttributes: { 'service.name': 'integration-test-service' }
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
            parentSpanId: index > 0 ? `bulk-span-${index - 1}` : '',
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
})