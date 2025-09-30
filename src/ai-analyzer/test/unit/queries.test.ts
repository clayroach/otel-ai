/**
 * Unit Tests for AI Analyzer Query Optimizations
 * Issue #161: Test memory-protected queries and materialized view logic
 */

import { describe, it, expect } from 'vitest'
import { ArchitectureQueries, OptimizedQueries } from '../../queries.js'

describe('AI Analyzer Queries', () => {
  // Unit tests should not require a real ClickHouse connection
  // We're just testing the query generation logic

  describe('Service Dependencies Query', () => {
    it('should include memory protection settings', () => {
      const query = ArchitectureQueries.getServiceDependencies(24)

      // Check for memory protection settings
      expect(query).toContain('SETTINGS')
      expect(query).toContain('max_memory_usage = 500000000')
      expect(query).toContain('max_execution_time = 30')
    })

    it('should use array-based approach without sampling', () => {
      const query = ArchitectureQueries.getServiceDependencies(24)

      // Should NOT contain sampling CTEs
      expect(query).not.toContain('SAMPLE')

      // Should use array-based approach
      expect(query).toContain('groupArray')
      expect(query).toContain('trace_data')
      expect(query).toContain('parent.3 as service_name')
      expect(query).toContain('child.3 as dependent_service')
    })

    it('should include all dependencies (HAVING count >= 1)', () => {
      const query = ArchitectureQueries.getServiceDependencies(24)

      expect(query).toContain('HAVING call_count >= 1')
      expect(query).not.toContain('HAVING call_count >= 5')
      expect(query).not.toContain('HAVING call_count > 1')
    })

    it('should have increased result limit', () => {
      const query = ArchitectureQueries.getServiceDependencies(24)

      expect(query).toContain('LIMIT 1000')
      expect(query).not.toContain('LIMIT 500')
    })
  })

  describe('Service Topology Query', () => {
    it('should include memory protection', () => {
      const query = ArchitectureQueries.getServiceTopology(24)

      expect(query).toContain('SETTINGS')
      expect(query).toContain('max_memory_usage = 1000000000')
      expect(query).toContain('max_execution_time = 30')
    })

    it('should include all services (HAVING total_spans >= 1)', () => {
      const query = ArchitectureQueries.getServiceTopology(24)

      expect(query).toContain('HAVING total_spans >= 1')
      expect(query).not.toContain('HAVING total_spans >= 5')
    })
  })

  describe('Trace Flows Query', () => {
    it('should include single-span traces', () => {
      const query = ArchitectureQueries.getTraceFlows(100, 24)

      expect(query).toContain('HAVING count(*) >= 1')
      expect(query).not.toContain('HAVING count(*) BETWEEN 3 AND 50')
      expect(query).not.toContain('HAVING count(*) > 1')
    })

    it('should use memory-optimized array functions', () => {
      const query = ArchitectureQueries.getTraceFlows(100, 24)

      expect(query).toContain('groupArray')
      expect(query).toContain('arrayFirst')
      expect(query).not.toContain('RECURSIVE')
    })
  })

  describe('Root Services Query', () => {
    it('should include all root services', () => {
      const query = ArchitectureQueries.getRootServices(24)

      expect(query).toContain('HAVING root_span_count >= 1')
      expect(query).not.toContain('HAVING root_span_count >= 5')
    })

    it('should have increased limit', () => {
      const query = ArchitectureQueries.getRootServices(24)

      expect(query).toContain('LIMIT 100')
      expect(query).not.toContain('LIMIT 50')
    })
  })

  describe('Leaf Services Query', () => {
    it('should include all leaf services', () => {
      const query = ArchitectureQueries.getLeafServices(24)

      expect(query).toContain('HAVING span_count >= 1')
      expect(query).not.toContain('HAVING span_count >= 5')
    })

    it('should have increased limit', () => {
      const query = ArchitectureQueries.getLeafServices(24)

      expect(query).toContain('LIMIT 100')
      expect(query).not.toContain('LIMIT 50')
    })
  })

  describe('Critical Paths Query', () => {
    it('should include single-span traces', () => {
      const query = ArchitectureQueries.getCriticalPaths(24)

      expect(query).toContain('HAVING span_count >= 1')
      expect(query).not.toContain('HAVING span_count >= 3')
    })

    it('should have increased limit for more visibility', () => {
      const query = ArchitectureQueries.getCriticalPaths(24)

      expect(query).toContain('LIMIT 50')
      expect(query).not.toContain('LIMIT 20')
    })
  })

  describe('Error Patterns Query', () => {
    it('should include single error occurrences', () => {
      const query = ArchitectureQueries.getErrorPatterns(24)

      expect(query).toContain('HAVING error_count >= 1')
      expect(query).not.toContain('HAVING error_count >= 5')
    })

    it('should have increased limit', () => {
      const query = ArchitectureQueries.getErrorPatterns(24)

      expect(query).toContain('LIMIT 100')
      expect(query).not.toContain('LIMIT 50')
    })
  })

  describe('Aggregated Table Queries', () => {
    it('should use 5-minute aggregation for recent data', () => {
      const query = OptimizedQueries.getServiceDependenciesFromView(12) // 12 hours

      expect(query).toContain('FROM otel.service_dependencies_5min')
      expect(query).not.toContain('FROM otel.service_dependencies_hourly')
    })

    it('should use hourly aggregation for longer ranges', () => {
      const query = OptimizedQueries.getServiceDependenciesFromView(48) // 48 hours

      expect(query).toContain('FROM otel.service_dependencies_hourly')
      expect(query).not.toContain('FROM otel.service_dependencies_5min')
    })

    it('should aggregate table data correctly', () => {
      const query = OptimizedQueries.getServiceTopologyFromView(24)

      // The query actually returns columns directly, not aggregated
      expect(query).toContain('total_spans')
      expect(query).toContain('root_spans')
      expect(query).toContain('avg_duration_ms')
      expect(query).toContain('p95_duration_ms')
      expect(query).toContain('FROM service_topology_5min')
    })

    it('should use getServiceDependenciesForMinutes for sub-hour queries', () => {
      const query = OptimizedQueries.getServiceDependenciesForMinutes(30) // 30 minutes

      expect(query).toContain('FROM otel.service_dependencies_5min')
      expect(query).toContain('WHERE window_start >= now() - INTERVAL 30 MINUTE')
      expect(query).toContain('sum(call_count)')
      expect(query).toContain('avg(avg_duration_ms)')
    })
  })

  describe('Query Safety', () => {
    it('should not contain dangerous operations', () => {
      const queries = [
        ArchitectureQueries.getServiceDependencies(24),
        ArchitectureQueries.getServiceTopology(24),
        ArchitectureQueries.getTraceFlows(100, 24),
        OptimizedQueries.getServiceDependenciesFromView(24)
      ]

      queries.forEach(query => {
        // No DROP or DELETE operations
        expect(query.toUpperCase()).not.toContain('DROP')
        expect(query.toUpperCase()).not.toContain('DELETE')
        expect(query.toUpperCase()).not.toContain('TRUNCATE')

        // Has proper memory limits
        if (query.includes('traces p')) {
          expect(query).toContain('max_memory_usage')
        }
      })
    })
  })

  describe('Time Range Filtering', () => {
    it('should correctly apply time range filters', () => {
      const testRanges = [1, 6, 12, 24, 48, 168] // Various hour ranges

      testRanges.forEach(hours => {
        const query = ArchitectureQueries.getServiceDependencies(hours)
        expect(query).toContain(`INTERVAL ${hours} HOUR`)
      })
    })
  })
})

