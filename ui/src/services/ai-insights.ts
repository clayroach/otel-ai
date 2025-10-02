/**
 * AI Insights API Service
 *
 * Client for ai-insights backend endpoints
 */

import type { CriticalPath } from '../components/ServiceTopology/types'

const API_BASE = 'http://localhost:4319'

export interface CriticalPathsRequest {
  startTime: string // ISO 8601
  endTime: string // ISO 8601
}

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

/**
 * Discover critical paths from service topology using LLM analysis
 */
export async function discoverCriticalPaths(
  request: CriticalPathsRequest
): Promise<CriticalPathsResponse> {
  const response = await fetch(`${API_BASE}/api/ai-insights/critical-paths`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(request)
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to discover critical paths')
  }

  return response.json()
}

/**
 * Check AI Insights service health
 */
export async function checkHealth(): Promise<{
  status: string
  service: string
  timestamp: string
}> {
  const response = await fetch(`${API_BASE}/api/ai-insights/health`)

  if (!response.ok) {
    throw new Error('AI Insights service unhealthy')
  }

  return response.json()
}
