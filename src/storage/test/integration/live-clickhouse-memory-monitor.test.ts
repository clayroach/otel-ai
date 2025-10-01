/**
 * Live ClickHouse Memory Monitor Test
 *
 * Connects to the live Docker ClickHouse instance and monitors
 * query memory usage during integration tests to identify
 * problematic queries that cause crashes.
 */

import { describe, it, beforeAll } from 'vitest'
import { createClient, type ClickHouseClient } from '@clickhouse/client'
import { ensureClickHouseRunning } from '../../../test-helpers/clickhouse-health.js'

// Enable this test by setting environment variable: ENABLE_MEMORY_MONITOR=true
// This test should run during integration tests to capture real memory patterns
describe.skipIf(!process.env.ENABLE_MEMORY_MONITOR)('Live ClickHouse Memory Monitor', () => {
  let liveClient: ClickHouseClient

  beforeAll(async () => {
    // Check ClickHouse health first
    await ensureClickHouseRunning()

    // Connect to the live Docker ClickHouse instance
    liveClient = createClient({
      url: 'http://localhost:8123',
      username: 'otel',
      password: 'otel123',
      database: 'otel',
      request_timeout: 10000
    })

    try {
      await liveClient.ping()
      console.log('✅ Connected to live ClickHouse Docker instance')
    } catch (error) {
      console.log('❌ Could not connect to live ClickHouse:', error)
      throw error
    }
  })

  describe('Real-time Memory Monitoring', () => {
    it('should monitor and analyze query memory usage patterns', async () => {
      console.log('📊 Starting real-time memory monitoring of live ClickHouse...')
      console.log('💡 TIP: Run integration tests in another terminal while this runs')

      // Enable detailed query logging
      try {
        await liveClient.command({
          query: `
            SET log_queries = 1,
                log_query_threads = 1,
                log_profile_events = 1,
                log_comment = 'memory-monitor-test'
          `
        })
        console.log('✅ Enhanced query logging enabled')
      } catch (error) {
        console.log('⚠️ Could not enable enhanced logging:', error)
      }

      // Monitor continuously for a longer period
      const monitorStartTime = new Date()
      console.log(`🕐 Monitoring started at: ${monitorStartTime.toISOString()}`)
      console.log('⏳ Monitoring for 5 minutes to capture integration test activity...')

      // Monitor in intervals
      const monitorDuration = 5 * 60 * 1000 // 5 minutes
      const intervalMs = 30 * 1000 // Check every 30 seconds
      const intervals = Math.floor(monitorDuration / intervalMs)

      for (let i = 0; i < intervals; i++) {
        console.log(`\n📊 === Interval ${i + 1}/${intervals} ===`)

        try {
          // Get current activity
          const currentActivityQuery = `
            SELECT
              count() as queries_this_interval,
              max(peak_memory_usage / (1024 * 1024)) as max_memory_mb,
              avg(peak_memory_usage / (1024 * 1024)) as avg_memory_mb,
              countIf(exception != '') as failed_queries,
              countIf(peak_memory_usage > 100 * 1024 * 1024) as high_memory_queries
            FROM system.query_log
            WHERE event_time >= now() - INTERVAL 30 SECOND
              AND query NOT LIKE '%system.query_log%'
          `

          const activityResult = await liveClient.query({
            query: currentActivityQuery,
            format: 'JSONEachRow'
          })
          const activity = await activityResult.json() as Record<string, unknown>[]

          if (activity.length > 0) {
            const stats = activity[0] as Record<string, unknown>
            console.log(`📈 Activity: ${stats.queries_this_interval} queries, max: ${Number(stats.max_memory_mb || 0).toFixed(1)}MB, avg: ${Number(stats.avg_memory_mb || 0).toFixed(1)}MB`)
            if (Number(stats.high_memory_queries || 0) > 0) {
              console.log(`🚨 HIGH MEMORY: ${stats.high_memory_queries} queries >100MB`)
            }
            if (Number(stats.failed_queries || 0) > 0) {
              console.log(`❌ FAILURES: ${stats.failed_queries} failed queries`)
            }
          }

          // If high memory usage detected, get details
          if (activity.length > 0 && Number((activity[0] as Record<string, unknown>).max_memory_mb || 0) > 100) {
            console.log('🔍 Investigating high memory queries...')

            const highMemoryQuery = `
              SELECT
                peak_memory_usage / (1024 * 1024) as memory_mb,
                query_duration_ms,
                substring(query, 1, 200) as query_preview,
                exception
              FROM system.query_log
              WHERE event_time >= now() - INTERVAL 30 SECOND
                AND peak_memory_usage > 100 * 1024 * 1024
                AND query NOT LIKE '%system.query_log%'
              ORDER BY peak_memory_usage DESC
              LIMIT 5
            `

            const highMemResult = await liveClient.query({
              query: highMemoryQuery,
              format: 'JSONEachRow'
            })
            const highMemData = await highMemResult.json() as Record<string, unknown>[]

            highMemData.forEach((q, idx) => {
              const query = q as Record<string, unknown>
              console.log(`  ${idx + 1}. ${Number(query.memory_mb || 0).toFixed(1)}MB: ${query.query_preview}...`)
              if (query.exception) {
                console.log(`     ❌ ${query.exception}`)
              }
            })
          }

        } catch (error) {
          console.log(`⚠️ Monitoring error: ${error}`)
        }

        // Wait for next interval (unless last)
        if (i < intervals - 1) {
          await new Promise(resolve => setTimeout(resolve, intervalMs))
        }
      }

      // Analyze memory usage patterns
      try {
        const memoryAnalysisQuery = `
          SELECT
            event_time,
            query_start_time,
            query_duration_ms,
            memory_usage,
            peak_memory_usage,
            read_rows,
            read_bytes,
            result_rows,
            result_bytes,
            substring(query, 1, 300) as query_preview,
            exception,
            type,
            -- Calculate memory efficiency metrics
            round(peak_memory_usage / (1024 * 1024), 2) as peak_memory_mb,
            round(memory_usage / (1024 * 1024), 2) as final_memory_mb,
            round(peak_memory_usage / greatest(read_bytes, 1), 4) as memory_per_byte_read,
            round(query_duration_ms / greatest(result_rows, 1), 2) as ms_per_result_row
          FROM system.query_log
          WHERE event_time >= '${monitorStartTime.toISOString().slice(0, 19)}'
            AND query NOT LIKE '%system.query_log%'  -- Exclude our monitoring queries
            AND query NOT LIKE '%log_queries%'       -- Exclude setup queries
            AND peak_memory_usage > 0
          ORDER BY peak_memory_usage DESC
          LIMIT 50
        `

        const result = await liveClient.query({
          query: memoryAnalysisQuery,
          format: 'JSONEachRow'
        })
        const data = await result.json() as Record<string, unknown>[]

        console.log(`\n📊 === MEMORY ANALYSIS RESULTS ===`)
        console.log(`📈 Found ${data.length} queries during monitoring period`)

        if (data.length === 0) {
          console.log('ℹ️  No queries detected during monitoring period')
          return
        }

        // Categorize queries by memory usage
        const categories = {
          critical: data.filter(q => Number((q as Record<string, unknown>).peak_memory_mb || 0) > 500),   // >500MB
          high: data.filter(q => Number((q as Record<string, unknown>).peak_memory_mb || 0) > 100),       // >100MB
          medium: data.filter(q => Number((q as Record<string, unknown>).peak_memory_mb || 0) > 50),      // >50MB
          low: data.filter(q => Number((q as Record<string, unknown>).peak_memory_mb || 0) <= 50)         // <=50MB
        }

        console.log('\n🎯 Memory Usage Categories:')
        console.log(`🚨 CRITICAL (>500MB): ${categories.critical.length} queries`)
        console.log(`⚠️  HIGH (>100MB): ${categories.high.length} queries`)
        console.log(`🟡 MEDIUM (>50MB): ${categories.medium.length} queries`)
        console.log(`✅ LOW (<=50MB): ${categories.low.length} queries`)

        // Show critical queries
        if (categories.critical.length > 0) {
          console.log('\n🚨 CRITICAL MEMORY USAGE QUERIES:')
          categories.critical.forEach((q, idx) => {
            console.log(`${idx + 1}. ${q.peak_memory_mb}MB peak, ${q.query_duration_ms}ms duration`)
            console.log(`   Query: ${q.query_preview}...`)
            if (q.exception) {
              console.log(`   ❌ Exception: ${q.exception}`)
            }
            console.log(`   Efficiency: ${q.memory_per_byte_read} memory/byte, ${q.ms_per_result_row}ms/row`)
            console.log('')
          })
        }

        // Show high-usage queries
        if (categories.high.length > 0) {
          console.log('\n⚠️  HIGH MEMORY USAGE QUERIES:')
          categories.high.slice(0, 5).forEach((q, idx) => {
            console.log(`${idx + 1}. ${q.peak_memory_mb}MB peak, ${q.query_duration_ms}ms duration`)
            console.log(`   Query: ${q.query_preview}...`)
            if (q.exception) {
              console.log(`   ❌ Exception: ${q.exception}`)
            }
          })
        }

        // Identify query patterns
        const patterns = {
          selfJoins: data.filter(q => {
            const query = q as Record<string, unknown>
            const preview = String(query.query_preview || '')
            return preview.includes('JOIN') && !!preview.match(/traces.*JOIN.*traces/i)
          }),
          complexAggregates: data.filter(q => {
            const query = q as Record<string, unknown>
            const preview = String(query.query_preview || '')
            return !!preview.match(/count\(\).*\*|quantile.*count|avg.*count/i)
          }),
          manyGroupBy: data.filter(q => {
            const query = q as Record<string, unknown>
            const preview = String(query.query_preview || '')
            return (preview.match(/GROUP BY/g) || []).length > 0 && preview.split(',').length > 5
          }),
          windowFunctions: data.filter(q => {
            const query = q as Record<string, unknown>
            const preview = String(query.query_preview || '')
            return preview.includes('OVER')
          }),
          largeCtes: data.filter(q => {
            const query = q as Record<string, unknown>
            const preview = String(query.query_preview || '')
            return preview.includes('WITH') && preview.length > 200
          })
        }

        console.log('\n🔍 Query Pattern Analysis:')
        Object.entries(patterns).forEach(([pattern, queries]) => {
          if (queries.length > 0) {
            const avgMemory = queries.reduce((sum, q) => sum + Number((q as Record<string, unknown>).peak_memory_mb || 0), 0) / queries.length
            console.log(`  ${pattern}: ${queries.length} queries, avg ${avgMemory.toFixed(1)}MB`)
          }
        })

        // Summary and recommendations
        console.log('\n💡 RECOMMENDATIONS:')
        if (categories.critical.length > 0) {
          console.log('🚨 CRITICAL: Queries >500MB detected - immediate investigation needed')
        }
        if (patterns.selfJoins.length > 0) {
          console.log('⚠️  Self-joins detected - consider using arrays instead of JOINs')
        }
        if (patterns.complexAggregates.length > 0) {
          console.log('⚠️  Complex aggregates detected - may need LIMIT protection')
        }

        console.log('=====================================\n')
      } catch (error) {
        console.log(`❌ Memory analysis failed: ${error}`)
        throw error
      }
    }, 60000) // 60 second timeout

    it('should provide real-time monitoring utility for debugging', async () => {
      console.log('🛠️  Real-time monitoring utility available')
      console.log('📖 Usage: Run this test while integration tests are running to capture memory patterns')
      console.log('🎯 Purpose: Identify which specific queries cause ClickHouse memory issues')

      // Provide a simple monitoring function
      const monitorNow = async () => {
        try {
          const result = await liveClient.query({
            query: `
              SELECT
                count() as total_queries,
                avg(peak_memory_usage / (1024 * 1024)) as avg_memory_mb,
                max(peak_memory_usage / (1024 * 1024)) as max_memory_mb,
                countIf(exception != '') as failed_queries
              FROM system.query_log
              WHERE event_time >= now() - INTERVAL 1 MINUTE
            `,
            format: 'JSONEachRow'
          })
          const stats = await result.json() as Record<string, unknown>[]

          if (stats.length > 0) {
            const s = stats[0] as Record<string, unknown>
            console.log(`📊 Last minute: ${s.total_queries} queries, avg: ${Number(s.avg_memory_mb || 0).toFixed(1)}MB, max: ${Number(s.max_memory_mb || 0).toFixed(1)}MB, failures: ${s.failed_queries}`)
          }
        } catch (error) {
          console.log(`⚠️ Monitoring error: ${error}`)
        }
      }

      await monitorNow()
    })
  })
})