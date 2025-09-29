/**
 * Comprehensive Query Pattern Catalog for OOM Detection
 *
 * Identifies problematic SQL patterns that cause high memory usage and OOM crashes.
 * Used for automated detection, classification, and optimization of risky queries.
 */

import { Effect } from 'effect'

/**
 * Risk levels for query patterns
 */
export type QueryRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

/**
 * Query pattern categories
 */
export type QueryPatternCategory =
  | 'SELF_JOIN' // Self-joins on large CTEs
  | 'CARTESIAN_PRODUCT' // Missing WHERE clauses causing cartesian products
  | 'COMPLEX_AGGREGATION' // Many GROUP BY columns or complex aggregations
  | 'STRING_OPERATIONS' // Memory-intensive string manipulations
  | 'LARGE_UNION' // Multiple large UNION operations
  | 'DEEP_CTE' // Deep recursive or nested CTEs
  | 'WINDOW_FUNCTIONS' // Complex window functions over large datasets
  | 'SUBQUERY_EXPLOSION' // Correlated subqueries in SELECT/WHERE
  | 'ARRAY_OPERATIONS' // Complex array manipulations
  | 'JSON_PARSING' // Heavy JSON extraction operations

/**
 * Pattern detection result
 */
export interface QueryPatternMatch {
  category: QueryPatternCategory
  riskLevel: QueryRiskLevel
  pattern: string
  description: string
  estimatedMemoryMultiplier: number // Multiplier vs simple SELECT
  matchedTokens: string[]
  optimizationSuggestion?: string
}

/**
 * Query pattern definition
 */
export interface QueryPattern {
  category: QueryPatternCategory
  riskLevel: QueryRiskLevel
  name: string
  description: string
  regex: RegExp
  memoryMultiplier: number
  examples: {
    problematic: string
    optimized?: string
  }
  optimizationStrategy?: string
}

/**
 * Comprehensive catalog of problematic query patterns
 */
