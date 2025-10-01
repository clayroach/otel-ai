/**
 * Storage Package - ClickHouse integration and S3 backend storage layer
 *
 * Provides the storage abstraction layer for the AI-native observability platform,
 * integrating ClickHouse for real-time analytics and S3/MinIO for raw data storage.
 */

// Note: No wildcard exports to prevent accidental function exports
// All exports must be explicit to ensure Layer-only pattern

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
  S3Config,
  RetentionConfig,
  PerformanceConfig
} from './config.js'
export { StorageConfigSchema, defaultStorageConfig, REQUIRED_TABLES } from './config.js'

// Error types
export type { StorageError } from './errors.js'
export { StorageErrorSchema, StorageErrorConstructors } from './errors.js'

// API Client types and tags
export type { StorageAPIClient } from './api-client.js'
export {
  StorageAPIClientTag,
  ClickHouseConfigTag,
  S3ConfigTag,
  StorageAPIClientLayer // Layer is the ONLY way to get a client
} from './api-client.js'

// Storage Service Layers and Tags - External consumption via Layers only
export type { StorageService } from './services.js'
export {
  StorageServiceTag,
  ConfigServiceTag,
  StorageServiceLive, // Layer for production use
  ConfigServiceLive, // Layer for config service
  StorageLayer, // Combined layer
  StorageOperations // Type/namespace for operations
} from './services.js'

// ClickHouse and S3 storage interfaces
export type { ClickHouseStorage } from './clickhouse.js'
export type { S3Storage } from './s3.js'
export { S3StorageTag, S3StorageLive } from './s3.js'

// Router exports - Layer pattern for HTTP endpoints
export type { StorageRouter } from './router.js'
export { StorageRouterTag, StorageRouterLive } from './router.js'

// Dependency Aggregator Service - SigNoz-inspired background service
export type { DependencyAggregator } from './dependency-aggregator.js'
export {
  DependencyAggregatorTag,
  DependencyAggregatorLive,
  DependencyAggregatorMock
} from './dependency-aggregator.js'

// Test Layers only - no utility functions exported from package index
export {
  MockStorageServiceLive,
  MockConfigServiceLive,
  MockClickHouseConfigLive,
  MockStorageAPIClientLive,
  TestStorageLayer,
  FailingTestStorageLayer,
  createMockStorageServiceLive,
  createMockStorageAPIClientLive,
  type MockStorageServiceOptions,
  type MockAPIClientOptions
} from './test-utils.js'
