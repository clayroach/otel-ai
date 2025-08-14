/**
 * Main storage service that combines ClickHouse and S3 storage
 * Implements the storage interfaces with Effect-TS service patterns
 */

import { Effect, Context, Layer, Schedule, Duration } from 'effect'
import { Schema } from '@effect/schema'
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
import { type S3Storage, makeS3Storage } from './s3.js'

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

export const makeStorageService = (
  clickhouse: ClickHouseStorage,
  s3: S3Storage,
  config: StorageConfig
): StorageService => ({
  writeOTLP: (data: OTLPData) =>
    Effect.gen(function* (_) {
      // Write to ClickHouse first (primary storage)
      yield* _(clickhouse.writeOTLP(data))

      // Optionally archive to S3 if enabled
      if (config.features?.enableS3Backup) {
        yield* _(s3.archiveOTLPData(data, data.timestamp))
      }
    }),

  writeBatch: (data: OTLPData[]) =>
    Effect.gen(function* (_) {
      // Process batches with controlled concurrency
      yield* _(
        Effect.forEach(
          data,
          (batch) => makeStorageService(clickhouse, s3, config).writeOTLP(batch),
          { concurrency: config.performance.maxConcurrentWrites }
        )
      )
    }),

  queryTraces: (params: QueryParams) => clickhouse.queryTraces(params),
  queryMetrics: (params: QueryParams) => clickhouse.queryMetrics(params),
  queryLogs: (params: QueryParams) => clickhouse.queryLogs(params),
  queryForAI: (params: AIQueryParams) => clickhouse.queryForAI(params),

  archiveData: (data: OTLPData, timestamp: number) => s3.archiveOTLPData(data, timestamp),

  applyRetentionPolicies: () =>
    Effect.gen(function* (_) {
      // Apply S3 retention policies
      yield* _(s3.applyRetentionPolicy(config.retention))

      // TODO: Implement ClickHouse retention policies
      // This would involve running DELETE queries on old data
    }),

  healthCheck: () =>
    Effect.gen(function* (_) {
      const [clickhouseHealth, s3Health] = yield* _(
        Effect.all([
          clickhouse.healthCheck().pipe(Effect.option),
          s3.healthCheck().pipe(Effect.option)
        ])
      )

      return {
        clickhouse: clickhouseHealth._tag === 'Some' ? clickhouseHealth.value : false,
        s3: s3Health._tag === 'Some' ? s3Health.value : false
      }
    }),

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

      // Get S3 statistics
      const s3Objects = yield* _(s3.listObjects())
      const s3Stats = {
        totalObjects: s3Objects.length,
        totalSize: '0 GB', // Would need to sum object sizes
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
    const s3 = yield* _(makeS3Storage(config.s3))

    return makeStorageService(clickhouse, s3, config)
  })
)

// Configuration layer that loads from environment
export const ConfigServiceLive = Layer.succeed(ConfigServiceTag, {
  ...defaultStorageConfig,
  ...loadConfigFromEnv()
})

// Combined layer for easy setup
export const StorageLayer = ConfigServiceLive.pipe(Layer.provide(StorageServiceLive))

// Convenience functions for common operations
export namespace StorageService {
  export const writeOTLP = (data: OTLPData) =>
    Effect.gen(function* (_) {
      const storage = yield* _(StorageServiceTag)
      yield* _(storage.writeOTLP(data))
    })

  export const queryTraces = (params: QueryParams) =>
    Effect.gen(function* (_) {
      const storage = yield* _(StorageServiceTag)
      return yield* _(storage.queryTraces(params))
    })

  export const queryMetrics = (params: QueryParams) =>
    Effect.gen(function* (_) {
      const storage = yield* _(StorageServiceTag)
      return yield* _(storage.queryMetrics(params))
    })

  export const queryLogs = (params: QueryParams) =>
    Effect.gen(function* (_) {
      const storage = yield* _(StorageServiceTag)
      return yield* _(storage.queryLogs(params))
    })

  export const queryForAI = (params: AIQueryParams) =>
    Effect.gen(function* (_) {
      const storage = yield* _(StorageServiceTag)
      return yield* _(storage.queryForAI(params))
    })

  export const healthCheck = () =>
    Effect.gen(function* (_) {
      const storage = yield* _(StorageServiceTag)
      return yield* _(storage.healthCheck())
    })

  export const getStats = () =>
    Effect.gen(function* (_) {
      const storage = yield* _(StorageServiceTag)
      return yield* _(storage.getStorageStats())
    })

  export const startRetentionSchedule = (intervalMinutes: number = 60) =>
    Effect.gen(function* (_) {
      const storage = yield* _(StorageServiceTag)

      // Run retention cleanup on a schedule
      yield* _(
        storage
          .applyRetentionPolicies()
          .pipe(Effect.repeat(Schedule.fixed(Duration.minutes(intervalMinutes))), Effect.forkDaemon)
      )
    })
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

    yield* _(StorageService.writeOTLP(sampleData))

    // Query traces
    const traces = yield* _(
      StorageService.queryTraces({
        timeRange: {
          start: Date.now() - 3600000, // Last hour
          end: Date.now()
        },
        limit: 100
      })
    )

    // Check health
    const health = yield* _(StorageService.healthCheck())

    console.log(`Found ${traces.length} traces`)
    console.log(`Health: CH=${health.clickhouse}, S3=${health.s3}`)

    return { traces, health }
  }).pipe(Effect.provide(StorageLayer))
