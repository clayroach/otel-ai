import { describe, it, expect } from 'vitest'
import { generateInsights, generateRequestId } from '../../service.js'

// Mock architecture data for testing
const mockArchitecture = {
  applicationName: 'Test Application',
  description: 'Test architecture for model selection',
  services: [
    {
      service: 'high-latency-service',
      type: 'backend' as const,
      operations: ['operation-1'],
      dependencies: [],
      metadata: {
        avgLatencyMs: 5000, // High latency
        errorRate: 0.02, // 2% error rate
        totalSpans: 1000
      }
    },
    {
      service: 'error-prone-service', 
      type: 'backend' as const,
      operations: ['operation-2'],
      dependencies: [],
      metadata: {
        avgLatencyMs: 500,
        errorRate: 0.05, // 5% error rate
        totalSpans: 800
      }
    },
    {
      service: 'complex-service',
      type: 'backend' as const,
      operations: ['operation-3'],
      dependencies: [
        { service: 'dep1', operation: 'op1', callCount: 100, avgLatencyMs: 50, errorRate: 0 },
        { service: 'dep2', operation: 'op2', callCount: 200, avgLatencyMs: 75, errorRate: 0.01 },
        { service: 'dep3', operation: 'op3', callCount: 150, avgLatencyMs: 25, errorRate: 0 },
        { service: 'dep4', operation: 'op4', callCount: 300, avgLatencyMs: 100, errorRate: 0.02 },
        { service: 'dep5', operation: 'op5', callCount: 250, avgLatencyMs: 60, errorRate: 0 },
        { service: 'dep6', operation: 'op6', callCount: 180, avgLatencyMs: 90, errorRate: 0.01 }
      ],
      metadata: {
        avgLatencyMs: 800,
        errorRate: 0.005, // 0.5% error rate
        totalSpans: 1200
      }
    },
    {
      service: 'normal-service',
      type: 'backend' as const,
      operations: ['operation-4'],
      dependencies: [],
      metadata: {
        avgLatencyMs: 100, // Normal latency
        errorRate: 0.001, // Low error rate
        totalSpans: 500
      }
    }
  ],
  dataFlows: [
    { from: 'service-a', operation: 'op', to: 'service-b', volume: 1000, latency: { p50: 50, p95: 100, p99: 150 } },
    { from: 'service-b', operation: 'op', to: 'service-c', volume: 800, latency: { p50: 75, p95: 125, p99: 200 } }
  ],
  criticalPaths: [
    { name: 'critical-path-1', services: ['service-a', 'service-b'], avgLatencyMs: 2000, errorRate: 0.01, volume: 1000, type: 'high-latency' }
  ],
  generatedAt: new Date()
}

