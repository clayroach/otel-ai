/**
 * Dependency Aggregator Service
 *
 * SigNoz-inspired service that periodically aggregates span relationships
 * into service dependency tables for efficient querying.
 */

import { Effect, Schedule, Duration, Console, Context, Layer, Stream } from 'effect'
import { createClient, type ClickHouseClient } from '@clickhouse/client'
import { type ClickHouseConfig } from './config.js'
import { StorageErrorConstructors, type StorageError } from './errors.js'

export interface DependencyAggregator {
  readonly start: () => Effect.Effect<void, StorageError, never>
  readonly stop: () => Effect.Effect<void, never, never>
  readonly runOnce: () => Effect.Effect<void, StorageError, never>
}

export const DependencyAggregatorTag =
  Context.GenericTag<DependencyAggregator>('DependencyAggregator')

interface AggregatorConfig {
  readonly intervalSeconds: number
  readonly enabled: boolean
}

const DEFAULT_CONFIG: AggregatorConfig = {
  intervalSeconds: 30,
  enabled: true
}

// Aggregation query for 5-minute windows
const AGGREGATE_5MIN_QUERY = `
  INSERT INTO otel.service_dependencies_5min
  SELECT
      toStartOfFiveMinute(child.timestamp) AS window_start,
      parent.service_name AS parent_service,
      parent.operation_name AS parent_operation,
      child.service_name AS child_service,
      child.operation_name AS child_operation,
      count() AS call_count,
      avg(toFloat64(child.duration_ns) / 1000000) AS avg_duration_ms,
      quantile(0.95)(toFloat64(child.duration_ns) / 1000000) AS p95_duration_ms,
      countIf(child.status_code IN ('ERROR', 'STATUS_CODE_ERROR', '2')) AS error_count,
      count() AS total_count
  FROM otel.span_relationships AS parent
  INNER JOIN otel.span_relationships AS child
      ON parent.trace_id = child.trace_id
      AND parent.span_id = child.parent_span_id
  WHERE parent.service_name != child.service_name
      AND child.timestamp >= now() - INTERVAL 10 MINUTE
      AND (window_start, parent_service, parent_operation, child_service, child_operation) NOT IN (
          SELECT window_start, parent_service, parent_operation, child_service, child_operation
          FROM otel.service_dependencies_5min
          WHERE window_start >= now() - INTERVAL 10 MINUTE
      )
  GROUP BY
      window_start,
      parent_service,
      parent_operation,
      child_service,
      child_operation
  HAVING call_count > 0
  SETTINGS
      max_memory_usage = 1073741824,
      max_bytes_before_external_group_by = 536870912
`

// Aggregation query for hourly windows
const AGGREGATE_HOURLY_QUERY = `
  INSERT INTO otel.service_dependencies_hourly
  SELECT
      toStartOfHour(child.timestamp) AS window_start,
      parent.service_name AS parent_service,
      child.service_name AS child_service,
      count() AS call_count,
      avg(toFloat64(child.duration_ns) / 1000000) AS avg_duration_ms,
      quantile(0.95)(toFloat64(child.duration_ns) / 1000000) AS p95_duration_ms,
      countIf(child.status_code IN ('ERROR', 'STATUS_CODE_ERROR', '2')) AS error_count,
      count() AS total_count
  FROM otel.span_relationships AS parent
  INNER JOIN otel.span_relationships AS child
      ON parent.trace_id = child.trace_id
      AND parent.span_id = child.parent_span_id
  WHERE parent.service_name != child.service_name
      AND child.timestamp >= now() - INTERVAL 2 HOUR
      AND (window_start, parent_service, child_service) NOT IN (
          SELECT window_start, parent_service, child_service
          FROM otel.service_dependencies_hourly
          WHERE window_start >= now() - INTERVAL 2 HOUR
      )
  GROUP BY
      window_start,
      parent_service,
      child_service
  HAVING call_count > 0
  SETTINGS
      max_memory_usage = 1073741824,
      max_bytes_before_external_group_by = 536870912
`

