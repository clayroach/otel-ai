/**
 * Shared ClickHouse Client Helper for Integration Tests
 *
 * Provides a properly configured ClickHouse client with retry logic,
 * connection pooling, and appropriate timeouts for integration testing.
 */

import { createClient, type ClickHouseClient } from '@clickhouse/client'

// Singleton client instance
let sharedClient: ClickHouseClient | null = null

/**
 * Get or create a shared ClickHouse client for integration tests
 * This uses a singleton pattern to avoid creating multiple connections
 *
 * @returns Configured ClickHouse client
 */
export function getTestClickHouseClient(): ClickHouseClient {
  if (!sharedClient) {
    sharedClient = createClient({
      url: `http://${process.env.CLICKHOUSE_HOST || 'localhost'}:${process.env.CLICKHOUSE_PORT || '8124'}`,
      username: process.env.CLICKHOUSE_USERNAME || 'otel',
      password: process.env.CLICKHOUSE_PASSWORD || 'otel123',
      database: process.env.CLICKHOUSE_DATABASE || 'otel',

      // Connection pooling configuration
      max_open_connections: 10,

      // Request configuration with retries
      request_timeout: 30000, // 30 seconds per request

      // ClickHouse specific settings
      clickhouse_settings: {
        max_memory_usage: '4000000000', // 4GB (string)
        max_execution_time: 120, // 2 minutes (number)
        connect_timeout: 10, // 10 seconds to connect (number)
        receive_timeout: 30, // 30 seconds to receive data (number)
        send_timeout: 30, // 30 seconds to send data (number)

        // Enable query retry on connection errors
        distributed_product_mode: 'allow',

        // Connection pool settings
        connections_with_failover_max_tries: '3', // string
        connection_pool_max_wait_ms: 5000 // number
      },

      // Compression for large data transfers
      compression: {
        request: false, // Don't compress requests (small)
        response: true // Compress responses (can be large)
      },

      // Keep alive to reuse connections
      keep_alive: {
        enabled: true,
        idle_socket_ttl: 30000 // 30 seconds
      }
    })
  }

  return sharedClient
}

/**
 * Close the shared client connection
 * Call this in global teardown or when tests complete
 */
export async function closeTestClickHouseClient(): Promise<void> {
  if (sharedClient) {
    await sharedClient.close()
    sharedClient = null
  }
}

/**
 * Execute a query with automatic retry logic
 *
 * @param query - The SQL query to execute
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param retryDelay - Delay between retries in ms (default: 1000)
 * @returns Query result
 */
export async function executeWithRetry<T = unknown>(
  query: string,
  maxRetries: number = 3,
  retryDelay: number = 1000
): Promise<T> {
  const client = getTestClickHouseClient()
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await client.query({
        query,
        format: 'JSON'
      })
      return (await result.json()) as T
    } catch (error) {
      lastError = error as Error

      // Check if error is retryable
      const errorMessage = lastError.message.toLowerCase()
      const isRetryable =
        errorMessage.includes('econnreset') ||
        errorMessage.includes('econnrefused') ||
        errorMessage.includes('socket hang up') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('enotfound')

      if (!isRetryable || attempt === maxRetries) {
        throw lastError
      }

      console.log(`⚠️ Query failed (attempt ${attempt}/${maxRetries}): ${errorMessage}`)
      console.log(`   Retrying in ${retryDelay}ms...`)

      await new Promise((resolve) => setTimeout(resolve, retryDelay))

      // Exponential backoff for subsequent retries
      retryDelay = Math.min(retryDelay * 2, 10000)
    }
  }

  throw lastError || new Error('Query failed after all retries')
}

/**
 * Wait for ClickHouse to be ready by executing a simple query
 *
 * @param maxWaitTime - Maximum time to wait in milliseconds (default: 30000)
 * @returns true when ready, throws error if timeout
 */
export async function waitForClickHouseReady(maxWaitTime: number = 30000): Promise<boolean> {
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitTime) {
    try {
      await executeWithRetry('SELECT 1', 1, 500)
      console.log('✅ ClickHouse is ready')
      return true
    } catch (error) {
      const elapsed = Date.now() - startTime
      if (elapsed >= maxWaitTime) {
        throw new Error(`ClickHouse did not become ready within ${maxWaitTime}ms`)
      }

      console.log(`⏳ Waiting for ClickHouse... (${Math.floor(elapsed / 1000)}s elapsed)`)
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  throw new Error(`ClickHouse did not become ready within ${maxWaitTime}ms`)
}

/**
 * Create test tables if they don't exist
 * Useful for tests that need specific table structures
 */
export async function ensureTestTables(): Promise<void> {
  const queries = [
    // Traces table
    `
    CREATE TABLE IF NOT EXISTS traces (
      trace_id String,
      span_id String,
      parent_span_id String,
      service_name String,
      operation_name String,
      start_time DateTime64(9),
      end_time DateTime64(9),
      duration_ns UInt64,
      span_kind String,
      status_code String,
      span_attributes Map(String, String),
      resource_attributes Map(String, String),
      encoding_type String DEFAULT 'json'
    ) ENGINE = MergeTree()
    ORDER BY (start_time, trace_id, span_id)
    `,

    // Metrics table
    `
    CREATE TABLE IF NOT EXISTS metrics (
      metric_name String,
      metric_type String,
      service_name String,
      timestamp DateTime64(9),
      value Float64,
      attributes Map(String, String),
      resource_attributes Map(String, String)
    ) ENGINE = MergeTree()
    ORDER BY (timestamp, service_name, metric_name)
    `,

    // Logs table
    `
    CREATE TABLE IF NOT EXISTS logs (
      timestamp DateTime64(9),
      trace_id String,
      span_id String,
      service_name String,
      severity_text String,
      severity_number UInt8,
      body String,
      attributes Map(String, String),
      resource_attributes Map(String, String)
    ) ENGINE = MergeTree()
    ORDER BY (timestamp, service_name)
    `
  ]

  for (const query of queries) {
    try {
      await executeWithRetry(query, 2, 500)
    } catch (error) {
      // Table might already exist, which is fine
      console.warn(`Table creation warning (may be normal): ${error}`)
    }
  }
}
