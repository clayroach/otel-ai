/**
 * ClickHouse storage implementation using Effect-native client
 * Following ADR-007: No tryPromise in domain code
 */

import { Effect, Layer, Context } from 'effect'
import { Schema } from '@effect/schema'
import {
  type TraceData,
  type MetricData,
  type LogData,
  type OTLPData,
  type QueryParams,
  type AIQueryParams,
  type AIDataset,
  OTLPDataSchema,
  QueryParamsSchema
} from './schemas.js'
import { type ClickHouseConfig } from './config.js'
import { type StorageError, StorageErrorConstructors } from './errors.js'
import {
  makeEffectClickHouseClientLayer,
  EffectClickHouseClientTag,
  DatabaseError
} from './clickhouse-effect-client.js'

// ============================================================================
// Storage Interface
// ============================================================================

export interface ClickHouseStorage {
  readonly writeOTLP: (
    data: OTLPData,
    encodingType?: 'protobuf' | 'json'
  ) => Effect.Effect<void, StorageError>
  readonly writeBatch: (data: OTLPData[]) => Effect.Effect<void, StorageError>
  readonly queryTraces: (params: QueryParams) => Effect.Effect<TraceData[], StorageError>
  readonly queryMetrics: (params: QueryParams) => Effect.Effect<MetricData[], StorageError>
  readonly queryLogs: (params: QueryParams) => Effect.Effect<LogData[], StorageError>
  readonly queryForAI: (params: AIQueryParams) => Effect.Effect<AIDataset, StorageError>
  readonly queryRaw: (sql: string) => Effect.Effect<unknown[], StorageError>
  readonly healthCheck: () => Effect.Effect<boolean, StorageError>
  readonly close: () => Effect.Effect<void, never>
}

export class ClickHouseStorageTag extends Context.Tag('ClickHouseStorage')<
  ClickHouseStorageTag,
  ClickHouseStorage
>() {}

// ============================================================================
// Implementation using Effect-native client
// ============================================================================

