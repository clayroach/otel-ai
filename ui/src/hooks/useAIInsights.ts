/**
 * React Query hooks for AI Insights API
 */

import { useQuery } from '@tanstack/react-query'
import { discoverCriticalPaths, checkHealth } from '../services/ai-insights'

export interface TimeRange {
  startTime: Date
  endTime: Date
}

/**
 * Hook to discover critical paths using LLM analysis
 *
 * @param timeRange - Time range for topology analysis
 * @param timeRangeKey - Stable string key for the time range (e.g., '1h', '24h') to prevent unnecessary refetches
 * @param enabled - Whether to enable the query (default: true - fetch once and cache)
 */
export function useCriticalPaths(timeRange: TimeRange, timeRangeKey: string, enabled = true) {
  return useQuery({
    queryKey: [
      'ai-insights',
      'critical-paths',
      timeRangeKey // Use stable string key instead of Date objects
    ],
    queryFn: () =>
      discoverCriticalPaths({
        startTime: timeRange.startTime.toISOString(),
        endTime: timeRange.endTime.toISOString()
      }),
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes - data is fresh for 5 min, then refetch on mount
    gcTime: 30 * 60 * 1000, // Keep in memory for 30 min
    refetchOnWindowFocus: false, // Don't refetch when user returns to tab
    refetchOnReconnect: false, // Don't refetch on network reconnect
    retry: 1,
    retryDelay: 1000
  })
}

/**
 * Hook to check AI Insights service health
 */
export function useAIInsightsHealth() {
  return useQuery({
    queryKey: ['ai-insights', 'health'],
    queryFn: checkHealth,
    staleTime: 60 * 1000, // 1 minute
    retry: false
  })
}
