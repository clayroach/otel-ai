/**
 * Statistical Path Discovery
 *
 * Fallback mechanism when LLM fails. Uses graph analysis and statistics
 * to identify critical paths without AI.
 */

import { ServiceMetrics } from '../types.js'

/**
 * Statistical path discovery (fallback when LLM fails)
 *
 * Uses graph analysis to identify high-traffic, high-impact paths
 * Based purely on metrics, no LLM involved.
 */
export function statisticalPathDiscovery(topology: ReadonlyArray<ServiceMetrics>): Array<{
  name: string
  description: string
  services: string[]
  priority: 'critical' | 'high' | 'medium' | 'low'
  severity: number
}> {
  console.log('📊 Using statistical path discovery (no LLM)')

  // Build dependency graph
  const graph = new Map<string, Set<string>>()
  topology.forEach((service) => {
    graph.set(service.serviceName, new Set())
    service.dependencies.forEach((dep) => {
      graph.get(service.serviceName)?.add(dep.targetService)
    })
  })

  // Find entry points (services with no incoming dependencies)
  const allTargets = new Set(topology.flatMap((s) => s.dependencies.map((d) => d.targetService)))
  const entryPoints = topology
    .filter((s) => !allTargets.has(s.serviceName))
    .sort((a, b) => b.callCount - a.callCount)
    .slice(0, 5) // Top 5 entry points

  const paths: Array<{
    name: string
    description: string
    services: string[]
    priority: 'critical' | 'high' | 'medium' | 'low'
    severity: number
  }> = []

  // For each entry point, trace the highest-traffic path
  entryPoints.forEach((entry, index) => {
    const path: string[] = [entry.serviceName]
    let current = entry.serviceName
    const visited = new Set<string>([current])

    // Follow the highest-traffic dependency chain
    while (true) {
      const currentDeps = graph.get(current)
      if (!currentDeps || currentDeps.size === 0) break

      const nextServices = Array.from(currentDeps).filter((s) => !visited.has(s))

      if (nextServices.length === 0) break

      // Find the dependency with highest call count
      const nextService = nextServices.reduce((best, service) => {
        const bestService = topology.find((s) => s.serviceName === best)
        const currentService = topology.find((s) => s.serviceName === service)

        if (!bestService) return service
        if (!currentService) return best

        return currentService.callCount > bestService.callCount ? service : best
      }, nextServices[0])

      if (!nextService) break

      path.push(nextService)
      visited.add(nextService)
      current = nextService

      // Prevent infinite loops
      if (path.length > 10) break
    }

    // Calculate metrics for this path
    const pathServices = path.map((name) => topology.find((s) => s.serviceName === name))
    const totalCalls = pathServices.reduce((sum, s) => sum + (s?.callCount || 0), 0)
    const avgErrorRate = pathServices.reduce((sum, s) => sum + (s?.errorRate || 0), 0) / path.length
    const avgLatency = pathServices.reduce((sum, s) => sum + (s?.avgLatency || 0), 0) / path.length

    // Determine priority based on metrics
    let priority: 'critical' | 'high' | 'medium' | 'low' = 'medium'
    let severity = 0.5

    if (totalCalls > 10000 && avgErrorRate > 0.01) {
      priority = 'critical'
      severity = 0.9
    } else if (totalCalls > 5000 || avgErrorRate > 0.05) {
      priority = 'high'
      severity = 0.7
    } else if (avgLatency > 1000) {
      priority = 'medium'
      severity = 0.6
    } else {
      priority = 'low'
      severity = 0.3
    }

    paths.push({
      name: `Path ${index + 1} (${entry.serviceName})`,
      description: `High-traffic path starting from ${entry.serviceName}`,
      services: path,
      priority,
      severity
    })
  })

  console.log(`📊 Statistical discovery found ${paths.length} paths`)

  return paths
}

/**
 * Calculate metrics for a given path from topology data
 */
export function calculatePathMetrics(
  services: ReadonlyArray<string>,
  topology: ReadonlyArray<ServiceMetrics>
): {
  requestCount: number
  avgLatency: number
  errorRate: number
  p99Latency: number
} {
  const pathServices = services
    .map((name) => topology.find((s) => s.serviceName === name))
    .filter((s): s is ServiceMetrics => s !== undefined)

  if (pathServices.length === 0) {
    return {
      requestCount: 0,
      avgLatency: 0,
      errorRate: 0,
      p99Latency: 0
    }
  }

  // Request count: use the entry service's call count
  const requestCount = pathServices[0]?.callCount || 0

  // Average latency: sum of all services in the path
  const avgLatency = pathServices.reduce((sum, s) => sum + s.avgLatency, 0)

  // Error rate: highest error rate in the path (pessimistic)
  const errorRate = Math.max(...pathServices.map((s) => s.errorRate))

  // P99 latency: sum of P99 latencies (cumulative)
  const p99Latency = pathServices.reduce((sum, s) => sum + s.p99Latency, 0)

  return {
    requestCount,
    avgLatency,
    errorRate,
    p99Latency
  }
}
