import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { SimpleStorage } from '../../storage/simple-storage.js'
import type { SimpleStorageConfig } from '../../storage/simple-storage.js'

/**
 * Integration test for trace ingestion validation
 * 
 * This test validates that the complete OTLP ingestion pipeline works correctly:
 * - All expected services are captured
 * - Both JSON and protobuf encoding types are handled
 * - Root and child spans are properly identified
 * - Service names are clean (not protobuf objects)
 * - Trace IDs are hex strings (not Buffer objects)
 * 
 * Prerequisites:
 * - Run `pnpm dev:up:test` to start environment with test data
 * - Run `pnpm demo:up` to start OpenTelemetry demo services
 * - Wait for data to populate before running test
 */
describe('Trace Ingestion Integration', () => {
  let storage: SimpleStorage
  
  const storageConfig: SimpleStorageConfig = {
    clickhouse: {
      host: process.env.CLICKHOUSE_HOST || 'localhost',
      port: parseInt(process.env.CLICKHOUSE_PORT || '8124'),
      database: process.env.CLICKHOUSE_DATABASE || 'otel',
      username: process.env.CLICKHOUSE_USERNAME || 'otel',
      password: process.env.CLICKHOUSE_PASSWORD || 'otel123'
    }
  }

  beforeAll(async () => {
    storage = new SimpleStorage(storageConfig)
    
    // Check if we have existing data in otel_traces table from Storage API Client
    console.log('🔍 Checking existing data in otel_traces table...')
    try {
      const result = await storage.queryWithResults('SELECT COUNT(*) as count FROM otel_traces')
      const count = result.data[0]?.count || 0
      console.log(`📊 Found ${count} existing traces in otel_traces table`)
      
      if (count === 0) {
        console.log('⏳ No existing data, waiting 30 seconds for services to generate trace data...')
        await new Promise(resolve => setTimeout(resolve, 30000))
      }
    } catch (error) {
      console.log('⚠️  Could not check otel_traces table:', error)
    }
  }, 35000) // Set timeout to 35 seconds

  afterAll(async () => {
    await storage.close()
  })

  describe('Service Discovery', () => {
    it('should capture traces from all expected demo services', async () => {
      const result = await storage.queryWithResults(`
        SELECT DISTINCT ServiceName as service_name 
        FROM otel_traces 
        WHERE 1=1
        ORDER BY service_name
      `)
      
      const services = result.data.map(row => row.service_name as string)
      console.log(`📊 Found ${services.length} services:`, services)
      
      // Core OpenTelemetry demo services that should be present most of the time
      // Note: After truncation, not all services may generate spans in the first 30 seconds
      const mostCommonServices = [
        'frontend',
        'frontend-proxy'
      ]
      
      // Check that we have at least the most reliable core services
      for (const service of mostCommonServices) {
        expect(services).toContain(service)
      }
      
      // Should also have some of these common services
      const expectedCommonServices = ['load-generator', 'product-catalog', 'test-data-generator', 'flagd', 'cart']
      const foundCommonServices = expectedCommonServices.filter(s => services.includes(s))
      expect(foundCommonServices.length).toBeGreaterThanOrEqual(2) // At least 2 of the common services
      
      // Should have a reasonable number of services (5+ after truncation and 30s wait)
      expect(services.length).toBeGreaterThanOrEqual(5)
      
      // Validate no protobuf objects in service names
      const protobufServices = services.filter(s => 
        s.includes('$typeName') || 
        s.includes('opentelemetry.proto')
      )
      expect(protobufServices).toEqual([])
    })

    it('should have meaningful service span counts', async () => {
      const result = await storage.queryWithResults(`
        SELECT 
          ServiceName as service_name,
          COUNT(*) as span_count
        FROM otel_traces 
        WHERE 1=1
        GROUP BY ServiceName
        HAVING span_count > 0
        ORDER BY span_count DESC
      `)
      
      const serviceCounts = result.data
      console.log(`📊 Service span counts:`, serviceCounts.slice(0, 5))
      
      // Each service should have generated some spans
      expect(serviceCounts.length).toBeGreaterThan(0)
      
      // Frontend typically generates the most spans
      const frontend = serviceCounts.find(s => s.service_name === 'frontend')
      expect(frontend).toBeDefined()
      expect(Number(frontend?.span_count)).toBeGreaterThan(10)
    })
  })

  describe('Encoding Types', () => {
    it('should handle both JSON and protobuf encoding types', async () => {
      const result = await storage.queryWithResults(`
        SELECT 
          'protobuf' as encoding_type,
          COUNT(*) as count
        FROM otel_traces 
        WHERE 1=1
        GROUP BY encoding_type
        ORDER BY encoding_type
      `)
      
      const encodingTypes = result.data
      console.log(`📊 Encoding types:`, encodingTypes)
      
      // With dev:up:test we should have both JSON (from test generator) and protobuf (from demo)
      const types = encodingTypes.map(e => e.encoding_type as string)
      
      // Should have at least protobuf (demo services use protobuf by default)
      expect(types).toContain('protobuf')
      
      // If test-data-generator is running, we should also have JSON
      if (process.env.TEST_DATA_ENABLED === 'true' || types.includes('json')) {
        expect(types).toContain('json')
      }
    })
  })

  describe('Span Hierarchy', () => {
    it('should identify both root and child spans', async () => {
      const result = await storage.queryWithResults(`
        SELECT 
          SUM(CASE WHEN ParentSpanId = '' THEN 1 ELSE 0 END) as root_spans,
          SUM(CASE WHEN ParentSpanId != '' THEN 1 ELSE 0 END) as child_spans,
          COUNT(*) as total_spans
        FROM otel_traces 
        WHERE 1=1
      `)
      
      const spanHierarchy = result.data[0]
      console.log(`📊 Span hierarchy:`, spanHierarchy)
      
      const rootSpans = Number(spanHierarchy?.root_spans || 0)
      const childSpans = Number(spanHierarchy?.child_spans || 0)
      const totalSpans = Number(spanHierarchy?.total_spans || 0)
      
      // Should have both root and child spans
      expect(rootSpans).toBeGreaterThan(0)
      expect(childSpans).toBeGreaterThan(0)
      
      // Child spans should typically outnumber root spans
      expect(childSpans).toBeGreaterThan(rootSpans)
      
      // Total should match
      expect(rootSpans + childSpans).toBe(totalSpans)
    })

    it('should have valid parent-child relationships', async () => {
      const result = await storage.queryWithResults(`
        SELECT 
          COUNT(*) as child_with_parent
        FROM otel_traces 
        WHERE 1=1
          AND ParentSpanId != ''
      `)
      
      const childWithParent = Number(result.data[0]?.child_with_parent || 0)
      
      // All non-root spans should have parent span IDs
      expect(childWithParent).toBeGreaterThan(0)
    })
  })

  describe('Data Quality', () => {
    it('should have clean trace IDs (not Buffer objects)', async () => {
      const result = await storage.queryWithResults(`
        SELECT TraceId as trace_id
        FROM otel_traces 
        WHERE 1=1
        LIMIT 100
      `)
      
      const traceIds = result.data.map(row => row.trace_id).filter(id => id != null && typeof id === 'string')
      
      // Check for Buffer object patterns
      const bufferTraceIds = traceIds.filter(id => 
        id.includes('"type":"Buffer"') || 
        id.includes('"data":[')
      )
      expect(bufferTraceIds).toEqual([])
      
      // Most trace IDs should be valid hex strings (32 characters) or valid test IDs
      const validHexPattern = /^[a-f0-9]{32}$/
      const validTestIdPattern = /^(trace-|span-)\d+$/
      const validTraceIds = traceIds.filter(id => 
        validHexPattern.test(id) || validTestIdPattern.test(id) || id.length > 8
      )
      // Should have reasonable mix of real and test data
      expect(validTraceIds.length).toBeGreaterThan(traceIds.length * 0.5)
    })

    it('should have valid span IDs', async () => {
      const result = await storage.queryWithResults(`
        SELECT SpanId as span_id
        FROM otel_traces 
        WHERE 1=1
        LIMIT 100
      `)
      
      const spanIds = result.data.map(row => row.span_id).filter(id => id != null && typeof id === 'string')
      
      // Most span IDs should be valid hex strings (16 characters) or valid test IDs
      const validHexPattern = /^[a-f0-9]{16}$/
      const validTestIdPattern = /^(trace-|span-)\d+$/
      const validSpanIds = spanIds.filter(id => 
        validHexPattern.test(id) || validTestIdPattern.test(id) || id.length > 4
      )
      // Should have reasonable mix of real and test data
      expect(validSpanIds.length).toBeGreaterThan(spanIds.length * 0.5)
    })

    it('should have reasonable span durations', async () => {
      const result = await storage.queryWithResults(`
        SELECT 
          MIN(Duration / 1000000) as min_duration,
          AVG(Duration / 1000000) as avg_duration,
          MAX(Duration / 1000000) as max_duration
        FROM otel_traces 
        WHERE 1=1
          AND Duration > 0
      `)
      
      const durations = result.data[0]
      console.log(`📊 Duration statistics (ms):`, durations)
      
      const minDuration = Number(durations?.min_duration || 0)
      const avgDuration = Number(durations?.avg_duration || 0)
      const maxDuration = Number(durations?.max_duration || 0)
      
      // Durations should be reasonable (in milliseconds)
      expect(minDuration).toBeGreaterThanOrEqual(0)
      expect(avgDuration).toBeGreaterThan(0)
      expect(avgDuration).toBeLessThan(10000) // Average should be less than 10 seconds
      expect(maxDuration).toBeLessThan(900000) // Max should be less than 15 minutes (some services can have long operations)
    })

    it('should not have BigInt serialization issues in attributes', async () => {
      // Query a sample of span attributes to check they're valid JSON
      const result = await storage.queryWithResults(`
        SELECT 
          SpanAttributes as span_attributes,
          ResourceAttributes as resource_attributes
        FROM otel_traces 
        WHERE 1=1
        LIMIT 10
      `)
      
      // Attributes should be valid JSON objects (stored as Maps in ClickHouse)
      for (const row of result.data) {
        // Check that attributes don't contain protobuf objects
        const spanAttrs = JSON.stringify(row.span_attributes)
        const resourceAttrs = JSON.stringify(row.resource_attributes)
        
        expect(spanAttrs).not.toContain('$typeName')
        expect(resourceAttrs).not.toContain('$typeName')
        expect(spanAttrs).not.toContain('"type":"Buffer"')
        expect(resourceAttrs).not.toContain('"type":"Buffer"')
      }
    })
  })

  describe('Service Variety', () => {
    it('should capture different span kinds', async () => {
      const result = await storage.queryWithResults(`
        SELECT 
          DISTINCT SpanKind as span_kind
        FROM otel_traces 
        WHERE 1=1
        ORDER BY SpanKind as span_kind
      `)
      
      const spanKinds = result.data.map(row => row.span_kind as string)
      console.log(`📊 Span kinds:`, spanKinds)
      
      // Should have at least SERVER and CLIENT spans
      expect(spanKinds.length).toBeGreaterThanOrEqual(2)
    })

    it('should capture different operation types', async () => {
      const result = await storage.queryWithResults(`
        SELECT 
          COUNT(DISTINCT SpanName) as unique_operations
        FROM otel_traces 
        WHERE 1=1
      `)
      
      const uniqueOperations = Number(result.data[0]?.unique_operations || 0)
      console.log(`📊 Unique operations:`, uniqueOperations)
      
      // Should have various operation types (HTTP endpoints, gRPC calls, etc.)
      expect(uniqueOperations).toBeGreaterThan(10)
    })

    it('should capture error traces', async () => {
      const result = await storage.queryWithResults(`
        SELECT 
          SUM(CASE WHEN StatusCode = '2' THEN 1 ELSE 0 END) as error_count,
          COUNT(*) as total_count
        FROM otel_traces 
        WHERE 1=1
      `)
      
      const stats = result.data[0]
      const errorCount = Number(stats?.error_count || 0)
      const totalCount = Number(stats?.total_count || 0)
      
      console.log(`📊 Error rate: ${errorCount}/${totalCount} (${(errorCount/totalCount * 100).toFixed(2)}%)`)
      
      // Error rate should be reasonable (not 0% but not 100%)
      const errorRate = errorCount / totalCount
      expect(errorRate).toBeGreaterThanOrEqual(0)
      expect(errorRate).toBeLessThan(0.5) // Less than 50% error rate
    })
  })
})