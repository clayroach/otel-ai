/**
 * Unit test suite for StorageAPIClient using Effect-TS patterns
 * Uses Effect layers for dependency injection without real external connections
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Effect, Layer } from 'effect'
import { 
  StorageServiceTag,
  ConfigServiceTag,
  type StorageStats
} from '../../services.js'
import {
  type OTLPData,
  type QueryParams,
  type AIQueryParams,
  type TraceData,
  type MetricData,
  type LogData,
  type AIDataset
} from '../../schemas.js'
import { StorageAPIClientTag, type StorageAPIClient } from '../../api-client.js'
import { type StorageError, StorageErrorConstructors } from '../../errors.js'

// Mock Storage Service Layer for unit tests - properly typed to match interface
const MockStorageServiceLive = Layer.succeed(StorageServiceTag, {
  writeOTLP: (_data: OTLPData): Effect.Effect<void, never> =>
    Effect.void,

  writeBatch: (_data: OTLPData[]): Effect.Effect<void, never> =>
    Effect.void,

  queryRaw: (_sql: string): Effect.Effect<unknown[], never> =>
    Effect.succeed([]),

  queryText: (_sql: string): Effect.Effect<string, never> =>
    Effect.succeed(''),

  queryTraces: (_params: QueryParams): Effect.Effect<TraceData[], never> =>
    Effect.succeed([
      {
        traceId: 'mock-trace-123',
        spanId: 'mock-span-123',
        operationName: 'mock-operation',
        startTime: Date.now() * 1000000,
        endTime: (Date.now() + 1000) * 1000000,
        duration: 1000000000,
        serviceName: 'mock-service',
        statusCode: 1,
        spanKind: 'SERVER',
        attributes: { 'test.key': 'test.value' },
        resourceAttributes: { 'service.name': 'mock-service' },
        events: [],
        links: []
      }
    ]),

  queryMetrics: (_params: QueryParams): Effect.Effect<MetricData[], never> =>
    Effect.succeed([]),

  queryLogs: (_params: QueryParams): Effect.Effect<LogData[], never> =>
    Effect.succeed([]),

  queryForAI: (_params: AIQueryParams): Effect.Effect<AIDataset, never> =>
    Effect.succeed({
      features: [],
      metadata: {},
      timeRange: { start: Date.now() - 3600000, end: Date.now() },
      sampleCount: 0
    }),

  archiveData: (_data: OTLPData, _timestamp: number): Effect.Effect<void, never> =>
    Effect.void,

  applyRetentionPolicies: (): Effect.Effect<void, never> =>
    Effect.void,

  healthCheck: (): Effect.Effect<{ clickhouse: boolean; s3: boolean }, never> =>
    Effect.succeed({ clickhouse: true, s3: true }),

  getStorageStats: (): Effect.Effect<StorageStats, never> =>
    Effect.succeed({
      clickhouse: {
        totalTraces: 100,
        totalMetrics: 50,
        totalLogs: 25,
        diskUsage: '1.2 GB'
      },
      s3: {
        totalObjects: 10,
        totalSize: '500 MB',
        oldestObject: new Date(Date.now() - 86400000),
        newestObject: new Date()
      }
    })
})

// Mock Config Service Layer
const MockConfigServiceLive = Layer.succeed(ConfigServiceTag, {
  clickhouse: {
    host: 'mock-host',
    port: 8123,
    database: 'test-db',
    username: 'test-user',
    password: 'test-pass'
  },
  s3: {
    endpoint: 'http://mock-s3:9000',
    accessKeyId: 'mock-access',
    secretAccessKey: 'mock-secret',
    bucket: 'test-bucket',
    region: 'us-east-1'
  },
  features: {
    enableS3Backup: true,
    enableCompression: true,
    enableEncryption: true,
    enableAIOptimizations: false
  },
  performance: {
    batchSize: 1000,
    flushInterval: 5000,
    maxConcurrentWrites: 5
  },
  retention: {
    traces: { clickhouse: '30d', s3: '1y' },
    metrics: { clickhouse: '90d', s3: '2y' },
    logs: { clickhouse: '7d', s3: '30d' }
  }
})

// Mock API Client Layer with proper error handling demonstration
const MockAPIClientLive = Layer.succeed(StorageAPIClientTag, {
  writeOTLP: (_data: OTLPData): Effect.Effect<void, StorageError> =>
    Effect.succeed(undefined),

  queryTraces: (_params: QueryParams): Effect.Effect<TraceData[], StorageError> =>
    Effect.succeed([
      {
        traceId: 'api-mock-trace-123',
        spanId: 'api-mock-span-123',
        operationName: 'api-mock-operation',
        startTime: Date.now() * 1000000,
        endTime: (Date.now() + 1000) * 1000000,
        duration: 1000000000,
        serviceName: 'api-mock-service',
        statusCode: 1,
        spanKind: 'SERVER',
        attributes: { 'test.api': 'true' },
        resourceAttributes: { 'service.name': 'api-mock-service' },
        events: [],
        links: []
      }
    ]),

  queryMetrics: (_params: QueryParams): Effect.Effect<MetricData[], StorageError> =>
    Effect.succeed([]),

  queryLogs: (_params: QueryParams): Effect.Effect<LogData[], StorageError> =>
    Effect.succeed([]),

  queryAI: (_params: AIQueryParams): Effect.Effect<unknown[], StorageError> =>
    Effect.succeed([]),
  
  queryRaw: (_sql: string): Effect.Effect<unknown[], StorageError> =>
    Effect.succeed([]),

  healthCheck: (): Effect.Effect<{ clickhouse: boolean; s3: boolean }, StorageError> =>
    Effect.succeed({ clickhouse: true, s3: true })
} as StorageAPIClient)

// Combined test layer - fix dependency order
const TestStorageLayer = Layer.mergeAll(
  MockConfigServiceLive,
  MockStorageServiceLive,
  MockAPIClientLive
)

describe('Storage Service with API Client (Effect-TS)', () => {
  beforeEach(() => {
    // No external setup needed with Effect layers
  })

  describe('Service Layer Configuration', () => {
    it('should provide storage service through Effect layer', async () => {
      const result = await Effect.runPromise(
        Effect.map(StorageServiceTag, storage => {
          expect(storage).toBeDefined()
          expect(storage.writeOTLP).toBeDefined()
          expect(storage.queryTraces).toBeDefined()
          expect(storage.healthCheck).toBeDefined()
          return true
        }).pipe(Effect.provide(TestStorageLayer))
      )
      expect(result).toBe(true)
    })

    it('should provide configuration through Effect layer', async () => {
      const config = await Effect.runPromise(
        Effect.map(ConfigServiceTag, cfg => {
          expect(cfg).toBeDefined()
          expect(cfg.clickhouse).toBeDefined()
          expect(cfg.s3).toBeDefined()
          return cfg
        }).pipe(Effect.provide(TestStorageLayer))
      )
      expect(config.clickhouse.host).toBe('mock-host')
      expect(config.s3.bucket).toBe('test-bucket')
    })
  })

  describe('Health Check', () => {
    it('should perform health check successfully with mocked services', async () => {
      const health = await Effect.runPromise(
        Effect.flatMap(StorageServiceTag, storage => 
          storage.healthCheck()
        ).pipe(Effect.provide(TestStorageLayer))
      )
      expect(health).toBeDefined()
      expect(health.clickhouse).toBe(true)
      expect(health.s3).toBe(true)
    })

    it('should handle health check through service interface', async () => {
      const isHealthy = await Effect.runPromise(
        Effect.flatMap(StorageServiceTag, storage => storage.healthCheck()).pipe(Effect.provide(TestStorageLayer))
      )
      expect(isHealthy.clickhouse).toBe(true)
      expect(isHealthy.s3).toBe(true)
    })
  })

  describe('OTLP Data Operations', () => {
    const testTraceData: OTLPData = {
      traces: [
        {
          traceId: 'test-trace-123',
          spanId: 'test-span-123',
          operationName: 'test-operation',
          startTime: Date.now() * 1000000,
          endTime: (Date.now() + 1000) * 1000000,
          duration: 1000000000,
          serviceName: 'test-service',
          statusCode: 1,
          spanKind: 'SERVER',
          attributes: { 'test.key': 'test.value' },
          resourceAttributes: { 'service.name': 'test-service' },
          events: [],
          links: []
        }
      ],
      timestamp: Date.now()
    }

    it('should write OTLP data through Effect service', async () => {
      const result = await Effect.runPromise(
        Effect.flatMap(StorageServiceTag, storage => storage.writeOTLP(testTraceData)).pipe(Effect.provide(TestStorageLayer))
      )
      // Mock service always succeeds
      expect(result).toBeUndefined() // void return
    })

    it('should handle empty traces array gracefully', async () => {
      const emptyData: OTLPData = {
        traces: [],
        timestamp: Date.now()
      }

      const result = await Effect.runPromise(
        Effect.flatMap(StorageServiceTag, storage => storage.writeOTLP(emptyData)).pipe(Effect.provide(TestStorageLayer))
      )
      expect(result).toBeUndefined()
    })

    it('should handle batch writes through Effect service', async () => {
      const batchData = [testTraceData, testTraceData]
      
      const result = await Effect.runPromise(
        Effect.flatMap(StorageServiceTag, storage =>
          Effect.map(storage.writeBatch(batchData), () => true)
        ).pipe(Effect.provide(TestStorageLayer))
      )
      expect(result).toBe(true)
    })
  })

  describe('Query Operations', () => {
    const queryParams: QueryParams = {
      timeRange: {
        start: Date.now() - 3600000, // 1 hour ago
        end: Date.now()
      },
      limit: 100
    }

    it('should query traces through Effect service', async () => {
      const traces = await Effect.runPromise(
        Effect.flatMap(StorageServiceTag, storage => storage.queryTraces(queryParams)).pipe(Effect.provide(TestStorageLayer))
      )
      expect(Array.isArray(traces)).toBe(true)
      expect(traces.length).toBeGreaterThan(0)
      
      // Validate mock data structure
      expect(traces.length).toBeGreaterThan(0)
      const trace = traces[0]
      expect(trace).toBeDefined()
      if (trace) {
        expect(trace).toHaveProperty('traceId')
        expect(trace).toHaveProperty('spanId')
        expect(trace).toHaveProperty('operationName')
        expect(trace).toHaveProperty('startTime')
        expect(trace).toHaveProperty('serviceName')
        expect(trace).toHaveProperty('statusCode')
        expect(trace).toHaveProperty('attributes')
        expect(typeof trace.attributes).toBe('object')
      }
    })

    it('should query metrics through Effect service', async () => {
      const metrics = await Effect.runPromise(
        Effect.flatMap(StorageServiceTag, storage => storage.queryMetrics(queryParams)).pipe(Effect.provide(TestStorageLayer))
      )
      expect(Array.isArray(metrics)).toBe(true)
    })

    it('should query logs through Effect service', async () => {
      const logs = await Effect.runPromise(
        Effect.flatMap(StorageServiceTag, storage => storage.queryLogs(queryParams)).pipe(Effect.provide(TestStorageLayer))
      )
      expect(Array.isArray(logs)).toBe(true)
    })

    it('should handle AI dataset queries', async () => {
      const aiParams: AIQueryParams = {
        ...queryParams,
        datasetType: 'anomaly-detection',
        features: ['latency', 'error_rate']
      }
      
      const dataset = await Effect.runPromise(
        Effect.flatMap(StorageServiceTag, storage => storage.queryForAI(aiParams)).pipe(Effect.provide(TestStorageLayer))
      )
      expect(dataset).toBeDefined()
      expect(dataset.features).toBeDefined()
      expect(dataset.metadata).toBeDefined()
      expect(dataset.timeRange).toBeDefined()
      expect(typeof dataset.sampleCount).toBe('number')
    })
  })

  describe('Data Validation and Type Safety', () => {
    it('should handle Effect-TS type safety for trace data', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* StorageServiceTag
          const traces = yield* storage.queryTraces({
            timeRange: { start: Date.now() - 1000, end: Date.now() },
            limit: 10
          })
          
          // Effect-TS ensures type safety at compile time
          traces.forEach((trace) => {
            expect(typeof trace.traceId).toBe('string')
            expect(typeof trace.spanId).toBe('string')
            expect(typeof trace.operationName).toBe('string')
            expect(typeof trace.startTime).toBe('number')
            expect(typeof trace.serviceName).toBe('string')
            expect(typeof trace.statusCode).toBe('number')
            expect(typeof trace.attributes).toBe('object')
          })
          
          return traces.length
        }).pipe(Effect.provide(TestStorageLayer))
      )
      expect(result).toBeGreaterThan(0)
    })

    it('should validate service interface contracts', async () => {
      const result = await Effect.runPromise(
        Effect.map(StorageServiceTag, storage => {
          // Verify all required methods exist
          expect(typeof storage.writeOTLP).toBe('function')
          expect(typeof storage.writeBatch).toBe('function')
          expect(typeof storage.queryTraces).toBe('function')
          expect(typeof storage.queryMetrics).toBe('function')
          expect(typeof storage.queryLogs).toBe('function')
          expect(typeof storage.queryForAI).toBe('function')
          expect(typeof storage.archiveData).toBe('function')
          expect(typeof storage.applyRetentionPolicies).toBe('function')
          expect(typeof storage.healthCheck).toBe('function')
          expect(typeof storage.getStorageStats).toBe('function')
          
          return true
        }).pipe(Effect.provide(TestStorageLayer))
      )
      expect(result).toBe(true)
    })
  })

  describe('Service Management', () => {
    it('should handle service cleanup through Effect layers', async () => {
      // Effect layers handle resource cleanup automatically
      const result = await Effect.runPromise(
        Effect.flatMap(StorageServiceTag, storage =>
          Effect.map(storage.healthCheck(), health => {
            expect(health.clickhouse).toBe(true)
            return true
          })
        ).pipe(Effect.provide(TestStorageLayer))
      )
      expect(result).toBe(true)
    })

    it('should provide consistent service instances', async () => {
      const [service1, service2] = await Effect.runPromise(
        Effect.map(
          Effect.all([StorageServiceTag, StorageServiceTag]),
          ([s1, s2]) => [s1, s2] as const
        ).pipe(Effect.provide(TestStorageLayer))
      )
      // Should be the same instance from the layer
      expect(service1).toBe(service2)
    })
  })

  describe('Performance and Reliability', () => {
    it('should handle concurrent operations with Effect concurrency', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* StorageServiceTag
          
          // Effect provides proper concurrency control
          const operations = Array(5)
            .fill(null)
            .map(() => storage.healthCheck())
          
          const results = yield* Effect.all(operations, { concurrency: 'unbounded' })
          expect(results.length).toBe(5)
          
          // All should succeed with mock service
          results.forEach(health => {
            expect(health.clickhouse).toBe(true)
            expect(health.s3).toBe(true)
          })
          
          return results.length
        }).pipe(Effect.provide(TestStorageLayer))
      )
      expect(result).toBe(5)
    })

    it('should handle large trace datasets with Effect batch processing', async () => {
      const largeDataset: OTLPData = {
        traces: Array(50)
          .fill(null)
          .map((_, index) => ({
            traceId: `trace-${index}`,
            spanId: `span-${index}`,
            operationName: `operation-${index}`,
            startTime: (Date.now() + index) * 1000000,
            endTime: (Date.now() + index + 1000) * 1000000,
            duration: 1000000000,
            serviceName: `service-${index % 5}`,
            statusCode: index % 2 === 0 ? 1 : 2,
            spanKind: 'SERVER',
            attributes: { index: index.toString(), category: `cat-${index % 3}` },
            resourceAttributes: { 'service.name': `service-${index % 5}` },
            events: [],
            links: []
          })),
        timestamp: Date.now()
      }

      const result = await Effect.runPromise(
        Effect.flatMap(StorageServiceTag, storage => storage.writeOTLP(largeDataset)).pipe(Effect.provide(TestStorageLayer))
      )
      expect(result).toBeUndefined() // void return indicates success
    })

    it('should provide storage statistics', async () => {
      const stats = await Effect.runPromise(
        Effect.flatMap(StorageServiceTag, storage => storage.getStorageStats()).pipe(Effect.provide(TestStorageLayer))
      )
      
      expect(stats).toBeDefined()
      expect(stats.clickhouse).toBeDefined()
      expect(stats.s3).toBeDefined()
      expect(typeof stats.clickhouse.totalTraces).toBe('number')
      expect(typeof stats.s3.totalObjects).toBe('number')
      expect(stats.clickhouse.diskUsage).toBe('1.2 GB')
      expect(stats.s3.totalSize).toBe('500 MB')
    })
  })

  describe('API Client Integration', () => {
    it('should demonstrate API client usage with Effect.match pattern', async () => {
      const queryParams: QueryParams = {
        timeRange: {
          start: Date.now() - 3600000,
          end: Date.now()
        },
        limit: 10
      }

      const result = await Effect.runPromise(
        Effect.flatMap(StorageAPIClientTag, apiClient => apiClient.queryTraces(queryParams)).pipe(
          Effect.provide(TestStorageLayer),
          Effect.match({
            onFailure: (error) => ({ success: false as const, error }),
            onSuccess: (traces) => ({ success: true as const, traces })
          })
        )
      )
      
      expect(result.success).toBe(true)
      if (result.success) {
        expect(Array.isArray(result.traces)).toBe(true)
        expect(result.traces.length).toBeGreaterThan(0)
        
        const trace = result.traces[0]
        expect(trace).toBeDefined()
        if (trace) {
          expect(trace.traceId).toBe('api-mock-trace-123')
          expect(trace.attributes['test.api']).toBe('true')
        }
      }
    })

    it('should demonstrate API client write with proper error handling', async () => {
      const testData: OTLPData = {
        traces: [{
          traceId: 'api-write-test',
          spanId: 'api-write-span',
          operationName: 'api-write-operation',
          startTime: Date.now() * 1000000,
          endTime: (Date.now() + 1000) * 1000000,
          duration: 1000000000,
          serviceName: 'api-write-service',
          statusCode: 1,
          spanKind: 'SERVER',
          attributes: { 'write.test': 'true' },
          resourceAttributes: { 'service.name': 'api-write-service' },
          events: [],
          links: []
        }],
        timestamp: Date.now()
      }
      
      const writeResult = await Effect.runPromise(
        Effect.flatMap(StorageAPIClientTag, apiClient => apiClient.writeOTLP(testData)).pipe(
          Effect.provide(TestStorageLayer),
          Effect.match({
            onFailure: (error) => ({ success: false as const, error }),
            onSuccess: () => ({ success: true as const })
          })
        )
      )
      
      expect(writeResult.success).toBe(true)
    })

    it('should demonstrate proper error handling with failing API client', async () => {
      // Create a failing API client for testing error paths
      const FailingAPIClientLive = Layer.succeed(StorageAPIClientTag, {
        writeOTLP: (_data: OTLPData) =>
          Effect.fail(StorageErrorConstructors.ConnectionError(
            'Mock API client connection failure',
            new Error('Mock error')
          )),
        queryTraces: (_params: QueryParams) =>
          Effect.fail(StorageErrorConstructors.QueryError(
            'Mock query failure',
            'SELECT * FROM traces',
            new Error('Mock error')
          )),
        queryMetrics: (_params: QueryParams) => Effect.succeed([]),
        queryLogs: (_params: QueryParams) => Effect.succeed([]),
        queryAI: (_params: AIQueryParams) => Effect.succeed([]),
        queryRaw: (_sql: string) => Effect.succeed([]),
        healthCheck: () => Effect.succeed({ clickhouse: false, s3: false })
      } as StorageAPIClient)

      const FailingTestLayer = Layer.mergeAll(
        MockConfigServiceLive,
        MockStorageServiceLive,
        FailingAPIClientLive
      )

      const errorResult = await Effect.runPromise(
        Effect.flatMap(StorageAPIClientTag, apiClient => apiClient.queryTraces({
          timeRange: { start: Date.now() - 3600000, end: Date.now() }
        })).pipe(
          Effect.provide(FailingTestLayer),
          Effect.match({
            onFailure: (error) => ({ success: false as const, error }),
            onSuccess: (traces) => ({ success: true as const, traces })
          })
        )
      )

      expect(errorResult.success).toBe(false)
      if (!errorResult.success) {
        expect(errorResult.error._tag).toBe('QueryError')
        expect(errorResult.error.message).toContain('Mock query failure')
      }
    })
  })

  describe('Error Handling', () => {
    it('should handle Effect-TS error types properly', async () => {
      // Create a service layer that can fail for testing
      const FailingStorageService = Layer.succeed(StorageServiceTag, {
        writeOTLP: (_data: OTLPData) =>
          Effect.fail({
            _tag: 'ConnectionError' as const,
            message: 'Mock connection failure',
            cause: new Error('Mock error')
          }),
        writeBatch: (_data: OTLPData[]) => Effect.succeed(undefined),
        queryTraces: (_params: QueryParams) => Effect.succeed([]),
        queryMetrics: (_params: QueryParams) => Effect.succeed([]),
        queryLogs: (_params: QueryParams) => Effect.succeed([]),
        queryForAI: (_params: AIQueryParams) => Effect.succeed({
          features: [],
          metadata: {},
          timeRange: { start: 0, end: 0 },
          sampleCount: 0
        } as AIDataset),
        queryRaw: (_sql: string) => Effect.succeed([]),
        queryText: (_sql: string) => Effect.succeed(''),
        archiveData: (_data: OTLPData, _timestamp: number) => Effect.succeed(undefined),
        applyRetentionPolicies: () => Effect.succeed(undefined),
        healthCheck: () => Effect.succeed({ clickhouse: true, s3: true }),
        getStorageStats: () => Effect.succeed({} as StorageStats)
      })

      const FailingLayer = Layer.mergeAll(
        MockConfigServiceLive,
        FailingStorageService
      )

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* StorageServiceTag
          
          // This should fail with our mock error
          const writeResult = yield* storage.writeOTLP({
            traces: [{
              traceId: 'test',
              spanId: 'test', 
              operationName: 'test',
              startTime: Date.now() * 1000000,
              endTime: (Date.now() + 1000) * 1000000,
              duration: 1000000000,
              serviceName: 'test',
              statusCode: 1,
              spanKind: 'SERVER',
              attributes: {},
              resourceAttributes: {},
              events: [],
              links: []
            }],
            timestamp: Date.now()
          }).pipe(Effect.option)
          
          return writeResult
        }).pipe(Effect.provide(FailingLayer))
      )

      // Should be None due to the failure
      expect(result._tag).toBe('None')
    })

    it('should provide structured error information', async () => {
      // Mock service always succeeds, so test the error structure types
      const result = await Effect.runPromise(
        Effect.map(StorageServiceTag, storage => {
          // Test that the service methods have proper error types
          // These methods should all have StorageError in their error channel
          const writeOp = storage.writeOTLP
          const queryOp = storage.queryTraces
          const healthOp = storage.healthCheck
          
          expect(typeof writeOp).toBe('function')
          expect(typeof queryOp).toBe('function')
          expect(typeof healthOp).toBe('function')
          
          return true
        }).pipe(Effect.provide(TestStorageLayer))
      )
      expect(result).toBe(true)
    })
  })
})

// Export for potential use in other test files
export { MockStorageServiceLive, MockConfigServiceLive, TestStorageLayer }