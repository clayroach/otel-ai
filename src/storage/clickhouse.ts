/**
 * ClickHouse storage implementation with OTLP ingestion and AI-optimized queries
 */

import { Effect, Schedule, Stream, Sink, Chunk, Option } from 'effect'
import { Schema } from '@effect/schema'
import { createClient, type ClickHouseClient } from '@clickhouse/client'
import {
  type TraceData,
  type MetricData,
  type LogData,
  type OTLPData,
  type QueryParams,
  type AIQueryParams,
  type AIDataset,
  OTLPDataSchema,
  QueryParamsSchema,
  AIQueryParamsSchema
} from './schemas.js'
import { type ClickHouseConfig } from './config.js'
import { type StorageError, StorageErrorConstructors } from './errors.js'

// Temporarily remove timeout operations to fix compilation issues

export interface ClickHouseStorage {
  readonly writeOTLP: (data: OTLPData) => Effect.Effect<void, StorageError>
  readonly writeBatch: (data: OTLPData[]) => Effect.Effect<void, StorageError>
  readonly queryTraces: (params: QueryParams) => Effect.Effect<TraceData[], StorageError>
  readonly queryMetrics: (params: QueryParams) => Effect.Effect<MetricData[], StorageError>
  readonly queryLogs: (params: QueryParams) => Effect.Effect<LogData[], StorageError>
  readonly queryForAI: (params: AIQueryParams) => Effect.Effect<AIDataset, StorageError>
  readonly healthCheck: () => Effect.Effect<boolean, StorageError>
  readonly close: () => Effect.Effect<void, never>
}

