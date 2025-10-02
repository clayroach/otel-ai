/**
 * Unit tests for CriticalPathAnalyzer service
 */

import { describe, it, expect } from 'vitest'
import { Effect, Layer, Stream } from 'effect'
import { CriticalPathAnalyzer, CriticalPathAnalyzerTag, CriticalPathAnalyzerLive } from '../../src/critical-path-analyzer/analyzer.js'
import { LLMManagerServiceTag } from '../../../llm-manager/index.js'
import type { LLMManagerService } from '../../../llm-manager/llm-manager-service.js'
import { NetworkError } from '../../../llm-manager/types.js'
import { mockServiceMetrics, mockLLMResponse } from '../fixtures/test-data.js'

/**
 * Mock LLM Manager for testing
 */
const createMockLLMManager = (response: string): LLMManagerService => ({
  generate: () =>
    Effect.succeed({
      content: response,
      model: 'mock-model',
      usage: {
        promptTokens: 100,
        completionTokens: 200,
        totalTokens: 300,
        cost: 0.01
      },
      metadata: {
        latencyMs: 500,
        retryCount: 0,
        cached: false
      }
    }),
  generateStream: () => Stream.fail(new NetworkError({ model: 'mock-model', message: 'Not implemented' })),
  isHealthy: () => Effect.succeed(true),
  getStatus: () =>
    Effect.succeed({
      availableModels: ['mock-model'],
      healthStatus: { 'mock-model': 'healthy' as const },
      config: {}
    }),
  getAvailableModels: () => Effect.succeed(['mock-model']),
  getDefaultModel: () => Effect.succeed('mock-model'),
  getModelInfo: () =>
    Effect.succeed({
      id: 'mock-model',
      name: 'Mock Model',
      provider: 'custom',
      capabilities: ['general'],
      contextWindow: 128000,
      maxOutputTokens: 4096,
      pricing: { inputTokens: 0.01, outputTokens: 0.03 },
      metadata: {
        contextLength: 128000,
        maxTokens: 4096,
        temperature: 0.7
      }
    }),
  getModelsByCapability: () => Effect.succeed([]),
  getModelsByProvider: () => Effect.succeed([]),
  getAllModels: () => Effect.succeed([])
})

