/**
 * Integration Tests for Service Topology Query Optimizations
 * Issue #161: Verify queries work correctly with real ClickHouse
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@clickhouse/client'
import type { ClickHouseClient } from '@clickhouse/client'
import { ArchitectureQueries, OptimizedQueries } from '../../queries.js'
import type { ServiceDependencyRaw, ServiceTopologyRaw, TraceFlowRaw } from '../../queries.js'

describe('Service Topology Queries Integration', () => {
  let client: ClickHouseClient

  beforeAll(async () => {
    // Create ClickHouse client with proper configuration
    client = createClient({
      url: `http://${process.env.CLICKHOUSE_HOST || 'localhost'}:${process.env.CLICKHOUSE_PORT || '8124'}`,
      username: process.env.CLICKHOUSE_USERNAME || 'otel',
      password: process.env.CLICKHOUSE_PASSWORD || 'otel123',
      database: process.env.CLICKHOUSE_DATABASE || 'otel',
      clickhouse_settings: {
        // Set default settings for all queries
        max_memory_usage: '4000000000', // 4GB default
        max_execution_time: 120 // 2 minutes default (as number)
      }
    })

    // Ensure traces table exists
    try {
      await client.query({
        query: `
          CREATE TABLE IF NOT EXISTS traces (
            trace_id String,
            span_id String,
            parent_span_id String,
            service_name String,
            operation_name String,
            start_time DateTime64(9),
            end_time DateTime64(9),
            duration_ns UInt64,
            span_kind String,
            status_code String,
            span_attributes Map(String, String),
            resource_attributes Map(String, String)
          ) ENGINE = MergeTree()
          ORDER BY (start_time, trace_id, span_id)
        `
      })
    } catch (error) {
      console.warn('Table creation failed (may already exist):', error)
    }
  })

  afterAll(async () => {
    await client.close()
  })

  describe('Query Syntax Validation', () => {
    it('should generate valid ClickHouse SQL for service dependencies', async () => {
      const query = ArchitectureQueries.getServiceDependencies(24)

      // Test that query is valid SQL by executing with LIMIT 0
      const testQuery = query.replace(/LIMIT \d+/, 'LIMIT 0')

      try {
        await client.query({ query: testQuery })
        expect(true).toBe(true) // Query is valid
      } catch (error) {
        console.error('Query validation failed:', error)
        throw error
      }
    })

    it('should generate valid ClickHouse SQL for service topology', async () => {
      const query = ArchitectureQueries.getServiceTopology(24)

      // Test that query is valid SQL by executing with LIMIT 0
      const testQuery = query.replace(/LIMIT \d+/, 'LIMIT 0')

      try {
        await client.query({ query: testQuery })
        expect(true).toBe(true) // Query is valid
      } catch (error) {
        console.error('Query validation failed:', error)
        throw error
      }
    })

    it('should generate valid ClickHouse SQL for trace flows', async () => {
      const query = ArchitectureQueries.getTraceFlows(100, 24)

      // Test that query is valid SQL by executing with LIMIT 0
      const testQuery = query.replace(/LIMIT \d+/, 'LIMIT 0')

      try {
        await client.query({ query: testQuery })
        expect(true).toBe(true) // Query is valid
      } catch (error) {
        console.error('Query validation failed:', error)
        throw error
      }
    })
  })

  describe('Query Execution with Test Data', () => {
    beforeAll(async () => {
      // Clear existing test data
      await client.query({ query: 'TRUNCATE TABLE IF EXISTS traces' })

      // Insert minimal test data using the proper ClickHouse client method
      const now = Date.now()
      const testData = [
        // Service A -> Service B (single call)
        {
          trace_id: 'trace-1',
          span_id: 'span-1a',
          parent_span_id: '',
          service_name: 'service-a',
          operation_name: 'operation-a',
          start_time: now * 1000000,
          end_time: (now + 100) * 1000000,
          duration_ns: 100000000,
          span_kind: 'SERVER',
          status_code: 'OK',
          span_attributes: {},
          resource_attributes: {}
        },
        {
          trace_id: 'trace-1',
          span_id: 'span-1b',
          parent_span_id: 'span-1a',
          service_name: 'service-b',
          operation_name: 'operation-b',
          start_time: (now + 10) * 1000000,
          end_time: (now + 90) * 1000000,
          duration_ns: 80000000,
          span_kind: 'CLIENT',
          status_code: 'OK',
          span_attributes: {},
          resource_attributes: {}
        },
        // Single-span trace
        {
          trace_id: 'trace-2',
          span_id: 'span-2',
          parent_span_id: '',
          service_name: 'service-c',
          operation_name: 'operation-c',
          start_time: now * 1000000,
          end_time: (now + 50) * 1000000,
          duration_ns: 50000000,
          span_kind: 'SERVER',
          status_code: 'OK',
          span_attributes: {},
          resource_attributes: {}
        }
      ]

      // Use the ClickHouse client's insert method
      await client.insert({
        table: 'traces',
        values: testData,
        format: 'JSONEachRow'
      })
    })

    it('should discover single-call dependencies', async () => {
      const query = ArchitectureQueries.getServiceDependencies(24)
      const result = await client.query({ query, format: 'JSONEachRow' })
      const dependencies = await result.json<ServiceDependencyRaw>()

      // Should find the single A->B dependency
      const singleCallDep = dependencies.find(
        d => d.service_name === 'service-a' && d.dependent_service === 'service-b'
      )
      expect(singleCallDep).toBeDefined()
      expect(Number(singleCallDep?.call_count)).toBe(1)
    })

    it('should include single-span services in topology', async () => {
      const query = ArchitectureQueries.getServiceTopology(24)
      const result = await client.query({ query, format: 'JSONEachRow' })
      const topology = await result.json<ServiceTopologyRaw>()

      // Should include service-c with single span
      const singleSpanService = topology.find(t => t.service_name === 'service-c')
      expect(singleSpanService).toBeDefined()
      expect(Number(singleSpanService?.total_spans)).toBe(1)
    })

    it('should include single-span traces in flows', async () => {
      const query = ArchitectureQueries.getTraceFlows(100, 24)
      const result = await client.query({ query, format: 'JSONEachRow' })
      const flows = await result.json<TraceFlowRaw>()

      // Should include trace-2 which has only one span
      const singleSpanTrace = flows.filter(f => f.trace_id === 'trace-2')
      expect(singleSpanTrace.length).toBe(1)
      expect(singleSpanTrace[0]?.service_name).toBe('service-c')
    })
  })

  describe('Memory Protection Validation', () => {
    it('should have memory limits in service dependencies query', () => {
      const query = ArchitectureQueries.getServiceDependencies(24)

      expect(query).toContain('max_memory_usage = 500000000')
      expect(query).toContain('max_execution_time = 30')
      expect(query).toContain('LIMIT 1000')
    })

    it('should have memory limits in service topology query', () => {
      const query = ArchitectureQueries.getServiceTopology(24)

      expect(query).toContain('max_memory_usage = 1000000000')
      expect(query).toContain('max_execution_time = 30')
      expect(query).toContain('LIMIT 500')
    })

    it('should avoid sampling in all queries', () => {
      const queries = [
        ArchitectureQueries.getServiceDependencies(24),
        ArchitectureQueries.getServiceTopology(24),
        ArchitectureQueries.getTraceFlows(100, 24),
        ArchitectureQueries.getRootServices(24),
        ArchitectureQueries.getLeafServices(24)
      ]

      queries.forEach(query => {
        // Should NOT have sampling
        expect(query).not.toContain('SAMPLE')
        expect(query).not.toContain('WHERE trace_id IN')

        // Should have inclusive HAVING clauses
        if (query.includes('HAVING')) {
          expect(query).toMatch(/HAVING .* >= 1/)
        }
      })
    })
  })

  describe('Aggregated Table Fallback', () => {
    it('should handle missing aggregated tables gracefully', async () => {
      // Try to query aggregated tables
      const aggregatedQuery = OptimizedQueries.getServiceDependenciesFromView(24)

      try {
        // This may fail if aggregated tables don't exist in test environment
        await client.query({ query: aggregatedQuery })

        // If it doesn't fail, aggregated tables exist - that's fine
        expect(true).toBe(true)
      } catch (error) {
        // Expected behavior - aggregated tables might not exist in test
        expect(error).toBeDefined()

        // Ensure raw queries still work as fallback
        const fallbackQuery = ArchitectureQueries.getServiceDependencies(24)
        const testQuery = fallbackQuery.replace(/LIMIT \d+/, 'LIMIT 0')

        try {
          await client.query({ query: testQuery })
          expect(true).toBe(true) // Fallback works
        } catch (fallbackError) {
          throw new Error(`Fallback query failed: ${fallbackError}`)
        }
      }
    })
  })
})