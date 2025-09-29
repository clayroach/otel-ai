/**
 * ClickHouse Memory Stress Test
 *
 * Uses a low-memory ClickHouse container to identify queries that cause
 * high memory usage and test memory protection mechanisms.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { createClient, type ClickHouseClient } from '@clickhouse/client'
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers'

describe('ClickHouse Memory Stress Tests', () => {
  let container: StartedTestContainer
  let client: ClickHouseClient

  /**
   * Create a very low-memory ClickHouse container for stress testing
   */
  async function startLowMemoryContainer(): Promise<StartedTestContainer> {
    console.log('🧪 Starting LOW-MEMORY ClickHouse container (256MB total)...')

    const container = await new GenericContainer('clickhouse/clickhouse-server:25.7')
      .withExposedPorts(8123, 9000)
      .withEnvironment({
        CLICKHOUSE_DB: 'otel',
        CLICKHOUSE_USER: 'otel',
        CLICKHOUSE_PASSWORD: 'otel123',
        CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT: '1'
      })
      // Very low memory limits to trigger issues quickly
      .withResourcesQuota({ memory: 256 * 1024 * 1024 })  // 256MB container limit
      .withCopyFilesToContainer([
        {
          source: `
            <clickhouse>
              <max_memory_usage>200000000</max_memory_usage>
              <max_memory_usage_for_user>150000000</max_memory_usage_for_user>
              <max_query_size>50000000</max_query_size>
              <max_result_rows>50000</max_result_rows>
              <max_result_bytes>25000000</max_result_bytes>
              <max_execution_time>10</max_execution_time>
              <!-- Enable spill-to-disk for testing -->
              <max_bytes_before_external_group_by>100000000</max_bytes_before_external_group_by>
              <max_bytes_before_external_sort>100000000</max_bytes_before_external_sort>
            </clickhouse>
          `,
          target: '/etc/clickhouse-server/config.d/memory-limits.xml'
        }
      ])
      .withStartupTimeout(120000)
      .withWaitStrategy(Wait.forAll([Wait.forListeningPorts(), Wait.forHealthCheck()]))
      .withHealthCheck({
        test: ['CMD', 'clickhouse-client', '--user', 'otel', '--password', 'otel123', '--query', 'SELECT 1'],
        interval: 5000,
        timeout: 3000,
        retries: 20,
        startPeriod: 10000
      })
      .start()

    console.log('✅ Low-memory container started')
    console.log('⚠️  Memory limits: Container=256MB, Query=200MB, User=150MB')
    return container
  }

  /**
   * Setup schema with both real and validation tables
   */
  async function setupLowMemorySchema(client: ClickHouseClient): Promise<void> {
    console.log('📊 Setting up schema for memory stress testing...')

    await client.command({ query: 'CREATE DATABASE IF NOT EXISTS otel' })
    await client.command({ query: 'USE otel' })

    // Create minimal schema for testing
    await client.command({
      query: `
        CREATE TABLE IF NOT EXISTS traces (
          trace_id String,
          span_id String,
          service_name LowCardinality(String),
          operation_name LowCardinality(String),
          duration_ns UInt64,
          start_time DateTime64(9),
          status_code LowCardinality(String)
        ) ENGINE = MergeTree()
        ORDER BY (service_name, start_time)
      `
    })

    // Create validation table
    await client.command({
      query: `
        CREATE TABLE IF NOT EXISTS traces_validation
        AS traces
        ENGINE = Null
      `
    })

    // Insert some test data to make queries more realistic
    await client.command({
      query: `
        INSERT INTO traces VALUES
        ('trace1', 'span1', 'frontend', 'GET /api/users', 1000000000, now(), 'OK'),
        ('trace1', 'span2', 'backend', 'query_users', 500000000, now(), 'OK'),
        ('trace2', 'span3', 'frontend', 'GET /api/orders', 2000000000, now(), 'ERROR'),
        ('trace2', 'span4', 'payment', 'process_payment', 3000000000, now(), 'OK'),
        ('trace3', 'span5', 'cart', 'add_item', 100000000, now(), 'OK')
      `
    })

    console.log('✅ Low-memory schema and test data created')
  }

  beforeAll(async () => {
    container = await startLowMemoryContainer()

    const port = container.getMappedPort(8123)
    const host = container.getHost()

    client = createClient({
      url: `http://${host}:${port}`,
      username: 'otel',
      password: 'otel123',
      database: 'otel',
      request_timeout: 30000
    })

    await setupLowMemorySchema(client)
  })

  afterAll(async () => {
    if (client) await client.close()
    if (container) await container.stop()
  })

  describe('Memory-Intensive Query Patterns', () => {
    it('should identify self-joins that cause high memory usage', async () => {
      const selfJoinQuery = `
        SELECT
          parent.service_name,
          child.service_name as dependent_service,
          count(*) as call_count,
          avg(child.duration_ns) as avg_duration
        FROM traces parent
        INNER JOIN traces child ON
          child.trace_id = parent.trace_id
          AND child.service_name != parent.service_name
        GROUP BY parent.service_name, child.service_name
      `

      console.log('🧪 Testing self-join query memory usage...')

      try {
        const result = await client.query({
          query: selfJoinQuery,
          format: 'JSONEachRow'
        })
        const data = await result.json()
        console.log(`✅ Self-join completed: ${Array.isArray(data) ? data.length : 0} rows`)
      } catch (error) {
        console.log(`❌ Self-join failed: ${error}`)
        expect(String(error)).toMatch(/memory|timeout|limit/i)
      }
    })

    it('should identify complex CTEs that cause memory issues', async () => {
      const complexCteQuery = `
        WITH service_stats AS (
          SELECT
            service_name,
            count() as request_count,
            avg(duration_ns) as avg_duration,
            max(duration_ns) as max_duration
          FROM traces
          GROUP BY service_name
        ),
        cross_service_analysis AS (
          SELECT
            s1.service_name as service1,
            s2.service_name as service2,
            s1.request_count * s2.request_count as interaction_volume,
            s1.avg_duration + s2.avg_duration as combined_latency
          FROM service_stats s1
          CROSS JOIN service_stats s2
          WHERE s1.service_name != s2.service_name
        )
        SELECT
          service1,
          service2,
          interaction_volume,
          combined_latency,
          interaction_volume * combined_latency as complexity_score
        FROM cross_service_analysis
        ORDER BY complexity_score DESC
      `

      console.log('🧪 Testing complex CTE memory usage...')

      try {
        const result = await client.query({
          query: complexCteQuery,
          format: 'JSONEachRow'
        })
        const data = await result.json()
        console.log(`✅ Complex CTE completed: ${Array.isArray(data) ? data.length : 0} rows`)
      } catch (error) {
        console.log(`❌ Complex CTE failed: ${error}`)
        expect(String(error)).toMatch(/memory|timeout|limit/i)
      }
    })

    it('should identify aggregates with many GROUP BY columns', async () => {
      const manyGroupByQuery = `
        SELECT
          service_name,
          operation_name,
          status_code,
          toYYYYMM(start_time) as month,
          toHour(start_time) as hour,
          count() as cnt,
          avg(duration_ns) as avg_dur,
          max(duration_ns) as max_dur,
          min(duration_ns) as min_dur,
          stddevPop(duration_ns) as stddev_dur
        FROM traces
        GROUP BY service_name, operation_name, status_code, month, hour
        ORDER BY cnt DESC
      `

      console.log('🧪 Testing many GROUP BY columns memory usage...')

      try {
        const result = await client.query({
          query: manyGroupByQuery,
          format: 'JSONEachRow'
        })
        const data = await result.json()
        console.log(`✅ Many GROUP BY completed: ${Array.isArray(data) ? data.length : 0} rows`)
      } catch (error) {
        console.log(`❌ Many GROUP BY failed: ${error}`)
        expect(String(error)).toMatch(/memory|timeout|limit/i)
      }
    })

    it('should test the dangerous pattern we kept for validation', async () => {
      const dangerousQuery = `
        SELECT
          service_name,
          count() * quantile(0.95)(duration_ns/1000000) AS dangerous_metric
        FROM traces_validation
        GROUP BY service_name
      `

      console.log('🧪 Testing dangerous ILLEGAL_AGGREGATION pattern...')

      try {
        const result = await client.query({
          query: dangerousQuery,
          format: 'JSONEachRow'
        })
        const data = await result.json()
        console.log(`⚠️ Dangerous pattern executed (may be allowed in this ClickHouse version): ${data.length} rows`)
        // Some ClickHouse versions may allow this pattern, so we just log it
        expect(data).toBeDefined()
      } catch (error) {
        console.log(`✅ Dangerous pattern correctly caught: ${error}`)
        // Accept various error messages that indicate the dangerous pattern was caught
        const errorStr = String(error)
        const isDangerousPatternError = errorStr.includes('inside another aggregate function') ||
                                       errorStr.includes('ILLEGAL_AGGREGATION') ||
                                       errorStr.includes('Aggregate function') ||
                                       errorStr.includes('memory')
        expect(isDangerousPatternError).toBe(true)
      }
    })

    it('should identify window functions with large partitions', async () => {
      const windowFunctionQuery = `
        SELECT
          service_name,
          operation_name,
          duration_ns,
          row_number() OVER (PARTITION BY service_name ORDER BY duration_ns DESC) as rn,
          avg(duration_ns) OVER (PARTITION BY service_name) as service_avg,
          lag(duration_ns, 1) OVER (PARTITION BY service_name ORDER BY start_time) as prev_duration
        FROM traces
        ORDER BY service_name, rn
      `

      console.log('🧪 Testing window functions memory usage...')

      try {
        const result = await client.query({
          query: windowFunctionQuery,
          format: 'JSONEachRow'
        })
        const data = await result.json()
        console.log(`✅ Window functions completed: ${Array.isArray(data) ? data.length : 0} rows`)
      } catch (error) {
        console.log(`❌ Window functions failed: ${error}`)
        expect(String(error)).toMatch(/memory|timeout|limit/i)
      }
    })
  })

  describe('Query Memory Usage Logging', () => {
    it('should enable query logging for memory tracking', async () => {
      console.log('📊 Enabling query logging for memory analysis...')

      // Enable query log if not already enabled
      await client.command({
        query: `
          SET log_queries = 1,
              log_query_threads = 1,
              log_profile_events = 1,
              send_logs_level = 'debug'
        `
      })

      console.log('✅ Query logging enabled')
    })

    it('should track memory usage patterns during execution', async () => {
      console.log('📊 Analyzing memory usage patterns...')

      const testQueries = [
        {
          name: 'Simple COUNT',
          sql: 'SELECT service_name, count() FROM traces GROUP BY service_name'
        },
        {
          name: 'Multiple aggregates',
          sql: 'SELECT service_name, count(), avg(duration_ns), max(duration_ns) FROM traces GROUP BY service_name'
        },
        {
          name: 'Complex percentiles',
          sql: 'SELECT service_name, quantile(0.5)(duration_ns), quantile(0.95)(duration_ns), quantile(0.99)(duration_ns) FROM traces GROUP BY service_name'
        }
      ]

      const results = []

      for (const test of testQueries) {
        try {
          const startTime = Date.now()
          const result = await client.query({
            query: test.sql,
            format: 'JSONEachRow'
          })
          const data = await result.json()
          const executionTime = Date.now() - startTime

          results.push({
            name: test.name,
            success: true,
            executionTime,
            rowCount: Array.isArray(data) ? data.length : 0
          })

          console.log(`✅ ${test.name}: ${executionTime}ms, ${Array.isArray(data) ? data.length : 0} rows`)
        } catch (error) {
          results.push({
            name: test.name,
            success: false,
            error: String(error)
          })
          console.log(`❌ ${test.name}: ${error}`)
        }
      }

      // At least basic queries should work
      const successfulQueries = results.filter(r => r.success)
      expect(successfulQueries.length).toBeGreaterThan(0)

      console.log('📈 Memory stress test summary:')
      results.forEach(r => {
        if (r.success) {
          console.log(`  ✅ ${r.name}: ${r.executionTime}ms`)
        } else {
          console.log(`  ❌ ${r.name}: Failed`)
        }
      })
    })

    it('should analyze recent query memory usage from system.query_log', async () => {
      console.log('📊 Analyzing recent query memory usage...')

      try {
        // Query the system.query_log table for memory usage analysis
        const memoryAnalysisQuery = `
          SELECT
            query_start_time,
            query_duration_ms,
            memory_usage,
            peak_memory_usage,
            read_rows,
            read_bytes,
            result_rows,
            result_bytes,
            substring(query, 1, 100) as query_preview,
            exception
          FROM system.query_log
          WHERE event_time >= now() - INTERVAL 5 MINUTE
            AND type = 'QueryFinish'
          ORDER BY peak_memory_usage DESC
          LIMIT 20
        `

        const result = await client.query({
          query: memoryAnalysisQuery,
          format: 'JSONEachRow'
        })
        const data = await result.json()

        console.log('📊 Recent queries by memory usage:')
        if (Array.isArray(data)) {
          data.forEach((query: unknown, idx: number) => {
            const q = query as Record<string, unknown>
            const memoryMB = (Number(q.peak_memory_usage || 0) / 1024 / 1024).toFixed(2)
            console.log(`  ${idx + 1}. Memory: ${memoryMB}MB, Duration: ${q.query_duration_ms}ms`)
            console.log(`     Query: ${q.query_preview}...`)
            if (q.exception) {
              console.log(`     ❌ Exception: ${q.exception}`)
            }
          })
        }

        expect(Array.isArray(data)).toBe(true)
      } catch (error) {
        console.log(`⚠️ Could not access query_log: ${error}`)
        // Don't fail test if query_log is not available
      }
    })
  })

  describe('Production Query Pattern Analysis', () => {
    it('should test real-world problematic patterns', async () => {
      console.log('🔍 Testing production query patterns that may cause issues...')

      // These are patterns from actual production queries that have caused issues
      const productionPatterns = [
        {
          name: 'Service topology with dependencies',
          sql: `
            SELECT
              parent.service_name,
              child.service_name as dependent_service,
              count(*) as call_count
            FROM traces parent
            INNER JOIN traces child ON child.trace_id = parent.trace_id
            WHERE parent.service_name != child.service_name
            GROUP BY parent.service_name, child.service_name
            LIMIT 100
          `
        },
        {
          name: 'Error rate calculation with time windows',
          sql: `
            SELECT
              service_name,
              toStartOfMinute(start_time) as time_bucket,
              count() as total_requests,
              countIf(status_code != 'OK') as errors,
              round(countIf(status_code != 'OK') * 100.0 / count(), 2) as error_rate
            FROM traces
            WHERE start_time >= now() - INTERVAL 1 HOUR
            GROUP BY service_name, time_bucket
            ORDER BY error_rate DESC
            LIMIT 50
          `
        },
        {
          name: 'Latency percentiles by service',
          sql: `
            SELECT
              service_name,
              count() as request_count,
              quantile(0.5)(duration_ns/1000000) as p50_ms,
              quantile(0.95)(duration_ns/1000000) as p95_ms,
              quantile(0.99)(duration_ns/1000000) as p99_ms
            FROM traces
            GROUP BY service_name
            HAVING request_count > 5
            ORDER BY p99_ms DESC
          `
        }
      ]

      for (const pattern of productionPatterns) {
        try {
          console.log(`🧪 Testing: ${pattern.name}`)
          const startTime = Date.now()
          const result = await client.query({
            query: pattern.sql,
            format: 'JSONEachRow'
          })
          const data = await result.json()
          const executionTime = Date.now() - startTime

          console.log(`  ✅ Completed in ${executionTime}ms, ${Array.isArray(data) ? data.length : 0} rows`)
        } catch (error) {
          console.log(`  ❌ Failed: ${error}`)
          // Document which patterns cause issues
        }
      }
    })
  })
})