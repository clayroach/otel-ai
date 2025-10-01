/**
 * Storage Package Test Utilities
 *
 * Shared mock Layer utilities for testing storage functionality across packages.
 * Follows Effect-TS Layer-only export pattern for consistency.
 */

import { Effect, Layer } from 'effect'
import {
  StorageServiceTag,
  ConfigServiceTag,
  type StorageService,
  type StorageStats
} from './services.js'
import { StorageAPIClientTag, ClickHouseConfigTag, type StorageAPIClient } from './api-client.js'
import {
  type OTLPData,
  type QueryParams,
  type AIQueryParams,
  type TraceData,
  type MetricData,
  type LogData,
  type AIDataset
} from './schemas.js'
import { type StorageConfig } from './config.js'
import { type StorageError } from './errors.js'
import { StorageErrorConstructors } from './errors.js'

// ============================================================================
// Mock Configuration Data
// ============================================================================

export const mockClickHouseConfig = {
  host: 'mock-clickhouse',
  port: 8123,
  database: 'test-otel',
  username: 'test-user',
  password: 'test-pass'
}

export const mockStorageConfig: StorageConfig = {
  clickhouse: mockClickHouseConfig,
  s3: {
    endpoint: 'http://mock-s3:9000',
    accessKeyId: 'mock-access-key',
    secretAccessKey: 'mock-secret-key',
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
}

// ============================================================================
// Test Data Factories
// ============================================================================

export const createMockTraceData = (overrides: Partial<TraceData> = {}): TraceData => ({
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
  links: [],
  ...overrides
})

export const createMockOTLPData = (overrides: Partial<OTLPData> = {}): OTLPData => ({
  traces: [createMockTraceData()],
  timestamp: Date.now(),
  ...overrides
})

export const createMockQueryParams = (overrides: Partial<QueryParams> = {}): QueryParams => ({
  timeRange: {
    start: Date.now() - 3600000, // 1 hour ago
    end: Date.now()
  },
  limit: 100,
  ...overrides
})

export const createMockAIQueryParams = (overrides: Partial<AIQueryParams> = {}): AIQueryParams => ({
  ...createMockQueryParams(),
  datasetType: 'anomaly-detection',
  features: ['latency', 'error_rate'],
  ...overrides
})

export const createMockStorageStats = (overrides: Partial<StorageStats> = {}): StorageStats => ({
  clickhouse: {
    totalTraces: 1000,
    totalMetrics: 500,
    totalLogs: 250,
    diskUsage: '1.2 GB',
    ...overrides.clickhouse
  },
  s3: {
    totalObjects: 10,
    totalSize: '500 MB',
    oldestObject: new Date(Date.now() - 86400000),
    newestObject: new Date(),
    ...overrides.s3
  }
})

// ============================================================================
// Mock Layer Options
// ============================================================================

export interface MockStorageServiceOptions {
  shouldFailWrite?: boolean
  shouldFailQuery?: boolean
  shouldFailHealth?: boolean
  customTraceData?: TraceData[]
  customMetricData?: MetricData[]
  customLogData?: LogData[]
  customAIDataset?: AIDataset
  customRawQueryResponse?: unknown[]
  customError?: StorageError
}

export interface MockAPIClientOptions {
  shouldFailWrite?: boolean
  shouldFailQuery?: boolean
  shouldFailHealth?: boolean
  customResponses?: {
    traces?: TraceData[]
    metrics?: MetricData[]
    logs?: LogData[]
    rawQuery?: unknown[]
  }
  customError?: StorageError
}

// ============================================================================
// Mock Layer Implementations
// ============================================================================

/**
 * Configurable Mock Storage Service Layer
 * Use this for unit tests that need to control storage behavior
 */
export const createMockStorageServiceLive = (
  options: MockStorageServiceOptions = {}
): Layer.Layer<StorageServiceTag, never, never> => {
  const {
    shouldFailWrite = false,
    shouldFailQuery = false,
    shouldFailHealth = false,
    customTraceData = [createMockTraceData()],
    customMetricData = [],
    customLogData = [],
    customAIDataset = {
      features: [],
      metadata: {},
      timeRange: { start: Date.now() - 3600000, end: Date.now() },
      sampleCount: 0
    },
    customRawQueryResponse = [],
    customError = StorageErrorConstructors.ConnectionError('Mock error', new Error('Mock'))
  } = options

  return Layer.succeed(StorageServiceTag, {
    writeOTLP: (_data: OTLPData): Effect.Effect<void, StorageError> =>
      shouldFailWrite ? Effect.fail(customError) : Effect.void,

    writeBatch: (_data: OTLPData[]): Effect.Effect<void, StorageError> =>
      shouldFailWrite ? Effect.fail(customError) : Effect.void,

    queryTraces: (_params: QueryParams): Effect.Effect<TraceData[], StorageError> =>
      shouldFailQuery ? Effect.fail(customError) : Effect.succeed(customTraceData),

    queryMetrics: (_params: QueryParams): Effect.Effect<MetricData[], StorageError> =>
      shouldFailQuery ? Effect.fail(customError) : Effect.succeed(customMetricData),

    queryLogs: (_params: QueryParams): Effect.Effect<LogData[], StorageError> =>
      shouldFailQuery ? Effect.fail(customError) : Effect.succeed(customLogData),

    queryForAI: (_params: AIQueryParams): Effect.Effect<AIDataset, StorageError> =>
      shouldFailQuery ? Effect.fail(customError) : Effect.succeed(customAIDataset),

    queryRaw: (_sql: string): Effect.Effect<unknown[], StorageError> =>
      shouldFailQuery ? Effect.fail(customError) : Effect.succeed(customRawQueryResponse),

    queryText: (_sql: string): Effect.Effect<string, StorageError> =>
      shouldFailQuery ? Effect.fail(customError) : Effect.succeed(''),

    insertRaw: (_sql: string): Effect.Effect<void, StorageError> =>
      shouldFailWrite ? Effect.fail(customError) : Effect.succeed(undefined),

    archiveData: (_data: OTLPData, _timestamp: number): Effect.Effect<void, StorageError> =>
      shouldFailWrite ? Effect.fail(customError) : Effect.void,

    applyRetentionPolicies: (): Effect.Effect<void, StorageError> =>
      shouldFailWrite ? Effect.fail(customError) : Effect.void,

    healthCheck: (): Effect.Effect<{ clickhouse: boolean; s3: boolean }, StorageError> =>
      shouldFailHealth ? Effect.fail(customError) : Effect.succeed({ clickhouse: true, s3: true }),

    getStorageStats: (): Effect.Effect<StorageStats, StorageError> =>
      shouldFailQuery ? Effect.fail(customError) : Effect.succeed(createMockStorageStats()),

    createValidationTables: (): Effect.Effect<void, StorageError> =>
      shouldFailWrite ? Effect.fail(customError) : Effect.void
  } satisfies StorageService)
}

/**
 * Standard Mock Storage Service Layer
 * Use this for most unit tests that just need working storage mocks
 */
export const MockStorageServiceLive = createMockStorageServiceLive()

/**
 * Mock Configuration Service Layer
 * Provides test-friendly configuration values
 */
export const MockConfigServiceLive = Layer.succeed(ConfigServiceTag, mockStorageConfig)

/**
 * Mock ClickHouse Config Layer
 * For tests that need ClickHouse-specific configuration
 */
export const MockClickHouseConfigLive = Layer.succeed(ClickHouseConfigTag, mockClickHouseConfig)

/**
 * Configurable Mock Storage API Client Layer
 * Use this for integration tests that need to control API client behavior
 */
export const createMockStorageAPIClientLive = (
  options: MockAPIClientOptions = {}
): Layer.Layer<StorageAPIClientTag, never, never> => {
  const {
    shouldFailWrite = false,
    shouldFailQuery = false,
    shouldFailHealth = false,
    customResponses = {},
    customError = StorageErrorConstructors.ConnectionError('Mock API error', new Error('Mock'))
  } = options

  const {
    traces = [
      createMockTraceData({ traceId: 'api-mock-trace-123', attributes: { 'test.api': 'true' } })
    ],
    metrics = [],
    logs = [],
    rawQuery = []
  } = customResponses

  return Layer.succeed(StorageAPIClientTag, {
    writeOTLP: (
      _data: OTLPData,
      _encodingType?: 'protobuf' | 'json'
    ): Effect.Effect<void, StorageError> =>
      shouldFailWrite ? Effect.fail(customError) : Effect.succeed(undefined),

    queryTraces: (_params: QueryParams): Effect.Effect<TraceData[], StorageError> =>
      shouldFailQuery ? Effect.fail(customError) : Effect.succeed(traces),

    queryMetrics: (_params: QueryParams): Effect.Effect<MetricData[], StorageError> =>
      shouldFailQuery ? Effect.fail(customError) : Effect.succeed(metrics),

    queryLogs: (_params: QueryParams): Effect.Effect<LogData[], StorageError> =>
      shouldFailQuery ? Effect.fail(customError) : Effect.succeed(logs),

    queryAI: (_params: AIQueryParams): Effect.Effect<readonly unknown[], StorageError> =>
      shouldFailQuery ? Effect.fail(customError) : Effect.succeed(rawQuery),

    queryRaw: (_sql: string): Effect.Effect<unknown[], StorageError> =>
      shouldFailQuery ? Effect.fail(customError) : Effect.succeed(rawQuery),

    insertRaw: (_sql: string): Effect.Effect<void, StorageError> =>
      shouldFailWrite ? Effect.fail(customError) : Effect.succeed(undefined),

    healthCheck: (): Effect.Effect<{ clickhouse: boolean; s3: boolean }, StorageError> =>
      shouldFailHealth ? Effect.fail(customError) : Effect.succeed({ clickhouse: true, s3: true })
  } satisfies StorageAPIClient)
}

/**
 * Standard Mock Storage API Client Layer
 * Use this for most integration tests that just need working API client mocks
 */
export const MockStorageAPIClientLive = createMockStorageAPIClientLive()

/**
 * Pre-composed Test Layer with all storage dependencies
 * Use this for comprehensive tests that need all storage components
 */
export const TestStorageLayer = Layer.mergeAll(
  MockConfigServiceLive,
  MockStorageServiceLive,
  MockStorageAPIClientLive,
  MockClickHouseConfigLive
)

/**
 * Failing Test Layer for error testing
 * Use this to test error handling and failure scenarios
 */
export const FailingTestStorageLayer = Layer.mergeAll(
  MockConfigServiceLive,
  createMockStorageServiceLive({
    shouldFailWrite: true,
    shouldFailQuery: true,
    customError: StorageErrorConstructors.QueryError(
      'Test failure',
      'SELECT * FROM test',
      new Error('Mock')
    )
  }),
  createMockStorageAPIClientLive({
    shouldFailWrite: true,
    shouldFailQuery: true,
    customError: StorageErrorConstructors.ValidationError('Test validation failure', [
      'field1',
      'field2'
    ])
  }),
  MockClickHouseConfigLive
)

// ============================================================================
// Utility Functions for Test Scenarios
// ============================================================================

/**
 * Create a mock layer for encoding type tests
 * Captures encoding type parameter for validation
 */
export const createEncodingTypeTestLayer = () => {
  let capturedEncodingType: string | undefined

  const testLayer = Layer.succeed(StorageAPIClientTag, {
    writeOTLP: (_data: OTLPData, encodingType?: 'protobuf' | 'json') => {
      capturedEncodingType = encodingType
      return Effect.succeed(undefined)
    },
    queryTraces: () => Effect.succeed([]),
    queryMetrics: () => Effect.succeed([]),
    queryLogs: () => Effect.succeed([]),
    queryAI: () => Effect.succeed([]),
    queryRaw: () => Effect.succeed([]),
    insertRaw: () => Effect.succeed(undefined),
    healthCheck: () => Effect.succeed({ clickhouse: true, s3: false })
  } satisfies StorageAPIClient)

  return {
    layer: testLayer,
    getCapturedEncodingType: () => capturedEncodingType
  }
}

/**
 * Create a mock layer with realistic diagnostic query responses
 * Use this for UI generator tests that need realistic query results
 */
export const createDiagnosticQueryTestLayer = () => {
  return createMockStorageAPIClientLive({
    customResponses: {
      rawQuery: [
        {
          minute: new Date().toISOString(),
          service_name: 'payment-service',
          total_requests: 150,
          error_rate_pct: 8.5,
          avg_p95_ms: 850,
          worst_operation: 'validate_payment',
          service_health_status: 'CRITICAL'
        },
        {
          minute: new Date().toISOString(),
          service_name: 'checkout-service',
          total_requests: 200,
          error_rate_pct: 2.1,
          avg_p95_ms: 450,
          worst_operation: 'calculate_tax',
          service_health_status: 'WARNING'
        },
        {
          minute: new Date().toISOString(),
          service_name: 'cart-service',
          total_requests: 300,
          error_rate_pct: 0.5,
          avg_p95_ms: 120,
          worst_operation: 'get_items',
          service_health_status: 'HEALTHY'
        }
      ]
    }
  })
}
