/**
 * Critical Paths API Client
 *
 * Type-safe client for the AI Insights critical path discovery API.
 * Integrates with Phase 1 backend (ai-insights package).
 */

/**
 * Critical Path type matching backend schema
 */
export interface CriticalPath {
  id: string
  name: string
  description?: string
  services: string[]
  startService: string
  endService: string
  edges: Array<{
    source: string
    target: string
  }>
  metrics: {
    requestCount: number
    avgLatency: number
    errorRate: number
    p99Latency: number
  }
  priority: 'critical' | 'high' | 'medium' | 'low'
  severity: number // 0-1 score
  lastUpdated: string
  metadata?: Record<string, unknown>
}

/**
 * API request types
 */
export interface CriticalPathsRequest {
  startTime: string // ISO 8601 timestamp
  endTime: string // ISO 8601 timestamp
}

/**
 * API response types
 */
export interface CriticalPathsResponse {
  paths: CriticalPath[]
  metadata: {
    discoveredBy: 'llm' | 'statistical'
    model: string
    executionTimeMs: number
    topologyServicesCount: number
    pathsDiscovered: number
  }
}

export interface CriticalPathsError {
  error: string
  message: string
  cause?: unknown
}

/**
 * Get critical paths for a time range
 */
export async function getCriticalPaths(
  params: CriticalPathsRequest
): Promise<CriticalPathsResponse> {
  const response = await fetch('/api/ai-insights/critical-paths', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params)
  })

  if (!response.ok) {
    const error: CriticalPathsError = await response.json()
    throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Health check for AI Insights service
 */
export async function checkHealth(): Promise<{
  status: string
  service: string
  timestamp: string
}> {
  const response = await fetch('/api/ai-insights/health')

  if (!response.ok) {
    throw new Error(`Health check failed: ${response.statusText}`)
  }

  return response.json()
}
