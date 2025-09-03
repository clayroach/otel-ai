/**
 * Storage Package - ClickHouse integration layer
 *
 * Provides the storage abstraction layer for the AI-native observability platform,
 * integrating ClickHouse for real-time analytics and telemetry storage.
 */

export * from './schemas.js'
export * from './config.js'
export * from './errors.js'
export * from './api-client.js'

// Schema types
export type {
  TraceData,
  MetricData,
  LogData,
  OTLPData,
  QueryParams,
  AIQueryParams,
  AIDataset
} from './schemas.js'

// Storage configuration
export type {
  StorageConfig,
  ClickHouseConfig,
  RetentionConfig,
  PerformanceConfig
} from './config.js'
export { StorageConfigSchema, defaultStorageConfig } from './config.js'

// Error types
export type { StorageError } from './errors.js'
export { StorageErrorSchema } from './errors.js'

// API Client types and implementations
export type { StorageAPIClient } from './api-client.js'
export {
  StorageAPIClientTag,
  ClickHouseConfigTag,
  makeStorageAPIClient,
  StorageAPIClientLayer
} from './api-client.js'

// Effect-TS storage implementations - now with resolved type issues
export * from './clickhouse.js'
