/**
 * Main storage service that combines ClickHouse and S3 storage
 * Implements the storage interfaces with Effect-TS service patterns
 */

import { Effect, Context, Layer, Schedule, Duration } from 'effect'
import { type StorageConfig, defaultStorageConfig, loadConfigFromEnv } from './config.js'
import {
  type OTLPData,
  type QueryParams,
  type AIQueryParams,
  type TraceData,
  type MetricData,
  type LogData,
  type AIDataset
} from './schemas.js'
import { type StorageError } from './errors.js'
import { type ClickHouseStorage, makeClickHouseStorage } from './clickhouse.js'
// S3 imports removed - not used yet

// Main storage service interface
export interface StorageService {
  // Write operations
  readonly writeOTLP: (data: OTLPData) => Effect.Effect<void, StorageError>
  readonly writeBatch: (data: OTLPData[]) => Effect.Effect<void, StorageError>

  // Read operations
  readonly queryTraces: (params: QueryParams) => Effect.Effect<TraceData[], StorageError>
  readonly queryMetrics: (params: QueryParams) => Effect.Effect<MetricData[], StorageError>
  readonly queryLogs: (params: QueryParams) => Effect.Effect<LogData[], StorageError>
  readonly queryForAI: (params: AIQueryParams) => Effect.Effect<AIDataset, StorageError>
  readonly queryRaw: (sql: string) => Effect.Effect<unknown[], StorageError>
  readonly queryText: (sql: string) => Effect.Effect<string, StorageError>
  readonly insertRaw: (sql: string) => Effect.Effect<void, StorageError>

  // Archive and retention
  readonly archiveData: (data: OTLPData, timestamp: number) => Effect.Effect<void, StorageError>
  readonly applyRetentionPolicies: () => Effect.Effect<void, StorageError>

  // Health and maintenance
  readonly healthCheck: () => Effect.Effect<{ clickhouse: boolean; s3: boolean }, StorageError>
  readonly getStorageStats: () => Effect.Effect<StorageStats, StorageError>
}

export interface StorageStats {
  clickhouse: {
    totalTraces: number
    totalMetrics: number
    totalLogs: number
    diskUsage: string
  }
  s3: {
    totalObjects: number
    totalSize: string
    oldestObject: Date | null
    newestObject: Date | null
  }
}

// Service tag for dependency injection
export class StorageServiceTag extends Context.Tag('StorageService')<
  StorageServiceTag,
  StorageService
>() {}

// Configuration service
export class ConfigServiceTag extends Context.Tag('ConfigService')<
  ConfigServiceTag,
  StorageConfig
>() {}

// Internal: Not exported - use StorageServiceLive Layer instead
const makeStorageService = (
  clickhouse: ClickHouseStorage,
  config: StorageConfig
): StorageService => ({
  writeOTLP: (data: OTLPData) =>
    // Write to ClickHouse (primary storage)
    clickhouse.writeOTLP(data),

  writeBatch: (data: OTLPData[]) =>
    // Process batches with controlled concurrency
    Effect.forEach(data, (batch) => makeStorageService(clickhouse, config).writeOTLP(batch), {
      concurrency: config.performance.maxConcurrentWrites
    }),

  queryTraces: (params: QueryParams) => clickhouse.queryTraces(params),
  queryMetrics: (params: QueryParams) => clickhouse.queryMetrics(params),
  queryLogs: (params: QueryParams) => clickhouse.queryLogs(params),
  queryForAI: (params: AIQueryParams) => clickhouse.queryForAI(params),
  queryRaw: (sql: string) => clickhouse.queryRaw(sql),
  queryText: (sql: string) => clickhouse.queryText(sql),
  insertRaw: (sql: string) => clickhouse.insertRaw(sql),

  archiveData: (_data: OTLPData, _timestamp: number) =>
    // S3 archiving not implemented yet - just return success
    Effect.void,

  applyRetentionPolicies: () =>
    // TODO: Implement ClickHouse retention policies
    // This would involve running DELETE queries on old data
    Effect.void,

  healthCheck: () =>
    clickhouse.healthCheck().pipe(
      Effect.option,
      Effect.map((clickhouseHealth) => ({
        clickhouse: clickhouseHealth._tag === 'Some' ? clickhouseHealth.value : false,
        s3: true // Always report S3 as healthy since we're not using it
      }))
    ),

  getStorageStats: () =>
    Effect.gen(function* (_) {
      // Get ClickHouse statistics
      const clickhouseStats = yield* _(
        Effect.tryPromise({
          try: async () => {
            // These would be actual queries to get statistics
            return {
              totalTraces: 0,
              totalMetrics: 0,
              totalLogs: 0,
              diskUsage: '0 GB'
            }
          },
          catch: (error) => ({
            _tag: 'QueryError' as const,
            message: `Failed to get ClickHouse stats: ${error}`,
            query: 'STATS',
            cause: error
          })
        })
      )

      // S3 not used yet
      const s3Stats = {
        totalObjects: 0,
        totalSize: '0 GB',
        oldestObject: null as Date | null,
        newestObject: null as Date | null
      }

      return {
        clickhouse: clickhouseStats,
        s3: s3Stats
      }
    })
})

