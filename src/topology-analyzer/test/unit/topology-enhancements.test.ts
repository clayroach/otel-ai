/**
 * Unit tests for enhanced topology functions with visualization support
 */

import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import type { ServiceTopologyRaw, ServiceDependencyRaw, TraceFlowRaw } from '../../queries.js'
import type { ApplicationArchitecture } from '../../types.js'
import { 
  getHealthColor,
  getEdgeThickness,
  getRuntimeIcon,
  buildTopologyVisualizationData,
  discoverTopologyWithVisualization
} from '../../topology.js'

describe('Topology Visualization Enhancements', () => {
  describe('getHealthColor', () => {
    it('should return correct colors for health statuses', () => {
      expect(getHealthColor('healthy')).toBe('#52c41a') // green
      expect(getHealthColor('warning')).toBe('#faad14') // yellow
      expect(getHealthColor('degraded')).toBe('#fa8c16') // orange
      expect(getHealthColor('critical')).toBe('#f5222d') // red
      expect(getHealthColor('unavailable')).toBe('#262626') // black
    })
  })

  describe('getEdgeThickness', () => {
    it('should calculate edge thickness based on call volume', () => {
      expect(getEdgeThickness(5)).toBe(1) // thin
      expect(getEdgeThickness(50)).toBe(2) // medium
      expect(getEdgeThickness(500)).toBe(3) // thick
      expect(getEdgeThickness(5000)).toBe(4) // very thick
    })
  })

  describe('getRuntimeIcon', () => {
    it('should return correct icons for runtime languages', () => {
      expect(getRuntimeIcon('go')).toBe('🐹')
      expect(getRuntimeIcon('java')).toBe('☕')
      expect(getRuntimeIcon('python')).toBe('🐍')
      expect(getRuntimeIcon('javascript')).toBe('⚡')
      expect(getRuntimeIcon('nodejs')).toBe('⚡')
      expect(getRuntimeIcon('csharp')).toBe('🔷')
      expect(getRuntimeIcon('ruby')).toBe('💎')
      expect(getRuntimeIcon('php')).toBe('🐘')
      expect(getRuntimeIcon('rust')).toBe('🦀')
      expect(getRuntimeIcon()).toBe('🔥') // unknown
      expect(getRuntimeIcon('unknown')).toBe('🔥')
    })

    it('should handle case-insensitive language names', () => {
      expect(getRuntimeIcon('GO')).toBe('🐹')
      expect(getRuntimeIcon('Java')).toBe('☕')
      expect(getRuntimeIcon('PYTHON')).toBe('🐍')
    })
  })

  describe('buildTopologyVisualizationData', () => {
    const mockTopologyData: ServiceTopologyRaw[] = [
      {
        service_name: 'api-gateway',
        operation_name: 'handleRequest',
        span_kind: 'SERVER',
        total_spans: 1000,
        root_spans: 800,
        error_spans: 10,
        avg_duration_ms: 45,
        p95_duration_ms: 80,
        unique_traces: 500,
        rate_per_second: 16.67,
        error_rate_percent: 1.0,
        health_status: 'healthy',
        runtime_language: 'go',
        runtime_name: 'go1.19'
      },
      {
        service_name: 'payment-service',
        operation_name: 'processPayment',
        span_kind: 'SERVER',
        total_spans: 500,
        root_spans: 0,
        error_spans: 30,
        avg_duration_ms: 120,
        p95_duration_ms: 180,
        unique_traces: 450,
        rate_per_second: 8.33,
        error_rate_percent: 6.0,
        health_status: 'critical',
        runtime_language: 'java'
      },
      {
        service_name: 'database',
        operation_name: 'query',
        span_kind: 'CLIENT',
        total_spans: 2000,
        root_spans: 0,
        error_spans: 5,
        avg_duration_ms: 10,
        p95_duration_ms: 25,
        unique_traces: 1800,
        rate_per_second: 33.33,
        error_rate_percent: 0.25,
        health_status: 'healthy',
        runtime_language: 'postgresql'
      }
    ]

    const mockDependencyData: ServiceDependencyRaw[] = [
      {
        service_name: 'api-gateway',
        operation_name: 'handleRequest',
        dependent_service: 'payment-service',
        dependent_operation: 'processPayment',
        call_count: 150,
        avg_duration_ms: 120,
        error_count: 9,
        total_count: 150
      },
      {
        service_name: 'payment-service',
        operation_name: 'processPayment',
        dependent_service: 'database',
        dependent_operation: 'query',
        call_count: 450,
        avg_duration_ms: 10,
        error_count: 2,
        total_count: 450
      }
    ]

    const mockArchitecture: ApplicationArchitecture = {
      applicationName: 'Test Application',
      description: 'Test application architecture',
      services: [
        {
          service: 'api-gateway',
          type: 'api',
          operations: ['handleRequest'],
          dependencies: [{
            service: 'payment-service',
            operation: 'processPayment',
            callCount: 150,
            avgLatencyMs: 120,
            errorRate: 0.06
          }],
          metadata: {}
        },
        {
          service: 'payment-service',
          type: 'backend',
          operations: ['processPayment'],
          dependencies: [{
            service: 'database',
            operation: 'query',
            callCount: 450,
            avgLatencyMs: 10,
            errorRate: 0.004
          }],
          metadata: {}
        },
        {
          service: 'database',
          type: 'database',
          operations: ['query'],
          dependencies: [],
          metadata: {}
        }
      ],
      dataFlows: [],
      criticalPaths: [],
      generatedAt: new Date()
    }

    it('should create nodes with correct health colors', () => {
      const result = buildTopologyVisualizationData(
        mockTopologyData,
        mockDependencyData,
        mockArchitecture
      )

      expect(result.nodes).toHaveLength(3)
      
      const apiGatewayNode = result.nodes.find(n => n.id === 'api-gateway')
      expect(apiGatewayNode?.itemStyle.color).toBe('#52c41a') // healthy - green
      
      const paymentNode = result.nodes.find(n => n.id === 'payment-service')
      expect(paymentNode?.itemStyle.color).toBe('#f5222d') // critical - red
      
      const dbNode = result.nodes.find(n => n.id === 'database')
      expect(dbNode?.itemStyle.color).toBe('#52c41a') // healthy - green
    })

    it('should create edges with correct thickness and colors', () => {
      const result = buildTopologyVisualizationData(
        mockTopologyData,
        mockDependencyData,
        mockArchitecture
      )

      expect(result.edges).toHaveLength(2)
      
      const apiToPaymentEdge = result.edges.find(
        e => e.source === 'api-gateway' && e.target === 'payment-service'
      )
      expect(apiToPaymentEdge?.lineStyle.width).toBe(3) // 150 calls = thick
      expect(apiToPaymentEdge?.lineStyle.color).toBe('#f5222d') // target is critical
      
      const paymentToDbEdge = result.edges.find(
        e => e.source === 'payment-service' && e.target === 'database'
      )
      expect(paymentToDbEdge?.lineStyle.width).toBe(3) // 450 calls = thick
      expect(paymentToDbEdge?.lineStyle.color).toBe('#52c41a') // target is healthy
    })

    it('should calculate health summary correctly', () => {
      const result = buildTopologyVisualizationData(
        mockTopologyData,
        mockDependencyData,
        mockArchitecture
      )

      expect(result.healthSummary).toEqual({
        healthy: 2,    // api-gateway, database
        warning: 0,
        degraded: 0,
        critical: 1,   // payment-service
        unavailable: 0
      })
    })

    it('should extract runtime environments', () => {
      const result = buildTopologyVisualizationData(
        mockTopologyData,
        mockDependencyData,
        mockArchitecture
      )

      expect(result.runtimeEnvironments).toContain('go')
      expect(result.runtimeEnvironments).toContain('java')
      expect(result.runtimeEnvironments).toContain('postgresql')
      expect(result.runtimeEnvironments).toHaveLength(3)
    })

    it('should calculate node sizes based on activity', () => {
      const result = buildTopologyVisualizationData(
        mockTopologyData,
        mockDependencyData,
        mockArchitecture
      )

      const apiGatewayNode = result.nodes.find(n => n.id === 'api-gateway')
      const dbNode = result.nodes.find(n => n.id === 'database')
      
      // Database has more spans (2000) than api-gateway (1000)
      expect(dbNode?.symbolSize || 0).toBeGreaterThan(apiGatewayNode?.symbolSize || 0)
    })

    it('should include R.E.D metrics in nodes', () => {
      const result = buildTopologyVisualizationData(
        mockTopologyData,
        mockDependencyData,
        mockArchitecture
      )

      const paymentNode = result.nodes.find(n => n.id === 'payment-service')
      expect(paymentNode?.metrics).toEqual({
        rate: 8.33,
        errorRate: 6.0,
        duration: 180
      })
    })
  })

  describe('discoverTopologyWithVisualization', () => {
    it('should return enhanced topology with visualization data', async () => {
      const mockTopologyData: ServiceTopologyRaw[] = [
        {
          service_name: 'test-service',
          operation_name: 'test-op',
          span_kind: 'SERVER',
          total_spans: 100,
          root_spans: 50,
          error_spans: 1,
          avg_duration_ms: 50,
          p95_duration_ms: 75,
          unique_traces: 90,
          rate_per_second: 1.67,
          error_rate_percent: 1.0,
          health_status: 'healthy',
          runtime_language: 'go'
        }
      ]

      const mockDependencyData: ServiceDependencyRaw[] = []
      const mockTraceFlows: TraceFlowRaw[] = []

      const result = await Effect.runPromise(
        discoverTopologyWithVisualization(
          mockTopologyData,
          mockDependencyData,
          mockTraceFlows
        )
      )

      expect(result).toHaveProperty('nodes')
      expect(result).toHaveProperty('edges')
      expect(result).toHaveProperty('runtimeEnvironments')
      expect(result).toHaveProperty('healthSummary')
      expect(result).toHaveProperty('applicationName')
      expect(result).toHaveProperty('services')
      
      expect(result.nodes).toHaveLength(1)
      expect(result.nodes[0]?.id).toBe('test-service')
      expect(result.nodes[0]?.itemStyle.color).toBe('#52c41a') // healthy
    })
  })
})