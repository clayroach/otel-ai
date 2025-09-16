/**
 * Fixed analyzer test with complete ServiceTopologyRaw types
 */

import { describe, expect, it } from 'vitest'
import { Schema } from '@effect/schema'
import { 
  AnalysisRequestSchema,
  ServiceTopologySchema
} from '../../types.js'
import { classifyServiceType, buildDependencyGraph } from '../../topology.js'
import type { ServiceTopologyRaw, ServiceDependencyRaw } from '../../queries.js'
import { ArchitectureQueries } from '../../queries.js'
import { PromptTemplates } from '../../prompts.js'

// Helper to add required fields to test data
function createTestTopology(partial: Partial<ServiceTopologyRaw>): ServiceTopologyRaw {
  const defaults: ServiceTopologyRaw = {
    service_name: 'test-service',
    operation_name: 'test-op',
    span_kind: 'SERVER',
    total_spans: 100,
    root_spans: 0,
    error_spans: 0,
    avg_duration_ms: 50,
    p95_duration_ms: 100,
    unique_traces: 80,
    rate_per_second: 1.67,
    error_rate_percent: 0,
    health_status: 'healthy'
  }
  return { ...defaults, ...partial }
}

describe('AI Analyzer', () => {
  describe('Schema Validation', () => {
    it('should validate AnalysisRequest schema', () => {
      const validRequest = {
        type: 'architecture' as const,
        timeRange: {
          startTime: '2024-01-01T00:00:00Z',  // Use ISO string format
          endTime: '2024-01-02T00:00:00Z'     // Use ISO string format
        }
      }
      
      const result = Schema.decodeUnknownSync(AnalysisRequestSchema)(validRequest)
      expect(result.type).toBe('architecture')
    })

    it('should validate ServiceTopology schema', () => {
      const validTopology = {
        service: 'api-gateway',
        type: 'api' as const,
        operations: ['handleRequest'],
        dependencies: [],
        metadata: {}
      }
      
      const result = Schema.decodeUnknownSync(ServiceTopologySchema)(validTopology)
      expect(result.service).toBe('api-gateway')
    })
  })

  describe('Service Classification', () => {
    it('should classify frontend services', () => {
      const frontendSpan = createTestTopology({
        service_name: 'web-frontend',
        operation_name: 'page-load',
        span_kind: 'CLIENT',
        total_spans: 100,
        root_spans: 90,
        error_spans: 5,
        avg_duration_ms: 200,
        p95_duration_ms: 500,
        unique_traces: 80,
        rate_per_second: 1.67,
        error_rate_percent: 5.0,
        health_status: 'warning'
      })
      
      const serviceType = classifyServiceType(frontendSpan)
      expect(serviceType).toBe('frontend')
    })

    it('should classify database services', () => {
      const dbSpan = createTestTopology({
        service_name: 'postgres',
        operation_name: 'SELECT users',
        span_kind: 'CLIENT',
        total_spans: 1000,
        root_spans: 0,
        error_spans: 10,
        avg_duration_ms: 50,
        p95_duration_ms: 100,
        unique_traces: 500,
        rate_per_second: 16.67,
        error_rate_percent: 1.0,
        health_status: 'healthy'
      })
      
      const serviceType = classifyServiceType(dbSpan)
      expect(serviceType).toBe('database')
    })

    it('should classify API gateway services', () => {
      const apiGatewaySpan = createTestTopology({
        service_name: 'api-gateway',
        operation_name: 'route-request',
        span_kind: 'SERVER',
        total_spans: 1000,
        root_spans: 950,
        error_spans: 20,
        avg_duration_ms: 100,
        p95_duration_ms: 200,
        unique_traces: 800,
        rate_per_second: 16.67,
        error_rate_percent: 2.0,
        health_status: 'warning'
      })
      
      const serviceType = classifyServiceType(apiGatewaySpan)
      expect(serviceType).toBe('api')
    })

    it('should classify cache services', () => {
      const cacheSpan = createTestTopology({
        service_name: 'service',
        operation_name: 'redis_get',
        span_kind: 'CLIENT',
        total_spans: 2000,
        root_spans: 0,
        error_spans: 5,
        avg_duration_ms: 5,
        p95_duration_ms: 10,
        unique_traces: 1000,
        rate_per_second: 33.33,
        error_rate_percent: 0.25,
        health_status: 'healthy'
      })
      
      const serviceType = classifyServiceType(cacheSpan)
      expect(serviceType).toBe('cache')
    })

    it('should classify queue services', () => {
      const queueSpan = createTestTopology({
        service_name: 'message-broker',
        operation_name: 'publish',
        span_kind: 'PRODUCER',
        total_spans: 500,
        root_spans: 0,
        error_spans: 5,
        avg_duration_ms: 30,
        p95_duration_ms: 50,
        unique_traces: 400,
        rate_per_second: 8.33,
        error_rate_percent: 1.0,
        health_status: 'healthy'
      })
      
      const serviceType = classifyServiceType(queueSpan)
      expect(serviceType).toBe('queue')
    })

    it('should classify external services', () => {
      const externalSpan = createTestTopology({
        service_name: 'third-party-api',
        operation_name: 'http-call',
        span_kind: 'CLIENT',
        total_spans: 200,
        root_spans: 0,
        error_spans: 20,
        avg_duration_ms: 500,
        p95_duration_ms: 1000,
        unique_traces: 150,
        rate_per_second: 3.33,
        error_rate_percent: 10.0,
        health_status: 'critical'
      })
      
      const serviceType = classifyServiceType(externalSpan)
      expect(serviceType).toBe('external')
    })

    it('should default to backend service', () => {
      const backendSpan = createTestTopology({
        service_name: 'user-service',
        operation_name: 'processRequest',
        span_kind: 'SERVER',
        total_spans: 800,
        root_spans: 100,
        error_spans: 8,
        avg_duration_ms: 150,
        p95_duration_ms: 300,
        unique_traces: 600,
        rate_per_second: 13.33,
        error_rate_percent: 1.0,
        health_status: 'healthy'
      })
      
      const serviceType = classifyServiceType(backendSpan)
      expect(serviceType).toBe('backend')
    })
  })

  describe('Dependency Graph Building', () => {
    it('should build dependency graph from raw data', () => {
      const dependencies: ServiceDependencyRaw[] = [
        {
          service_name: 'frontend',
          operation_name: 'render',
          dependent_service: 'api-gateway',
          dependent_operation: 'handleRequest',
          call_count: 100,
          avg_duration_ms: 200,
          error_count: 5,
          total_count: 100
        },
        {
          service_name: 'api-gateway',
          operation_name: 'handleRequest',
          dependent_service: 'user-service',
          dependent_operation: 'getUser',
          call_count: 80,
          avg_duration_ms: 150,
          error_count: 2,
          total_count: 80
        }
      ]
      
      const graph = buildDependencyGraph(dependencies)
      
      expect(graph.has('frontend')).toBe(true)
      expect(graph.has('api-gateway')).toBe(true)
      
      const frontendDeps = graph.get('frontend')
      expect(frontendDeps).toHaveLength(1)
      expect(frontendDeps?.[0]?.service).toBe('api-gateway')
      expect(frontendDeps?.[0]?.callCount).toBe(100)
      
      const apiDeps = graph.get('api-gateway')
      expect(apiDeps).toHaveLength(1)
      expect(apiDeps?.[0]?.service).toBe('user-service')
      expect(apiDeps?.[0]?.errorRate).toBeCloseTo(0.025, 3)
    })
  })

  describe('Query Building', () => {
    it('should generate correct service topology query', () => {
      const query = ArchitectureQueries.getServiceTopology(24)
      expect(query).toContain('SELECT')
      expect(query).toContain('service_name')
      expect(query).toContain('operation_name')
      expect(query).toContain('INTERVAL 24 HOUR')
    })

    it('should generate correct service dependencies query', () => {
      const query = ArchitectureQueries.getServiceDependencies(12)
      expect(query).toContain('parent.service_name')
      expect(query).toContain('child.service_name')
      expect(query).toContain('INNER JOIN')
      expect(query).toContain('INTERVAL 12 HOUR')
    })

    it('should generate correct trace flows query', () => {
      const query = ArchitectureQueries.getTraceFlows(50, 6)
      expect(query).toContain('WITH sampled_traces')
      expect(query).toContain('trace_spans')
      expect(query).toContain('LIMIT 50')
      expect(query).toContain('INTERVAL 6 HOUR')
    })
  })

  describe('Prompt Templates', () => {
    it('should generate architecture analysis prompt', () => {
      const topology = {
        applicationName: 'Test App',
        description: 'Test application',
        services: [],
        dataFlows: [],
        criticalPaths: [],
        generatedAt: new Date()
      }
      
      const prompt = PromptTemplates.architectureOverview(topology)
      expect(prompt).toContain('Application Data')
      expect(prompt).toContain('Test App')
    })

    it('should generate data flow prompt', () => {
      const flows = [
        {
          from: 'service-a',
          to: 'service-b',
          operation: 'test-op',
          volume: 100,
          latency: { p50: 50, p95: 100, p99: 200 }
        }
      ]
      
      // PromptTemplates doesn't have analyzeDataFlows, so let's use performanceInsights
      // which includes data flow analysis
      const architecture = {
        applicationName: 'Test App',
        description: 'Test application',
        services: [],
        dataFlows: flows,
        criticalPaths: [],
        generatedAt: new Date()
      }
      const prompt = PromptTemplates.performanceInsights(architecture)
      expect(prompt).toContain('High-Volume Data Flows')
      expect(prompt).toContain('service-a')
      expect(prompt).toContain('service-b')
    })
  })

  describe('Service Type Classification with Real Data', () => {
    it('should classify microservices architecture correctly', () => {
      const microservicesTopology = [
        createTestTopology({
          service_name: 'frontend',
          operation_name: 'render',
          span_kind: 'CLIENT',
          root_spans: 100
        }),
        createTestTopology({
          service_name: 'api-gateway',
          operation_name: 'route',
          span_kind: 'SERVER',
          root_spans: 950,
          total_spans: 1000
        }),
        createTestTopology({
          service_name: 'user-service',
          operation_name: 'getUser',
          span_kind: 'SERVER',
          root_spans: 50,
          total_spans: 500
        }),
        createTestTopology({
          service_name: 'postgres',
          operation_name: 'SELECT',
          span_kind: 'CLIENT'
        }),
        createTestTopology({
          service_name: 'redis',
          operation_name: 'cache_get',
          span_kind: 'CLIENT'
        })
      ]
      
      const serviceTypes = microservicesTopology.map(classifyServiceType)
      
      expect(serviceTypes).toContain('frontend')
      expect(serviceTypes).toContain('api')
      expect(serviceTypes).toContain('backend')
      expect(serviceTypes).toContain('database')
      expect(serviceTypes).toContain('cache')
    })
  })
})