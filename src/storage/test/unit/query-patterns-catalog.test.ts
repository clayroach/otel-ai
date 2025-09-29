/**
 * Tests for Query Pattern Catalog
 *
 * Verifies that the catalog correctly identifies problematic SQL patterns
 * and provides appropriate risk assessments and optimization suggestions.
 */

import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import {
  analyzeQueryPatterns,
  calculateQueryRiskScore,
  getRiskLevelFromScore,
  generateOptimizationSuggestions,
  PROBLEMATIC_QUERY_PATTERNS
} from '../../query-patterns-catalog.js'

describe('Query Pattern Catalog', () => {
  describe('Pattern Detection', () => {
    it('should detect self-join CTE pattern (Issue #57)', async () => {
      const problematicSQL = `
        WITH trace_spans AS (
          SELECT trace_id, span_id, parent_span_id, service_name
          FROM traces
          WHERE start_time >= now() - INTERVAL 1 HOUR
        )
        SELECT ts.service_name as from_service, ps.service_name as to_service
        FROM trace_spans ts
        LEFT JOIN trace_spans ps ON ts.parent_span_id = ps.span_id AND ts.trace_id = ps.trace_id
        WHERE ts.service_name != ps.service_name
      `

      const matches = await Effect.runPromise(analyzeQueryPatterns(problematicSQL))

      expect(matches.length).toBeGreaterThanOrEqual(1)
      const cteMatch = matches.find(m => m.pattern === 'CTE Self-Join')
      expect(cteMatch).toBeDefined()
      expect(cteMatch?.category).toBe('SELF_JOIN')
      expect(cteMatch?.riskLevel).toBe('CRITICAL')
      expect(cteMatch?.estimatedMemoryMultiplier).toBe(100)
      expect(cteMatch?.optimizationSuggestion).toContain('array functions')
    })

    it('should detect cartesian product from missing JOIN condition', async () => {
      const problematicSQL = `
        SELECT * FROM traces, ai_anomalies
        WHERE start_time > now() - INTERVAL 1 HOUR
      `

      const matches = await Effect.runPromise(analyzeQueryPatterns(problematicSQL))

      expect(matches.length).toBeGreaterThan(0)
      const cartesianMatch = matches.find(m => m.category === 'CARTESIAN_PRODUCT')
      expect(cartesianMatch).toBeDefined()
      expect(cartesianMatch?.riskLevel).toBe('CRITICAL')
    })

    it('should detect complex aggregation with many GROUP BY columns', async () => {
      const problematicSQL = `
        SELECT service_name, operation_name, span_kind, status_code, resource_type, deployment_env, COUNT(*)
        FROM traces
        GROUP BY service_name, operation_name, span_kind, status_code, resource_type, deployment_env
      `

      const matches = await Effect.runPromise(analyzeQueryPatterns(problematicSQL))

      const aggregationMatch = matches.find(m => m.category === 'COMPLEX_AGGREGATION')
      expect(aggregationMatch).toBeDefined()
      expect(aggregationMatch?.riskLevel).toBe('HIGH')
      expect(aggregationMatch?.pattern).toBe('Many Group By Columns')
    })

    it('should detect nested aggregates', async () => {
      const problematicSQL = `
        SELECT COUNT(DISTINCT(service_name)) as unique_services
        FROM traces
      `

      const matches = await Effect.runPromise(analyzeQueryPatterns(problematicSQL))

      const nestedMatch = matches.find(m => m.pattern === 'Nested Aggregates')
      expect(nestedMatch).toBeDefined()
      expect(nestedMatch?.riskLevel).toBe('CRITICAL')
      expect(nestedMatch?.optimizationSuggestion).toContain('ClickHouse-specific aggregate functions')
    })

    it('should detect complex window functions', async () => {
      const problematicSQL = `
        SELECT service_name, operation_name,
               ROW_NUMBER() OVER (PARTITION BY service_name, operation_name, span_kind ORDER BY start_time) as rn
        FROM traces
      `

      const matches = await Effect.runPromise(analyzeQueryPatterns(problematicSQL))

      const windowMatch = matches.find(m => m.category === 'WINDOW_FUNCTIONS')
      expect(windowMatch).toBeDefined()
      expect(windowMatch?.riskLevel).toBe('MEDIUM')
    })

    it('should detect correlated subqueries', async () => {
      const problematicSQL = `
        SELECT *,
               (SELECT COUNT(*) FROM traces t2 WHERE t2.service_name = t1.service_name) as service_count
        FROM traces t1
      `

      const matches = await Effect.runPromise(analyzeQueryPatterns(problematicSQL))

      const subqueryMatch = matches.find(m => m.category === 'SUBQUERY_EXPLOSION')
      expect(subqueryMatch).toBeDefined()
      expect(subqueryMatch?.riskLevel).toBe('HIGH')
    })

    it('should detect multiple UNION operations', async () => {
      const problematicSQL = `
        SELECT * FROM traces WHERE service_name = 'a'
        UNION ALL
        SELECT * FROM traces WHERE service_name = 'b'
        UNION ALL
        SELECT * FROM traces WHERE service_name = 'c'
        UNION ALL
        SELECT * FROM traces WHERE service_name = 'd'
      `

      const matches = await Effect.runPromise(analyzeQueryPatterns(problematicSQL))

      const unionMatch = matches.find(m => m.category === 'LARGE_UNION')
      expect(unionMatch).toBeDefined()
      expect(unionMatch?.riskLevel).toBe('HIGH')
    })

    it('should not flag simple, safe queries', async () => {
      const safeSQL = `
        SELECT service_name, COUNT(*) as request_count
        FROM traces
        WHERE start_time >= now() - INTERVAL 1 HOUR
        GROUP BY service_name
        ORDER BY request_count DESC
        LIMIT 100
      `

      const matches = await Effect.runPromise(analyzeQueryPatterns(safeSQL))
      expect(matches).toHaveLength(0)
    })
  })

  describe('Risk Scoring', () => {
    it('should calculate high risk score for multiple critical patterns', async () => {
      const veryProblematicSQL = `
        WITH trace_spans AS (SELECT * FROM traces)
        SELECT ts1.*, ts2.*, COUNT(DISTINCT(ts1.service_name))
        FROM trace_spans ts1, trace_spans ts2
        WHERE ts1.trace_id = ts2.trace_id
        GROUP BY ts1.service_name, ts1.operation_name, ts1.span_kind, ts1.status_code, ts1.resource_type
      `

      const matches = await Effect.runPromise(analyzeQueryPatterns(veryProblematicSQL))
      const riskScore = calculateQueryRiskScore(matches)

      expect(riskScore).toBeGreaterThanOrEqual(100) // Should be CRITICAL
      expect(getRiskLevelFromScore(riskScore)).toBe('CRITICAL')
    })

    it('should calculate medium risk score for moderate patterns', async () => {
      const mediumRiskSQL = `
        SELECT service_name, operation_name,
               ROW_NUMBER() OVER (PARTITION BY service_name, operation_name ORDER BY start_time) as rn
        FROM traces
        WHERE CONCAT(service_name, operation_name, span_kind) LIKE '%payment%'
      `

      const matches = await Effect.runPromise(analyzeQueryPatterns(mediumRiskSQL))
      const riskScore = calculateQueryRiskScore(matches)

      expect(riskScore).toBeGreaterThan(20)
      expect(riskScore).toBeLessThan(100)
      expect(getRiskLevelFromScore(riskScore)).toBe('MEDIUM')
    })

    it('should return zero risk score for safe queries', async () => {
      const safeSQL = `SELECT COUNT(*) FROM traces WHERE service_name = 'frontend'`

      const matches = await Effect.runPromise(analyzeQueryPatterns(safeSQL))
      const riskScore = calculateQueryRiskScore(matches)

      expect(riskScore).toBe(0)
      expect(getRiskLevelFromScore(riskScore)).toBe('LOW')
    })
  })

  describe('Optimization Suggestions', () => {
    it('should provide optimization suggestions for problematic patterns', async () => {
      const problematicSQL = `
        WITH trace_spans AS (SELECT * FROM traces)
        SELECT ts1.*, ts2.*
        FROM trace_spans ts1
        LEFT JOIN trace_spans ts2 ON ts1.parent_span_id = ts2.span_id
      `

      const matches = await Effect.runPromise(analyzeQueryPatterns(problematicSQL))
      const suggestions = generateOptimizationSuggestions(matches)

      expect(suggestions.length).toBeGreaterThanOrEqual(1)
      // Should have self-join optimization suggestions
      const selfJoinSuggestion = suggestions.find(s => s.includes('self-join') || s.includes('array') || s.includes('hierarchical'))
      expect(selfJoinSuggestion).toBeDefined()
    })

    it('should handle queries with no optimization suggestions', async () => {
      const safeSQL = `SELECT service_name FROM traces LIMIT 10`

      const matches = await Effect.runPromise(analyzeQueryPatterns(safeSQL))
      const suggestions = generateOptimizationSuggestions(matches)

      expect(suggestions).toHaveLength(0)
    })
  })

  describe('Pattern Completeness', () => {
    it('should have all expected pattern categories', () => {
      const categories = PROBLEMATIC_QUERY_PATTERNS.map(p => p.category)
      const uniqueCategories = [...new Set(categories)]

      expect(uniqueCategories).toContain('SELF_JOIN')
      expect(uniqueCategories).toContain('CARTESIAN_PRODUCT')
      expect(uniqueCategories).toContain('COMPLEX_AGGREGATION')
      expect(uniqueCategories).toContain('STRING_OPERATIONS')
      expect(uniqueCategories).toContain('LARGE_UNION')
      expect(uniqueCategories).toContain('DEEP_CTE')
      expect(uniqueCategories).toContain('WINDOW_FUNCTIONS')
      expect(uniqueCategories).toContain('SUBQUERY_EXPLOSION')
      expect(uniqueCategories).toContain('ARRAY_OPERATIONS')
      expect(uniqueCategories).toContain('JSON_PARSING')
    })

    it('should have critical patterns for Issue #57 problems', () => {
      const criticalPatterns = PROBLEMATIC_QUERY_PATTERNS.filter(p => p.riskLevel === 'CRITICAL')

      // Should have self-join patterns (main Issue #57 cause)
      const selfJoinPatterns = criticalPatterns.filter(p => p.category === 'SELF_JOIN')
      expect(selfJoinPatterns.length).toBeGreaterThan(0)

      // Should have cartesian product patterns (related Issue #57 cause)
      const cartesianPatterns = criticalPatterns.filter(p => p.category === 'CARTESIAN_PRODUCT')
      expect(cartesianPatterns.length).toBeGreaterThan(0)
    })

    it('should have optimization strategies for all high-risk patterns', () => {
      const highRiskPatterns = PROBLEMATIC_QUERY_PATTERNS.filter(p =>
        p.riskLevel === 'CRITICAL' || p.riskLevel === 'HIGH'
      )

      highRiskPatterns.forEach(pattern => {
        expect(pattern.optimizationStrategy).toBeDefined()
        expect(pattern.optimizationStrategy).not.toBe('')
        expect(pattern.examples.optimized).toBeDefined()
      })
    })
  })

  describe('Memory Multiplier Accuracy', () => {
    it('should assign highest multipliers to most dangerous patterns', () => {
      const criticalPatterns = PROBLEMATIC_QUERY_PATTERNS.filter(p => p.riskLevel === 'CRITICAL')
      const mediumPatterns = PROBLEMATIC_QUERY_PATTERNS.filter(p => p.riskLevel === 'MEDIUM')

      const maxCriticalMultiplier = Math.max(...criticalPatterns.map(p => p.memoryMultiplier))
      const maxMediumMultiplier = Math.max(...mediumPatterns.map(p => p.memoryMultiplier))

      expect(maxCriticalMultiplier).toBeGreaterThan(maxMediumMultiplier)
    })

    it('should have realistic memory multipliers', () => {
      PROBLEMATIC_QUERY_PATTERNS.forEach(pattern => {
        // Memory multipliers should be reasonable (1-1000x)
        expect(pattern.memoryMultiplier).toBeGreaterThan(0)
        expect(pattern.memoryMultiplier).toBeLessThanOrEqual(1000)

        // Critical patterns should have high multipliers
        if (pattern.riskLevel === 'CRITICAL') {
          expect(pattern.memoryMultiplier).toBeGreaterThan(50)
        }
      })
    })
  })
})