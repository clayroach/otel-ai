/**
 * AI Analyzer Tests
 * 
 * Test suite for the LLM-based application architecture analysis.
 */

import { describe, it, expect } from 'vitest'
import { Schema } from '@effect/schema'
import { 
  AnalysisRequestSchema,
  ServiceTopologySchema
} from '../types.js'
import { classifyServiceType, buildDependencyGraph } from '../topology.js'
import { ArchitectureQueries } from '../queries.js'
import { PromptTemplates } from '../prompts.js'

describe('AI Analyzer', () => {
  
  describe('Schema Validation', () => {
    it('should validate analysis request schema', () => {
      const validRequest = {
        type: 'architecture',
        timeRange: {
          startTime: '2024-01-01T00:00:00.000Z',
          endTime: '2024-01-02T00:00:00.000Z'
        }
      }
      
      const result = Schema.decodeUnknownSync(AnalysisRequestSchema)(validRequest)
      
      expect(result.type).toBe('architecture')
      expect(result.timeRange.startTime).toBeInstanceOf(Date)
    })

    it('should validate service topology schema', () => {
      const validTopology = {
        service: 'user-service',
        type: 'backend',
        operations: ['getUser', 'createUser'],
        dependencies: [{
          service: 'database',
          operation: 'query',
          callCount: 100,
          avgLatencyMs: 50,
          errorRate: 0.01
        }],
        metadata: {
          spanKind: 'SERVER',
          totalSpans: 1000,
          avgLatencyMs: 100
        }
      }
      
      const result = Schema.decodeUnknownSync(ServiceTopologySchema)(validTopology)
      
      expect(result.service).toBe('user-service')
      expect(result.type).toBe('backend')
      expect(result.dependencies).toHaveLength(1)
    })
  })

  describe('Service Classification', () => {
    it('should classify frontend services', () => {
      const frontendSpan = {
        service_name: 'web-frontend',
        operation_name: 'page-load',
        span_kind: 'CLIENT',
        total_spans: 100,
        root_spans: 90,
        error_spans: 5,
        avg_duration_ms: 200,
        p95_duration_ms: 500,
        unique_traces: 80
      }
      
      const serviceType = classifyServiceType(frontendSpan)
      expect(serviceType).toBe('frontend')
    })

    it('should classify database services', () => {
      const dbSpan = {
        service_name: 'postgres',
        operation_name: 'SELECT users',
        span_kind: 'CLIENT',
        total_spans: 1000,
        root_spans: 0,
        error_spans: 10,
        avg_duration_ms: 50,
        p95_duration_ms: 100,
        unique_traces: 500
      }
      
      const serviceType = classifyServiceType(dbSpan)
      expect(serviceType).toBe('database')
    })

    it('should classify API gateway services', () => {
      const apiGatewaySpan = {
        service_name: 'api-gateway',
        operation_name: 'route-request',
        span_kind: 'SERVER',
        total_spans: 1000,
        root_spans: 950,
        error_spans: 20,
        avg_duration_ms: 100,
        p95_duration_ms: 200,
        unique_traces: 800
      }
      
      const serviceType = classifyServiceType(apiGatewaySpan)
      expect(serviceType).toBe('api')
    })

    it('should classify cache services', () => {
      const cacheSpan = {
        service_name: 'redis-cache',
        operation_name: 'cache-get',
        span_kind: 'CLIENT',
        total_spans: 2000,
        root_spans: 0,
        error_spans: 5,
        avg_duration_ms: 5,
        p95_duration_ms: 10,
        unique_traces: 1000
      }
      
      const serviceType = classifyServiceType(cacheSpan)
      expect(serviceType).toBe('cache')
    })
  })

  describe('Dependency Graph Building', () => {
    it('should build service dependency graph', () => {
      const dependencies = [
        {
          service_name: 'user-service',
          operation_name: 'getUser',
          dependent_service: 'database',
          dependent_operation: 'query',
          call_count: 100,
          avg_duration_ms: 50,
          error_count: 2,
          total_count: 100
        },
        {
          service_name: 'user-service',
          operation_name: 'getUser',
          dependent_service: 'cache',
          dependent_operation: 'get',
          call_count: 80,
          avg_duration_ms: 5,
          error_count: 0,
          total_count: 80
        }
      ]
      
      const dependencyGraph = buildDependencyGraph(dependencies)
      
      expect(dependencyGraph.has('user-service')).toBe(true)
      const userServiceDeps = dependencyGraph.get('user-service')!
      expect(userServiceDeps).toHaveLength(2)
      expect(userServiceDeps[0].service).toBe('database')
      expect(userServiceDeps[1].service).toBe('cache')
    })
  })

  describe('Query Generation', () => {
    it('should generate service topology query', () => {
      const query = ArchitectureQueries.getServiceTopology(24)
      
      expect(query).toContain('SELECT')
      expect(query).toContain('service_name')
      expect(query).toContain('operation_name')
      expect(query).toContain('span_kind')
      expect(query).toContain('INTERVAL 24 HOUR')
    })

    it('should generate service dependencies query', () => {
      const query = ArchitectureQueries.getServiceDependencies(12)
      
      expect(query).toContain('INNER JOIN')
      expect(query).toContain('parent_span_id')
      expect(query).toContain('INTERVAL 12 HOUR')
      expect(query).toContain('avg_duration_ms')
    })

    it('should generate trace flows query', () => {
      const query = ArchitectureQueries.getTraceFlows(50, 6)
      
      expect(query).toContain('WITH RECURSIVE')
      expect(query).toContain('trace_hierarchy')
      expect(query).toContain('INTERVAL 6 HOUR')
      expect(query).toContain('LIMIT 50')
    })
  })

  describe('Prompt Generation', () => {
    it('should generate architecture overview prompt', () => {
      const mockArchitecture = {
        applicationName: 'Test App',
        description: 'Test application',
        services: [{
          service: 'test-service',
          type: 'backend' as const,
          operations: ['testOp'],
          dependencies: [],
          metadata: {
            errorRate: 0.01,
            avgLatencyMs: 100,
            totalSpans: 1000
          }
        }],
        dataFlows: [{
          from: 'frontend',
          to: 'backend',
          operation: 'api-call',
          volume: 1000,
          latency: { p50: 100, p95: 200, p99: 300 }
        }],
        criticalPaths: [{
          name: 'main-path',
          services: ['frontend', 'backend'],
          avgLatencyMs: 150,
          errorRate: 0.005
        }],
        generatedAt: new Date()
      }
      
      const prompt = PromptTemplates.architectureOverview(mockArchitecture)
      
      expect(prompt).toContain('Test App')
      expect(prompt).toContain('test-service')
      expect(prompt).toContain('Architecture Summary')
      expect(prompt).toContain('Service Classification')
    })

    it('should generate dependency analysis prompt', () => {
      const mockArchitecture = {
        applicationName: 'Test App',
        description: 'Test application',
        services: [{
          service: 'test-service',
          type: 'backend' as const,
          operations: ['testOp'],
          dependencies: [{
            service: 'database',
            operation: 'query',
            callCount: 100,
            avgLatencyMs: 50,
            errorRate: 0.01
          }],
          metadata: {
            errorRate: 0.01,
            avgLatencyMs: 100
          }
        }],
        dataFlows: [],
        criticalPaths: [],
        generatedAt: new Date()
      }
      
      const prompt = PromptTemplates.dependencyAnalysis(mockArchitecture)
      
      expect(prompt).toContain('Service Dependencies Analysis')
      expect(prompt).toContain('test-service')
      expect(prompt).toContain('database')
      expect(prompt).toContain('Dependency Complexity Assessment')
    })

    it('should generate Mermaid diagram prompts', () => {
      const mockArchitecture = {
        applicationName: 'Test App',
        description: 'Test application',
        services: [{
          service: 'test-service',
          type: 'backend' as const,
          operations: ['testOp'],
          dependencies: [],
          metadata: {}
        }],
        dataFlows: [{
          from: 'frontend',
          to: 'backend',
          operation: 'api-call',
          volume: 1000,
          latency: { p50: 100, p95: 200, p99: 300 }
        }],
        criticalPaths: [{
          name: 'main-path',
          services: ['frontend', 'backend'],
          avgLatencyMs: 150,
          errorRate: 0.005
        }],
        generatedAt: new Date()
      }
      
      const architectureDiagram = PromptTemplates.mermaidDiagram(mockArchitecture, 'architecture')
      const sequenceDiagram = PromptTemplates.mermaidDiagram(mockArchitecture, 'sequence')
      const dataflowDiagram = PromptTemplates.mermaidDiagram(mockArchitecture, 'dataflow')
      
      expect(architectureDiagram).toContain('graph TD')
      expect(sequenceDiagram).toContain('sequenceDiagram')
      expect(dataflowDiagram).toContain('flowchart')
      
      expect(architectureDiagram).toContain('test-service')
      expect(sequenceDiagram).toContain('frontend → backend')
      expect(dataflowDiagram).toContain('frontend → backend')
    })
  })

  describe('Integration Scenarios', () => {
    it('should handle microservices architecture pattern', () => {
      const microservicesTopology = [
        {
          service_name: 'api-gateway',
          operation_name: 'route',
          span_kind: 'SERVER',
          total_spans: 1000,
          root_spans: 950,
          error_spans: 10,
          avg_duration_ms: 50,
          p95_duration_ms: 100,
          unique_traces: 800
        },
        {
          service_name: 'user-service',
          operation_name: 'getUser',
          span_kind: 'SERVER',
          total_spans: 500,
          root_spans: 0,
          error_spans: 5,
          avg_duration_ms: 100,
          p95_duration_ms: 200,
          unique_traces: 400
        },
        {
          service_name: 'postgres',
          operation_name: 'SELECT',
          span_kind: 'CLIENT',
          total_spans: 300,
          root_spans: 0,
          error_spans: 2,
          avg_duration_ms: 25,
          p95_duration_ms: 50,
          unique_traces: 250
        }
      ]
      
      const serviceTypes = microservicesTopology.map(classifyServiceType)
      
      expect(serviceTypes).toContain('api')
      expect(serviceTypes).toContain('backend')
      expect(serviceTypes).toContain('database')
    })

    it('should identify performance bottlenecks', () => {
      const performanceData = [
        {
          service_name: 'slow-service',
          operation_name: 'heavyOperation',
          span_kind: 'SERVER',
          total_spans: 100,
          root_spans: 0,
          error_spans: 20,
          avg_duration_ms: 5000, // Very slow
          p95_duration_ms: 8000,
          unique_traces: 80
        },
        {
          service_name: 'fast-service',
          operation_name: 'quickOperation',
          span_kind: 'SERVER',
          total_spans: 1000,
          root_spans: 0,
          error_spans: 1,
          avg_duration_ms: 10, // Very fast
          p95_duration_ms: 20,
          unique_traces: 900
        }
      ]
      
      const slowServices = performanceData.filter(s => s.avg_duration_ms > 1000)
      const errorProneServices = performanceData.filter(s => s.error_spans / s.total_spans > 0.1)
      
      expect(slowServices).toHaveLength(1)
      expect(slowServices[0].service_name).toBe('slow-service')
      expect(errorProneServices).toHaveLength(1)
      expect(errorProneServices[0].service_name).toBe('slow-service')
    })
  })
})