export const makeClickHouseStorage = (
  config: ClickHouseConfig
): Effect.Effect<ClickHouseStorage, StorageError> =>
  Effect.gen(function* (_) {
    // Create ClickHouse client
    const client = createClient({
      host: `http://${config.host}:${config.port}`,
      database: config.database,
      username: config.username,
      password: config.password,
      // Remove timeout config for now - will use defaults
      compression: {
        response: config.compression ?? true,
        request: config.compression ?? true
      }
    })

    // Test connection
    yield* _(
      Effect.tryPromise({
        try: () => client.query({ query: 'SELECT 1' }),
        catch: (error) =>
          StorageErrorConstructors.ConnectionError(`Failed to connect to ClickHouse: ${error}`, error)
      })
    )

    const writeOTLP = (data: OTLPData): Effect.Effect<void, StorageError> =>
      Effect.gen(function* (_) {
        // Validate input data
        const validatedData = yield* _(
          Schema.decodeUnknown(OTLPDataSchema)(data).pipe(
            Effect.mapError((parseError) =>
              StorageErrorConstructors.ValidationError(
                'Invalid OTLP data structure',
                parseError.message ? [parseError.message] : ['Unknown validation error']
              )
            )
          )
        )

        // Write traces if present
        if (validatedData.traces && validatedData.traces.length > 0) {
          yield* _(writeTraces([...validatedData.traces]))
        }

        // Write metrics if present
        if (validatedData.metrics && validatedData.metrics.length > 0) {
          yield* _(writeMetrics([...validatedData.metrics]))
        }

        // Write logs if present
        if (validatedData.logs && validatedData.logs.length > 0) {
          yield* _(writeLogs([...validatedData.logs]))
        }
      })

    const writeBatch = (data: OTLPData[]): Effect.Effect<void, StorageError> =>
      Effect.gen(function* (_) {
        // Process batches with controlled concurrency
        yield* _(
          Effect.forEach(data, (batch) => writeOTLP(batch), {
            concurrency: config.maxOpenConnections ?? 5
          })
        )
      })

    const writeTraces = (traces: TraceData[]): Effect.Effect<void, StorageError> =>
      Effect.gen(function* (_) {
        const insertQuery = `
          INSERT INTO otel_traces (
            Timestamp, TraceId, SpanId, ParentSpanId, SpanName, SpanKind,
            ServiceName, ResourceAttributes, Duration, StatusCode, StatusMessage,
            SpanAttributes, Events
          ) VALUES
        `

        const values = traces.map((trace) => [
          new Date(trace.startTime / 1000000), // Convert nanoseconds to milliseconds
          trace.traceId,
          trace.spanId,
          trace.parentSpanId || '',
          trace.operationName,
          trace.spanKind,
          trace.serviceName,
          trace.resourceAttributes,
          trace.duration,
          trace.statusCode,
          trace.statusMessage || '',
          trace.attributes,
          trace.events.map((event) => [
            new Date(event.timestamp / 1000000),
            event.name,
            event.attributes
          ])
        ])

        yield* _(
          Effect.tryPromise({
            try: () =>
              client.insert({
                table: 'otel_traces',
                values,
                format: 'JSONEachRow'
              }),
            catch: (error) =>
              StorageErrorConstructors.QueryError(`Failed to insert traces: ${error}`, insertQuery, error)
          }).pipe(
            Effect.retry(
              Schedule.exponential('100 millis').pipe(Schedule.compose(Schedule.recurs(3)))
            )
          )
        )
      })

    const writeMetrics = (metrics: MetricData[]): Effect.Effect<void, StorageError> =>
      Effect.gen(function* (_) {
        // Group metrics by type for optimal insertion
        const sums = metrics.filter((m) => m.metricType === 'counter')
        const gauges = metrics.filter((m) => m.metricType === 'gauge')
        const histograms = metrics.filter((m) => m.metricType === 'histogram')

        // Insert sums/counters
        if (sums.length > 0) {
          yield* _(insertMetricsToTable('otel_metrics_sum', sums))
        }

        // Insert gauges
        if (gauges.length > 0) {
          yield* _(insertMetricsToTable('otel_metrics_gauge', gauges))
        }

        // Insert histograms (more complex structure)
        if (histograms.length > 0) {
          yield* _(insertHistogramMetrics(histograms))
        }
      })

    const insertMetricsToTable = (
      tableName: string,
      metrics: MetricData[]
    ): Effect.Effect<void, StorageError> =>
      Effect.gen(function* (_) {
        const values = metrics.map((metric) => ({
          MetricName: metric.metricName,
          Timestamp: new Date(metric.timestamp / 1000000),
          Value: metric.value,
          Attributes: metric.attributes,
          ResourceAttributes: metric.resourceAttributes
        }))

        yield* _(
          Effect.tryPromise({
            try: () =>
              client.insert({
                table: tableName,
                values,
                format: 'JSONEachRow'
              }),
            catch: (error) =>
              StorageErrorConstructors.QueryError(
                `Failed to insert metrics to ${tableName}: ${error}`,
                `INSERT INTO ${tableName}`,
                error
              )
          }).pipe(
            Effect.retry(
              Schedule.exponential('100 millis').pipe(Schedule.compose(Schedule.recurs(3)))
            )
          )
        )
      })

    const insertHistogramMetrics = (histograms: MetricData[]): Effect.Effect<void, StorageError> =>
      Effect.gen(function* (_) {
        // Insert histogram data with bucket information
        for (const histogram of histograms) {
          if (histogram.buckets) {
            const values = histogram.buckets.map((bucket) => ({
              MetricName: histogram.metricName,
              Timestamp: new Date(histogram.timestamp / 1000000),
              Attributes: histogram.attributes,
              ResourceAttributes: histogram.resourceAttributes,
              BucketBoundary: bucket.boundary,
              BucketCount: bucket.count
            }))

            yield* _(
              Effect.tryPromise({
                try: () =>
                  client.insert({
                    table: 'otel_metrics_histogram',
                    values,
                    format: 'JSONEachRow'
                  }),
                catch: (error) =>
                  StorageErrorConstructors.QueryError(
                    `Failed to insert histogram metrics: ${error}`,
                    'INSERT INTO otel_metrics_histogram',
                    error
                  )
              }).pipe(
                Effect.retry(
                  Schedule.exponential('100 millis').pipe(Schedule.compose(Schedule.recurs(3)))
                )
              )
            )
          }
        }
      })

    const writeLogs = (logs: LogData[]): Effect.Effect<void, StorageError> =>
      Effect.gen(function* (_) {
        const values = logs.map((log) => ({
          Timestamp: new Date(log.timestamp / 1000000),
          TraceId: log.traceId || '',
          SpanId: log.spanId || '',
          SeverityText: log.severityText || '',
          SeverityNumber: log.severityNumber || 0,
          Body: log.body,
          LogAttributes: log.attributes,
          ResourceAttributes: log.resourceAttributes
        }))

        yield* _(
          Effect.tryPromise({
            try: () =>
              client.insert({
                table: 'otel_logs',
                values,
                format: 'JSONEachRow'
              }),
            catch: (error) =>
              StorageErrorConstructors.QueryError(
                `Failed to insert logs: ${error}`,
                'INSERT INTO otel_logs',
                error
              )
          }).pipe(
            Effect.retry(
              Schedule.exponential('100 millis').pipe(Schedule.compose(Schedule.recurs(3)))
            )
          )
        )
      })

    const queryTraces = (params: QueryParams): Effect.Effect<TraceData[], StorageError> =>
      Effect.gen(function* (_) {
        const validatedParams = yield* _(
          Schema.decodeUnknown(QueryParamsSchema)(params).pipe(
            Effect.mapError((parseError) =>
              StorageErrorConstructors.ValidationError(
                'Invalid query parameters',
                parseError.message ? [parseError.message] : ['Unknown validation error']
              )
            )
          )
        )

        const query = buildTraceQuery(validatedParams)

        const result = yield* _(
          Effect.tryPromise({
            try: () =>
              client.query({
                query,
                format: 'JSONEachRow'
              }),
            catch: (error) => StorageErrorConstructors.QueryError(`Trace query failed: ${error}`, query, error)
          })
        )

        const resultSet = yield* _(Effect.promise(() => result.json<any[]>()))
        return resultSet.map((row) => transformClickHouseRowToTrace(row))
      })

    const queryMetrics = (params: QueryParams): Effect.Effect<MetricData[], StorageError> =>
      Effect.gen(function* (_) {
        // Similar implementation for metrics
        const query = buildMetricQuery(params)

        const result = yield* _(
          Effect.tryPromise({
            try: () => client.query({ query, format: 'JSONEachRow' }),
            catch: (error) => StorageErrorConstructors.QueryError(`Metric query failed: ${error}`, query, error)
          })
        )

        const resultSet = yield* _(Effect.promise(() => result.json<any[]>()))
        return resultSet.map((row) => transformClickHouseRowToMetric(row))
      })

    const queryLogs = (params: QueryParams): Effect.Effect<LogData[], StorageError> =>
      Effect.gen(function* (_) {
        // Similar implementation for logs
        const query = buildLogQuery(params)

        const result = yield* _(
          Effect.tryPromise({
            try: () => client.query({ query, format: 'JSONEachRow' }),
            catch: (error) => StorageErrorConstructors.QueryError(`Log query failed: ${error}`, query, error)
          })
        )

        const resultSet = yield* _(Effect.promise(() => result.json<any[]>()))
        return resultSet.map((row) => transformClickHouseRowToLog(row))
      })

    const queryForAI = (params: AIQueryParams): Effect.Effect<AIDataset, StorageError> =>
      Effect.gen(function* (_) {
        // AI-optimized query implementation
        const query = buildAIQuery(params)

        const result = yield* _(
          Effect.tryPromise({
            try: () => client.query({ query, format: 'JSONEachRow' }),
            catch: (error) => StorageErrorConstructors.QueryError(`AI query failed: ${error}`, query, error)
          })
        )

        const resultSet = yield* _(Effect.promise(() => result.json<any[]>()))
        return transformResultSetToAIDataset(resultSet, params)
      })

    const healthCheck = (): Effect.Effect<boolean, StorageError> =>
      Effect.gen(function* (_) {
        yield* _(
          Effect.tryPromise({
            try: () => client.query({ query: 'SELECT 1 as health' }),
            catch: (error) => StorageErrorConstructors.ConnectionError(`Health check failed: ${error}`, error)
          })
        )
        return true
      })

    const close = (): Effect.Effect<void, never> => Effect.sync(() => client.close())

    return {
      writeOTLP,
      writeBatch,
      queryTraces,
      queryMetrics,
      queryLogs,
      queryForAI,
      healthCheck,
      close
    }
  })

