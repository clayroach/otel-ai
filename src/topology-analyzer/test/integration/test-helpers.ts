/**
 * Temporary helpers for integration tests during TypeScript migration
 */

import { Effect } from 'effect'

interface TopologyService {
  serviceName: string
  dependencies: string[]
  metadata: Record<string, unknown>
}

// Helper functions to replace the complex API client integration
export const waitForTelemetryData = async (
  minServices = 5,
  maxWaitMs = 20000
): Promise<TopologyService[]> => {
  const startWait = Date.now()
  const API_BASE_URL = process.env.API_URL || 'http://localhost:4319'

  while (Date.now() - startWait < maxWaitMs) {
    try {
      const endTime = new Date()
      const startTime = new Date(endTime.getTime() - 2 * 60 * 60 * 1000)

      const response = await fetch(`${API_BASE_URL}/api/ai-analyzer/topology`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeRange: {
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString()
          }
        })
      })

      if (response.ok) {
        const topology = (await response.json()) as TopologyService[]
        if (Array.isArray(topology) && topology.length >= minServices) {
          console.log(`✅ Found ${topology.length} services - sufficient data available`)
          return topology
        }
      }

      // Wait 2 seconds before retry
      await Effect.runPromise(Effect.sleep(2000))
    } catch (error) {
      // Continue waiting on errors
      await Effect.runPromise(Effect.sleep(2000))
    }
  }

  // Final attempt - return whatever data we have
  const endTime = new Date()
  const startTime = new Date(endTime.getTime() - 4 * 60 * 60 * 1000) // Expand to 4 hours

  const response = await fetch(`${API_BASE_URL}/api/ai-analyzer/topology`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timeRange: {
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString()
      }
    })
  })

  if (response.ok) {
    const topology = (await response.json()) as TopologyService[]
    console.log(`⚠️ Final attempt: Found ${topology.length} services after ${maxWaitMs}ms wait`)
    return topology
  }

  throw new Error(`Failed to get topology data after ${maxWaitMs}ms`)
}

interface ArchitectureAnalysis {
  architecture: {
    services: Array<{
      serviceName: string
      dependencies: string[]
      metadata: Record<string, unknown>
    }>
  }
  metadata: {
    analyzedSpans: string | number
  }
}

export const waitForArchitectureData = async (
  minSpans = 50,
  maxWaitMs = 15000
): Promise<ArchitectureAnalysis> => {
  const startWait = Date.now()
  const API_BASE_URL = process.env.API_URL || 'http://localhost:4319'

  while (Date.now() - startWait < maxWaitMs) {
    try {
      const endTime = new Date()
      const startTime = new Date(endTime.getTime() - 2 * 60 * 60 * 1000)

      const response = await fetch(`${API_BASE_URL}/api/ai-analyzer/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'architecture',
          timeRange: {
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString()
          }
        })
      })

      if (response.ok) {
        const analysis = (await response.json()) as ArchitectureAnalysis
        // TypeScript comment: analysis could have undefined or null properties
        const spanCount =
          typeof analysis?.metadata?.analyzedSpans === 'string'
            ? parseInt(analysis.metadata.analyzedSpans, 10)
            : analysis?.metadata?.analyzedSpans || 0
        if (spanCount >= minSpans && analysis?.architecture?.services?.length > 0) {
          console.log(
            `✅ Found ${analysis.metadata.analyzedSpans} spans and ${analysis.architecture.services.length} services`
          )
          return analysis
        }
      }

      // Wait 2 seconds before retry
      await Effect.runPromise(Effect.sleep(2000))
    } catch (error) {
      await Effect.runPromise(Effect.sleep(2000))
    }
  }

  // Final attempt with extended time range
  const endTime = new Date()
  const startTime = new Date(endTime.getTime() - 4 * 60 * 60 * 1000)

  const response = await fetch(`${API_BASE_URL}/api/ai-analyzer/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'architecture',
      timeRange: {
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString()
      }
    })
  })

  if (response.ok) {
    const analysis = (await response.json()) as ArchitectureAnalysis
    // TypeScript comment: using structured type instead of any
    console.log(
      `⚠️ Final attempt: ${analysis?.metadata?.analyzedSpans || 0} spans, ${analysis?.architecture?.services?.length || 0} services`
    )
    return analysis
  }

  throw new Error(`Failed to get architecture data after ${maxWaitMs}ms`)
}

export const isValidServiceMetadata = (metadata: unknown): boolean => {
  // TypeScript: metadata could be null or undefined
  return (
    metadata !== null &&
    metadata !== undefined &&
    typeof metadata === 'object' &&
    'avgLatencyMs' in metadata &&
    'errorRate' in metadata &&
    typeof (metadata as Record<string, unknown>).avgLatencyMs === 'number' &&
    typeof (metadata as Record<string, unknown>).errorRate === 'number'
  )
}

export const parseSpanCount = (spanCount: string | number): number => {
  if (typeof spanCount === 'number') return spanCount
  const parsed = parseInt(spanCount, 10)
  return isNaN(parsed) ? 0 : parsed
}

// Re-export shared ClickHouse health check utilities
export {
  checkClickHouseHealth,
  ensureClickHouseRunning,
  waitForClickHouse
} from '../../../test-helpers/clickhouse-health.js'