export const makeClickHouseStorage = (
  config: ClickHouseConfig
): Effect.Effect<ClickHouseStorage, StorageError> =>
  Effect.gen(function* () {
    // Get the Effect-native client
    const clientLayer = makeEffectClickHouseClientLayer(config)
    const client = yield* EffectClickHouseClientTag.pipe(
      Effect.provide(clientLayer),
      Effect.mapError((error: unknown) => {
        const err = error as { message?: string; host?: string; port?: number; cause?: unknown }
        const errorParams: { message: string; host?: string; port?: number; cause?: unknown } = {
          message: err.message || 'Connection failed'
        }
        if (err.host !== undefined) errorParams.host = err.host
        if (err.port !== undefined) errorParams.port = err.port
        if (err.cause !== undefined) errorParams.cause = err.cause
        return StorageErrorConstructors.ConnectionError(errorParams)
      })
    )

    // Test connection
    yield* client.ping().pipe(
      Effect.mapError((error: DatabaseError) =>
        StorageErrorConstructors.ConnectionError({
          message: `Failed to connect to ClickHouse: ${error.message}`,
          cause: error
        })
      )
    )

    const writeOTLP = (
      data: OTLPData,
      encodingType: 'protobuf' | 'json' = 'protobuf'
    ): Effect.Effect<void, StorageError> =>
      Effect.gen(function* () {
        // Validate OTLP data
        const validatedData = yield* Schema.decodeUnknown(OTLPDataSchema)(data).pipe(
          Effect.mapError((error) =>
            StorageErrorConstructors.ValidationError('Invalid OTLP data format', [error.message])
          )
        )

        // Write traces if present
        if (validatedData.traces && validatedData.traces.length > 0) {
          yield* writeTraces([...validatedData.traces], encodingType)
        }

        // Write metrics if present
        if (validatedData.metrics && validatedData.metrics.length > 0) {
          yield* writeMetrics([...validatedData.metrics])
        }

        // Write logs if present
        if (validatedData.logs && validatedData.logs.length > 0) {
          yield* writeLogs([...validatedData.logs])
        }
      })

    const writeBatch = (data: OTLPData[]): Effect.Effect<void, StorageError> =>
      Effect.forEach(data, (batch) => writeOTLP(batch), {
        concurrency: config.maxOpenConnections ?? 5
      }).pipe(Effect.map(() => void 0))

    const writeTraces = (
      traces: TraceData[],
      encodingType: 'protobuf' | 'json' = 'protobuf'
    ): Effect.Effect<void, StorageError> =>
      Effect.gen(function* () {
        const values = traces.map((trace) => {
          const startTimeNs = trace.startTime
          const endTimeNs = trace.endTime || trace.startTime + trace.duration

          console.log(
            `🔍 [Debug] Timestamp conversion for trace ${trace.traceId}: ${startTimeNs}ns`
          )

          return {
            trace_id: trace.traceId,
            span_id: trace.spanId,
            parent_span_id: trace.parentSpanId || '',
            start_time: startTimeNs,
            end_time: endTimeNs,
            duration_ns: trace.duration,
            service_name: trace.serviceName,
            operation_name: trace.operationName,
            span_kind: trace.spanKind,
            status_code: trace.statusCode,
            status_message: trace.statusMessage || '',
            trace_state: '',
            scope_name: '',
            scope_version: '',
            span_attributes: trace.attributes || {},
            resource_attributes: trace.resourceAttributes || {},
            events: JSON.stringify(trace.events || []),
            links: JSON.stringify(trace.links || []),
            ingestion_time: Date.now() * 1000000,
            processing_version: 1,
            encoding_type: encodingType
          }
        })

        console.log(`📝 [Debug] Batch insert to traces table: ${values.length} records`)
        console.log(
          `📝 [Debug] Sample value to insert:`,
          JSON.stringify(values[0], null, 2).slice(0, 300)
        )

        yield* client
          .insert({
            table: 'traces',
            values
          })
          .pipe(
            Effect.mapError((error: DatabaseError) =>
              StorageErrorConstructors.WriteError({
                message: `Failed to write traces: ${error.message}`,
                operation: 'writeTraces',
                cause: error
              })
            )
          )
      })

    const writeMetrics = (metrics: MetricData[]): Effect.Effect<void, StorageError> =>
      Effect.gen(function* () {
        const values = metrics.map((metric) => ({
          metric_name: metric.metricName,
          metric_type: metric.metricType,
          value: metric.value,
          unit: metric.unit || '',
          timestamp: Math.floor(metric.timestamp / 1000000),
          attributes: JSON.stringify(metric.attributes || {}),
          resource_attributes: JSON.stringify(metric.resourceAttributes || {}),
          service_name: '',
          ingestion_time: Date.now() * 1000000,
          processing_version: 1
        }))

        yield* client
          .insert({
            table: 'metrics',
            values
          })
          .pipe(
            Effect.mapError((error: DatabaseError) =>
              StorageErrorConstructors.WriteError({
                message: `Failed to write metrics: ${error.message}`,
                operation: 'writeMetrics',
                cause: error
              })
            )
          )
      })

    const writeLogs = (logs: LogData[]): Effect.Effect<void, StorageError> =>
      Effect.gen(function* () {
        const values = logs.map((log) => ({
          timestamp: Math.floor(log.timestamp / 1000000),
          severity: log.severityText || 'INFO',
          message: log.body,
          attributes: JSON.stringify(log.attributes || {}),
          resource_attributes: JSON.stringify(log.resourceAttributes || {}),
          service_name: '',
          trace_id: log.traceId || '',
          span_id: log.spanId || '',
          ingestion_time: Date.now() * 1000000,
          processing_version: 1
        }))

        yield* client
          .insert({
            table: 'logs',
            values
          })
          .pipe(
            Effect.mapError((error: DatabaseError) =>
              StorageErrorConstructors.WriteError({
                message: `Failed to write logs: ${error.message}`,
                operation: 'writeLogs',
                cause: error
              })
            )
          )
      })

    const queryTraces = (params: QueryParams): Effect.Effect<TraceData[], StorageError> =>
      Effect.gen(function* () {
        const validated = yield* Schema.decodeUnknown(QueryParamsSchema)(params).pipe(
          Effect.mapError((error) =>
            StorageErrorConstructors.ValidationError('Invalid query parameters', [error.message])
          )
        )

        const serviceName = validated.filters?.serviceName as string | undefined
        const query = `
          SELECT * FROM traces
          WHERE start_time >= now() - INTERVAL ${validated.timeRange}
          ${serviceName ? `AND service_name = '${serviceName}'` : ''}
          ORDER BY start_time DESC
          LIMIT ${validated.limit ?? 100}
        `

        console.log(`📊 [Debug] Executing trace query: ${query.substring(0, 100)}...`)

        const result = yield* client
          .query<TraceData>({
            query,
            format: 'JSONEachRow'
          })
          .pipe(
            Effect.mapError((error: DatabaseError) =>
              StorageErrorConstructors.ReadError({
                message: `Failed to query traces: ${error.message}`,
                operation: 'queryTraces',
                cause: error
              })
            )
          )

        return result
      })

    const queryMetrics = (params: QueryParams): Effect.Effect<MetricData[], StorageError> =>
      Effect.gen(function* () {
        const validated = yield* Schema.decodeUnknown(QueryParamsSchema)(params).pipe(
          Effect.mapError((error) =>
            StorageErrorConstructors.ValidationError('Invalid query parameters', [error.message])
          )
        )

        const serviceName = validated.filters?.serviceName as string | undefined
        const query = `
          SELECT * FROM metrics
          WHERE timestamp >= now() - INTERVAL ${validated.timeRange}
          ${serviceName ? `AND service_name = '${serviceName}'` : ''}
          ORDER BY timestamp DESC
          LIMIT ${validated.limit ?? 100}
        `

        const result = yield* client
          .query<MetricData>({
            query,
            format: 'JSONEachRow'
          })
          .pipe(
            Effect.mapError((error: DatabaseError) =>
              StorageErrorConstructors.ReadError({
                message: `Failed to query metrics: ${error.message}`,
                operation: 'queryMetrics',
                cause: error
              })
            )
          )

        return result
      })

    const queryLogs = (params: QueryParams): Effect.Effect<LogData[], StorageError> =>
      Effect.gen(function* () {
        const validated = yield* Schema.decodeUnknown(QueryParamsSchema)(params).pipe(
          Effect.mapError((error) =>
            StorageErrorConstructors.ValidationError('Invalid query parameters', [error.message])
          )
        )

        const serviceName = validated.filters?.serviceName as string | undefined
        const query = `
          SELECT * FROM logs
          WHERE timestamp >= now() - INTERVAL ${validated.timeRange}
          ${serviceName ? `AND service_name = '${serviceName}'` : ''}
          ORDER BY timestamp DESC
          LIMIT ${validated.limit ?? 100}
        `

        const result = yield* client
          .query<LogData>({
            query,
            format: 'JSONEachRow'
          })
          .pipe(
            Effect.mapError((error: DatabaseError) =>
              StorageErrorConstructors.ReadError({
                message: `Failed to query logs: ${error.message}`,
                operation: 'queryLogs',
                cause: error
              })
            )
          )

        return result
      })

    const queryForAI = (params: AIQueryParams): Effect.Effect<AIDataset, StorageError> =>
      Effect.gen(function* () {
        const sampleSize = params.windowSize ?? 1000
        const query = `
          SELECT * FROM traces
          WHERE start_time >= toDateTime64(${params.timeRange.start}, 9)
            AND start_time <= toDateTime64(${params.timeRange.end}, 9)
          ORDER BY start_time DESC
          LIMIT ${sampleSize}
        `

        const result = yield* client
          .query<Record<string, unknown>>({
            query,
            format: 'JSONEachRow'
          })
          .pipe(
            Effect.mapError((error: DatabaseError) =>
              StorageErrorConstructors.ReadError({
                message: `Failed to query for AI: ${error.message}`,
                operation: 'queryForAI',
                cause: error
              })
            )
          )

        // Transform the traces into feature vectors for AI processing
        const features = result.map((trace) => {
          // Extract numeric features from traces for AI processing
          const duration = Number(trace.duration_ns) || 0
          const statusCode = Number(trace.status_code) || 0
          const startTime = Number(trace.start_time) || 0

          return [duration, statusCode, startTime]
        })

        return {
          features,
          labels: undefined,
          metadata: {
            timeRange: params.timeRange,
            sampleCount: result.length,
            datasetType: params.datasetType,
            features: params.features
          },
          timeRange: params.timeRange,
          sampleCount: result.length
        }
      })

    const queryRaw = (sql: string): Effect.Effect<unknown[], StorageError> =>
      client
        .query({
          query: sql,
          format: 'JSONEachRow'
        })
        .pipe(
          Effect.mapError((error: DatabaseError) =>
            StorageErrorConstructors.DatabaseError({
              message: `Query failed: ${error.message}`,
              operation: 'queryRaw',
              cause: error
            })
          )
        )

    const healthCheck = (): Effect.Effect<boolean, StorageError> =>
      client.ping().pipe(
        Effect.mapError((error: DatabaseError) =>
          StorageErrorConstructors.ConnectionError({
            message: `Health check failed: ${error.message}`,
            cause: error
          })
        )
      )

    const close = (): Effect.Effect<void, never> => client.close()

    // Return the storage implementation
    return {
      writeOTLP,
      writeBatch,
      queryTraces,
      queryMetrics,
      queryLogs,
      queryForAI,
      queryRaw,
      healthCheck,
      close
    }
  })

// ============================================================================
// Layer Construction for dependency injection
// ============================================================================

export const makeClickHouseStorageLayer = (
  config: ClickHouseConfig
): Layer.Layer<ClickHouseStorageTag, StorageError, never> =>
  Layer.effect(ClickHouseStorageTag, makeClickHouseStorage(config))