describe('CriticalPathAnalyzer', () => {
  describe('discoverCriticalPaths', () => {
    it('should discover critical paths using LLM analysis', async () => {
      const mockResponse = JSON.stringify(mockLLMResponse)
      const mockLLMLayer = Layer.succeed(LLMManagerServiceTag, createMockLLMManager(mockResponse))

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
      }).pipe(Effect.provide(CriticalPathAnalyzerLive), Effect.provide(mockLLMLayer))

      const paths = await Effect.runPromise(program)

      expect(paths).toBeDefined()
      expect(paths.length).toBeGreaterThan(0)

      const firstPath = paths[0]
      expect(firstPath).toBeDefined()
      expect(firstPath?.id).toBeDefined()
      expect(firstPath?.name).toBeDefined()
      expect(firstPath?.services).toBeDefined()
      expect(firstPath?.edges).toBeDefined()
      expect(firstPath?.metrics).toBeDefined()
      expect(firstPath?.priority).toBeDefined()
      expect(firstPath?.severity).toBeDefined()
      expect(firstPath?.lastUpdated).toBeDefined()
    })

    it('should extract JSON from markdown code blocks', async () => {
      const mockResponse = '```json\n' + JSON.stringify(mockLLMResponse) + '\n```'
      const mockLLMLayer = Layer.succeed(LLMManagerServiceTag, createMockLLMManager(mockResponse))

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
      }).pipe(Effect.provide(CriticalPathAnalyzerLive), Effect.provide(mockLLMLayer))

      const paths = await Effect.runPromise(program)

      expect(paths.length).toBeGreaterThan(0)
      const firstPath = paths[0]
      expect(firstPath).toBeDefined()
      expect(firstPath?.name).toBe('User Checkout Flow')
    })

    it('should fallback to statistical discovery when LLM fails', async () => {
      const mockLLMLayer = Layer.succeed(
        LLMManagerServiceTag,
        createMockLLMManager('invalid json response')
      )

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
      }).pipe(Effect.provide(CriticalPathAnalyzerLive), Effect.provide(mockLLMLayer))

      const paths = await Effect.runPromise(program)

      // Should still return paths via statistical fallback
      expect(paths).toBeDefined()
      expect(Array.isArray(paths)).toBe(true)
    })

    it('should enrich paths with calculated metrics', async () => {
      const mockResponse = JSON.stringify(mockLLMResponse)
      const mockLLMLayer = Layer.succeed(LLMManagerServiceTag, createMockLLMManager(mockResponse))

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
      }).pipe(Effect.provide(CriticalPathAnalyzerLive), Effect.provide(mockLLMLayer))

      const paths = await Effect.runPromise(program)

      // Check that metrics are calculated from topology
      const firstPath = paths[0]
      expect(firstPath).toBeDefined()
      expect(firstPath?.metrics.requestCount).toBeGreaterThan(0)
      expect(firstPath?.metrics.avgLatency).toBeGreaterThan(0)
      expect(firstPath?.metrics.errorRate).toBeGreaterThanOrEqual(0)
      expect(firstPath?.metrics.p99Latency).toBeGreaterThan(0)
    })

    it('should generate edges from service chain', async () => {
      const mockResponse = JSON.stringify(mockLLMResponse)
      const mockLLMLayer = Layer.succeed(LLMManagerServiceTag, createMockLLMManager(mockResponse))

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
      }).pipe(Effect.provide(CriticalPathAnalyzerLive), Effect.provide(mockLLMLayer))

      const paths = await Effect.runPromise(program)

      // Check edges are properly generated
      const path = paths[0]
      expect(path).toBeDefined()
      if (path) {
        expect(path.edges.length).toBe(path.services.length - 1)
        expect(path.edges[0]?.source).toBe(path.services[0])
        expect(path.edges[0]?.target).toBe(path.services[1])
      }
    })
  })

  describe('analyzePath', () => {
    it('should analyze custom path with user-provided services', async () => {
      const mockLLMLayer = Layer.succeed(
        LLMManagerServiceTag,
        createMockLLMManager(JSON.stringify(mockLLMResponse))
      )

      const program = Effect.gen(function* () {
        const analyzer = yield* CriticalPathAnalyzerTag

        const result = yield* analyzer.analyzePath(['frontend', 'backend', 'database'])

        return result
      }).pipe(Effect.provide(CriticalPathAnalyzerLive), Effect.provide(mockLLMLayer))

      const path = await Effect.runPromise(program)

      expect(path.id).toBe('custom')
      expect(path.services).toEqual(['frontend', 'backend', 'database'])
      expect(path.startService).toBe('frontend')
      expect(path.endService).toBe('database')
      expect(path.edges.length).toBe(2)
      expect(path.priority).toBe('medium')
    })

    it('should generate edges for single service path', async () => {
      const mockLLMLayer = Layer.succeed(
        LLMManagerServiceTag,
        createMockLLMManager(JSON.stringify(mockLLMResponse))
      )

      const program = Effect.gen(function* () {
        const analyzer = yield* CriticalPathAnalyzerTag

        const result = yield* analyzer.analyzePath(['standalone-service'])

        return result
      }).pipe(Effect.provide(CriticalPathAnalyzerLive), Effect.provide(mockLLMLayer))

      const path = await Effect.runPromise(program)

      expect(path.services).toEqual(['standalone-service'])
      expect(path.edges.length).toBe(0)
      expect(path.startService).toBe('standalone-service')
      expect(path.endService).toBe('standalone-service')
    })
  })
})
