/**
 * Type-Safe API Client for Integration Tests
 *
 * Eliminates "as any" usage by providing properly typed API response handling
 * with comprehensive Schema validation using Effect-TS patterns.
 */

import { Schema, ParseResult } from '@effect/schema'
import {
  HealthCheckResponseSchema,
  TopologyResponseSchema,
  AnalysisResponseSchema,
  type HealthCheckResponse,
  type TopologyResponse,
  type AnalysisResponse
} from '../../types.js'

// API Error types
export type APIError =
  | { _tag: 'FetchError'; message: string; cause?: Error }
  | { _tag: 'ValidationError'; message: string; errors: readonly ParseResult.ParseIssue[] }
  | { _tag: 'HTTPError'; status: number; statusText: string; body?: string }

// Type-safe API client
export class TypedAPIClient {
  constructor(private baseUrl: string) {}

  // Type-safe health check
  async getHealthCheck(): Promise<HealthCheckResponse> {
    return this.makeRequest(
      `${this.baseUrl}/api/ai-analyzer/health`,
      { method: 'GET' },
      HealthCheckResponseSchema
    )
  }

  // Type-safe topology fetch
  async getTopology(timeRange: { startTime: string; endTime: string }): Promise<TopologyResponse> {
    return this.makeRequest(
      `${this.baseUrl}/api/ai-analyzer/topology`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeRange })
      },
      TopologyResponseSchema
    )
  }

  // Type-safe analysis request
  async getAnalysis(request: {
    type: 'architecture' | 'dataflow' | 'dependencies' | 'insights'
    timeRange: {
      startTime: string
      endTime: string
    }
    filters?: unknown
    config?: unknown
  }): Promise<AnalysisResponse> {
    return this.makeRequest(
      `${this.baseUrl}/api/ai-analyzer/analyze`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      },
      AnalysisResponseSchema
    )
  }

  // Generic type-safe request handler
  private async makeRequest<T>(
    url: string,
    init: RequestInit,
    schema: Schema.Schema<T>
  ): Promise<T> {
    try {
      const response = await fetch(url, init)

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unknown error')
        throw {
          _tag: 'HTTPError' as const,
          status: response.status,
          statusText: response.statusText,
          body: errorBody
        }
      }

      const rawData = await response.json()

      // Use Effect Schema validation for comprehensive type checking
      const parseResult = Schema.decodeUnknownEither(schema)(rawData)

      if (parseResult._tag === 'Left') {
        throw {
          _tag: 'ValidationError' as const,
          message: `Schema validation failed for response`,
          errors: parseResult.left.issue ? [parseResult.left.issue] : []
        }
      }

      return parseResult.right
    } catch (error) {
      if (error && typeof error === 'object' && '_tag' in error) {
        throw error // Re-throw our typed errors
      }

      throw {
        _tag: 'FetchError' as const,
        message: error instanceof Error ? error.message : 'Unknown fetch error',
        cause: error instanceof Error ? error : undefined
      }
    }
  }
}

// Utility function to wait for telemetry data with proper typing
export async function waitForTelemetryData(
  client: TypedAPIClient,
  minServices = 5,
  maxWaitMs = 20000
): Promise<TopologyResponse> {
  const startWait = Date.now()

  while (Date.now() - startWait < maxWaitMs) {
    try {
      const endTime = new Date()
      const startTime = new Date(endTime.getTime() - 2 * 60 * 60 * 1000)

      const topology = await client.getTopology({
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString()
      })

      if (topology.length >= minServices) {
        console.log(`✅ Found ${topology.length} services - sufficient data available`)
        return topology
      }

      // Wait 2 seconds before retry
      await new Promise((resolve) => setTimeout(resolve, 2000))
    } catch (error) {
      // Continue waiting on errors
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }

  // Final attempt with extended time range
  const endTime = new Date()
  const startTime = new Date(endTime.getTime() - 4 * 60 * 60 * 1000) // Expand to 4 hours

  const topology = await client.getTopology({
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString()
  })

  console.log(`⚠️ Final attempt: Found ${topology.length} services after ${maxWaitMs}ms wait`)
  return topology
}

// Utility function to wait for architecture analysis data with proper typing
export async function waitForArchitectureData(
  client: TypedAPIClient,
  minSpans = 50,
  maxWaitMs = 15000
): Promise<AnalysisResponse> {
  const startWait = Date.now()

  while (Date.now() - startWait < maxWaitMs) {
    try {
      const endTime = new Date()
      const startTime = new Date(endTime.getTime() - 2 * 60 * 60 * 1000)

      const analysis = await client.getAnalysis({
        type: 'architecture',
        timeRange: {
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString()
        }
      })

      const analyzedSpans =
        typeof analysis.metadata.analyzedSpans === 'string'
          ? parseInt(analysis.metadata.analyzedSpans, 10)
          : analysis.metadata.analyzedSpans

      // Type guard to ensure architecture.services is an array
      const services = analysis.architecture?.services
      const serviceCount = Array.isArray(services) ? services.length : 0

      if (analyzedSpans >= minSpans && serviceCount > 0) {
        console.log(`✅ Found ${analyzedSpans} spans and ${serviceCount} services`)
        return analysis
      }

      // Wait 2 seconds before retry
      await new Promise((resolve) => setTimeout(resolve, 2000))
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }

  // Final attempt with extended time range
  const endTime = new Date()
  const startTime = new Date(endTime.getTime() - 4 * 60 * 60 * 1000)

  const analysis = await client.getAnalysis({
    type: 'architecture',
    timeRange: {
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString()
    }
  })

  const analyzedSpans =
    typeof analysis.metadata.analyzedSpans === 'string'
      ? parseInt(analysis.metadata.analyzedSpans, 10)
      : analysis.metadata.analyzedSpans

  // Type guard for final attempt logging
  const finalServices = analysis.architecture?.services
  const finalServiceCount = Array.isArray(finalServices) ? finalServices.length : 0

  console.log(`⚠️ Final attempt: ${analyzedSpans} spans, ${finalServiceCount} services`)
  return analysis
}

// Type guard utilities for safe property access
export function isValidServiceMetadata(metadata: unknown): metadata is {
  avgLatencyMs?: number
  errorRate?: number
  totalSpans?: number | string
  throughput?: number
  dependencies?: number
} {
  if (!metadata || typeof metadata !== 'object') return false

  const keys = ['avgLatencyMs', 'errorRate', 'totalSpans', 'throughput', 'dependencies']
  const metaObj = metadata as Record<string, unknown>

  return keys.every(
    (key) =>
      !(key in metaObj) ||
      typeof metaObj[key] === 'number' ||
      (key === 'totalSpans' && typeof metaObj[key] === 'string')
  )
}

// Safe number parsing for BigInt strings
export function parseSpanCount(value: number | string): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    // Handle comma-separated BigInt strings
    const cleaned = value.replace(/,/g, '')
    const parsed = parseInt(cleaned, 10)
    if (isNaN(parsed)) throw new Error(`Cannot parse span count: ${value}`)
    return parsed
  }
  throw new Error(`Invalid span count type: ${typeof value}`)
}