// Helper functions for query building and data transformation
const buildTraceQuery = (params: QueryParams): string => {
  const { timeRange, filters, limit, offset, orderBy, orderDirection } = params

  let query = `
    SELECT 
      TraceId as traceId,
      SpanId as spanId,
      ParentSpanId as parentSpanId,
      SpanName as operationName,
      Timestamp as startTime,
      Duration as duration,
      ServiceName as serviceName,
      StatusCode as statusCode,
      StatusMessage as statusMessage,
      SpanKind as spanKind,
      SpanAttributes as attributes,
      ResourceAttributes as resourceAttributes
    FROM otel_traces 
    WHERE Timestamp >= ${new Date(timeRange.start).toISOString()}
      AND Timestamp <= ${new Date(timeRange.end).toISOString()}
  `

  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      query += ` AND ${key} = '${value}'`
    })
  }

  if (orderBy) {
    query += ` ORDER BY ${orderBy} ${orderDirection || 'ASC'}`
  }

  if (limit) {
    query += ` LIMIT ${limit}`
  }

  if (offset) {
    query += ` OFFSET ${offset}`
  }

  return query
}

const buildMetricQuery = (params: QueryParams): string => {
  // Similar query building logic for metrics
  const { timeRange, limit } = params
  return `
    SELECT MetricName, Timestamp, Value, Attributes, ResourceAttributes
    FROM otel_metrics_sum
    WHERE Timestamp >= '${new Date(timeRange.start).toISOString()}'
      AND Timestamp <= '${new Date(timeRange.end).toISOString()}'
    ${limit ? `LIMIT ${limit}` : ''}
  `
}

