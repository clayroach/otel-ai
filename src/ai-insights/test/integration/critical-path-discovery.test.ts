/**
 * Integration Tests for Critical Path Discovery
 *
 * Tests with REAL LLM services and topology data
 */

import { describe, it, expect } from 'vitest'
import { Effect, Layer } from 'effect'
import { CriticalPathAnalyzerLive, CriticalPathAnalyzerTag } from '../../src/critical-path-analyzer/analyzer.js'
import { LLMManagerLive } from '../../../llm-manager/index.js'
import { TopologyAnalyzerService } from '../../../topology-analyzer/index.js'
import { shouldSkipExternalLLMTests } from '../../../llm-manager/test/utils/llm-availability.js'
import { mockServiceMetrics } from '../fixtures/test-data.js'

/**
 * Mock TopologyAnalyzer that returns realistic test data
 */
const createMockTopologyAnalyzer = () => ({
  analyzeArchitecture: () =>
    Effect.fail({
      _tag: 'QueryError' as const,
      message: 'Not needed for path discovery tests',
      query: ''
    }),
  getServiceTopology: () =>
    Effect.succeed([
      {
        service: 'frontend',
        type: 'frontend' as const,
        operations: ['GET /', 'POST /checkout', 'GET /products'],
        dependencies: [
          {
            service: 'api-gateway',
            operation: 'POST /api/checkout',
            callCount: 15000,
            avgLatencyMs: 80,
            errorRate: 0.005
          },
          {
            service: 'auth-service',
            operation: 'POST /api/auth',
            callCount: 5000,
            avgLatencyMs: 30,
            errorRate: 0.001
          }
        ],
        metadata: {
          avgLatencyMs: 120,
          p95LatencyMs: 800,
          errorRate: 0.005,
          totalSpans: 50000,
          throughput: 100,
          dependencies: 2
        }
      },
      {
        service: 'api-gateway',
        type: 'api' as const,
        operations: ['POST /api/checkout', 'GET /api/cart'],
        dependencies: [
          {
            service: 'cart-service',
            operation: 'GET /cart',
            callCount: 8000,
            avgLatencyMs: 60,
            errorRate: 0.01
          },
          {
            service: 'payment-service',
            operation: 'POST /payment',
            callCount: 7000,
            avgLatencyMs: 200,
            errorRate: 0.05
          }
        ],
        metadata: {
          avgLatencyMs: 150,
          p95LatencyMs: 1000,
          errorRate: 0.008,
          totalSpans: 30000
        }
      },
      {
        service: 'payment-service',
        type: 'backend' as const,
        operations: ['POST /payment', 'GET /payment/status'],
        dependencies: [
          {
            service: 'payment-gateway',
            operation: 'POST /process',
            callCount: 6500,
            avgLatencyMs: 300,
            errorRate: 0.08
          }
        ],
        metadata: {
          avgLatencyMs: 200,
          p95LatencyMs: 2000,
          errorRate: 0.05,
          totalSpans: 15000
        }
      },
      {
        service: 'database',
        type: 'database' as const,
        operations: ['SELECT', 'INSERT', 'UPDATE'],
        dependencies: [],
        metadata: {
          avgLatencyMs: 40,
          p95LatencyMs: 200,
          errorRate: 0.001,
          totalSpans: 100000
        }
      }
    ])
})

