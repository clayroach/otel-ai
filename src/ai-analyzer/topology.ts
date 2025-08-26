/**
 * Application Topology Discovery
 * 
 * Analyzes trace data to discover service relationships, classify service types,
 * and build a comprehensive understanding of application architecture.
 */

import { Effect } from 'effect'
import type { 
  ServiceTopology, 
  ApplicationArchitecture, 
  AnalysisError 
} from './types.js'
import type { 
  ServiceDependencyRaw, 
  ServiceTopologyRaw, 
  TraceFlowRaw 
} from './queries.js'

/**
 * Service type classification based on span characteristics
 */
export const classifyServiceType = (topology: ServiceTopologyRaw): ServiceTopology['type'] => {
  const { span_kind, root_spans, total_spans, operation_name } = topology
  
  // Frontend services (browsers, mobile apps)
  if (span_kind === 'CLIENT' && root_spans > 0) {
    return 'frontend'
  }
  
  // API gateways and load balancers
  if (span_kind === 'SERVER' && root_spans > total_spans * 0.8) {
    return 'api'
  }
  
  // Database services
  if (span_kind === 'CLIENT' && (
    operation_name.toLowerCase().includes('select') ||
    operation_name.toLowerCase().includes('insert') ||
    operation_name.toLowerCase().includes('update') ||
    operation_name.toLowerCase().includes('delete') ||
    operation_name.toLowerCase().includes('query')
  )) {
    return 'database'
  }
  
  // Cache services
  if (operation_name.toLowerCase().includes('cache') ||
      operation_name.toLowerCase().includes('redis') ||
      operation_name.toLowerCase().includes('memcache')) {
    return 'cache'
  }
  
  // Queue/messaging services
  if (span_kind === 'PRODUCER' || span_kind === 'CONSUMER' ||
      operation_name.toLowerCase().includes('queue') ||
      operation_name.toLowerCase().includes('publish') ||
      operation_name.toLowerCase().includes('subscribe')) {
    return 'queue'
  }
  
  // External services (third-party APIs)
  if (span_kind === 'CLIENT' && root_spans === 0) {
    return 'external'
  }
  
  // Default to backend service
  return 'backend'
}

/**
 * Build service dependency graph from raw dependency data
 */
export const buildDependencyGraph = (
  dependencies: ServiceDependencyRaw[]
): Map<string, ServiceTopology['dependencies']> => {
  const dependencyMap = new Map<string, ServiceTopology['dependencies']>()
  
  dependencies.forEach(dep => {
    const serviceKey = dep.service_name
    const existing = [...(dependencyMap.get(serviceKey) || [])]
    
    existing.push({
      service: dep.dependent_service,
      operation: dep.dependent_operation,
      callCount: dep.call_count,
      avgLatencyMs: dep.avg_duration_ms,
      errorRate: dep.error_count / dep.total_count
    })
    
    dependencyMap.set(serviceKey, existing)
  })
  
  return dependencyMap
}

/**
 * Discover critical paths through the application
 */
export const discoverCriticalPaths = (traceFlows: TraceFlowRaw[]) => {
  const pathMap = new Map<string, {
    services: string[]
    totalLatency: number
    errorCount: number
    sampleCount: number
  }>()
  
  // Group by trace and build service paths
  const traceGroups = traceFlows.reduce((acc, flow) => {
    const traceId = flow.trace_id
    if (!acc[traceId]) {
      acc[traceId] = []
    }
    acc[traceId]!.push(flow)
    return acc
  }, {} as Record<string, TraceFlowRaw[]>)
  
  Object.values(traceGroups).forEach(flows => {
    // Sort by level to get proper ordering
    flows.sort((a, b) => a.level - b.level)
    
    const services = flows.map(f => f.service_name)
    const pathKey = services.join(' -> ')
    const totalLatency = flows.reduce((sum, f) => sum + f.duration_ms, 0)
    const errorCount = flows.filter(f => f.status_code === 'ERROR').length
    
    const existing = pathMap.get(pathKey) || {
      services: services,
      totalLatency: 0,
      errorCount: 0,
      sampleCount: 0
    }
    
    existing.totalLatency += totalLatency
    existing.errorCount += errorCount
    existing.sampleCount += 1
    
    pathMap.set(pathKey, existing)
  })
  
  // Convert to final format and sort by average latency
  return Array.from(pathMap.entries())
    .map(([name, data]) => ({
      name,
      services: data.services,
      avgLatencyMs: data.totalLatency / data.sampleCount,
      errorRate: data.errorCount / data.sampleCount
    }))
    .sort((a, b) => b.avgLatencyMs - a.avgLatencyMs)
    .slice(0, 10) // Top 10 critical paths
}

/**
 * Build data flow analysis
 */