describe('Model Selection and Insights Generation', () => {
  describe('generateRequestId', () => {
    it('should generate unique request IDs', () => {
      const id1 = generateRequestId()
      const id2 = generateRequestId()
      
      expect(id1).toMatch(/^ai-analysis-\d+-[a-z0-9]+$/)
      expect(id2).toMatch(/^ai-analysis-\d+-[a-z0-9]+$/)
      expect(id1).not.toBe(id2)
    })

    it('should include timestamp and random component', () => {
      const id = generateRequestId()
      const parts = id.split('-')
      
      expect(parts).toHaveLength(4) // ai, analysis, timestamp, random
      expect(parts[0]).toBe('ai')
      expect(parts[1]).toBe('analysis')
      expect(parseInt(parts[2] || '0')).toBeGreaterThan(0)
      expect(parts[3]).toMatch(/^[a-z0-9]+$/)
    })
  })

  describe('Statistical Analysis (Default Model)', () => {
    it('should generate performance insights for high latency services', () => {
      const insights = generateInsights(mockArchitecture, 'architecture')
      
      const performanceInsight = insights.find(i => i.type === 'performance')
      expect(performanceInsight).toBeDefined()
      expect(performanceInsight?.title).toBe('High Latency Services Detected')
      expect(performanceInsight?.severity).toBe('warning')
      expect(performanceInsight?.evidence.data.services).toContain('high-latency-service: 5000ms avg latency (1000 spans)')
    })

    it('should generate reliability insights for high error rate services', () => {
      const insights = generateInsights(mockArchitecture, 'architecture')
      
      const reliabilityInsight = insights.find(i => i.type === 'reliability')
      expect(reliabilityInsight).toBeDefined()
      expect(reliabilityInsight?.title).toBe('High Error Rate Services')
      expect(reliabilityInsight?.severity).toBe('critical')
      expect(reliabilityInsight?.evidence.data.services).toContain('error-prone-service: 5.0% error rate (800 spans, 500ms avg)')
    })

    it('should generate architecture insights for complex dependencies', () => {
      const insights = generateInsights(mockArchitecture, 'architecture')
      
      const architectureInsight = insights.find(i => i.type === 'architecture')
      expect(architectureInsight).toBeDefined()
      expect(architectureInsight?.title).toBe('Complex Service Dependencies')
      expect(architectureInsight?.severity).toBe('info')
      expect(architectureInsight?.evidence.data.services).toContain('complex-service: 6 dependencies (1200 spans, 800ms avg)')
    })

    it('should not generate insights when thresholds are not met', () => {
      const lowTrafficArchitecture = {
        ...mockArchitecture,
        services: [{
          service: 'simple-service',
          type: 'backend' as const,
          operations: ['op'],
          dependencies: [],
          metadata: { avgLatencyMs: 50, errorRate: 0.001, totalSpans: 100 }
        }]
      }

      const insights = generateInsights(lowTrafficArchitecture, 'architecture')
      expect(insights).toHaveLength(0)
    })

    it('should sort services by severity in evidence', () => {
      const insights = generateInsights(mockArchitecture, 'architecture')
      
      const performanceInsight = insights.find(i => i.type === 'performance')
      const services = performanceInsight?.evidence.data.services
      
      if (services && services.length > 0) {
        // First service should have highest latency
        expect(services[0]).toContain('high-latency-service: 5000ms')
        // Should be sorted by latency descending
        const latencies = services.map(e => parseInt(e.match(/(\d+)ms/)?.[1] || '0'))
        for (let i = 1; i < latencies.length; i++) {
          expect(latencies[i-1] || 0).toBeGreaterThanOrEqual(latencies[i] || 0)
        }
      }
    })
  })

  describe('Evidence Formatting', () => {
    it('should format performance evidence as human-readable strings', () => {
      const insights = generateInsights(mockArchitecture, 'architecture')
      const performanceInsight = insights.find(i => i.type === 'performance')
      
      expect(performanceInsight?.evidence.data.services).toEqual([
        'high-latency-service: 5000ms avg latency (1000 spans)'
      ])
    })

    it('should format reliability evidence with error rates and latency', () => {
      const insights = generateInsights(mockArchitecture, 'architecture')
      const reliabilityInsight = insights.find(i => i.type === 'reliability')
      
      expect(reliabilityInsight?.evidence.data.services).toEqual([
        'error-prone-service: 5.0% error rate (800 spans, 500ms avg)',
        'high-latency-service: 2.0% error rate (1000 spans, 5000ms avg)'
      ])
    })

    it('should format architecture evidence with dependency counts', () => {
      const insights = generateInsights(mockArchitecture, 'architecture')
      const architectureInsight = insights.find(i => i.type === 'architecture')
      
      expect(architectureInsight?.evidence.data.services).toEqual([
        'complex-service: 6 dependencies (1200 spans, 800ms avg)'
      ])
    })
  })

  describe('Threshold Configuration', () => {
    it('should use 1000ms threshold for performance insights', () => {
      const borderlineArchitecture = {
        ...mockArchitecture,
        services: [
          {
            service: 'borderline-service',
            type: 'backend' as const,
            operations: ['op'],
            dependencies: [],
            metadata: { avgLatencyMs: 999, errorRate: 0.001, totalSpans: 100 }
          },
          {
            service: 'slow-service',
            type: 'backend' as const,
            operations: ['op'],
            dependencies: [],
            metadata: { avgLatencyMs: 1001, errorRate: 0.001, totalSpans: 100 }
          }
        ]
      }

      const insights = generateInsights(borderlineArchitecture, 'architecture')
      const performanceInsight = insights.find(i => i.type === 'performance')
      
      expect(performanceInsight?.evidence.data.services).toHaveLength(1)
      expect(performanceInsight?.evidence.data.services[0]).toContain('slow-service: 1001ms')
    })

    it('should use 1% threshold for reliability insights', () => {
      const borderlineArchitecture = {
        ...mockArchitecture,
        services: [
          {
            service: 'low-error-service',
            type: 'backend' as const,
            operations: ['op'],
            dependencies: [],
            metadata: { avgLatencyMs: 100, errorRate: 0.009, totalSpans: 1000 } // 0.9%
          },
          {
            service: 'high-error-service',
            type: 'backend' as const,
            operations: ['op'],
            dependencies: [],
            metadata: { avgLatencyMs: 100, errorRate: 0.011, totalSpans: 1000 } // 1.1%
          }
        ]
      }

      const insights = generateInsights(borderlineArchitecture, 'architecture')
      const reliabilityInsight = insights.find(i => i.type === 'reliability')
      
      expect(reliabilityInsight?.evidence.data.services).toHaveLength(1)
      expect(reliabilityInsight?.evidence.data.services[0]).toContain('high-error-service: 1.1%')
    })

    it('should use 5 dependencies threshold for architecture insights', () => {
      const architectureWithDependencies = {
        ...mockArchitecture,
        services: [
          {
            service: 'simple-service',
            type: 'backend' as const,
            operations: ['op'],
            dependencies: Array(4).fill(null).map((_, i) => ({ 
              service: `dep-${i}`, operation: 'op', callCount: 100, avgLatencyMs: 50, errorRate: 0 
            })), // 4 deps - below threshold
            metadata: { avgLatencyMs: 100, errorRate: 0.001, totalSpans: 100 }
          },
          {
            service: 'complex-service',
            type: 'backend' as const,
            operations: ['op'],
            dependencies: Array(6).fill(null).map((_, i) => ({ 
              service: `dep-${i}`, operation: 'op', callCount: 100, avgLatencyMs: 50, errorRate: 0 
            })), // 6 deps - above threshold
            metadata: { avgLatencyMs: 100, errorRate: 0.001, totalSpans: 100 }
          }
        ]
      }

      const insights = generateInsights(architectureWithDependencies, 'architecture')
      const architectureInsight = insights.find(i => i.type === 'architecture')
      
      expect(architectureInsight?.evidence.data.services).toHaveLength(1)
      expect(architectureInsight?.evidence.data.services[0]).toContain('complex-service: 6 dependencies')
    })
  })

  describe('Analysis Type Variations', () => {
    it('should generate the same insights for different analysis types', () => {
      const insightsArch = generateInsights(mockArchitecture, 'architecture')
      const insightsDataflow = generateInsights(mockArchitecture, 'dataflow')
      const insightsDeps = generateInsights(mockArchitecture, 'dependencies')
      const insightsInsights = generateInsights(mockArchitecture, 'insights')

      // Compare insights without timing-sensitive metadata
      const normalizeInsights = (insights: any[]) => insights.map(insight => ({
        ...insight,
        evidence: {
          ...insight.evidence,
          metadata: {
            ...insight.evidence.metadata,
            processingTime: expect.any(Number) // Ignore timing variations
          }
        }
      }))
      
      expect(normalizeInsights(insightsArch)).toEqual(normalizeInsights(insightsDataflow))
      expect(normalizeInsights(insightsArch)).toEqual(normalizeInsights(insightsDeps))
      expect(normalizeInsights(insightsArch)).toEqual(normalizeInsights(insightsInsights))
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty services array', () => {
      const emptyArchitecture = {
        ...mockArchitecture,
        services: []
      }

      const insights = generateInsights(emptyArchitecture, 'architecture')
      expect(insights).toHaveLength(0)
    })

    it('should handle services with zero spans', () => {
      const zeroSpanArchitecture = {
        ...mockArchitecture,
        services: [{
          service: 'zero-span-service',
          type: 'backend' as const,
          operations: ['op'],
          dependencies: [],
          metadata: { avgLatencyMs: 5000, errorRate: 0.1, totalSpans: 0 }
        }]
      }

      const insights = generateInsights(zeroSpanArchitecture, 'architecture')
      expect(insights.length).toBeGreaterThanOrEqual(0) // Should not crash
    })

    it('should handle services with null/undefined metadata values', () => {
      const nullMetadataArchitecture = {
        ...mockArchitecture,
        services: [{
          service: 'null-metadata-service',
          type: 'backend' as const,
          operations: ['op'],
          dependencies: [],
          metadata: { avgLatencyMs: null as unknown, errorRate: undefined as unknown, totalSpans: 1000 }
        }]
      }

      expect(() => {
        generateInsights(nullMetadataArchitecture, 'architecture')
      }).not.toThrow()
    })

    it('should limit evidence to 5 items for performance insights', () => {
      const manyServicesArchitecture = {
        ...mockArchitecture,
        services: Array(10).fill(null).map((_, i) => ({
          service: `slow-service-${i}`,
          type: 'backend' as const,
          operations: [`op-${i}`],
          dependencies: [],
          metadata: { avgLatencyMs: 2000 + i * 100, errorRate: 0.001, totalSpans: 100 }
        }))
      }

      const insights = generateInsights(manyServicesArchitecture, 'architecture')
      const performanceInsight = insights.find(i => i.type === 'performance')
      
      expect(performanceInsight?.evidence.data.services).toHaveLength(5)
    })

    it('should limit evidence to 3 items for architecture insights', () => {
      const manyComplexServicesArchitecture = {
        ...mockArchitecture,
        services: Array(5).fill(null).map((_, i) => ({
          service: `complex-service-${i}`,
          type: 'backend' as const,
          operations: [`op-${i}`],
          dependencies: Array(6 + i).fill(null).map((_, j) => ({ 
            service: `dep-${j}`, operation: 'op', callCount: 100, avgLatencyMs: 50, errorRate: 0 
          })),
          metadata: { avgLatencyMs: 100, errorRate: 0.001, totalSpans: 100 }
        }))
      }

      const insights = generateInsights(manyComplexServicesArchitecture, 'architecture')
      const architectureInsight = insights.find(i => i.type === 'architecture')
      
      expect(architectureInsight?.evidence.data.services).toHaveLength(3)
    })
  })
})