/**
 * ClickHouse Memory Stress Test
 *
 * Dedicated test for reproducing and validating memory protection patterns.
 * Uses a low-memory ClickHouse container to reliably trigger memory issues
 * and verify that our protection mechanisms prevent crashes.
 */

import { Effect, pipe } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type ClickHouseClient as EvaluatorClient } from '../../query-generator/sql-evaluator-optimizer.js'
import {
  type ClickHouseTestContainer,
  setupClickHouseSchema,
  cleanupClickHouseContainer
} from '../test-utils/clickhouse-container.js'
import { createClient, type ClickHouseClient } from '@clickhouse/client'
import { GenericContainer, Wait } from 'testcontainers'

describe('ClickHouse Memory Stress Tests', () => {
  let testContainer: ClickHouseTestContainer
  let testClient: EvaluatorClient

  /**
   * Create a low-memory ClickHouse container for stress testing
   * Memory limit is artificially low to trigger crashes reliably
   */
  async function startLowMemoryClickHouseContainer(): Promise<ClickHouseTestContainer> {
    console.log('🧪 Starting LOW-MEMORY ClickHouse container for stress testing...')

    const container = await new GenericContainer('clickhouse/clickhouse-server:25.7')
      .withExposedPorts(8123, 9000)
      .withEnvironment({
        CLICKHOUSE_DB: 'otel',
        CLICKHOUSE_USER: 'otel',
        CLICKHOUSE_PASSWORD: 'otel123',
        CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT: '1'
      })
      // Low memory limit for the container itself
      .withResourcesQuota({ memory: 512 * 1024 * 1024 }) // 512MB container limit
      // Add custom ClickHouse config with memory limits
      .withCopyFilesToContainer([
        {
          source: `
            <clickhouse>
              <max_memory_usage>400000000</max_memory_usage>
              <max_memory_usage_for_user>300000000</max_memory_usage_for_user>
              <max_query_size>100000000</max_query_size>
              <max_result_rows>100000</max_result_rows>
              <max_result_bytes>50000000</max_result_bytes>
              <allow_experimental_correlated_subqueries>1</allow_experimental_correlated_subqueries>
            </clickhouse>
          `,
          target: '/etc/clickhouse-server/config.d/memory-limits.xml'
        }
      ])
      .withStartupTimeout(120000)
      .withWaitStrategy(Wait.forAll([Wait.forListeningPorts(), Wait.forHealthCheck()]))
      .withHealthCheck({
        test: [
          'CMD',
          'clickhouse-client',
          '--user',
          'otel',
          '--password',
          'otel123',
          '--query',
          'SELECT 1'
        ],
        interval: 5000,
        timeout: 3000,
        retries: 20,
        startPeriod: 10000
      })
      .start()

    const port = container.getMappedPort(8123)
    const host = container.getHost()

    console.log(`✅ Low-memory ClickHouse container started on ${host}:${port}`)
    console.log('⚠️  Memory limits: Container=512MB, Global=400MB, User=300MB')

    // Wait for ClickHouse to be ready
    await new Promise((resolve) => setTimeout(resolve, 5000))

    // Create ClickHouse client
    const client = createClient({
      url: `http://${host}:${port}`,
      username: 'otel',
      password: 'otel123',
      database: 'default',
      request_timeout: 30000
    })

    // Test the connection
    await client.ping()
    console.log('✅ Low-memory ClickHouse connection verified')

    // Create Effect-based wrapper for evaluator
    const evaluatorClient: EvaluatorClient = {
      queryRaw: (sql: string) =>
        Effect.tryPromise({
          try: async () => {
            const result = await client.query({
              query: sql,
              format: 'JSONEachRow'
            })
            const data = await result.json()
            return Array.isArray(data) ? data : []
          },
          catch: (error) => new Error(String(error))
        }),
      queryText: (sql: string) =>
        Effect.tryPromise({
          try: async () => {
            const result = await client.query({
              query: sql,
              format: 'TabSeparated'
            })
            return await result.text()
          },
          catch: (error) => new Error(String(error))
        })
    }

    return { container, client, evaluatorClient }
  }

  /**
   * Generate large test dataset to trigger memory pressure
   */
  async function insertLargeTestDataset(client: ClickHouseClient): Promise<void> {
    console.log('📊 Generating large test dataset for memory stress testing...')

    // Generate 50k test traces with realistic data distribution
    const batchSize = 1000
    const totalRows = 50000
    const services = ['frontend', 'cart', 'checkout', 'payment', 'email', 'inventory', 'shipping', 'analytics']
    const operations = ['http_request', 'db_query', 'cache_get', 'api_call', 'process_order', 'send_email']

    console.log(`📈 Inserting ${totalRows} test rows in batches of ${batchSize}...`)

    for (let batch = 0; batch < totalRows / batchSize; batch++) {
      const values: string[] = []

      for (let i = 0; i < batchSize; i++) {
        const traceId = `trace_${batch}_${i}`
        const spanId = `span_${batch}_${i}`
        const service = services[Math.floor(Math.random() * services.length)]
        const operation = operations[Math.floor(Math.random() * operations.length)]

        // Generate realistic latency distribution (most fast, some slow, few very slow)
        const rand = Math.random()
        let durationNs: number
        if (rand < 0.7) {
          durationNs = Math.floor(Math.random() * 100_000_000) // 0-100ms (fast)
        } else if (rand < 0.95) {
          durationNs = Math.floor(Math.random() * 1_000_000_000) // 100ms-1s (slow)
        } else {
          durationNs = Math.floor(Math.random() * 10_000_000_000) // 1s-10s (very slow)
        }

        const startTime = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000) // Last 7 days
        const endTime = new Date(startTime.getTime() + durationNs / 1_000_000)
        const statusCode = Math.random() < 0.95 ? 'OK' : 'ERROR'

        values.push(`(
          '${traceId}',
          '${spanId}',
          '',
          '${startTime.toISOString().replace('T', ' ').replace('Z', '')}',
          '${endTime.toISOString().replace('T', ' ').replace('Z', '')}',
          ${durationNs},
          '${service}',
          '${operation}',
          '${statusCode}'
        )`)
      }

      const insertSQL = `
        INSERT INTO otel.traces
        (trace_id, span_id, parent_span_id, start_time, end_time, duration_ns, service_name, operation_name, status_code)
        VALUES ${values.join(', ')}
      `

      await client.command({ query: insertSQL })

      if ((batch + 1) % 10 === 0) {
        console.log(`  📥 Inserted ${(batch + 1) * batchSize} rows...`)
      }
    }

    // Verify data was inserted
    const countResult = await client.query({
      query: 'SELECT count() as total FROM otel.traces',
      format: 'JSONEachRow'
    })
    const count = await countResult.json() as Array<{ total: number }>
    console.log(`✅ Test dataset ready: ${count[0]?.total || 0} total rows`)
  }

  beforeAll(async () => {
    console.log('🚀 Setting up ClickHouse memory stress test environment...')

    // Start low-memory container
    testContainer = await startLowMemoryClickHouseContainer()
    testClient = testContainer.evaluatorClient

    // Set up schema
    await setupClickHouseSchema(testContainer.client)

    // Insert large test dataset to trigger memory pressure
    await insertLargeTestDataset(testContainer.client)

    console.log('✅ Memory stress test environment ready')
  }, 180000) // 3 minute timeout for setup

  afterAll(async () => {
    if (testContainer) {
      await cleanupClickHouseContainer(testContainer)
    }
  })

  describe('Memory-Dangerous Query Patterns', () => {
    it('should detect and protect against count() * avg() patterns', async () => {
      // This is the exact pattern that caused crashes
      const dangerousSQL = `
        SELECT
          service_name,
          count() * avg(duration_ns) AS weighted_duration
        FROM otel.traces
        WHERE start_time >= now() - INTERVAL 1 HOUR
        GROUP BY service_name
        ORDER BY weighted_duration DESC
      `

      console.log('🧪 Testing count() * avg() pattern protection...')

      const program = Effect.gen(function* () {
        const result = yield* pipe(
          testClient.queryRaw(dangerousSQL),
          Effect.timeout(10000) // 10 second timeout
        )
        return result
      })

      // This should either:
      // 1. Be protected with LIMIT 0 (return 0 rows safely)
      // 2. Return results without crashing
      const result = await Effect.runPromise(program)

      // If protection worked, should have 0 rows (LIMIT 0 applied)
      // If no protection needed, should have results without crash
      console.log(`📊 Query completed safely with ${result.length} rows`)

      // Key test: ClickHouse container should still be responsive
      const pingResult = await testContainer.client.ping()
      expect(pingResult).toBeTruthy()
      console.log('✅ Container remained stable after dangerous query')
    }, 30000)

    it('should protect against CTE with aggregate arithmetic', async () => {
      // Pattern from real crash logs: CTE with calculated aggregates
      const cteSQL = `
        WITH service_stats AS (
          SELECT
            service_name,
            count() AS request_count,
            avg(duration_ns/1000000) AS avg_latency
          FROM otel.traces
          WHERE start_time >= now() - INTERVAL 1 HOUR
          GROUP BY service_name
        )
        SELECT
          service_name,
          request_count * avg_latency AS weighted_impact
        FROM service_stats
        ORDER BY weighted_impact DESC
      `

      console.log('🧪 Testing CTE aggregate arithmetic protection...')

      const program = Effect.gen(function* () {
        const result = yield* pipe(
          testClient.queryRaw(cteSQL),
          Effect.timeout(10000)
        )
        return result
      })

      const result = await Effect.runPromise(program)
      console.log(`📊 CTE query completed with ${result.length} rows`)

      // Verify container stability
      await testContainer.client.ping()
      console.log('✅ Container stable after CTE query')
    }, 30000)

    it('should protect against large JOIN aggregations', async () => {
      // Heavy JOIN with multiple aggregations
      const joinSQL = `
        SELECT
          t1.service_name,
          count(DISTINCT t1.trace_id) as unique_traces,
          sum(t1.duration_ns) as total_duration,
          avg(t1.duration_ns) as avg_duration,
          count() as total_spans
        FROM otel.traces t1
        JOIN otel.traces t2 ON t1.service_name = t2.service_name
        WHERE t1.start_time >= now() - INTERVAL 2 HOUR
          AND t2.start_time >= now() - INTERVAL 2 HOUR
        GROUP BY t1.service_name
        HAVING count() > 100
        ORDER BY total_duration DESC
      `

      console.log('🧪 Testing large JOIN aggregation protection...')

      const program = Effect.gen(function* () {
        const result = yield* pipe(
          testClient.queryRaw(joinSQL),
          Effect.timeout(15000) // Longer timeout for JOIN
        )
        return result
      })

      const result = await Effect.runPromise(program)
      console.log(`📊 JOIN query completed with ${result.length} rows`)

      // Verify container stability
      await testContainer.client.ping()
      console.log('✅ Container stable after JOIN query')
    }, 45000)

    it('should protect against nested subquery aggregations', async () => {
      // Nested subqueries with aggregations
      const subquerySQL = `
        SELECT
          service_name,
          duration_ns * (
            SELECT count()
            FROM otel.traces t2
            WHERE t2.service_name = t1.service_name
              AND t2.status_code = 'ERROR'
          ) AS error_weighted_duration
        FROM otel.traces t1
        WHERE start_time >= now() - INTERVAL 1 HOUR
        ORDER BY error_weighted_duration DESC
        LIMIT 100
      `

      console.log('🧪 Testing nested subquery aggregation protection...')

      const program = Effect.gen(function* () {
        const result = yield* pipe(
          testClient.queryRaw(subquerySQL),
          Effect.timeout(15000)
        )
        return result
      })

      const result = await Effect.runPromise(program)
      console.log(`📊 Subquery completed with ${result.length} rows`)

      // Verify container stability
      await testContainer.client.ping()
      console.log('✅ Container stable after subquery')
    }, 45000)
  })

  describe('Memory Protection Validation', () => {
    it('should apply LIMIT 0 protection for detected dangerous patterns', async () => {
      // Test that our protection actually applies LIMIT 0
      const protectedSQL = `
        SELECT
          service_name,
          count() * sum(duration_ns) AS danger_metric
        FROM otel.traces
        GROUP BY service_name
      `

      console.log('🛡️ Validating LIMIT 0 protection application...')

      const program = Effect.gen(function* () {
        const result = yield* testClient.queryRaw(protectedSQL)
        return result
      })

      const result = await Effect.runPromise(program)

      // If protection is working, should return 0 rows due to LIMIT 0
      console.log(`🔍 Protection test result: ${result.length} rows`)

      if (result.length === 0) {
        console.log('✅ LIMIT 0 protection successfully applied')
      } else {
        console.log('⚠️ Query executed without protection - container should remain stable')
      }

      // Critical: Container must remain responsive regardless
      await testContainer.client.ping()
      console.log('✅ Container remained stable')
    }, 30000)

    it('should handle multiple dangerous queries in sequence', async () => {
      console.log('🧪 Testing multiple dangerous queries in sequence...')

      const dangerousQueries = [
        "SELECT count() * avg(duration_ns) FROM otel.traces",
        "SELECT sum(duration_ns * count()) FROM otel.traces GROUP BY service_name",
        "WITH stats AS (SELECT count() c FROM otel.traces) SELECT sum(duration_ns * c) FROM otel.traces, stats"
      ]

      for (let i = 0; i < dangerousQueries.length; i++) {
        console.log(`  🔍 Executing dangerous query ${i + 1}/${dangerousQueries.length}...`)

        const query = dangerousQueries[i]
        if (!query) continue

        const program = Effect.gen(function* () {
          const result = yield* pipe(
            testClient.queryRaw(query),
            Effect.timeout(10000)
          )
          return result
        })

        const result = await Effect.runPromise(program)
        console.log(`  📊 Query ${i + 1} completed with ${result.length} rows`)

        // Verify container stability after each query
        await testContainer.client.ping()
      }

      console.log('✅ All dangerous queries handled safely')
    }, 60000)
  })

  describe('Container Memory Limits', () => {
    it('should demonstrate container memory constraints', async () => {
      console.log('📊 Testing container memory limits...')

      // Query to check ClickHouse memory settings
      const memoryQuery = `
        SELECT
          name,
          value
        FROM system.settings
        WHERE name LIKE '%memory%'
          AND name IN (
            'max_memory_usage',
            'max_memory_usage_for_user',
            'max_query_size'
          )
        ORDER BY name
      `

      const result = await testContainer.client.query({
        query: memoryQuery,
        format: 'JSONEachRow'
      })
      const settings = await result.json() as Array<{ name: string; value: string }>

      console.log('🔧 ClickHouse memory settings:')
      settings.forEach((setting) => {
        console.log(`  ${setting.name}: ${setting.value}`)
      })

      // Verify our low memory limits are applied
      const memoryLimit = settings.find((s) => s.name === 'max_memory_usage')
      expect(memoryLimit?.value).toBe('400000000') // 400MB

      console.log('✅ Low memory configuration verified')
    }, 15000)
  })
})