export const buildDataFlows = (dependencies: ServiceDependencyRaw[]) => {
  return dependencies.map(dep => ({
    from: dep.service_name,
    to: dep.dependent_service,
    operation: dep.dependent_operation,
    volume: dep.call_count,
    latency: {
      p50: dep.avg_duration_ms, // Approximation - we'd need percentile data
      p95: dep.avg_duration_ms * 1.5, // Rough estimate
      p99: dep.avg_duration_ms * 2.0 // Rough estimate
    }
  }))
}

/**
 * Main topology discovery function
 */
export const discoverApplicationTopology = (
  topologyData: ServiceTopologyRaw[],
  dependencyData: ServiceDependencyRaw[],
  traceFlows: TraceFlowRaw[]
): Effect.Effect<ApplicationArchitecture, AnalysisError, never> =>
  Effect.gen(function* (_) {
    try {
      // Build dependency graph
      const dependencyGraph = buildDependencyGraph(dependencyData)
      
      // Convert raw topology to structured services
      const services: ServiceTopology[] = topologyData.map(raw => ({
        service: raw.service_name,
        type: classifyServiceType(raw),
        operations: [raw.operation_name], // We'd need to aggregate operations per service
        dependencies: dependencyGraph.get(raw.service_name) || [],
        metadata: {
          spanKind: raw.span_kind,
          totalSpans: raw.total_spans,
          rootSpans: raw.root_spans,
          errorRate: raw.error_spans / raw.total_spans,
          avgLatencyMs: raw.avg_duration_ms,
          p95LatencyMs: raw.p95_duration_ms,
          uniqueTraces: raw.unique_traces
        }
      }))
      
      // Aggregate operations per service (group by service_name)
      const serviceMap = new Map<string, ServiceTopology>()
      services.forEach(service => {
        const existing = serviceMap.get(service.service)
        if (existing) {
          // Merge operations and update metadata
          const mergedOperations = [...new Set([...existing.operations, ...service.operations])]
          // Keep the metadata from the service with more spans (more representative)
          const metadata = (service.metadata.totalSpans as number) > (existing.metadata.totalSpans as number) 
            ? service.metadata 
            : existing.metadata
          
          serviceMap.set(service.service, {
            ...existing,
            operations: mergedOperations,
            metadata
          })
        } else {
          serviceMap.set(service.service, service)
        }
      })
      
      const aggregatedServices = Array.from(serviceMap.values())
      
      // Discover critical paths
      const criticalPaths = discoverCriticalPaths(traceFlows)
      
      // Build data flows
      const dataFlows = buildDataFlows(dependencyData)
      
      // Infer application name from most common service prefix or domain
      const serviceNames = aggregatedServices.map(s => s.service)
      const applicationName = inferApplicationName(serviceNames)
      
      const architecture: ApplicationArchitecture = {
        applicationName,
        description: `Application discovered from trace analysis with ${aggregatedServices.length} services and ${dataFlows.length} data flows`,
        services: aggregatedServices,
        dataFlows,
        criticalPaths,
        generatedAt: new Date()
      }
      
      return architecture
    } catch (error) {
      return yield* _(Effect.fail({
        _tag: 'ConfigurationError' as const,
        message: `Failed to build topology: ${error instanceof Error ? error.message : 'Unknown error'}`
      }))
    }
  })

/**
 * Infer application name from service names
 */
const inferApplicationName = (serviceNames: string[]): string => {
  // Try to find common prefixes
  const prefixes = serviceNames
    .map(name => {
      const parts = name.split('-')[0]?.split('_')[0]?.split('.')[0]
      return parts || ''
    })
    .filter(prefix => prefix.length > 2)
  
  const prefixCounts = prefixes.reduce((acc, prefix) => {
    acc[prefix] = (acc[prefix] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  
  const sortedPrefixes = Object.entries(prefixCounts)
    .sort(([,a], [,b]) => b - a)
  
  const mostCommonPrefix = sortedPrefixes[0]?.[0]
  const mostCommonCount = sortedPrefixes[0]?.[1] || 0
  
  if (mostCommonPrefix && mostCommonCount > 1) {
    return `${mostCommonPrefix.charAt(0).toUpperCase()}${mostCommonPrefix.slice(1)} Application`
  }
  
  return 'Microservices Application'
}

/**
 * Helper to identify service entry points (root services)
 */
export const identifyEntryPoints = (services: ServiceTopology[]): ServiceTopology[] => {
  return services.filter(service => 
    service.type === 'frontend' || 
    service.type === 'api' ||
    (service.metadata.rootSpans as number) > 0
  )
}

/**
 * Helper to identify leaf services (services that don't call others)
 */
export const identifyLeafServices = (services: ServiceTopology[]): ServiceTopology[] => {
  return services.filter(service => 
    service.dependencies.length === 0 ||
    service.type === 'database' ||
    service.type === 'cache' ||
    service.type === 'external'
  )
}