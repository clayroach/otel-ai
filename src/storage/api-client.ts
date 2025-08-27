/**
 * Storage API Client with Effect-TS Error Channels
 *
 * Production-ready API client for storage service with proper
 * type safety, error handling, and Schema validation.
 */

import { Effect, Layer, Context } from 'effect'
import { Schema } from '@effect/schema'
import { 
  OTLPDataSchema,
  QueryParamsSchema,
  AIQueryParamsSchema,
  type TraceData,
  type MetricData, 
  type LogData,
  type OTLPData,
  type QueryParams,
  type AIQueryParams
} from './schemas.js'
import { 
  StorageErrorConstructors,
  type StorageError
} from './errors.js'
import { makeClickHouseStorage } from './clickhouse.js'
import { type ClickHouseConfig } from './config.js'

/**
 * Storage API Client Service Interface
 * Provides type-safe storage operations with proper error handling
 */
export interface StorageAPIClient {
  readonly writeOTLP: (data: OTLPData) => Effect.Effect<void, StorageError>
  readonly queryTraces: (params: QueryParams) => Effect.Effect<TraceData[], StorageError>
  readonly queryMetrics: (params: QueryParams) => Effect.Effect<MetricData[], StorageError>  
  readonly queryLogs: (params: QueryParams) => Effect.Effect<LogData[], StorageError>
  readonly queryAI: (params: AIQueryParams) => Effect.Effect<readonly unknown[], StorageError>
  readonly healthCheck: () => Effect.Effect<{ clickhouse: boolean; s3: boolean }, StorageError>
}

export class StorageAPIClientTag extends Context.Tag('StorageAPIClient')<
  StorageAPIClientTag,
  StorageAPIClient
>() {}

/**
 * ClickHouse Config Service Tag
 */
export class ClickHouseConfigTag extends Context.Tag('ClickHouseConfig')<
  ClickHouseConfigTag,
  ClickHouseConfig
>() {}

/**
 * S3 Config Service Tag  
 */
export class S3ConfigTag extends Context.Tag('S3Config')<
  S3ConfigTag,
  {
    readonly endpoint: string
    readonly accessKey: string
    readonly secretKey: string  
    readonly bucket: string
  }
>() {}

// Schema definitions removed as they were unused
// If needed in future, add them back when actually used

/**
 * Create Storage API Client implementation using Effect-TS dependency injection
 * This wraps the internal ClickHouseStorage with additional schema validation and error handling
 */
export const makeStorageAPIClient: Effect.Effect<StorageAPIClient, StorageError, ClickHouseConfigTag> =
  Effect.gen(function* (_) {
    const clickhouseConfig = yield* _(ClickHouseConfigTag)
    
    // Create the internal ClickHouse storage implementation
    const clickhouseStorage = yield* _(makeClickHouseStorage(clickhouseConfig))

    return {
  writeOTLP: (data: OTLPData) =>
    Effect.gen(function* (_) {
      // Validate input data
      const validatedData = yield* _(
        Schema.decodeUnknown(OTLPDataSchema)(data).pipe(
          Effect.mapError((error) => 
            StorageErrorConstructors.ValidationError(
              'Invalid OTLP data format',
              [error.message]
            )
          )
        )
      )

      // Delegate to internal ClickHouse storage implementation
      yield* _(clickhouseStorage.writeOTLP(validatedData))
    }),

  queryTraces: (params: QueryParams) =>
    Effect.gen(function* (_) {
      // Validate query parameters
      const validatedParams = yield* _(
        Schema.decodeUnknown(QueryParamsSchema)(params).pipe(
          Effect.mapError((error) =>
            StorageErrorConstructors.ValidationError(
              'Invalid query parameters',
              [error.message]
            )
          )
        )
      )

      // Delegate to internal ClickHouse storage implementation
      return yield* _(clickhouseStorage.queryTraces(validatedParams))
    }),

  queryMetrics: (params: QueryParams) =>
    Effect.gen(function* (_) {
      const validatedParams = yield* _(
        Schema.decodeUnknown(QueryParamsSchema)(params).pipe(
          Effect.mapError((error) =>
            StorageErrorConstructors.ValidationError(
              'Invalid query parameters',
              [error.message]
            )
          )
        )
      )

      // Delegate to internal ClickHouse storage implementation
      return yield* _(clickhouseStorage.queryMetrics(validatedParams))
    }),

  queryLogs: (params: QueryParams) =>
    Effect.gen(function* (_) {
      const validatedParams = yield* _(
        Schema.decodeUnknown(QueryParamsSchema)(params).pipe(
          Effect.mapError((error) =>
            StorageErrorConstructors.ValidationError(
              'Invalid query parameters',
              [error.message]
            )
          )
        )
      )

      // Delegate to internal ClickHouse storage implementation
      return yield* _(clickhouseStorage.queryLogs(validatedParams))
    }),

  queryAI: (params: AIQueryParams) =>
    Effect.gen(function* (_) {
      const validatedParams = yield* _(
        Schema.decodeUnknown(AIQueryParamsSchema)(params).pipe(
          Effect.mapError((error) =>
            StorageErrorConstructors.ValidationError(
              'Invalid AI query parameters',
              [error.message]
            )
          )
        )
      )

      // Delegate to internal ClickHouse storage implementation
      const aiDataset = yield* _(clickhouseStorage.queryForAI(validatedParams))
      return aiDataset.features || []
    }),

  healthCheck: () =>
    Effect.gen(function* (_) {
      // Delegate to internal ClickHouse storage implementation
      const clickhouseHealthy = yield* _(clickhouseStorage.healthCheck())
      
      // TODO: Add S3 health check when S3 storage is available
      const s3Healthy = true
      
      return { clickhouse: clickhouseHealthy, s3: s3Healthy }
    })}
  })

/**
 * Storage API Client Layer
 */
export const StorageAPIClientLayer = Layer.effect(
  StorageAPIClientTag,
  makeStorageAPIClient
)

// Legacy helper functions removed as they were unused
// These functions were part of an older storage pattern and are no longer needed
// Current storage operations are handled by the ClickHouse storage implementation

// Legacy query building and transformation functions removed as they were unused
// These functions were part of an older storage pattern and are no longer needed
// Current query operations are handled by the ClickHouse storage implementation