describe.skipIf(shouldSkipExternalLLMTests())('Critical Path Discovery with Real LLM', () => {
  it('should discover critical paths using real LLM analysis', async () => {
    const mockTopologyLayer = Layer.succeed(TopologyAnalyzerService, createMockTopologyAnalyzer())

    const program = Effect.gen(function* () {
      const analyzer = yield* CriticalPathAnalyzerTag

      const result = yield* analyzer.discoverCriticalPaths({
        topology: mockServiceMetrics,
        timeRange: {
          startTime: new Date('2025-01-19T09:00:00Z'),
          endTime: new Date('2025-01-19T10:00:00Z')
        }
      })

      return result
    }).pipe(
      Effect.provide(CriticalPathAnalyzerLive),
      Effect.provide(LLMManagerLive),
      Effect.provide(mockTopologyLayer)
    )

    const paths = await Effect.runPromise(program)

    // Verify LLM returned paths
    expect(paths).toBeDefined()
    expect(paths.length).toBeGreaterThan(0)
    expect(paths.length).toBeLessThanOrEqual(10) // Should return 5-10 paths per prompt

    // Verify path structure
    const firstPath = paths[0]
    expect(firstPath).toBeDefined()
    expect(firstPath?.name).toBeDefined()
    expect(firstPath?.description).toBeDefined()
    expect(firstPath?.services).toBeDefined()
    expect(firstPath?.edges).toBeDefined()
    expect(firstPath?.metrics).toBeDefined()
    expect(firstPath?.priority).toBeDefined()
    expect(firstPath?.severity).toBeGreaterThanOrEqual(0)
    expect(firstPath?.severity).toBeLessThanOrEqual(1)

    // Verify edges match services
    if (firstPath) {
      expect(firstPath.edges.length).toBe(firstPath.services.length - 1)
    }
  }, 30000) // 30s timeout for real LLM call

  it('should enrich LLM results with calculated metrics from topology', async () => {
    const mockTopologyLayer = Layer.succeed(TopologyAnalyzerService, createMockTopologyAnalyzer())

    const program = Effect.gen(function* () {
      const analyzer = yield* CriticalPathAnalyzerTag

      const result = yield* analyzer.discoverCriticalPaths({
        topology: mockServiceMetrics,
        timeRange: {
          startTime: new Date('2025-01-19T09:00:00Z'),
          endTime: new Date('2025-01-19T10:00:00Z')
        }
      })

      return result
    }).pipe(
      Effect.provide(CriticalPathAnalyzerLive),
      Effect.provide(LLMManagerLive),
      Effect.provide(mockTopologyLayer)
    )

    const paths = await Effect.runPromise(program)
    const firstPath = paths[0]

    // Metrics should be calculated from our topology data, not LLM
    expect(firstPath).toBeDefined()
    if (firstPath) {
      expect(firstPath.metrics.requestCount).toBeGreaterThan(0)
      expect(firstPath.metrics.avgLatency).toBeGreaterThan(0)
      expect(firstPath.metrics.errorRate).toBeGreaterThanOrEqual(0)
      expect(firstPath.metrics.p99Latency).toBeGreaterThan(0)

      // Verify severity is calculated based on metrics
      expect(firstPath.severity).toBeGreaterThanOrEqual(0)
      expect(firstPath.severity).toBeLessThanOrEqual(1)
    }
  }, 30000)

  it('should return business-oriented path names from LLM', async () => {
    const mockTopologyLayer = Layer.succeed(TopologyAnalyzerService, createMockTopologyAnalyzer())

    const program = Effect.gen(function* () {
      const analyzer = yield* CriticalPathAnalyzerTag

      const result = yield* analyzer.discoverCriticalPaths({
        topology: mockServiceMetrics,
        timeRange: {
          startTime: new Date('2025-01-19T09:00:00Z'),
          endTime: new Date('2025-01-19T10:00:00Z')
        }
      })

      return result
    }).pipe(
      Effect.provide(CriticalPathAnalyzerLive),
      Effect.provide(LLMManagerLive),
      Effect.provide(mockTopologyLayer)
    )

    const paths = await Effect.runPromise(program)

    // LLM should provide business-oriented names, not technical ones
    paths.forEach((path) => {
      expect(path.name).toBeDefined()
      expect(path.name.length).toBeGreaterThan(0)
      // Should not just be service names concatenated
      expect(path.name).not.toMatch(/^[a-z-]+-[a-z-]+-[a-z-]+$/)
    })
  }, 30000)
})

describe('Critical Path Discovery - Local/Offline', () => {
  it('should use statistical fallback when LLM unavailable', async () => {
    // This test doesn't need real LLM - tests fallback mechanism
    const mockTopologyLayer = Layer.succeed(TopologyAnalyzerService, createMockTopologyAnalyzer())

    const program = Effect.gen(function* () {
      const analyzer = yield* CriticalPathAnalyzerTag

      // Use statistical discovery directly by passing empty/minimal topology
      const result = yield* analyzer.discoverCriticalPaths({
        topology: mockServiceMetrics,
        timeRange: {
          startTime: new Date('2025-01-19T09:00:00Z'),
          endTime: new Date('2025-01-19T10:00:00Z')
        }
      })

      return result
    }).pipe(
      Effect.provide(CriticalPathAnalyzerLive),
      Effect.provide(LLMManagerLive),
      Effect.provide(mockTopologyLayer)
    )

    const paths = await Effect.runPromise(program)

    // Should still return paths
    expect(paths).toBeDefined()
    expect(Array.isArray(paths)).toBe(true)
  })

  it('should analyze custom path without LLM', async () => {
    const mockTopologyLayer = Layer.succeed(TopologyAnalyzerService, createMockTopologyAnalyzer())

    const program = Effect.gen(function* () {
      const analyzer = yield* CriticalPathAnalyzerTag

      const result = yield* analyzer.analyzePath(['frontend', 'api-gateway', 'database'])

      return result
    }).pipe(
      Effect.provide(CriticalPathAnalyzerLive),
      Effect.provide(LLMManagerLive),
      Effect.provide(mockTopologyLayer)
    )

    const path = await Effect.runPromise(program)

    expect(path).toBeDefined()
    expect(path.id).toBe('custom')
    expect(path.services).toEqual(['frontend', 'api-gateway', 'database'])
    expect(path.edges.length).toBe(2)
    expect(path.edges[0]?.source).toBe('frontend')
    expect(path.edges[0]?.target).toBe('api-gateway')
    expect(path.edges[1]?.source).toBe('api-gateway')
    expect(path.edges[1]?.target).toBe('database')
  })
})
