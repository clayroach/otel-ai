/**
 * Configuration schemas and defaults for the storage package
 */

import { Schema } from '@effect/schema'

// ClickHouse configuration
export const ClickHouseConfigSchema = Schema.Struct({
  host: Schema.String,
  port: Schema.Number,
  database: Schema.String,
  username: Schema.String,
  password: Schema.String,
  connectTimeout: Schema.optional(Schema.Number),
  requestTimeout: Schema.optional(Schema.Number),
  maxOpenConnections: Schema.optional(Schema.Number),
  compression: Schema.optional(Schema.Boolean),
  // Advanced settings for AI workloads
  maxQueryMemoryUsage: Schema.optional(Schema.String), // e.g., "1GB"
  maxExecutionTime: Schema.optional(Schema.Number), // seconds
  sendProgressInHttpHeaders: Schema.optional(Schema.Boolean)
})

// Performance and optimization settings
export const PerformanceConfigSchema = Schema.Struct({
  batchSize: Schema.Number,
  flushInterval: Schema.Number, // milliseconds
  maxConcurrentWrites: Schema.Number,
  compressionLevel: Schema.optional(Schema.Number),
  // AI-specific optimizations
  enablePreAggregation: Schema.optional(Schema.Boolean),
  cacheSize: Schema.optional(Schema.String), // e.g., "512MB"
  enableQueryCache: Schema.optional(Schema.Boolean)
})

// Main storage configuration schema
export const StorageConfigSchema = Schema.Struct({
  clickhouse: ClickHouseConfigSchema,
  performance: PerformanceConfigSchema,
  // Feature flags
  features: Schema.optional(
    Schema.Struct({
      enableCompression: Schema.Boolean,
      enableAIOptimizations: Schema.Boolean
    })
  )
})

export type StorageConfig = Schema.Schema.Type<typeof StorageConfigSchema>
export type ClickHouseConfig = Schema.Schema.Type<typeof ClickHouseConfigSchema>
export type PerformanceConfig = Schema.Schema.Type<typeof PerformanceConfigSchema>

// Default configuration suitable for development
export const defaultStorageConfig: StorageConfig = {
  clickhouse: {
    host: 'localhost',
    port: 8123,
    database: 'otel',
    username: 'otel',
    password: 'otel123',
    connectTimeout: 10000,
    requestTimeout: 30000,
    maxOpenConnections: 10,
    compression: true
  },
  performance: {
    batchSize: 100,
    flushInterval: 5000,
    maxConcurrentWrites: 5,
    compressionLevel: 6,
    enablePreAggregation: true,
    cacheSize: '512MB',
    enableQueryCache: true
  },
  features: {
    enableCompression: true,
    enableAIOptimizations: true
  }
}

// Helper function to load configuration from environment variables
export const loadConfigFromEnv = (): Partial<StorageConfig> => ({
  clickhouse: {
    host: process.env.CLICKHOUSE_HOST || defaultStorageConfig.clickhouse.host,
    port: parseInt(process.env.CLICKHOUSE_PORT || '') || defaultStorageConfig.clickhouse.port,
    database: process.env.CLICKHOUSE_DATABASE || defaultStorageConfig.clickhouse.database,
    username: process.env.CLICKHOUSE_USERNAME || defaultStorageConfig.clickhouse.username,
    password: process.env.CLICKHOUSE_PASSWORD || defaultStorageConfig.clickhouse.password,
    connectTimeout:
      parseInt(process.env.CLICKHOUSE_CONNECT_TIMEOUT || '') ||
      defaultStorageConfig.clickhouse.connectTimeout,
    requestTimeout:
      parseInt(process.env.CLICKHOUSE_REQUEST_TIMEOUT || '') ||
      defaultStorageConfig.clickhouse.requestTimeout,
    maxOpenConnections:
      parseInt(process.env.CLICKHOUSE_MAX_CONNECTIONS || '') ||
      defaultStorageConfig.clickhouse.maxOpenConnections,
    compression:
      process.env.CLICKHOUSE_COMPRESSION === 'true' || defaultStorageConfig.clickhouse.compression
  },
  performance: {
    batchSize:
      parseInt(process.env.STORAGE_BATCH_SIZE || '') || defaultStorageConfig.performance.batchSize,
    flushInterval:
      parseInt(process.env.STORAGE_FLUSH_INTERVAL || '') ||
      defaultStorageConfig.performance.flushInterval,
    maxConcurrentWrites:
      parseInt(process.env.STORAGE_MAX_CONCURRENT_WRITES || '') ||
      defaultStorageConfig.performance.maxConcurrentWrites
  }
})

// Type guard functions
export const isValidClickHouseConfig = (config: unknown): config is ClickHouseConfig =>
  Schema.is(ClickHouseConfigSchema)(config)

export const isValidStorageConfig = (config: unknown): config is StorageConfig =>
  Schema.is(StorageConfigSchema)(config)
