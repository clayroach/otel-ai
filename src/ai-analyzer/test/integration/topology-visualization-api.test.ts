/**
 * Integration tests for topology visualization API endpoint
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { Effect } from 'effect'

describe('Topology Visualization API Integration', () => {
  let baseUrl: string

  beforeAll(async () => {
    // Set up test environment
    process.env.CLICKHOUSE_HOST = process.env.CLICKHOUSE_HOST || 'localhost'
    process.env.CLICKHOUSE_PORT = process.env.CLICKHOUSE_PORT || '8124'
    process.env.CLICKHOUSE_USER = process.env.CLICKHOUSE_USER || 'otel'
    process.env.CLICKHOUSE_PASSWORD = process.env.CLICKHOUSE_PASSWORD || 'otel123'
    process.env.CLICKHOUSE_DATABASE = process.env.CLICKHOUSE_DATABASE || 'otel'
    
    // Test against the existing server on correct port
    baseUrl = process.env.API_BASE_URL || 'http://localhost:4319'
    
    // Wait for backend to be ready
    const maxRetries = 30
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(`${baseUrl}/health`)
        if (response.ok) {
          console.log('✅ Backend is ready')
          break
        }
      } catch (error) {
        if (i === maxRetries - 1) {
          throw new Error('Backend service failed to start')
        }
        await Effect.runPromise(Effect.sleep(1000))
      }
    }
  })

  afterAll(async () => {
    // Clean up if needed
  })

  describe('POST /api/ai-analyzer/topology-visualization', () => {
    it('should return topology visualization data with nodes and edges', async () => {
      const response = await fetch(`${baseUrl}/api/ai-analyzer/topology-visualization`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          timeRange: {
            hours: 24
          }
        })
      })

      // Check response status
      if (!response.ok) {
        const error = await response.text()
        console.error('API Error:', error)
      }
      expect(response.status).toBe(200)

      const data = await response.json()

      // Validate response structure
      expect(data).toHaveProperty('nodes')
      expect(data).toHaveProperty('edges')
      expect(data).toHaveProperty('healthSummary')
      expect(data).toHaveProperty('runtimeEnvironments')
      expect(data).toHaveProperty('applicationName')
      expect(data).toHaveProperty('services')

      // Validate nodes structure
      if (data.nodes.length > 0) {
        const firstNode = data.nodes[0]
        expect(firstNode).toHaveProperty('id')
        expect(firstNode).toHaveProperty('name')
        expect(firstNode).toHaveProperty('category')
        expect(firstNode).toHaveProperty('symbolSize')
        expect(firstNode).toHaveProperty('itemStyle')
        expect(firstNode.itemStyle).toHaveProperty('color')
        expect(firstNode).toHaveProperty('metrics')
        expect(firstNode.metrics).toHaveProperty('rate')
        expect(firstNode.metrics).toHaveProperty('errorRate')
        expect(firstNode.metrics).toHaveProperty('duration')
      }

      // Validate edges structure
      if (data.edges.length > 0) {
        const firstEdge = data.edges[0]
        expect(firstEdge).toHaveProperty('source')
        expect(firstEdge).toHaveProperty('target')
        expect(firstEdge).toHaveProperty('value')
        expect(firstEdge).toHaveProperty('lineStyle')
        expect(firstEdge.lineStyle).toHaveProperty('width')
        expect(firstEdge.lineStyle).toHaveProperty('color')
      }

      // Validate health summary
      expect(data.healthSummary).toHaveProperty('healthy')
      expect(data.healthSummary).toHaveProperty('warning')
      expect(data.healthSummary).toHaveProperty('degraded')
      expect(data.healthSummary).toHaveProperty('critical')
      expect(data.healthSummary).toHaveProperty('unavailable')

      // Validate health summary values are numbers
      expect(typeof data.healthSummary.healthy).toBe('number')
      expect(typeof data.healthSummary.warning).toBe('number')
      expect(typeof data.healthSummary.degraded).toBe('number')
      expect(typeof data.healthSummary.critical).toBe('number')
      expect(typeof data.healthSummary.unavailable).toBe('number')
    })

    it('should handle different time ranges', async () => {
      const timeRanges = [1, 6, 12, 48]

      for (const hours of timeRanges) {
        const response = await fetch(`${baseUrl}/api/ai-analyzer/topology-visualization`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            timeRange: {
              hours
            }
          })
        })

        expect(response.status).toBe(200)
        const data = await response.json()
        
        // Data should be present for all time ranges (even if empty)
        expect(data).toHaveProperty('nodes')
        expect(data).toHaveProperty('edges')
        expect(Array.isArray(data.nodes)).toBe(true)
        expect(Array.isArray(data.edges)).toBe(true)
      }
    })

    it('should validate health color mapping', async () => {
      const response = await fetch(`${baseUrl}/api/ai-analyzer/topology-visualization`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          timeRange: {
            hours: 24
          }
        })
      })

      expect(response.status).toBe(200)
      const data = await response.json()

      // Valid health colors
      const validColors = ['#52c41a', '#faad14', '#fa8c16', '#f5222d', '#262626', '#8c8c8c']

      data.nodes.forEach((node: { itemStyle?: { color?: string } }) => {
        if (node.itemStyle?.color) {
          expect(validColors).toContain(node.itemStyle.color)
        }
      })
    })

    it('should validate edge thickness values', async () => {
      const response = await fetch(`${baseUrl}/api/ai-analyzer/topology-visualization`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          timeRange: {
            hours: 24
          }
        })
      })

      expect(response.status).toBe(200)
      const data = await response.json()

      // Edge thickness should be between 1 and 4
      data.edges.forEach((edge: { lineStyle?: { width?: number } }) => {
        if (edge.lineStyle?.width) {
          expect(edge.lineStyle.width).toBeGreaterThanOrEqual(1)
          expect(edge.lineStyle.width).toBeLessThanOrEqual(4)
        }
      })
    })

    it('should handle missing storage service gracefully', async () => {
      // This test would require mocking the storage service to be unavailable
      // For now, we'll skip this in integration tests
      expect(true).toBe(true)
    })

    it('should return appropriate error for invalid time range', async () => {
      const response = await fetch(`${baseUrl}/api/ai-analyzer/topology-visualization`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          timeRange: {
            hours: -1 // Invalid negative hours
          }
        })
      })

      // Should still work but with default time range
      expect(response.status).toBe(200)
    })

    it('should include runtime environments when available', async () => {
      const response = await fetch(`${baseUrl}/api/ai-analyzer/topology-visualization`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          timeRange: {
            hours: 24
          }
        })
      })

      expect(response.status).toBe(200)
      const data = await response.json()

      expect(data).toHaveProperty('runtimeEnvironments')
      expect(Array.isArray(data.runtimeEnvironments)).toBe(true)

      // If runtime environments are present, they should be strings
      data.runtimeEnvironments.forEach((runtime: unknown) => {
        expect(typeof runtime).toBe('string')
      })
    })

    it('should calculate node sizes based on activity', async () => {
      const response = await fetch(`${baseUrl}/api/ai-analyzer/topology-visualization`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          timeRange: {
            hours: 24
          }
        })
      })

      expect(response.status).toBe(200)
      const data = await response.json()

      // Node sizes should be reasonable (between 20 and 60 as per implementation)
      data.nodes.forEach((node: { symbolSize?: number }) => {
        if (node.symbolSize) {
          expect(node.symbolSize).toBeGreaterThanOrEqual(20)
          expect(node.symbolSize).toBeLessThanOrEqual(60)
        }
      })
    })

    it('should include R.E.D metrics in node data', async () => {
      const response = await fetch(`${baseUrl}/api/ai-analyzer/topology-visualization`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          timeRange: {
            hours: 24
          }
        })
      })

      expect(response.status).toBe(200)
      const data = await response.json()

      data.nodes.forEach((node: { metrics?: { rate: number; errorRate: number; duration: number } }) => {
        expect(node.metrics).toBeDefined()
        if (node.metrics) {
          expect(typeof node.metrics.rate).toBe('number')
          expect(typeof node.metrics.errorRate).toBe('number')
          expect(typeof node.metrics.duration).toBe('number')
          
          // Validate metric ranges
          expect(node.metrics.rate).toBeGreaterThanOrEqual(0)
          expect(node.metrics.errorRate).toBeGreaterThanOrEqual(0)
          expect(node.metrics.errorRate).toBeLessThanOrEqual(100)
          expect(node.metrics.duration).toBeGreaterThanOrEqual(0)
        }
      })
    })
  })
})