// Service implementation using Effect-TS layers
export const StorageServiceLive = Layer.effect(
  StorageServiceTag,
  Effect.gen(function* (_) {
    const config = yield* _(ConfigServiceTag)

    const clickhouse = yield* _(makeClickHouseStorage(config.clickhouse))
    // S3 not used yet - removed to simplify setup

    return makeStorageService(clickhouse, config)
  })
)

// Configuration layer that loads from environment
export const ConfigServiceLive = Layer.succeed(ConfigServiceTag, {
  ...defaultStorageConfig,
  ...loadConfigFromEnv()
})

// Storage layer that requires ConfigServiceTag to be provided externally
export const StorageLayer = StorageServiceLive

// Convenience functions for common operations
export namespace StorageOperations {
  export const writeOTLP = (data: OTLPData) =>
    StorageServiceTag.pipe(Effect.flatMap((storage) => storage.writeOTLP(data)))

  export const queryTraces = (params: QueryParams) =>
    StorageServiceTag.pipe(Effect.flatMap((storage) => storage.queryTraces(params)))

  export const queryMetrics = (params: QueryParams) =>
    StorageServiceTag.pipe(Effect.flatMap((storage) => storage.queryMetrics(params)))

  export const queryLogs = (params: QueryParams) =>
    StorageServiceTag.pipe(Effect.flatMap((storage) => storage.queryLogs(params)))

  export const queryForAI = (params: AIQueryParams) =>
    StorageServiceTag.pipe(Effect.flatMap((storage) => storage.queryForAI(params)))

  export const healthCheck = () =>
    StorageServiceTag.pipe(Effect.flatMap((storage) => storage.healthCheck()))

  export const getStats = () =>
    StorageServiceTag.pipe(Effect.flatMap((storage) => storage.getStorageStats()))

  export const startRetentionSchedule = (intervalMinutes: number = 60) =>
    StorageServiceTag.pipe(
      Effect.flatMap((storage) =>
        storage
          .applyRetentionPolicies()
          .pipe(Effect.repeat(Schedule.fixed(Duration.minutes(intervalMinutes))), Effect.forkDaemon)
      )
    )
}

// Example usage and integration helpers
export const exampleUsage = () =>
  Effect.gen(function* (_) {
    // Write some OTLP data
    const sampleData: OTLPData = {
      traces: [
        {
          traceId: 'abc123',
          spanId: 'span123',
          operationName: 'test-operation',
          startTime: Date.now() * 1000000,
          endTime: (Date.now() + 1000) * 1000000,
          duration: 1000000000,
          serviceName: 'test-service',
          statusCode: 1,
          spanKind: 'SERVER',
          attributes: { 'http.method': 'GET' },
          resourceAttributes: { 'service.name': 'test-service' },
          events: [],
          links: []
        }
      ],
      timestamp: Date.now()
    }

    yield* _(StorageOperations.writeOTLP(sampleData))

    // Query traces
    const traces = yield* _(
      StorageOperations.queryTraces({
        timeRange: {
          start: Date.now() - 3600000, // Last hour
          end: Date.now()
        },
        limit: 100
      })
    )

    // Check health
    const health = yield* _(StorageOperations.healthCheck())

    console.log(`Found ${traces.length} traces`)
    console.log(`Health: CH=${health.clickhouse}, S3=${health.s3}`)

    return { traces, health }
  }).pipe(Effect.provide(StorageLayer))
