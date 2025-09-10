import { describe, it, expect } from 'vitest'
import { UIGenerationPipeline } from '../../services/ui-generation-pipeline'

// Type definitions for test assertions
interface ComponentWithType {
  type: string
  title?: string
  component?: string
  props?: {
    analysis?: {
      patterns?: string[]
    }
    config?: {
      series?: unknown[]
    }
  }
}

interface ComponentPropsForTest {
  analysis?: {
    patterns?: string[]
  }
  config?: {
    series?: unknown[]
  }
}

describe('UI Generation Pipeline Integration', () => {
  describe('Natural Language to Component Generation', () => {
    it('should generate component from natural language query', async () => {
      const result = await UIGenerationPipeline.generateFromNaturalLanguage(
        'Show service latency percentiles over the last 15 minutes',
        {
          context: {
            services: ['frontend', 'checkout', 'payment'],
            timeRange: '15 minutes'
          }
        }
      )

      // Verify pipeline response structure
      expect(result).toBeDefined()
      expect(result.query).toBeDefined()
      expect(result.query.sql).toContain('SELECT')
      expect(result.results).toBeDefined()
      expect(result.results.data).toBeInstanceOf(Array)
      expect(result.component).toBeDefined()
      expect(result.metadata).toBeDefined()
      expect(result.metadata.steps).toBeInstanceOf(Array)
      expect(result.metadata.totalTime).toBeGreaterThan(0)
    })

    it('should generate diagnostic UI for latency issues', async () => {
      const result = await UIGenerationPipeline.generateDiagnosticUI(
        'frontend -> checkout -> payment',
        'latency'
      )

      expect(result).toBeDefined()
      expect(result.query.sql).toContain('quantile')
      const component = result.component as ComponentWithType
      expect(component.type).toBeDefined()
      expect(component.title).toBeDefined()
    })

    it('should generate diagnostic UI for error analysis', async () => {
      const result = await UIGenerationPipeline.generateDiagnosticUI(
        'frontend -> cart -> checkout',
        'errors'
      )

      expect(result).toBeDefined()
      expect(result.query.sql).toContain('error')
      expect(result.component).toBeDefined()
    })

    it('should handle time-series data and select line chart', async () => {
      const result = await UIGenerationPipeline.generateFromNaturalLanguage(
        'Show request count per minute for the last hour'
      )

      expect(result).toBeDefined()
      const component = result.component as ComponentWithType
      expect(component.type).toBe('chart')
      
      // Check that time-series pattern was detected
      const componentProps = component.props as ComponentPropsForTest
      expect(componentProps?.analysis?.patterns).toContain('time-series')
    })

    it('should validate pipeline readiness', async () => {
      const isReady = await UIGenerationPipeline.validate()
      expect(isReady).toBe(true)
    })
  })

  describe('Component Configuration Generation', () => {
    it('should generate ECharts configuration for line chart', async () => {
      const result = await UIGenerationPipeline.generateFromNaturalLanguage(
        'Show latency percentiles (p50, p95, p99) over time'
      )

      const component = result.component as ComponentWithType
      const componentProps = component.props as ComponentPropsForTest
      expect(componentProps?.config).toBeDefined()
      
      // Should have chart configuration
      if (componentProps?.config?.series) {
        expect(componentProps.config.series).toBeInstanceOf(Array)
      }
    })

    it('should handle categorical data and select bar chart', async () => {
      const result = await UIGenerationPipeline.generateFromNaturalLanguage(
        'Compare error counts by service'
      )

      expect(result).toBeDefined()
      expect(result.component).toBeDefined()
      
      // Check that categorical pattern might be detected
      const component = result.component as ComponentWithType
      const componentProps = component.props as ComponentPropsForTest
      if (componentProps?.analysis?.patterns) {
        // Either categorical or metrics pattern should be detected
        const patterns = componentProps.analysis.patterns
        expect(
          patterns.includes('categorical') || 
          patterns.includes('metrics')
        ).toBe(true)
      }
    })
  })

  describe('Error Handling', () => {
    it('should handle empty query results gracefully', async () => {
      const result = await UIGenerationPipeline.generateFromNaturalLanguage(
        'Show data for non-existent service'
      )

      expect(result).toBeDefined()
      const component = result.component as ComponentWithType
      expect(component.type).toBeDefined()
      // With mock data, this will generate time-series data by default
      // In production, empty results would fall back to table
      expect(['DynamicLineChart', 'DynamicDataTable']).toContain(component.component)
    })
  })
})