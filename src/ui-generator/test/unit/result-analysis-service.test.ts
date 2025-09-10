import { describe, it, expect } from 'vitest'
import { Effect } from 'effect'
import { ResultAnalysisService } from '../../services/result-analysis-service'

describe('ResultAnalysisService', () => {
  describe('analyzeResults', () => {
    it('should detect time-series pattern with temporal and metric columns', async () => {
      const results = [
        { timestamp: '2024-01-01T00:00:00Z', latency: 100, requests: 50 },
        { timestamp: '2024-01-01T00:01:00Z', latency: 110, requests: 55 },
        { timestamp: '2024-01-01T00:02:00Z', latency: 95, requests: 45 }
      ]

      const analysis = await Effect.runPromise(
        ResultAnalysisService.analyzeResults(results)
      )

      expect(analysis.rowCount).toBe(3)
      expect(analysis.columnCount).toBe(3)
      expect(analysis.detectedPatterns).toContain('time-series')
      expect(analysis.recommendedChartType).toBe('line-chart')
      expect(analysis.confidence).toBeGreaterThan(0.5)
      
      const timestampCol = analysis.columns.find(c => c.name === 'timestamp')
      expect(timestampCol?.isTemporal).toBe(true)
      expect(timestampCol?.type).toBe('datetime')
      
      const latencyCol = analysis.columns.find(c => c.name === 'latency')
      expect(latencyCol?.isMetric).toBe(true)
      expect(latencyCol?.type).toBe('number')
    })

    it('should detect categorical pattern with string columns and metrics', async () => {
      const results = [
        { service: 'frontend', error_count: 10, latency_ms: 100 },
        { service: 'backend', error_count: 5, latency_ms: 50 },
        { service: 'database', error_count: 2, latency_ms: 20 }
      ]

      const analysis = await Effect.runPromise(
        ResultAnalysisService.analyzeResults(results)
      )

      // Should detect either categorical or metrics pattern
      expect(
        analysis.detectedPatterns.includes('categorical') || 
        analysis.detectedPatterns.includes('metrics')
      ).toBe(true)
      // Should recommend bar-chart, heatmap, or table based on pattern
      expect(['bar-chart', 'heatmap', 'table']).toContain(analysis.recommendedChartType)
      
      const serviceCol = analysis.columns.find(c => c.name === 'service')
      expect(serviceCol?.type).toBe('string')
      expect(serviceCol?.cardinality).toBe(3)
    })

    it('should detect metrics pattern with multiple numeric columns', async () => {
      const results = [
        { cpu_percent: 45, memory_percent: 60, disk_percent: 30 },
        { cpu_percent: 50, memory_percent: 65, disk_percent: 35 },
        { cpu_percent: 48, memory_percent: 62, disk_percent: 32 }
      ]

      const analysis = await Effect.runPromise(
        ResultAnalysisService.analyzeResults(results)
      )

      expect(analysis.detectedPatterns).toContain('metrics')
      const metricColumns = analysis.columns.filter(c => c.isMetric)
      expect(metricColumns.length).toBeGreaterThanOrEqual(2)
    })

    it('should identify semantic types for common metric names', async () => {
      const results = [
        { 
          service_name: 'api',
          latency_ms: 100,
          error_rate: 0.05,
          request_count: 1000
        }
      ]

      const analysis = await Effect.runPromise(
        ResultAnalysisService.analyzeResults(results)
      )

      const serviceCol = analysis.columns.find(c => c.name === 'service_name')
      expect(serviceCol?.semanticType).toBe('service_name')

      const latencyCol = analysis.columns.find(c => c.name === 'latency_ms')
      expect(latencyCol?.semanticType).toBe('latency_ms')

      const errorCol = analysis.columns.find(c => c.name === 'error_rate')
      expect(errorCol?.semanticType).toBe('error_rate')

      const countCol = analysis.columns.find(c => c.name === 'request_count')
      expect(countCol?.semanticType).toBe('request_count')
    })

    it('should handle empty results', async () => {
      const analysis = await Effect.runPromise(
        ResultAnalysisService.analyzeResults([])
      )

      expect(analysis.rowCount).toBe(0)
      expect(analysis.columnCount).toBe(0)
      expect(analysis.columns).toEqual([])
      expect(analysis.detectedPatterns).toEqual([])
      expect(analysis.recommendedChartType).toBe('table')
      expect(analysis.reasoning).toContain('No data')
    })

    it('should detect datetime patterns in string format', async () => {
      const results = [
        { date: '2024-01-01', value: 100 },
        { date: '2024-01-02', value: 110 },
        { date: '2024-01-03', value: 105 }
      ]

      const analysis = await Effect.runPromise(
        ResultAnalysisService.analyzeResults(results)
      )

      const dateCol = analysis.columns.find(c => c.name === 'date')
      expect(dateCol?.type).toBe('datetime')
      expect(dateCol?.isTemporal).toBe(true)
    })

    it('should detect boolean type', async () => {
      const results = [
        { active: true, count: 10 },
        { active: false, count: 5 },
        { active: true, count: 8 }
      ]

      const analysis = await Effect.runPromise(
        ResultAnalysisService.analyzeResults(results)
      )

      const activeCol = analysis.columns.find(c => c.name === 'active')
      expect(activeCol?.type).toBe('boolean')
    })

    it('should detect JSON type for objects', async () => {
      const results = [
        { config: { timeout: 5000, retries: 3 }, status: 'ok' },
        { config: { timeout: 3000, retries: 2 }, status: 'error' }
      ]

      const analysis = await Effect.runPromise(
        ResultAnalysisService.analyzeResults(results)
      )

      const configCol = analysis.columns.find(c => c.name === 'config')
      expect(configCol?.type).toBe('json')
    })

    it('should calculate correct cardinality', async () => {
      const results = [
        { category: 'A', value: 1 },
        { category: 'B', value: 2 },
        { category: 'A', value: 3 },
        { category: 'C', value: 4 },
        { category: 'B', value: 5 }
      ]

      const analysis = await Effect.runPromise(
        ResultAnalysisService.analyzeResults(results)
      )

      const categoryCol = analysis.columns.find(c => c.name === 'category')
      expect(categoryCol?.cardinality).toBe(3) // A, B, C

      const valueCol = analysis.columns.find(c => c.name === 'value')
      expect(valueCol?.cardinality).toBe(5) // 1, 2, 3, 4, 5
    })

    it('should provide sample values', async () => {
      const results = [
        { status: 'success' },
        { status: 'error' },
        { status: 'success' },
        { status: 'pending' },
        { status: 'error' },
        { status: 'timeout' }
      ]

      const analysis = await Effect.runPromise(
        ResultAnalysisService.analyzeResults(results)
      )

      const statusCol = analysis.columns.find(c => c.name === 'status')
      expect(statusCol?.sampleValues).toBeDefined()
      expect(statusCol?.sampleValues.length).toBeLessThanOrEqual(5)
      expect(statusCol?.sampleValues).toContain('success')
    })

    it('should recommend heatmap for multiple metrics without time', async () => {
      const results = [
        { request_count: 10, error_count: 20, latency_avg: 30, cpu_percent: 40 },
        { request_count: 15, error_count: 25, latency_avg: 35, cpu_percent: 45 }
      ]

      const analysis = await Effect.runPromise(
        ResultAnalysisService.analyzeResults(results)
      )

      const metricColumns = analysis.columns.filter(c => c.isMetric)
      expect(metricColumns.length).toBeGreaterThanOrEqual(3)
      expect(analysis.recommendedChartType).toBe('heatmap')
      expect(analysis.reasoning.toLowerCase()).toContain('metric')
    })

    it('should handle null values in columns', async () => {
      const results = [
        { name: 'test', value: 100 },
        { name: null, value: 200 },
        { name: 'test2', value: null }
      ]

      const analysis = await Effect.runPromise(
        ResultAnalysisService.analyzeResults(results)
      )

      expect(analysis.rowCount).toBe(3)
      expect(analysis.columns.length).toBe(2)
    })
  })
})