const makeDependencyAggregator = (
  client: ClickHouseClient,
  config: AggregatorConfig = DEFAULT_CONFIG
): DependencyAggregator => {
  let isRunning = false

  const runAggregation = (): Effect.Effect<void, StorageError, never> =>
    Effect.gen(function* () {
      yield* Console.log('[DependencyAggregator] Running aggregation...')

      // Run 5-minute aggregation
      yield* Effect.tryPromise({
        try: async () => {
          const result = await client.exec({
            query: AGGREGATE_5MIN_QUERY,
            clickhouse_settings: {
              wait_end_of_query: 1
            }
          })
          return result
        },
        catch: (error) =>
          StorageErrorConstructors.QueryError(
            `Failed to aggregate 5-minute dependencies: ${String(error)}`,
            AGGREGATE_5MIN_QUERY,
            error
          )
      })

      // Run hourly aggregation
      yield* Effect.tryPromise({
        try: async () => {
          const result = await client.exec({
            query: AGGREGATE_HOURLY_QUERY,
            clickhouse_settings: {
              wait_end_of_query: 1
            }
          })
          return result
        },
        catch: (error) =>
          StorageErrorConstructors.QueryError(
            `Failed to aggregate hourly dependencies: ${String(error)}`,
            AGGREGATE_HOURLY_QUERY,
            error
          )
      })

      // Get stats for logging (allow failure)
      const stats = yield* Effect.tryPromise({
        try: async () => {
          const result = await client.query({
            query: `
              SELECT
                (SELECT count() FROM otel.service_dependencies_5min WHERE window_start >= now() - INTERVAL 10 MINUTE) as count_5min,
                (SELECT count() FROM otel.service_dependencies_hourly WHERE window_start >= now() - INTERVAL 2 HOUR) as count_hourly
            `,
            format: 'JSONEachRow'
          })
          const data = await result.json()
          return data[0] as { count_5min: number; count_hourly: number }
        },
        catch: () => ({ count_5min: 0, count_hourly: 0 })
      }).pipe(Effect.catchAll(() => Effect.succeed({ count_5min: 0, count_hourly: 0 })))

      yield* Console.log(
        `[DependencyAggregator] Aggregation complete. 5min: ${stats.count_5min} deps, Hourly: ${stats.count_hourly} deps`
      )
    })

  const start = (): Effect.Effect<void, StorageError, never> =>
    Effect.gen(function* () {
      if (isRunning) {
        yield* Console.log('[DependencyAggregator] Already running')
        return
      }

      if (!config.enabled) {
        yield* Console.log('[DependencyAggregator] Disabled by configuration')
        return
      }

      isRunning = true
      yield* Console.log(`[DependencyAggregator] Starting with ${config.intervalSeconds}s interval`)

      // Run immediately, then schedule
      yield* runAggregation()

      // Create a stream that runs the aggregation periodically
      yield* Stream.fromSchedule(Schedule.fixed(Duration.seconds(config.intervalSeconds))).pipe(
        Stream.mapEffect(() => runAggregation()),
        Stream.runDrain,
        Effect.catchAll((error) =>
          Console.error(`[DependencyAggregator] Error in scheduled run:`, error)
        ),
        Effect.fork // Run in background
      )
    })

  const stop = (): Effect.Effect<void, never, never> =>
    Effect.gen(function* () {
      isRunning = false
      yield* Console.log('[DependencyAggregator] Stopped')
    })

  return {
    start,
    stop,
    runOnce: runAggregation
  }
}

// Create the Layer for the aggregator
export const DependencyAggregatorLive = (config?: AggregatorConfig) =>
  Layer.effect(
    DependencyAggregatorTag,
    Effect.gen(function* () {
      const clickhouseConfig: ClickHouseConfig = {
        host: process.env.CLICKHOUSE_HOST || 'localhost',
        port: parseInt(process.env.CLICKHOUSE_PORT || '8123'),
        database: process.env.CLICKHOUSE_DATABASE || 'otel',
        username: process.env.CLICKHOUSE_USER || 'otel',
        password: process.env.CLICKHOUSE_PASSWORD || 'otel123',
        compression: true
      }

      const client = createClient({
        host: `http://${clickhouseConfig.host}:${clickhouseConfig.port}`,
        database: clickhouseConfig.database,
        username: clickhouseConfig.username,
        password: clickhouseConfig.password,
        compression: {
          response: clickhouseConfig.compression ?? true,
          request: clickhouseConfig.compression ?? true
        },
        request_timeout: 30000,
        max_open_connections: 10
      })

      // Test connection
      yield* Effect.tryPromise({
        try: () => client.query({ query: 'SELECT 1' }),
        catch: (error) =>
          StorageErrorConstructors.ConnectionError(
            `Failed to connect to ClickHouse: ${error}`,
            error
          )
      })

      return makeDependencyAggregator(client, config)
    })
  )

// Mock implementation for testing
export const DependencyAggregatorMock = Layer.succeed(
  DependencyAggregatorTag,
  DependencyAggregatorTag.of({
    start: () => Effect.succeed(undefined),
    stop: () => Effect.succeed(undefined),
    runOnce: () => Effect.succeed(undefined)
  })
)
