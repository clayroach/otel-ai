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

// S3/MinIO configuration
export const S3ConfigSchema = Schema.Struct({
  endpoint: Schema.String,
  accessKeyId: Schema.String,
  secretAccessKey: Schema.String,
  bucket: Schema.String,
  region: Schema.optional(Schema.String),
  forcePathStyle: Schema.optional(Schema.Boolean), // Required for MinIO
  enableEncryption: Schema.optional(Schema.Boolean), // Enable/disable server-side encryption
  // Retention and lifecycle
  enableVersioning: Schema.optional(Schema.Boolean),
  lifecycleRules: Schema.optional(
    Schema.Array(
      Schema.Struct({
        id: Schema.String,
        status: Schema.Literal('Enabled', 'Disabled'),
        expiration: Schema.Number // days
      })
    )
  )
})

// Retention policies for different data types
export const RetentionConfigSchema = Schema.Struct({
  traces: Schema.Struct({
    clickhouse: Schema.String, // e.g., "30d"
    s3: Schema.String // e.g., "1y"
  }),
  metrics: Schema.Struct({
    clickhouse: Schema.String, // e.g., "90d"
    s3: Schema.String // e.g., "2y"
  }),
  logs: Schema.Struct({
    clickhouse: Schema.String, // e.g., "7d"
    s3: Schema.String // e.g., "30d"
  })
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
  s3: S3ConfigSchema,
  retention: RetentionConfigSchema,
  performance: PerformanceConfigSchema,
  // Feature flags
  features: Schema.optional(
    Schema.Struct({
      enableS3Backup: Schema.Boolean,
      enableCompression: Schema.Boolean,
      enableEncryption: Schema.Boolean,
      enableAIOptimizations: Schema.Boolean
    })
  )
})

export type StorageConfig = Schema.Schema.Type<typeof StorageConfigSchema>
export type ClickHouseConfig = Schema.Schema.Type<typeof ClickHouseConfigSchema>
export type S3Config = Schema.Schema.Type<typeof S3ConfigSchema>
export type RetentionConfig = Schema.Schema.Type<typeof RetentionConfigSchema>
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
    compression: true,
    maxQueryMemoryUsage: '1GB',
    maxExecutionTime: 300,
    sendProgressInHttpHeaders: true
  },
  s3: {
    endpoint: 'http://localhost:9010',
    accessKeyId: 'otel-ai',
    secretAccessKey: 'otel-ai-secret',
    bucket: 'otel-data',
    region: 'us-east-1',
    forcePathStyle: true, // Required for MinIO
    enableVersioning: false
  },
  retention: {
    traces: {
      clickhouse: '30d',
      s3: '1y'
    },
    metrics: {
      clickhouse: '90d',
      s3: '2y'
    },
    logs: {
      clickhouse: '7d',
      s3: '30d'
    }
  },
  performance: {
    batchSize: 1000,
    flushInterval: 5000, // 5 seconds
    maxConcurrentWrites: 5,
    compressionLevel: 6,
    enablePreAggregation: true,
    cacheSize: '512MB',
    enableQueryCache: true
  },
  features: {
    enableS3Backup: true,
    enableCompression: true,
    enableEncryption: false, // Can be enabled for production
    enableAIOptimizations: true
  }
}

// Environment-based configuration loader
export const loadConfigFromEnv = (): Partial<StorageConfig> => ({
  clickhouse: {
    host: process.env.CLICKHOUSE_HOST || 'localhost',
    port: parseInt(process.env.CLICKHOUSE_PORT || '8124'),
    database: process.env.CLICKHOUSE_DATABASE || 'otel',
    username: process.env.CLICKHOUSE_USERNAME || 'otel',
    password: process.env.CLICKHOUSE_PASSWORD || 'otel123'
  },
  s3: {
    endpoint: process.env.S3_ENDPOINT || 'http://localhost:9010',
    accessKeyId: process.env.S3_ACCESS_KEY_ID || 'otel-ai',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || 'otel-ai-secret',
    bucket: process.env.S3_BUCKET || 'otel-data',
    region: process.env.S3_REGION,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true'
  }
})