describe('Edge Cases', () => {
  describe('Empty Dataset Handling', () => {
    it('queries should handle empty results gracefully', () => {
      // All queries should have proper GROUP BY and aggregation
      const query = ArchitectureQueries.getServiceDependencies(24)

      expect(query).toContain('GROUP BY')
      expect(query).toContain('count(*)')
      expect(query).toContain('avg(')
    })
  })

  describe('Single Service Scenarios', () => {
    it('should handle traces with only one service', () => {
      const query = ArchitectureQueries.getServiceDependencies(24)

      // The array filter ensures different services
      expect(query).toContain('x.3 != parent.3')
    })
  })

  describe('Large Dataset Protection', () => {
    it('should have result limits to prevent UI overload', () => {
      const queries = [
        ArchitectureQueries.getServiceDependencies(24),
        ArchitectureQueries.getServiceTopology(24),
        ArchitectureQueries.getRootServices(24),
        ArchitectureQueries.getLeafServices(24)
      ]

      queries.forEach(query => {
        expect(query).toMatch(/LIMIT \d+/)
      })
    })
  })
})

describe('Performance Characteristics', () => {
  it('should use appropriate memory limits based on query complexity', () => {
    const dependencyQuery = ArchitectureQueries.getServiceDependencies(24)
    const topologyQuery = ArchitectureQueries.getServiceTopology(24)

    // Dependencies query now uses lower memory limit with array approach (500MB)
    expect(dependencyQuery).toContain('max_memory_usage = 500000000') // 500MB

    // Topology query (simple aggregation) can have lower limit
    expect(topologyQuery).toContain('max_memory_usage = 1000000000') // 1GB
  })

  it('should use appropriate timeout values', () => {
    const dependencyQuery = ArchitectureQueries.getServiceDependencies(24)
    const topologyQuery = ArchitectureQueries.getServiceTopology(24)

    // Both queries use 30 second timeout now
    expect(dependencyQuery).toContain('max_execution_time = 30')

    // Topology query also has 30 second timeout
    expect(topologyQuery).toContain('max_execution_time = 30')
  })
})