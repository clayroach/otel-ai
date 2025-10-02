/**
 * React Query hooks for AI Insights API
 */

import { useQuery } from 'react-query'
import { discoverCriticalPaths, checkHealth } from '../services/ai-insights'

export interface TimeRange {
  startTime: Date
  endTime: Date
}

/**
 * Hook to discover critical paths using LLM analysis
 *
 * @param timeRange - Time range for topology analysis
 * @param enabled - Whether to enable the query (default: true)
 */
export function useCriticalPaths(timeRange: TimeRange, enabled = true) {
  return useQuery(
    [
      'ai-insights',
      'critical-paths',
      timeRange.startTime.toISOString(),
      timeRange.endTime.toISOString()
    ],
    () =>
      discoverCriticalPaths({
        startTime: timeRange.startTime.toISOString(),
        endTime: timeRange.endTime.toISOString()
      }),
    {
      enabled,
      staleTime: 5 * 60 * 1000, // 5 minutes - LLM results are expensive
      cacheTime: 30 * 60 * 1000, // 30 minutes cache
      retry: 1, // Only retry once for LLM calls
      retryDelay: 1000
    }
  )
}

/**
 * Hook to check AI Insights service health
 */
export function useAIInsightsHealth() {
  return useQuery(['ai-insights', 'health'], checkHealth, {
    staleTime: 60 * 1000, // 1 minute
    retry: false
  })
}