const buildLogQuery = (params: QueryParams): string => {
  // Similar query building logic for logs
  const { timeRange, limit } = params
  return `
    SELECT Timestamp, TraceId, SpanId, SeverityText, SeverityNumber, Body, LogAttributes, ResourceAttributes
    FROM otel_logs
    WHERE Timestamp >= '${new Date(timeRange.start).toISOString()}'
      AND Timestamp <= '${new Date(timeRange.end).toISOString()}'
    ${limit ? `LIMIT ${limit}` : ''}
  `
}

const buildAIQuery = (params: AIQueryParams): string => {
  // AI-optimized query with feature extraction
  const { timeRange, features, windowSize, datasetType } = params

  switch (datasetType) {
    case 'anomaly-detection':
      return `
        SELECT 
          ${features.join(', ')},
          toUnixTimestamp(Timestamp) as timestamp
        FROM otel_traces
        WHERE Timestamp >= '${new Date(timeRange.start).toISOString()}'
          AND Timestamp <= '${new Date(timeRange.end).toISOString()}'
        ORDER BY Timestamp
      `
    default:
      return buildTraceQuery(params)
  }
}

const transformClickHouseRowToTrace = (row: any): TraceData => ({
  traceId: row.traceId,
  spanId: row.spanId,
  parentSpanId: row.parentSpanId,
  operationName: row.operationName,
  startTime: new Date(row.startTime).getTime() * 1000000, // Convert to nanoseconds
  endTime: new Date(row.startTime).getTime() * 1000000 + row.duration * 1000000,
  duration: row.duration,
  serviceName: row.serviceName,
  statusCode: row.statusCode,
  statusMessage: row.statusMessage,
  spanKind: row.spanKind,
  attributes: row.attributes || {},
  resourceAttributes: row.resourceAttributes || {},
  events: [],
  links: []
})

const transformClickHouseRowToMetric = (row: any): MetricData => ({
  metricName: row.MetricName,
  timestamp: new Date(row.Timestamp).getTime() * 1000000,
  value: row.Value,
  metricType: 'counter' as const,
  attributes: row.Attributes || {},
  resourceAttributes: row.ResourceAttributes || {}
})

const transformClickHouseRowToLog = (row: any): LogData => ({
  timestamp: new Date(row.Timestamp).getTime() * 1000000,
  observedTimestamp: new Date(row.Timestamp).getTime() * 1000000,
  severityText: row.SeverityText,
  severityNumber: row.SeverityNumber,
  body: row.Body,
  traceId: row.TraceId,
  spanId: row.SpanId,
  attributes: row.LogAttributes || {},
  resourceAttributes: row.ResourceAttributes || {}
})

const transformResultSetToAIDataset = (resultSet: any[], params: AIQueryParams): AIDataset => ({
  features: resultSet.map((row) => params.features.map((feature) => parseFloat(row[feature]) || 0)),
  metadata: {
    query: params,
    resultCount: resultSet.length
  },
  timeRange: params.timeRange,
  sampleCount: resultSet.length
})
