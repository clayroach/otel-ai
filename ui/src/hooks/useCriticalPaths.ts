/**
 * React Query hooks for Critical Paths
 *
 * Provides type-safe data fetching with caching, loading states, and error handling.
 */

import { useQuery, UseQueryOptions } from '@tanstack/react-query'
import {
  getCriticalPaths,
  checkHealth,
  type CriticalPath,
  type CriticalPathsRequest,
  type CriticalPathsResponse
} from '../api/critical-paths'

/**
 * Query key factory for critical paths
 */
export const criticalPathsKeys = {
  all: ['critical-paths'] as const,
  lists: () => [...criticalPathsKeys.all, 'list'] as const,
  list: (params: CriticalPathsRequest) => [...criticalPathsKeys.lists(), params] as const,
  health: () => [...criticalPathsKeys.all, 'health'] as const
}

/**
 * Hook to fetch critical paths for a time range
 *
 * @example
 * ```tsx
 * const { data, isLoading, error } = useCriticalPaths({
 *   startTime: '2024-01-01T00:00:00Z',
 *   endTime: '2024-01-01T01:00:00Z'
 * })
 * ```
 */
export function useCriticalPaths(
  params: CriticalPathsRequest,
  options?: Omit<
    UseQueryOptions<CriticalPathsResponse, Error, CriticalPathsResponse>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery<CriticalPathsResponse, Error>({
    queryKey: criticalPathsKeys.list(params),
    queryFn: () => getCriticalPaths(params),
    staleTime: 60_000, // 1 minute - paths don't change that frequently
    gcTime: 5 * 60_000, // 5 minutes - cache for reasonable time
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    ...options
  })
}

/**
 * Hook to check AI Insights service health
 *
 * @example
 * ```tsx
 * const { data: health } = useCriticalPathsHealth()
 * if (health?.status === 'ok') { /* ... *\/ }
 * ```
 */
export function useCriticalPathsHealth(
  options?: Omit<
    UseQueryOptions<{ status: string; service: string; timestamp: string }, Error>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: criticalPathsKeys.health(),
    queryFn: checkHealth,
    staleTime: 30_000, // 30 seconds
    gcTime: 2 * 60_000, // 2 minutes
    retry: 1,
    ...options
  })
}

/**
 * Hook to get critical paths filtered by severity
 *
 * @example
 * ```tsx
 * const criticalOnly = useCriticalPathsBySeverity(paths, 0.7) // >= 70% severity
 * ```
 */
export function useCriticalPathsBySeverity(
  paths: CriticalPath[] | undefined,
  minSeverity: number
): CriticalPath[] {
  if (!paths) return []
  return paths.filter((path) => path.severity >= minSeverity)
}

/**
 * Hook to get critical paths for specific services
 *
 * @example
 * ```tsx
 * const paymentPaths = useCriticalPathsByService(paths, 'payment-service')
 * ```
 */
export function useCriticalPathsByService(
  paths: CriticalPath[] | undefined,
  serviceName: string
): CriticalPath[] {
  if (!paths) return []
  return paths.filter((path) => path.services.includes(serviceName))
}

/**
 * Hook to get critical paths by priority level
 *
 * @example
 * ```tsx
 * const criticalPaths = useCriticalPathsByPriority(paths, 'critical')
 * ```
 */
export function useCriticalPathsByPriority(
  paths: CriticalPath[] | undefined,
  priority: 'critical' | 'high' | 'medium' | 'low'
): CriticalPath[] {
  if (!paths) return []
  return paths.filter((path) => path.priority === priority)
}
