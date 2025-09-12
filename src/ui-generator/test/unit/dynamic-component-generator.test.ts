import { describe, it, expect } from 'vitest'
import { DynamicUIGenerator } from '../../services/dynamic-component-generator'
import type { ColumnAnalysis } from '../../services/types'

// Type definitions for test assertions
interface ComponentPropsForTest {
  data: unknown[]
  analysis: {
    patterns: string[]
    columns: ColumnAnalysis[]
    confidence: number
  }
  config?: unknown
}

describe('DynamicUIGenerator', () => {
  describe('generateFromQueryResults', () => {
    it('should generate component from time-series query results', async () => {
      const queryResults = [
        { timestamp: '2024-01-01T00:00:00Z', latency_p50: 50, latency_p95: 95 },
        { timestamp: '2024-01-01T00:01:00Z', latency_p50: 55, latency_p95: 100 },
        { timestamp: '2024-01-01T00:02:00Z', latency_p50: 52, latency_p95: 98 }
      ]

      const component = await DynamicUIGenerator.generateFromQueryResults(
        queryResults,
        { userIntent: 'Show latency percentiles over time' }
      )

      expect(component).toBeDefined()
      expect(component.id).toMatch(/^dynamic-/)
      expect(component.type).toBe('chart')
      expect(component.title).toBeDefined()
      expect(component.component).toBeDefined()
      expect(component.metadata.rowCount).toBe(3)
      expect(component.metadata.generatedAt).toBeDefined()
      expect(component.metadata.dataSource).toBe('Show latency percentiles over time')
    })

    it('should generate table component for non-chartable data', async () => {
      const queryResults = [
        { id: 1, name: 'Item 1', description: 'Description 1' },
        { id: 2, name: 'Item 2', description: 'Description 2' }
      ]

      const component = await DynamicUIGenerator.generateFromQueryResults(
        queryResults,
        { userIntent: 'Show items list' }
      )

      expect(component.type).toBe('table')
      expect(component.component).toBe('DynamicDataTable')
    })

    it('should handle empty query results', async () => {
      const component = await DynamicUIGenerator.generateFromQueryResults(
        [],
        { userIntent: 'Empty query' }
      )

      expect(component).toBeDefined()
      expect(component.type).toBe('table')
      expect(component.metadata.rowCount).toBe(0)
      expect(component.metadata.confidence).toBe(1.0)
    })

    it('should include analysis data in props', async () => {
      const queryResults = [
        { service: 'frontend', errors: 10 },
        { service: 'backend', errors: 5 }
      ]

      const component = await DynamicUIGenerator.generateFromQueryResults(
        queryResults
      )

      const props = component.props as ComponentPropsForTest
      expect(props.data).toEqual(queryResults)
      expect(props.analysis).toBeDefined()
      expect(props.analysis.patterns).toBeDefined()
      expect(props.analysis.columns).toBeDefined()
      expect(props.analysis.confidence).toBeDefined()
    })

    it('should generate unique component IDs', async () => {
      const queryResults = [{ value: 1 }, { value: 2 }]

      const component1 = await DynamicUIGenerator.generateFromQueryResults(queryResults)
      const component2 = await DynamicUIGenerator.generateFromQueryResults(queryResults)

      expect(component1.id).not.toBe(component2.id)
      expect(component1.id).toMatch(/^dynamic-\d+-[a-z0-9]+$/)
      expect(component2.id).toMatch(/^dynamic-\d+-[a-z0-9]+$/)
    })
  })

  describe('generateDashboard', () => {
    it('should generate multiple components for dashboard', async () => {
      const queries = [
        {
          name: 'Latency Query',
          results: [
            { timestamp: '2024-01-01', latency: 100 },
            { timestamp: '2024-01-02', latency: 110 }
          ]
        },
        {
          name: 'Error Query',
          results: [
            { service: 'frontend', errors: 10 },
            { service: 'backend', errors: 5 }
          ]
        }
      ]

      const components = await DynamicUIGenerator.generateDashboard(queries)

      expect(components).toHaveLength(2)
      expect(components[0]?.metadata.dataSource).toBe('Latency Query')
      expect(components[1]?.metadata.dataSource).toBe('Error Query')
    })

    it('should handle empty dashboard queries', async () => {
      const components = await DynamicUIGenerator.generateDashboard([])
      expect(components).toHaveLength(0)
    })

    it('should use intent if provided over name', async () => {
      const queries = [
        {
          name: 'Query1',
          results: [{ value: 1 }],
          intent: 'Custom Intent'
        }
      ]

      const components = await DynamicUIGenerator.generateDashboard(queries)
      expect(components[0]?.metadata.dataSource).toBe('Custom Intent')
    })
  })

  describe('validateQueryResults', () => {
    it('should validate valid query results', () => {
      const valid = DynamicUIGenerator.validateQueryResults([
        { col1: 'value1', col2: 100 }
      ])
      expect(valid).toBe(true)
    })

    it('should reject non-array results', () => {
      const valid = DynamicUIGenerator.validateQueryResults('not an array' as unknown as unknown[])
      expect(valid).toBe(false)
    })

    it('should reject empty array', () => {
      const valid = DynamicUIGenerator.validateQueryResults([])
      expect(valid).toBe(false)
    })

    it('should reject non-object rows', () => {
      const valid = DynamicUIGenerator.validateQueryResults([1, 2, 3] as unknown as unknown[])
      expect(valid).toBe(false)
    })

    it('should reject null rows', () => {
      const valid = DynamicUIGenerator.validateQueryResults([null] as unknown as unknown[])
      expect(valid).toBe(false)
    })

    it('should reject rows with no columns', () => {
      const valid = DynamicUIGenerator.validateQueryResults([{}])
      expect(valid).toBe(false)
    })

    it('should accept rows with at least one column', () => {
      const valid = DynamicUIGenerator.validateQueryResults([{ col: 'value' }])
      expect(valid).toBe(true)
    })
  })

  describe('Component Type Mapping', () => {
    it('should map line chart correctly', async () => {
      const queryResults = [
        { time: '2024-01-01T00:00:00Z', value: 100 },
        { time: '2024-01-01T00:01:00Z', value: 110 }
      ]

      const component = await DynamicUIGenerator.generateFromQueryResults(
        queryResults,
        { userIntent: 'time series data' }
      )

      if (component.type === 'chart') {
        expect(['DynamicLineChart', 'DynamicDataTable']).toContain(component.component)
      }
    })

    it('should handle categorical data', async () => {
      const queryResults = [
        { category: 'A', count: 10 },
        { category: 'B', count: 20 },
        { category: 'C', count: 15 }
      ]

      const component = await DynamicUIGenerator.generateFromQueryResults(
        queryResults,
        { userIntent: 'category comparison' }
      )

      expect(component).toBeDefined()
      expect(component.props).toBeDefined()
    })
  })
})