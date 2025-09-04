/**
 * Effect-native ClickHouse client wrapper v2
 *
 * Wraps the ClickHouse client at the boundary, providing pure Effect functions
 * for all database operations. Following ADR-007 principles.
 */

import { Effect, Layer, Context, Data } from 'effect'
import { createClient, type ClickHouseClient } from '@clickhouse/client'
import { type ClickHouseConfig } from './config.js'

// ============================================================================
// Error Types
// ============================================================================

export class DatabaseError extends Data.TaggedError('DatabaseError')<{
  readonly message: string
  readonly operation?: string
  readonly cause?: unknown
}> {}

export class ConnectionError extends Data.TaggedError('ConnectionError')<{
  readonly message: string
  readonly host?: string
  readonly port?: number
  readonly cause?: unknown
}> {}

// ============================================================================
// Effect-Native ClickHouse Client Interface
// ============================================================================

export interface EffectClickHouseClient {
  readonly query: <T = unknown>(params: {
    query: string
    format?: string
  }) => Effect.Effect<T[], DatabaseError>

  readonly insert: <T = unknown>(params: {
    table: string
    values: T[]
    format?: string
  }) => Effect.Effect<void, DatabaseError>

  readonly exec: (params: { query: string }) => Effect.Effect<void, DatabaseError>

  readonly ping: () => Effect.Effect<boolean, DatabaseError>

  readonly close: () => Effect.Effect<void, never>
}

export class EffectClickHouseClientTag extends Context.Tag('EffectClickHouseClient')<
  EffectClickHouseClientTag,
  EffectClickHouseClient
>() {}

// ============================================================================
// Implementation
// ============================================================================

class EffectClickHouseClientImpl implements EffectClickHouseClient {
  constructor(private readonly client: ClickHouseClient) {}

  query<T = unknown>(params: {
    query: string
    format?: string
  }): Effect.Effect<T[], DatabaseError> {
    const self = this
    return Effect.gen(function* () {
      const result = yield* Effect.tryPromise({
        try: () =>
          self.client.query({
            query: params.query,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            format: (params.format || 'JSONEachRow') as any
          }),
        catch: (error) =>
          new DatabaseError({
            message: `Query failed: ${String(error)}`,
            operation: 'query',
            cause: error
          })
      })

      const data = yield* Effect.tryPromise({
        try: () => result.json() as Promise<T[]>,
        catch: (error) =>
          new DatabaseError({
            message: `Failed to parse query result: ${String(error)}`,
            operation: 'query',
            cause: error
          })
      })

      return Array.isArray(data) ? data : [data]
    })
  }

  insert<T = unknown>(params: {
    table: string
    values: T[]
    format?: string
  }): Effect.Effect<void, DatabaseError> {
    return Effect.tryPromise({
      try: () =>
        this.client.insert({
          table: params.table,
          values: params.values,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          format: (params.format || 'JSONEachRow') as any
        }),
      catch: (error) =>
        new DatabaseError({
          message: `Insert failed: ${String(error)}`,
          operation: 'insert',
          cause: error
        })
    }).pipe(Effect.map(() => void 0))
  }

  exec(params: { query: string }): Effect.Effect<void, DatabaseError> {
    return Effect.tryPromise({
      try: () => this.client.exec({ query: params.query }),
      catch: (error) =>
        new DatabaseError({
          message: `Exec failed: ${String(error)}`,
          operation: 'exec',
          cause: error
        })
    }).pipe(Effect.map(() => void 0))
  }

  ping(): Effect.Effect<boolean, DatabaseError> {
    return Effect.tryPromise({
      try: async () => {
        await this.client.ping()
        return true
      },
      catch: (error) =>
        new DatabaseError({
          message: `Ping failed: ${String(error)}`,
          operation: 'ping',
          cause: error
        })
    })
  }

  close(): Effect.Effect<void, never> {
    return Effect.promise(() => this.client.close())
  }
}

// ============================================================================
// Layer Construction
// ============================================================================

export const makeEffectClickHouseClientLayer = (
  config: ClickHouseConfig
): Layer.Layer<EffectClickHouseClientTag, ConnectionError, never> =>
  Layer.scoped(
    EffectClickHouseClientTag,
    Effect.gen(function* () {
      // Create the underlying ClickHouse client
      const client = createClient({
        url: `http://${config.host}:${config.port}`,
        database: config.database,
        username: config.username,
        password: config.password,
        clickhouse_settings: {
          // Disable async insert to avoid parse errors in tests
          async_insert: 0,
          date_time_input_format: 'best_effort',
          date_time_output_format: 'iso',
          output_format_json_named_tuples_as_objects: 1,
          input_format_skip_unknown_fields: 1
        }
      })

      // Test connection
      const effectClient = new EffectClickHouseClientImpl(client)

      const pingResult = yield* effectClient.ping().pipe(
        Effect.catchAll(() =>
          Effect.fail(
            new ConnectionError({
              message: `Failed to connect to ClickHouse at ${config.host}:${config.port}`,
              host: config.host,
              port: config.port
            })
          )
        )
      )

      if (!pingResult) {
        return yield* Effect.fail(
          new ConnectionError({
            message: `ClickHouse connection test failed`,
            host: config.host,
            port: config.port
          })
        )
      }

      // Register cleanup
      yield* Effect.addFinalizer(() => effectClient.close())

      return effectClient
    })
  )

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create an Effect-native ClickHouse client from config
 */
export const createEffectClickHouseClient = (
  config: ClickHouseConfig
): Effect.Effect<EffectClickHouseClient, ConnectionError> => {
  const layer = makeEffectClickHouseClientLayer(config)
  return Layer.build(layer).pipe(
    Effect.map((context) => Context.get(context, EffectClickHouseClientTag)),
    Effect.scoped
  )
}
