/**
 * ClickHouse Query Memory Usage Monitor
 *
 * Monitors query memory usage through system.query_log to identify
 * problematic queries that cause high memory usage or crashes.
 */

import { Effect } from 'effect'
import type { ClickHouseStorage } from './clickhouse.js'
import type { StorageError } from './errors.js'
import {
  analyzeQueryPatterns,
  calculateQueryRiskScore,
  getRiskLevelFromScore,
  generateOptimizationSuggestions,
  type QueryPatternMatch
} from './query-patterns-catalog.js'

export interface QueryMemoryInfo {
  query_start_time: string
  query_duration_ms: number
  memory_usage: number
  read_rows: number
  read_bytes: number
  result_rows: number
  result_bytes: number
  query_preview: string
  exception: string | undefined
  normalized_memory_mb: number
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  // Pattern analysis results
  pattern_matches?: QueryPatternMatch[]
  pattern_risk_score?: number
  optimization_suggestions?: string[]
}

/**
 * Monitor recent queries for high memory usage
 */
export const monitorQueryMemoryUsage = (
  clickhouse: ClickHouseStorage,
  minutesBack: number = 5
): Effect.Effect<QueryMemoryInfo[], StorageError> =>
  Effect.gen(function* () {
    const memoryAnalysisQuery = `
      SELECT
        query_start_time,
        query_duration_ms,
        memory_usage,
        read_rows,
        read_bytes,
        result_rows,
        result_bytes,
        substring(query, 1, 200) as query_preview,
        exception
      FROM system.query_log
      WHERE event_time >= now() - INTERVAL ${minutesBack} MINUTE
        AND type IN ('QueryFinish', 'ExceptionBeforeStart', 'ExceptionWhileProcessing')
        AND memory_usage > 0
      ORDER BY memory_usage DESC
      LIMIT 50
    `

    const rawData = yield* clickhouse.queryRaw(memoryAnalysisQuery)

    const queries: QueryMemoryInfo[] = (rawData as Record<string, unknown>[]).map(
      (row: Record<string, unknown>) => {
        const memoryMB = Number(row.memory_usage) / (1024 * 1024)

        let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW'
        if (memoryMB > 1000)
          riskLevel = 'CRITICAL' // >1GB
        else if (memoryMB > 500)
          riskLevel = 'HIGH' // >500MB
        else if (memoryMB > 100) riskLevel = 'MEDIUM' // >100MB

        return {
          query_start_time: String(row.query_start_time || ''),
          query_duration_ms: Number(row.query_duration_ms || 0),
          memory_usage: Number(row.memory_usage || 0),
          read_rows: Number(row.read_rows || 0),
          read_bytes: Number(row.read_bytes || 0),
          result_rows: Number(row.result_rows || 0),
          result_bytes: Number(row.result_bytes || 0),
          query_preview: String(row.query_preview || ''),
          exception: row.exception ? String(row.exception) : undefined,
          normalized_memory_mb: memoryMB,
          risk_level: riskLevel
        }
      }
    )

    return queries
  })

/**
 * Find queries that caused memory issues
 */
export const findProblematicQueries = (
  clickhouse: ClickHouseStorage,
  minutesBack: number = 30
): Effect.Effect<QueryMemoryInfo[], StorageError> =>
  Effect.gen(function* () {
    const queries = yield* monitorQueryMemoryUsage(clickhouse, minutesBack)

    // Filter for high-risk queries
    const problematic = queries.filter(
      (q) =>
        q.risk_level === 'HIGH' ||
        q.risk_level === 'CRITICAL' ||
        q.exception?.includes('MEMORY_LIMIT_EXCEEDED') ||
        q.exception?.includes('ILLEGAL_AGGREGATION')
    )

    return problematic
  })

/**
 * Log query memory analysis for debugging
 */
export const logQueryMemoryAnalysis = (
  clickhouse: ClickHouseStorage
): Effect.Effect<void, StorageError> =>
  Effect.gen(function* () {
    const queries = yield* monitorQueryMemoryUsage(clickhouse, 10)

    console.log('\n📊 === QUERY MEMORY ANALYSIS ===')
    console.log(`Found ${queries.length} recent queries`)

    const byRisk = queries.reduce(
      (acc, q) => {
        acc[q.risk_level] = (acc[q.risk_level] || 0) + 1
        return acc
      },
      {} as Record<string, number>
    )

    console.log('📈 Risk distribution:')
    Object.entries(byRisk).forEach(([level, count]) => {
      const emoji =
        level === 'CRITICAL' ? '🚨' : level === 'HIGH' ? '⚠️' : level === 'MEDIUM' ? '🟡' : '✅'
      console.log(`  ${emoji} ${level}: ${count} queries`)
    })

    // Show top memory consumers
    const topQueries = queries.slice(0, 5)
    console.log('\n🔝 Top memory consuming queries:')
    topQueries.forEach((q, idx) => {
      console.log(
        `${idx + 1}. ${q.normalized_memory_mb.toFixed(2)}MB (${q.risk_level}) - ${q.query_duration_ms}ms`
      )
      console.log(`   ${q.query_preview}...`)
      if (q.exception) {
        console.log(`   ❌ ${q.exception}`)
      }
    })

    console.log('=================================\n')
  })