export const PROBLEMATIC_QUERY_PATTERNS: QueryPattern[] = [
  // SELF_JOIN patterns (Issue #57 primary cause)
  {
    category: 'SELF_JOIN',
    riskLevel: 'CRITICAL',
    name: 'CTE Self-Join',
    description: 'Self-join on large Common Table Expression causing cartesian product',
    regex: /WITH\s+\w+\s+AS[\s\S]*?LEFT\s+JOIN\s+\w+\s+\w+\s+ON[\s\S]*?AND/i,
    memoryMultiplier: 100,
    examples: {
      problematic: `
        WITH trace_spans AS (SELECT trace_id, span_id, parent_span_id FROM traces)
        SELECT ts.*, ps.* FROM trace_spans ts
        LEFT JOIN trace_spans ps ON ts.parent_span_id = ps.span_id AND ts.trace_id = ps.trace_id
      `,
      optimized: `
        WITH service_flows AS (
          SELECT trace_id, groupArray(service_name) as services
          FROM traces GROUP BY trace_id
        )
        SELECT services[i], services[i+1] FROM service_flows
        ARRAY JOIN arrayEnumerate(services) as i WHERE i < length(services)
      `
    },
    optimizationStrategy: 'Replace self-joins with array functions (groupArray + arrayJoin)'
  },

  {
    category: 'SELF_JOIN',
    riskLevel: 'HIGH',
    name: 'Recursive Trace Join',
    description: 'Self-join for hierarchical trace relationships',
    regex: /LEFT\s+JOIN\s+\w+\s+\w+\s+ON\s+\w+\.[\w_]+\s*=\s*\w+\.[\w_]+/i,
    memoryMultiplier: 50,
    examples: {
      problematic: `
        SELECT t1.*, t2.* FROM traces t1
        JOIN traces t2 ON t1.parent_span_id = t2.span_id
      `,
      optimized: `
        SELECT trace_id, arrayJoin(arrayEnumerate(groupArray(span_id))) as hierarchy
        FROM traces GROUP BY trace_id
      `
    },
    optimizationStrategy: 'Use hierarchical functions instead of self-joins'
  },

  // CARTESIAN_PRODUCT patterns
  {
    category: 'CARTESIAN_PRODUCT',
    riskLevel: 'CRITICAL',
    name: 'Missing Join Condition',
    description: 'Comma-separated tables in FROM clause causing cartesian product',
    regex: /FROM\s+\w+\s*,\s*\w+/i,
    memoryMultiplier: 1000,
    examples: {
      problematic: `SELECT * FROM traces, ai_anomalies WHERE start_time > now() - INTERVAL 1 HOUR`,
      optimized: `SELECT * FROM traces t JOIN ai_anomalies a ON t.trace_id = a.trace_id WHERE t.start_time > now() - INTERVAL 1 HOUR`
    },
    optimizationStrategy: 'Add explicit JOIN conditions with ON clause'
  },

  {
    category: 'CARTESIAN_PRODUCT',
    riskLevel: 'HIGH',
    name: 'Multiple Table Cross Join',
    description: 'Multiple tables in FROM clause without explicit joins',
    regex: /FROM\s+\w+\s*,\s*\w+\s*,\s*\w+/i,
    memoryMultiplier: 500,
    examples: {
      problematic: `SELECT * FROM traces, ai_anomalies, ai_service_baselines`,
      optimized: `SELECT * FROM traces t JOIN ai_anomalies a ON t.trace_id = a.trace_id JOIN ai_service_baselines b ON t.service_name = b.service_name`
    },
    optimizationStrategy: 'Convert to explicit JOINs with proper conditions'
  },

  // COMPLEX_AGGREGATION patterns
  {
    category: 'COMPLEX_AGGREGATION',
    riskLevel: 'HIGH',
    name: 'Many Group By Columns',
    description: 'GROUP BY with many columns causing high memory usage',
    regex: /GROUP\s+BY\s+(?:\w+\s*,\s*){5,}/i,
    memoryMultiplier: 20,
    examples: {
      problematic: `GROUP BY service_name, operation_name, span_kind, status_code, resource_type, deployment_env`,
      optimized: `GROUP BY service_name, operation_name HAVING COUNT(*) > 100`
    },
    optimizationStrategy: 'Reduce grouping dimensions or add HAVING filters'
  },

  {
    category: 'COMPLEX_AGGREGATION',
    riskLevel: 'CRITICAL',
    name: 'Nested Aggregates',
    description: 'Aggregate functions inside other aggregate functions',
    regex: /\b\w+\s*\(\s*[^()]*\b\w+\s*\([^)]+\)[^)]*\)/i,
    memoryMultiplier: 80,
    examples: {
      problematic: `SELECT COUNT(DISTINCT(service_name)) FROM traces`,
      optimized: `SELECT uniq(service_name) FROM traces`
    },
    optimizationStrategy: 'Use ClickHouse-specific aggregate functions (uniq, etc.)'
  },

  // STRING_OPERATIONS patterns
  {
    category: 'STRING_OPERATIONS',
    riskLevel: 'MEDIUM',
    name: 'Large String Concat',
    description: 'String concatenation operations on large datasets',
    regex: /CONCAT\s*\(/i,
    memoryMultiplier: 10,
    examples: {
      problematic: `SELECT CONCAT(service_name, operation_name, span_kind, status_code) FROM traces`,
      optimized: `SELECT arrayStringConcat([service_name, operation_name, span_kind, status_code], '_') FROM traces`
    },
    optimizationStrategy: 'Use ClickHouse array functions for string operations'
  },

  // LARGE_UNION patterns
  {
    category: 'LARGE_UNION',
    riskLevel: 'HIGH',
    name: 'Multiple Union All',
    description: 'Many UNION ALL operations on large tables',
    regex: /(UNION\s+ALL[\s\S]*?){3,}/i,
    memoryMultiplier: 30,
    examples: {
      problematic: `SELECT * FROM traces WHERE service_name = 'a' UNION ALL SELECT * FROM traces WHERE service_name = 'b' UNION ALL...`,
      optimized: `SELECT * FROM traces WHERE service_name IN ('a', 'b', 'c', 'd')`
    },
    optimizationStrategy: 'Combine into single query with IN clause or array functions'
  },

  // DEEP_CTE patterns
  {
    category: 'DEEP_CTE',
    riskLevel: 'HIGH',
    name: 'Nested CTE Chain',
    description: 'Multiple nested CTEs causing materialization overhead',
    regex: /WITH\s+\w+\s+AS\s*\([^)]*WITH\s+\w+\s+AS/i,
    memoryMultiplier: 25,
    examples: {
      problematic: `WITH a AS (...), b AS (SELECT * FROM a WHERE ...), c AS (SELECT * FROM b WHERE ...)`,
      optimized: `Single optimized query without intermediate materializations`
    },
    optimizationStrategy: 'Flatten CTEs or use materialized views for complex hierarchies'
  },

  // WINDOW_FUNCTIONS patterns
  {
    category: 'WINDOW_FUNCTIONS',
    riskLevel: 'MEDIUM',
    name: 'Complex Window Function',
    description: 'Window functions with large partitions',
    regex: /\b\w+\s*\(\s*[^)]*\)\s*OVER\s*\(\s*PARTITION\s+BY\s+\w+/i,
    memoryMultiplier: 15,
    examples: {
      problematic: `ROW_NUMBER() OVER (PARTITION BY service_name, operation_name, span_kind ORDER BY start_time)`,
      optimized: `Use groupArray() and array functions instead of window functions`
    },
    optimizationStrategy: 'Replace with ClickHouse array aggregation functions where possible'
  },

  // SUBQUERY_EXPLOSION patterns
  {
    category: 'SUBQUERY_EXPLOSION',
    riskLevel: 'HIGH',
    name: 'Correlated Subquery',
    description: 'Correlated subqueries in SELECT or WHERE causing N*M complexity',
    regex: /(SELECT|WHERE).*\(\s*SELECT.*FROM\s+\w+.*WHERE.*\w+\.\w+\s*=\s*\w+\.\w+/i,
    memoryMultiplier: 40,
    examples: {
      problematic: `SELECT *, (SELECT COUNT(*) FROM traces t2 WHERE t2.service_name = t1.service_name) FROM traces t1`,
      optimized: `Use JOIN or window functions instead of correlated subqueries`
    },
    optimizationStrategy: 'Convert to JOINs or use analytical functions'
  },

  // ARRAY_OPERATIONS patterns
  {
    category: 'ARRAY_OPERATIONS',
    riskLevel: 'MEDIUM',
    name: 'Large Array Processing',
    description: 'Complex array operations on large datasets',
    regex: /arrayJoin\s*\(\s*arrayMap\s*\(|arrayFilter\s*\(\s*arrayMap/i,
    memoryMultiplier: 12,
    examples: {
      problematic: `arrayJoin(arrayMap(x -> x * 2, arrayFilter(x -> x > 100, large_array)))`,
      optimized: `Use simpler array operations or move complex logic to application layer`
    },
    optimizationStrategy: 'Simplify array operations or process in application code'
  },

  // JSON_PARSING patterns
  {
    category: 'JSON_PARSING',
    riskLevel: 'MEDIUM',
    name: 'Heavy JSON Extraction',
    description: 'Complex JSON parsing operations on large text fields',
    regex: /JSONExtract\w*\s*\([^)]*JSONExtract|visitParamExtract\w*\s*\([^)]*visitParamExtract/i,
    memoryMultiplier: 8,
    examples: {
      problematic: `JSONExtractString(JSONExtractRaw(span_attributes, 'nested'), 'deep.value')`,
      optimized: `Store frequently accessed JSON fields as separate columns`
    },
    optimizationStrategy: 'Denormalize frequently accessed JSON fields or use materialized columns'
  }
]

/**
 * Analyze a SQL query for problematic patterns
 */
export const analyzeQueryPatterns = (sql: string): Effect.Effect<QueryPatternMatch[], never> => {
  const matches: QueryPatternMatch[] = []
  const normalizedSql = sql.replace(/\s+/g, ' ').trim()

  for (const pattern of PROBLEMATIC_QUERY_PATTERNS) {
    const match = normalizedSql.match(pattern.regex)
    if (match) {
      matches.push({
        category: pattern.category,
        riskLevel: pattern.riskLevel,
        pattern: pattern.name,
        description: pattern.description,
        estimatedMemoryMultiplier: pattern.memoryMultiplier,
        matchedTokens: match.slice(1).filter(Boolean),
        ...(pattern.optimizationStrategy && {
          optimizationSuggestion: pattern.optimizationStrategy
        })
      })
    }
  }

  // Sort by risk level (CRITICAL first)
  matches.sort((a, b) => {
    const riskOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
    return riskOrder[a.riskLevel] - riskOrder[b.riskLevel]
  })

  return Effect.succeed(matches)
}

/**
 * Calculate overall query risk score
 */
export const calculateQueryRiskScore = (matches: QueryPatternMatch[]): number => {
  if (matches.length === 0) return 0

  const riskWeights = { CRITICAL: 100, HIGH: 50, MEDIUM: 20, LOW: 5 }
  const totalRisk = matches.reduce((sum, match) => sum + riskWeights[match.riskLevel], 0)

  return Math.min(totalRisk, 1000) // Cap at 1000
}

/**
 * Get risk level from score
 */
export const getRiskLevelFromScore = (score: number): QueryRiskLevel => {
  if (score >= 100) return 'CRITICAL'
  if (score >= 50) return 'HIGH'
  if (score >= 20) return 'MEDIUM'
  return 'LOW'
}

/**
 * Generate optimization suggestions for a query
 */
export const generateOptimizationSuggestions = (matches: QueryPatternMatch[]): string[] => {
  return matches
    .filter((match) => match.optimizationSuggestion)
    .map((match) => `${match.pattern}: ${match.optimizationSuggestion}`)
}
