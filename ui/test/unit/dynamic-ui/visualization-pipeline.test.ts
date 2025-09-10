/**
 * Unit tests for Dynamic UI Visualization Pipeline
 * Using Effect Layers with real checkout data
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Effect, pipe, Layer } from 'effect'
import {
  MockQueryGeneratorService,
  MockClickHouseService,
  MockVisualizationService,
  MockFullPipelineLayer,
  MockQueryGeneratorSuccessLayer,
  MockClickHouseWithCheckoutDataLayer,
  MockVisualizationLayer,
  getCheckoutDataByService,
  calculateServiceMetrics,
  getCheckoutTimeRange,
  type QueryGeneratorService
} from './fixtures/mock-layers'
import { mockCriticalPaths } from './fixtures/mock-responses'
import checkoutResultsData from './fixtures/checkout-service-results.json'

describe('Visualization Pipeline with Real Data', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Query Generation with Effect Layers', () => {
    it('should generate checkout flow query using Effect Layer', async () => {
      const program = pipe(
        Effect.gen(function* () {
          const queryGenerator = yield* MockQueryGeneratorService
          
          const result = yield* queryGenerator.generateQuery({
            path: mockCriticalPaths.checkoutFlow,
            analysisGoal: 'Analyze checkout latency'
          })

          return result
        }),
        Effect.provide(MockQueryGeneratorSuccessLayer)
      )

      const result = await Effect.runPromise(program)

      expect(result.sql).toContain('SELECT')
      expect(result.sql).toContain('service_name')
      expect(result.sql).toContain('p50_ms')
      expect(result.sql).toContain('p95_ms')
      expect(result.sql).toContain('p99_ms')
      expect(result.model).toBe('codellama')
      expect(result.analysisType).toBe('latency')
    })

    it('should validate generated queries', async () => {
      const program = pipe(
        Effect.gen(function* () {
          const queryGenerator = yield* MockQueryGeneratorService
          
          const query = yield* queryGenerator.generateQuery({
            path: mockCriticalPaths.checkoutFlow
          })

          const validation = queryGenerator.validateQuery(query.sql)
          return validation
        }),
        Effect.provide(MockQueryGeneratorSuccessLayer)
      )

      const result = await Effect.runPromise(program)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })
  })

  describe('ClickHouse Query Execution with Real Data', () => {
    it('should return real checkout data from mock ClickHouse', async () => {
      const program = pipe(
        Effect.gen(function* () {
          const clickhouse = yield* MockClickHouseService
          
          const results = yield* clickhouse.executeQuery(
            'SELECT * FROM traces WHERE service_name IN ("frontend", "cart", "checkout")'
          )

          return results
        }),
        Effect.provide(MockClickHouseWithCheckoutDataLayer)
      )

      const result = await Effect.runPromise(program)

      expect(result.rows).toBe(119)
      expect(result.data).toHaveLength(119)
      expect(result.meta).toHaveLength(7)
      
      // Verify real data structure
      const firstRow = result.data[0]
      expect(firstRow).toHaveProperty('service_name')
      expect(firstRow).toHaveProperty('operation_name')
      expect(firstRow).toHaveProperty('minute')
      expect(firstRow).toHaveProperty('p50_ms')
      expect(firstRow).toHaveProperty('p95_ms')
      expect(firstRow).toHaveProperty('p99_ms')
      expect(firstRow).toHaveProperty('request_count')
    })

    it('should filter checkout data by service', () => {
      const frontendData = getCheckoutDataByService('frontend')
      const cartData = getCheckoutDataByService('cart')
      const checkoutData = getCheckoutDataByService('checkout')

      expect(frontendData.length).toBeGreaterThan(0)
      expect(cartData.length).toBeGreaterThan(0)
      expect(checkoutData.length).toBeGreaterThan(0)

      // Verify service filtering
      frontendData.forEach(row => {
        expect(row.service_name).toBe('frontend')
      })
    })

    it('should calculate service metrics from real data', () => {
      const frontendMetrics = calculateServiceMetrics('frontend')
      const cartMetrics = calculateServiceMetrics('cart')

      expect(frontendMetrics).not.toBeNull()
      expect(frontendMetrics?.service).toBe('frontend')
      expect(frontendMetrics?.avgP50).toBeGreaterThan(0)
      expect(frontendMetrics?.avgP95).toBeGreaterThan(frontendMetrics?.avgP50 ?? 0)
      expect(frontendMetrics?.avgP99).toBeGreaterThan(frontendMetrics?.avgP95 ?? 0)
      expect(frontendMetrics?.totalRequests).toBeGreaterThan(0)

      expect(cartMetrics).not.toBeNull()
      expect(cartMetrics?.service).toBe('cart')
    })

    it('should extract time range from checkout data', () => {
      const timeRange = getCheckoutTimeRange()

      expect(timeRange.start).toBeLessThan(timeRange.end)
      expect(timeRange.duration).toBeGreaterThan(0)

      // Data spans from 03:06 to 03:21 (15 minutes)
      const durationMinutes = timeRange.duration / (1000 * 60)
      expect(durationMinutes).toBeCloseTo(15, 0)
    })
  })

  describe('Visualization Generation', () => {
    it('should select optimal chart type based on data structure', async () => {
      const program = pipe(
        Effect.gen(function* () {
          const visualizer = yield* MockVisualizationService
          
          const chartType = yield* visualizer.selectOptimalChart(checkoutResultsData)
          return chartType
        }),
        Effect.provide(MockVisualizationLayer)
      )

      const result = await Effect.runPromise(program)

      // Should select line-percentiles because data has DateTime and p50/p95/p99
      expect(result).toBe('line-percentiles')
    })

    it('should generate ECharts component for checkout data', async () => {
      const program = pipe(
        Effect.gen(function* () {
          const visualizer = yield* MockVisualizationService
          
          const chart = yield* visualizer.generateChart(
            checkoutResultsData, 
            'line-percentiles'
          )
          return chart
        }),
        Effect.provide(MockVisualizationLayer)
      )

      const result = await Effect.runPromise(program)

      expect(result.component).toContain('ReactECharts')
      expect(result.component).toContain('Checkout Flow Performance')
      expect(result.component).toContain('p50')
      expect(result.component).toContain('p95')
      expect(result.component).toContain('p99')
      
      expect(result.config.dataPoints).toBe(119)
      expect(result.config.services).toContain('frontend')
      expect(result.config.services).toContain('cart')
      expect(result.config.services).toContain('checkout')
    })
  })

  describe('Full Pipeline Integration', () => {
    it('should execute complete pipeline from query to visualization', async () => {
      const program = pipe(
        Effect.gen(function* () {
          // Step 1: Generate query
          const queryGenerator = yield* MockQueryGeneratorService
          const queryResult = yield* queryGenerator.generateQuery({
            path: mockCriticalPaths.checkoutFlow
          })

          // Step 2: Execute query
          const clickhouse = yield* MockClickHouseService
          const queryData = yield* clickhouse.executeQuery(queryResult.sql)

          // Step 3: Generate visualization
          const visualizer = yield* MockVisualizationService
          const chartType = yield* visualizer.selectOptimalChart(queryData)
          const chart = yield* visualizer.generateChart(queryData, chartType)

          return {
            query: queryResult,
            data: queryData,
            visualization: chart
          }
        }),
        Effect.provide(MockFullPipelineLayer)
      )

      const result = await Effect.runPromise(program)

      // Verify complete pipeline
      expect(result.query.sql).toBeDefined()
      expect(result.query.analysisType).toBe('latency')
      
      expect(result.data.rows).toBe(119)
      expect(result.data.data).toHaveLength(119)
      
      expect(result.visualization.component).toContain('ReactECharts')
      expect(result.visualization.config.chartType).toBe('line-percentiles')
    })

    it('should handle high latency services correctly', () => {
      // Find operations with high p99 latency
      const highLatencyOps = checkoutResultsData.data.filter(
        row => row.p99_ms > 10
      )

      expect(highLatencyOps.length).toBeGreaterThan(0)

      // Verify frontend POST operations have highest latency
      const frontendPosts = highLatencyOps.filter(
        row => row.service_name === 'frontend' && row.operation_name === 'POST'
      )

      expect(frontendPosts.length).toBeGreaterThan(0)
      
      // These should trigger bottleneck analysis
      frontendPosts.forEach(op => {
        expect(op.p99_ms).toBeGreaterThan(30)
      })
    })

    it('should identify service bottlenecks from real data', () => {
      // Calculate average p99 by service
      const services = ['frontend', 'cart', 'checkout']
      const serviceBottlenecks = services.map(service => {
        const metrics = calculateServiceMetrics(service)
        return {
          service,
          avgP99: metrics?.avgP99 || 0
        }
      }).sort((a, b) => b.avgP99 - a.avgP99)

      // Frontend should have highest average p99 due to POST operations
      expect(serviceBottlenecks[0].service).toBe('frontend')
      expect(serviceBottlenecks[0].avgP99).toBeGreaterThan(5)

      // This data would trigger bottleneck analysis for frontend
    })

    it('should validate data quality for visualization', () => {
      // Check for data completeness
      const servicesInData = new Set(
        checkoutResultsData.data.map(row => row.service_name)
      )
      
      expect(servicesInData.has('frontend')).toBe(true)
      expect(servicesInData.has('cart')).toBe(true)
      expect(servicesInData.has('checkout')).toBe(true)

      // Check for required metrics
      checkoutResultsData.data.forEach(row => {
        expect(row.p50_ms).toBeDefined()
        expect(row.p95_ms).toBeDefined()
        expect(row.p99_ms).toBeDefined()
        expect(row.request_count).toBeDefined()
        
        // Verify p50 <= p95 <= p99
        expect(row.p50_ms).toBeLessThanOrEqual(row.p95_ms)
        expect(row.p95_ms).toBeLessThanOrEqual(row.p99_ms)
      })
    })
  })

  describe('Error Handling with Effect Layers', () => {
    it('should handle query generation failure gracefully', async () => {
      const program = pipe(
        Effect.gen(function* () {
          const queryGenerator = yield* MockQueryGeneratorService
          
          const result = yield* queryGenerator.generateQuery({
            path: mockCriticalPaths.checkoutFlow
          })

          return result
        }),
        Effect.provide(Layer.succeed(
          MockQueryGeneratorService,
          {
            generateQuery: () => Effect.fail(new Error('API timeout')),
            getAvailableModels: () => Effect.fail(new Error('Network error')),
            validateQuery: () => ({ valid: false, errors: ['Service unavailable'] })
          } satisfies QueryGeneratorService
        ))
      )

      await expect(Effect.runPromise(program)).rejects.toThrow('API timeout')
    })
  })
})