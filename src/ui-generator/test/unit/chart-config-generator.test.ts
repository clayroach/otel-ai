import { describe, it, expect } from 'vitest'
import { Effect } from 'effect'
import { 
  ChartConfigGeneratorServiceTag,
  ChartConfigGeneratorServiceLive
} from '../../services/chart-config-generator'
import type { ChartAnalysisInput } from '../../services/types'

// Type for testing with invalid chart types
interface TestChartAnalysisInput extends Omit<ChartAnalysisInput, 'recommendedChartType'> {
  recommendedChartType: ChartAnalysisInput['recommendedChartType'] | 'unknown-chart'
}

describe('ChartConfigGenerator', () => {
  describe('generateConfig', () => {
    it('should generate line chart config for time-series data', async () => {
      const analysis: ChartAnalysisInput = {
        recommendedChartType: 'line-chart',
        columns: [
          {
            name: 'timestamp',
            type: 'datetime',
            isMetric: false,
            isTemporal: true,
            cardinality: 10,
            sampleValues: []
          },
          {
            name: 'latency_p50',
            type: 'number',
            isMetric: true,
            isTemporal: false,
            cardinality: 10,
            sampleValues: [],
            semanticType: 'latency_ms'
          },
          {
            name: 'latency_p95',
            type: 'number',
            isMetric: true,
            isTemporal: false,
            cardinality: 10,
            sampleValues: [],
            semanticType: 'latency_ms'
          }
        ],
        rowCount: 10,
        columnCount: 3,
        detectedPatterns: ['time-series'],
        confidence: 0.9,
        reasoning: 'Time-series data with metrics'
      }

      const data = Array.from({ length: 10 }, (_, i) => ({
        timestamp: new Date(Date.now() - (10 - i) * 60000).toISOString(),
        latency_p50: 50 + Math.random() * 20,
        latency_p95: 100 + Math.random() * 50
      }))

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* ChartConfigGeneratorServiceTag
          return yield* service.generateConfig(analysis, data)
        }).pipe(Effect.provide(ChartConfigGeneratorServiceLive))
      )

      expect(result.type).toBe('line')
      expect(result.title).toBe('Time Series Visualization')
      expect(result.config).toBeDefined()
      expect(result.dataRequirements.requiredColumns).toContain('timestamp')
      expect(result.dataRequirements.requiredColumns).toContain('latency_p50')
    })

    it('should generate bar chart config for categorical data', async () => {
      const analysis: ChartAnalysisInput = {
        recommendedChartType: 'bar-chart',
        columns: [
          {
            name: 'service_name',
            type: 'string',
            isMetric: false,
            isTemporal: false,
            cardinality: 3,
            sampleValues: ['frontend', 'backend', 'database']
          },
          {
            name: 'request_count',
            type: 'number',
            isMetric: true,
            isTemporal: false,
            cardinality: 3,
            sampleValues: [100, 200, 150]
          }
        ],
        rowCount: 3,
        columnCount: 2,
        detectedPatterns: ['categorical'],
        confidence: 0.8,
        reasoning: 'Categorical data with metrics'
      }

      const data = [
        { service_name: 'frontend', request_count: 100 },
        { service_name: 'backend', request_count: 200 },
        { service_name: 'database', request_count: 150 }
      ]

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* ChartConfigGeneratorServiceTag
          return yield* service.generateConfig(analysis, data)
        }).pipe(Effect.provide(ChartConfigGeneratorServiceLive))
      )

      expect(result.type).toBe('bar')
      expect(result.title).toBe('Category Analysis')
      expect(result.config).toBeDefined()
      expect(result.dataRequirements.requiredColumns).toContain('service_name')
      expect(result.dataRequirements.requiredColumns).toContain('request_count')
    })

    it('should generate heatmap config for multiple metrics', async () => {
      const analysis: ChartAnalysisInput = {
        recommendedChartType: 'heatmap',
        columns: [
          {
            name: 'metric1',
            type: 'number',
            isMetric: true,
            isTemporal: false,
            cardinality: 10,
            sampleValues: []
          },
          {
            name: 'metric2',
            type: 'number',
            isMetric: true,
            isTemporal: false,
            cardinality: 10,
            sampleValues: []
          },
          {
            name: 'metric3',
            type: 'number',
            isMetric: true,
            isTemporal: false,
            cardinality: 10,
            sampleValues: []
          }
        ],
        rowCount: 10,
        columnCount: 3,
        detectedPatterns: ['metrics', 'correlation'],
        confidence: 0.7,
        reasoning: 'Multiple metrics for correlation analysis'
      }

      const data = Array.from({ length: 10 }, () => ({
        metric1: Math.random() * 100,
        metric2: Math.random() * 100,
        metric3: Math.random() * 100
      }))

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* ChartConfigGeneratorServiceTag
          return yield* service.generateConfig(analysis, data)
        }).pipe(Effect.provide(ChartConfigGeneratorServiceLive))
      )

      expect(result.type).toBe('heatmap')
      expect(result.title).toBe('Correlation Analysis')
      expect(result.config).toBeDefined()
    })

    it('should generate pie chart config for proportional data', async () => {
      const analysis: ChartAnalysisInput = {
        recommendedChartType: 'pie-chart',
        columns: [
          {
            name: 'category',
            type: 'string',
            isMetric: false,
            isTemporal: false,
            cardinality: 4,
            sampleValues: ['A', 'B', 'C', 'D']
          },
          {
            name: 'value',
            type: 'number',
            isMetric: true,
            isTemporal: false,
            cardinality: 4,
            sampleValues: [30, 25, 20, 25]
          }
        ],
        rowCount: 4,
        columnCount: 2,
        detectedPatterns: ['categorical'],
        confidence: 0.85,
        reasoning: 'Proportional data suitable for pie chart'
      }

      const data = [
        { category: 'A', value: 30 },
        { category: 'B', value: 25 },
        { category: 'C', value: 20 },
        { category: 'D', value: 25 }
      ]

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* ChartConfigGeneratorServiceTag
          return yield* service.generateConfig(analysis, data)
        }).pipe(Effect.provide(ChartConfigGeneratorServiceLive))
      )

      expect(result.type).toBe('pie')
      expect(result.title).toBe('Distribution Visualization')
      expect(result.config).toBeDefined()
    })

    it('should generate scatter plot config for correlation analysis', async () => {
      const analysis: ChartAnalysisInput = {
        recommendedChartType: 'scatter-plot',
        columns: [
          {
            name: 'x_value',
            type: 'number',
            isMetric: true,
            isTemporal: false,
            cardinality: 20,
            sampleValues: []
          },
          {
            name: 'y_value',
            type: 'number',
            isMetric: true,
            isTemporal: false,
            cardinality: 20,
            sampleValues: []
          }
        ],
        rowCount: 20,
        columnCount: 2,
        detectedPatterns: ['correlation'],
        confidence: 0.75,
        reasoning: 'Two metrics for correlation visualization'
      }

      const data = Array.from({ length: 20 }, () => ({
        x_value: Math.random() * 100,
        y_value: Math.random() * 100
      }))

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* ChartConfigGeneratorServiceTag
          return yield* service.generateConfig(analysis, data)
        }).pipe(Effect.provide(ChartConfigGeneratorServiceLive))
      )

      expect(result.type).toBe('scatter')
      expect(result.title).toBe('Scatter Plot Analysis')
      expect(result.config).toBeDefined()
    })

    it('should fallback to table config for unknown chart types', async () => {
      const analysis: TestChartAnalysisInput = {
        recommendedChartType: 'unknown-chart',
        columns: [
          {
            name: 'col1',
            type: 'string',
            isMetric: false,
            isTemporal: false,
            cardinality: 5,
            sampleValues: []
          }
        ],
        rowCount: 5,
        columnCount: 1,
        detectedPatterns: [],
        confidence: 0.5,
        reasoning: 'No clear pattern'
      }

      const data = [
        { col1: 'value1' },
        { col1: 'value2' }
      ]

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* ChartConfigGeneratorServiceTag
          return yield* service.generateConfig(analysis as ChartAnalysisInput, data)
        }).pipe(Effect.provide(ChartConfigGeneratorServiceLive))
      )

      expect(result.type).toBe('table')
      expect(result.title).toBe('Data Table')
    })

    it('should handle empty data gracefully', async () => {
      const analysis: ChartAnalysisInput = {
        recommendedChartType: 'line-chart',
        columns: [],
        rowCount: 0,
        columnCount: 0,
        detectedPatterns: [],
        confidence: 1.0,
        reasoning: 'No data'
      }

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* ChartConfigGeneratorServiceTag
          return yield* service.generateConfig(analysis, [])
        }).pipe(Effect.provide(ChartConfigGeneratorServiceLive))
      )

      expect(result.type).toBe('table')
      expect(result.title).toBe('Data Table')
    })

    it('should handle missing temporal column for line chart', async () => {
      const analysis: ChartAnalysisInput = {
        recommendedChartType: 'line-chart',
        columns: [
          {
            name: 'metric1',
            type: 'number',
            isMetric: true,
            isTemporal: false,
            cardinality: 10,
            sampleValues: []
          }
        ],
        rowCount: 10,
        columnCount: 1,
        detectedPatterns: [],
        confidence: 0.5,
        reasoning: 'No temporal column'
      }

      const data = Array.from({ length: 10 }, () => ({
        metric1: Math.random() * 100
      }))

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* ChartConfigGeneratorServiceTag
          return yield* service.generateConfig(analysis, data)
        }).pipe(Effect.provide(ChartConfigGeneratorServiceLive))
      )

      // Should fallback to table when line chart requirements aren't met
      expect(result.type).toBe('table')
    })
  })
})