/**
 * Enhanced monitoring with pattern analysis
 */
export const monitorQueryMemoryWithPatterns = (
  clickhouse: ClickHouseStorage,
  minutesBack: number = 10
): Effect.Effect<QueryMemoryInfo[], StorageError> =>
  Effect.gen(function* () {
    // Get basic memory usage data
    const queries = yield* monitorQueryMemoryUsage(clickhouse, minutesBack)

    // Enhance each query with pattern analysis
    const enhancedQueries = yield* Effect.all(
      queries.map((query) =>
        Effect.gen(function* () {
          // Get the full query text (not just preview)
          const fullQueryResult = yield* clickhouse.queryRaw(`
            SELECT query
            FROM system.query_log
            WHERE query_start_time = '${query.query_start_time}'
              AND query_duration_ms = ${query.query_duration_ms}
              AND memory_usage = ${query.memory_usage}
            LIMIT 1
          `)

          const fullQuery =
            Array.isArray(fullQueryResult) && fullQueryResult.length > 0
              ? String((fullQueryResult[0] as Record<string, unknown>).query || query.query_preview)
              : query.query_preview

          // Analyze patterns
          const patternMatches = yield* analyzeQueryPatterns(fullQuery)
          const patternRiskScore = calculateQueryRiskScore(patternMatches)
          const optimizationSuggestions = generateOptimizationSuggestions(patternMatches)

          return {
            ...query,
            pattern_matches: patternMatches,
            pattern_risk_score: patternRiskScore,
            optimization_suggestions: optimizationSuggestions
          }
        })
      )
    )

    return enhancedQueries
  })

/**
 * Find queries with problematic patterns
 */
export const findQueriesWithProblematicPatterns = (
  clickhouse: ClickHouseStorage,
  minutesBack: number = 30
): Effect.Effect<QueryMemoryInfo[], StorageError> =>
  Effect.gen(function* () {
    const queries = yield* monitorQueryMemoryWithPatterns(clickhouse, minutesBack)

    // Filter for queries with problematic patterns
    const problematic = queries.filter(
      (q) =>
        q.pattern_matches &&
        q.pattern_matches.length > 0 &&
        q.pattern_risk_score &&
        q.pattern_risk_score >= 50 // HIGH or CRITICAL
    )

    return problematic
  })

/**
 * Log detailed pattern analysis
 */
export const logPatternAnalysis = (
  clickhouse: ClickHouseStorage,
  minutesBack: number = 10
): Effect.Effect<void, StorageError> =>
  Effect.gen(function* () {
    const queries = yield* monitorQueryMemoryWithPatterns(clickhouse, minutesBack)

    console.log('\n🔍 === QUERY PATTERN ANALYSIS ===')
    console.log(`Analyzed ${queries.length} recent queries`)

    // Group by pattern risk level
    const byPatternRisk = queries.reduce(
      (acc, q) => {
        const riskLevel = q.pattern_risk_score ? getRiskLevelFromScore(q.pattern_risk_score) : 'LOW'
        acc[riskLevel] = (acc[riskLevel] || 0) + 1
        return acc
      },
      {} as Record<string, number>
    )

    console.log('📊 Pattern risk distribution:')
    Object.entries(byPatternRisk).forEach(([level, count]) => {
      const emoji =
        level === 'CRITICAL' ? '🚨' : level === 'HIGH' ? '⚠️' : level === 'MEDIUM' ? '🟡' : '✅'
      console.log(`  ${emoji} ${level}: ${count} queries`)
    })

    // Show top problematic queries
    const problematic = queries
      .filter((q) => q.pattern_matches && q.pattern_matches.length > 0)
      .sort((a, b) => (b.pattern_risk_score || 0) - (a.pattern_risk_score || 0))
      .slice(0, 5)

    if (problematic.length > 0) {
      console.log('\n🔝 Top problematic pattern queries:')
      problematic.forEach((q, idx) => {
        console.log(
          `${idx + 1}. Pattern Risk: ${q.pattern_risk_score}, Memory: ${q.normalized_memory_mb.toFixed(2)}MB`
        )
        console.log(`   Query: ${q.query_preview}...`)
        if (q.pattern_matches) {
          q.pattern_matches.forEach((match) => {
            console.log(
              `   🎯 Pattern: ${match.pattern} (${match.riskLevel}) - ${match.description}`
            )
          })
        }
        if (q.optimization_suggestions && q.optimization_suggestions.length > 0) {
          console.log(`   💡 Suggestions: ${q.optimization_suggestions.join('; ')}`)
        }
      })
    }

    console.log('=================================\n')
  })
