/**
 * React Query hooks for Service Topology API
 */

import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import type {
  ServiceNode,
  TopologyVisualizationData
} from '../components/ServiceTopology/ServiceTopologyGraph'

// Helper function to calculate node size based on request rate
const calculateNodeSize = (rate: number, maxRate: number): number => {
  const minSize = 20
  const maxSize = 60
  if (maxRate === 0) return minSize
  return minSize + (rate / maxRate) * (maxSize - minSize)
}

// Fetch and transform topology data
const fetchTopologyVisualization = async (
  timeRange?: [Date, Date]
): Promise<TopologyVisualizationData> => {
  const params: { startTime?: string; endTime?: string } = {}
  if (timeRange) {
    params.startTime = timeRange[0].toISOString()
    params.endTime = timeRange[1].toISOString()
  }

  const response = await axios.post('http://localhost:4319/api/topology/visualization', {
    timeRange: params
  })

  if (!response.data) {
    throw new Error('No topology data received')
  }

  // Calculate max rate for node sizing
  const maxRate = response.data.nodes
    ? Math.max(...response.data.nodes.map((n: ServiceNode) => n.metrics?.rate || 0))
    : 100

  // Transform backend data to match our expected structure
  return {
    ...response.data,
    nodes:
      response.data.nodes?.map((node: ServiceNode) => ({
        ...node,
        symbolSize: calculateNodeSize(node.metrics?.rate || 0, maxRate),
        metrics: node.metrics
          ? {
              rate: node.metrics.rate || 0,
              errorRate: node.metrics.errorRate || 0,
              duration: node.metrics.duration || 0,
              spanCount: node.metrics.spanCount || Math.floor(node.metrics.rate * 60 * 5) || 1000,
              rateStatus: node.metrics.rate < 1 ? 1 : node.metrics.rate > 200 ? 1 : 0,
              errorStatus: (() => {
                const serviceName = node.name?.toLowerCase() || ''
                if (serviceName.includes('payment') || serviceName.includes('checkout')) {
                  return node.metrics.errorRate > 0.5 ? 2 : node.metrics.errorRate > 0.1 ? 1 : 0
                } else if (serviceName.includes('recommendation') || serviceName.includes('ad')) {
                  return node.metrics.errorRate > 10 ? 2 : node.metrics.errorRate > 5 ? 1 : 0
                } else {
                  return node.metrics.errorRate > 5 ? 2 : node.metrics.errorRate > 1 ? 1 : 0
                }
              })(),
              durationStatus: (() => {
                const serviceName = node.name?.toLowerCase() || ''
                if (serviceName.includes('database') || serviceName.includes('redis')) {
                  return node.metrics.duration > 50 ? 2 : node.metrics.duration > 20 ? 1 : 0
                } else if (serviceName.includes('frontend') || serviceName.includes('ui')) {
                  return node.metrics.duration > 1000 ? 2 : node.metrics.duration > 500 ? 1 : 0
                } else {
                  return node.metrics.duration > 500 ? 2 : node.metrics.duration > 200 ? 1 : 0
                }
              })(),
              otelStatus: node.metrics.spanCount < 100 ? 1 : 0
            }
          : {
              rate: 0,
              errorRate: 0,
              duration: 0,
              spanCount: 0,
              rateStatus: 0,
              errorStatus: 0,
              durationStatus: 0,
              otelStatus: 0
            }
      })) || []
  }
}

/**
 * Hook to fetch service topology visualization data
 *
 * @param timeRange - Time range for topology query
 * @param timeRangeKey - Stable string key for the time range
 * @param enabled - Whether to enable the query (default: true)
 * @param refetchInterval - Auto-refresh interval in ms (false to disable)
 */
export function useServiceTopology(
  timeRange?: [Date, Date],
  timeRangeKey?: string,
  enabled = true,
  refetchInterval: number | false = false
) {
  return useQuery({
    queryKey: ['topology', 'visualization', timeRangeKey || 'default'],
    queryFn: () => fetchTopologyVisualization(timeRange),
    enabled,
    staleTime: Infinity, // Never auto-refetch (only manual via Analyze button or interval)
    gcTime: 30 * 60 * 1000, // Keep in memory for 30 min
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchInterval, // Support auto-refresh if enabled
    retry: 1,
    retryDelay: 1000
  })
}
