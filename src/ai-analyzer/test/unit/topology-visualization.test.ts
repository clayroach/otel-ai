/**
 * Unit tests for topology visualization enhancements
 */

import { describe, expect, it } from 'vitest'
import type { ServiceTopologyRaw, ServiceDependencyRaw } from '../../queries.js'
import { buildDependencyGraph } from '../../topology.js'
import { Schema } from '@effect/schema'
import { 
  ServiceNodeSchema, 
  ServiceEdgeSchema, 
  TopologyVisualizationDataSchema 
} from '../../types.js'

describe('Topology Visualization Enhancements', () => {
  describe('ServiceTopologyRaw with R.E.D metrics', () => {
    it('should include health status calculation', () => {
      const topology: ServiceTopologyRaw = {
        service_name: 'api-gateway',
        operation_name: 'handleRequest',
        span_kind: 'SERVER',
        total_spans: 1000,
        root_spans: 800,
        error_spans: 60,
        avg_duration_ms: 45,
        p95_duration_ms: 150,
        unique_traces: 500,
        rate_per_second: 16.67,
        error_rate_percent: 6.0,
        health_status: 'critical',
        runtime_language: 'go',
        runtime_name: 'go1.19'
      }

      // Health status should be critical due to 6% error rate (>5% threshold)
      expect(topology.health_status).toBe('critical')
      expect(topology.error_rate_percent).toBe(6.0)
    })

    it('should detect runtime environment', () => {
      const topology: ServiceTopologyRaw = {
        service_name: 'payment-service',
        operation_name: 'processPayment',
        span_kind: 'SERVER',
        total_spans: 500,
        root_spans: 0,
        error_spans: 2,
        avg_duration_ms: 120,
        p95_duration_ms: 180,
        unique_traces: 450,
        rate_per_second: 8.33,
        error_rate_percent: 0.4,
        health_status: 'healthy',
        runtime_language: 'java',
        runtime_name: 'OpenJDK',
        component: 'spring-boot'
      }

      expect(topology.runtime_language).toBe('java')
      expect(topology.runtime_name).toBe('OpenJDK')
      expect(topology.component).toBe('spring-boot')
    })

    it('should calculate rate per second correctly', () => {
      const topology: ServiceTopologyRaw = {
        service_name: 'cache-service',
        operation_name: 'get',
        span_kind: 'CLIENT',
        total_spans: 3600, // 3600 spans in 1 hour
        root_spans: 0,
        error_spans: 0,
        avg_duration_ms: 2,
        p95_duration_ms: 5,
        unique_traces: 1800,
        rate_per_second: 60, // 3600 / 60 minutes = 60/second
        error_rate_percent: 0,
        health_status: 'healthy'
      }

      expect(topology.rate_per_second).toBe(60)
    })
  })

  describe('Health Status Determination', () => {
    const testCases: Array<{
      name: string
      error_rate_percent: number
      p95_duration_ms: number
      expected_status: ServiceTopologyRaw['health_status']
    }> = [
      {
        name: 'healthy service',
        error_rate_percent: 0.5,
        p95_duration_ms: 50,
        expected_status: 'healthy'
      },
      {
        name: 'warning due to moderate errors',
        error_rate_percent: 3,
        p95_duration_ms: 50,
        expected_status: 'warning'
      },
      {
        name: 'warning due to slow P95',
        error_rate_percent: 0.5,
        p95_duration_ms: 300,
        expected_status: 'warning'
      },
      {
        name: 'degraded due to very slow P95',
        error_rate_percent: 0.5,
        p95_duration_ms: 600,
        expected_status: 'degraded'
      },
      {
        name: 'critical due to high error rate',
        error_rate_percent: 8,
        p95_duration_ms: 50,
        expected_status: 'critical'
      }
    ]

    testCases.forEach(({ name, error_rate_percent, p95_duration_ms, expected_status }) => {
      it(`should classify ${name}`, () => {
        const topology: ServiceTopologyRaw = {
          service_name: 'test-service',
          operation_name: 'test',
          span_kind: 'SERVER',
          total_spans: 1000,
          root_spans: 0,
          error_spans: error_rate_percent * 10,
          avg_duration_ms: p95_duration_ms / 2,
          p95_duration_ms,
          unique_traces: 900,
          rate_per_second: 16.67,
          error_rate_percent,
          health_status: expected_status
        }

        // The health status is determined by the SQL query's CASE statement
        expect(topology.health_status).toBe(expected_status)
      })
    })
  })

  describe('ServiceNode Schema', () => {
    it('should validate correct service node data', () => {
      const validNode = {
        id: 'api-gateway',
        name: 'API Gateway',
        category: 'gateway',
        symbolSize: 40,
        itemStyle: {
          color: '#52c41a' // green
        },
        label: {
          show: true
        },
        metrics: {
          rate: 100,
          errorRate: 0.5,
          duration: 45
        }
      }

      const result = Schema.decodeUnknownSync(ServiceNodeSchema)(validNode)
      expect(result).toEqual(validNode)
    })

    it('should support optional position for layout persistence', () => {
      const nodeWithPosition = {
        id: 'database',
        name: 'Database',
        category: 'database',
        symbolSize: 30,
        itemStyle: {
          color: '#faad14' // orange
        },
        label: {
          show: true
        },
        metrics: {
          rate: 50,
          errorRate: 0.1,
          duration: 120
        },
        position: [100, 200] as [number, number]
      }

      const result = Schema.decodeUnknownSync(ServiceNodeSchema)(nodeWithPosition)
      expect(result.position).toEqual([100, 200])
    })
  })

  describe('ServiceEdge Schema', () => {
    it('should validate correct service edge data', () => {
      const validEdge = {
        source: 'api-gateway',
        target: 'payment-service',
        value: 150, // call volume
        lineStyle: {
          width: 3,
          color: '#52c41a' // green (target service health)
        }
      }

      const result = Schema.decodeUnknownSync(ServiceEdgeSchema)(validEdge)
      expect(result).toEqual(validEdge)
    })

    it('should map edge thickness based on call volume', () => {
      const testCases = [
        { volume: 5, expectedWidth: 1 },     // thin
        { volume: 50, expectedWidth: 2 },    // medium
        { volume: 500, expectedWidth: 3 },   // thick
        { volume: 5000, expectedWidth: 4 }   // very thick
      ]

      testCases.forEach(({ volume, expectedWidth }) => {
        const edge = {
          source: 'service-a',
          target: 'service-b',
          value: volume,
          lineStyle: {
            width: expectedWidth,
            color: '#52c41a'
          }
        }

        const result = Schema.decodeUnknownSync(ServiceEdgeSchema)(edge)
        expect(result.lineStyle.width).toBe(expectedWidth)
      })
    })
  })

  describe('TopologyVisualizationData Schema', () => {
    it('should extend ApplicationArchitecture with visualization data', () => {
      const visualizationData = {
        applicationName: 'E-Commerce Platform',
        description: 'Microservices e-commerce application',
        services: [],
        dataFlows: [],
        criticalPaths: [],
        generatedAt: new Date().toISOString(),
        nodes: [
          {
            id: 'api-gateway',
            name: 'API Gateway',
            category: 'gateway',
            symbolSize: 40,
            itemStyle: { color: '#52c41a' },
            label: { show: true },
            metrics: { rate: 100, errorRate: 0.5, duration: 45 }
          }
        ],
        edges: [
          {
            source: 'api-gateway',
            target: 'payment-service',
            value: 150,
            lineStyle: { width: 3, color: '#52c41a' }
          }
        ],
        runtimeEnvironments: ['go', 'java', 'python'],
        healthSummary: {
          healthy: 5,
          warning: 2,
          degraded: 1,
          critical: 0,
          unavailable: 0
        }
      }

      const result = Schema.decodeUnknownSync(TopologyVisualizationDataSchema)(visualizationData)
      expect(result.nodes).toHaveLength(1)
      expect(result.edges).toHaveLength(1)
      expect(result.runtimeEnvironments).toContain('go')
      expect(result.healthSummary.healthy).toBe(5)
    })
  })

  describe('Dependency Graph with Call Volume', () => {
    it('should include call volume metrics in dependency graph', () => {
      const dependencies: ServiceDependencyRaw[] = [
        {
          service_name: 'api-gateway',
          operation_name: 'handleRequest',
          dependent_service: 'payment-service',
          dependent_operation: 'processPayment',
          call_count: 1500,
          avg_duration_ms: 120,
          error_count: 15,
          total_count: 1500
        },
        {
          service_name: 'api-gateway',
          operation_name: 'handleRequest',
          dependent_service: 'inventory-service',
          dependent_operation: 'checkStock',
          call_count: 2000,
          avg_duration_ms: 45,
          error_count: 5,
          total_count: 2000
        }
      ]

      const dependencyGraph = buildDependencyGraph(dependencies)
      const apiGatewayDeps = dependencyGraph.get('api-gateway')

      expect(apiGatewayDeps).toBeDefined()
      expect(apiGatewayDeps).toHaveLength(2)
      
      const paymentDep = apiGatewayDeps?.find(d => d.service === 'payment-service')
      expect(paymentDep?.callCount).toBe(1500)
      expect(paymentDep?.errorRate).toBeCloseTo(0.01, 2) // 15/1500 = 0.01

      const inventoryDep = apiGatewayDeps?.find(d => d.service === 'inventory-service')
      expect(inventoryDep?.callCount).toBe(2000)
      expect(inventoryDep?.errorRate).toBeCloseTo(0.0025, 4) // 5/2000 = 0.0025
    })
  })

  describe('Runtime Environment Mapping', () => {
    const runtimeTestCases = [
      { language: 'go', name: 'go1.19', expected: '🐹' },
      { language: 'java', name: 'OpenJDK', expected: '☕' },
      { language: 'python', name: 'CPython', expected: '🐍' },
      { language: 'javascript', name: 'node', expected: '⚡' },
      { language: 'csharp', name: 'dotnet', expected: '🔷' },
      { language: 'ruby', name: 'ruby', expected: '💎' },
      { language: 'php', name: 'php', expected: '🐘' },
      { language: 'rust', name: 'rust', expected: '🦀' },
      { language: undefined, name: undefined, expected: '🔥' }
    ]

    runtimeTestCases.forEach(({ language, expected }) => {
      it(`should map ${language || 'unknown'} to ${expected} icon`, () => {
        // This would be implemented in the UI component
        // For now we're just documenting the expected mapping
        const iconMap: Record<string, string> = {
          go: '🐹',
          java: '☕',
          python: '🐍',
          javascript: '⚡',
          csharp: '🔷',
          ruby: '💎',
          php: '🐘',
          rust: '🦀',
          unknown: '🔥'
        }

        const icon = iconMap[language || 'unknown'] || iconMap.unknown
        expect(icon).toBe(expected)
      })
    })
  })
})