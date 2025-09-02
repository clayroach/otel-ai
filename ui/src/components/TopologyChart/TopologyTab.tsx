import React, { useState, useEffect } from 'react'
import { Spin, Alert, Empty, Button, message } from 'antd'
import PieNodeTopologyChart from './PieNodeTopologyChart'
import type { ServiceNode, TopologyVisualizationData } from './PieNodeTopologyChart'
import axios from 'axios'

interface TopologyTabProps {
  timeRange?: [Date, Date]
  autoRefresh?: boolean
  refreshInterval?: number
  data?: TopologyVisualizationData | null // Allow external data to be passed
  highlightedServices?: string[] // Services to highlight
  servicesWithTabs?: string[] // Services that have tabs open (show with neighbors)
  onServiceClick?: (serviceId: string) => void // Callback for service clicks
  selectedPaths?: Array<{
    id: string
    name: string
    services: string[]
    edges: Array<{ source: string; target: string }>
  }> // Selected critical paths for visualization
}

export const TopologyTab: React.FC<TopologyTabProps> = ({
  timeRange,
  autoRefresh = false,
  refreshInterval = 30000, // 30 seconds
  data: _data,
  highlightedServices = [],
  servicesWithTabs = [],
  onServiceClick,
  selectedPaths: _selectedPaths = []
}) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [topologyData, setTopologyData] = useState<TopologyVisualizationData | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
  const [_selectedNode, setSelectedNode] = useState<ServiceNode | null>(null)
  // const [lastUpdated, setLastUpdated] = useState<Date | null>(null) // Not currently used
  const [filteredHealthStatuses, setFilteredHealthStatuses] = useState<string[]>([])

  const fetchTopologyData = async () => {
    setLoading(true)
    setError(null)

    try {
      const params: { startTime?: string; endTime?: string } = {}
      if (timeRange) {
        params.startTime = timeRange[0].toISOString()
        params.endTime = timeRange[1].toISOString()
      }

      const response = await axios.post(
        'http://localhost:4319/api/ai-analyzer/topology-visualization',
        {
          timeRange: params
        }
      )

      if (response.data) {
        // Transform backend data to match our expected structure
        const transformedData = {
          ...response.data,
          nodes:
            response.data.nodes?.map((node: ServiceNode) => ({
              ...node,
              // Ensure metrics have the expected structure
              metrics: node.metrics
                ? {
                    rate: node.metrics.rate || 0,
                    errorRate: node.metrics.errorRate || 0,
                    duration: node.metrics.duration || 0,
                    spanCount:
                      node.metrics.spanCount || Math.floor(node.metrics.rate * 1000) || 1000,
                    // Calculate status based on service-specific thresholds
                    // Rate status: detect anomalies (too low or too high)
                    rateStatus: node.metrics.rate < 1 ? 1 : node.metrics.rate > 200 ? 1 : 0,
                    // Error status: stricter for critical services like payment
                    errorStatus: (() => {
                      const serviceName = node.name?.toLowerCase() || ''
                      if (serviceName.includes('payment') || serviceName.includes('checkout')) {
                        // Critical services: stricter thresholds
                        return node.metrics.errorRate > 0.5
                          ? 2
                          : node.metrics.errorRate > 0.1
                            ? 1
                            : 0
                      } else if (
                        serviceName.includes('recommendation') ||
                        serviceName.includes('ad')
                      ) {
                        // Non-critical services: more lenient
                        return node.metrics.errorRate > 10 ? 2 : node.metrics.errorRate > 5 ? 1 : 0
                      } else {
                        // Default thresholds
                        return node.metrics.errorRate > 5 ? 2 : node.metrics.errorRate > 1 ? 1 : 0
                      }
                    })(),
                    // Duration status: varies by service type
                    durationStatus: (() => {
                      const serviceName = node.name?.toLowerCase() || ''
                      if (serviceName.includes('database') || serviceName.includes('redis')) {
                        // Database services: expect fast responses
                        return node.metrics.duration > 50 ? 2 : node.metrics.duration > 20 ? 1 : 0
                      } else if (serviceName.includes('frontend') || serviceName.includes('ui')) {
                        // Frontend services: more lenient on latency
                        return node.metrics.duration > 1000
                          ? 2
                          : node.metrics.duration > 500
                            ? 1
                            : 0
                      } else {
                        // Backend services: standard thresholds
                        return node.metrics.duration > 500 ? 2 : node.metrics.duration > 200 ? 1 : 0
                      }
                    })(),
                    // OTel status: based on span count (detect collection issues)
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

        console.log('Transformed topology data:', transformedData)
        setTopologyData(transformedData)
        // setLastUpdated(new Date())
        message.success('Topology data updated successfully')
      }
    } catch (err) {
      console.error('Failed to fetch topology data:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch topology data'
      setError(errorMessage)

      // Use mock data as fallback
      setTopologyData(getMockTopologyData())
      message.warning('Using mock topology data for demonstration')
    } finally {
      setLoading(false)
    }
  }

  // Initial fetch
  useEffect(() => {
    fetchTopologyData()
  }, [timeRange])

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh && refreshInterval > 0) {
      const interval = setInterval(() => {
        fetchTopologyData()
      }, refreshInterval)

      return () => clearInterval(interval)
    }
  }, [autoRefresh, refreshInterval])

  const handleNodeClick = (node: ServiceNode) => {
    console.log('TopologyTab - Node clicked:', node)
    console.log('TopologyTab - onServiceClick prop exists?', !!onServiceClick)
    setSelectedNode(node)

    // Use the node.id which should be the clean service name
    // Fall back to extracting from name if id is not available
    const serviceName = node.id || node.name.replace(/^[^\s]+\s/, '')
    console.log('TopologyTab - Using service identifier:', serviceName)

    // Call the parent's onServiceClick callback if provided
    if (onServiceClick) {
      console.log('TopologyTab - Calling onServiceClick with:', serviceName)
      onServiceClick(serviceName)
    } else {
      console.log('TopologyTab - No onServiceClick callback provided!')
    }
  }

  const handleRefresh = () => {
    fetchTopologyData()
  }

  const handleHealthFilter = (status: string) => {
    if (status === '') {
      // Clear filter
      setFilteredHealthStatuses([])
    } else {
      // Toggle the status in the filter list
      setFilteredHealthStatuses((prev) => {
        if (prev.includes(status)) {
          return prev.filter((s) => s !== status)
        } else {
          return [...prev, status]
        }
      })
    }
  }

  if (loading && !topologyData) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" tip="Loading topology data..." />
      </div>
    )
  }

  if (error && !topologyData) {
    return (
      <Alert
        message="Error Loading Topology"
        description={error}
        type="error"
        showIcon
        action={
          <Button size="small" onClick={handleRefresh}>
            Try Again
          </Button>
        }
      />
    )
  }

  if (!topologyData) {
    return (
      <Empty description="No topology data available" image={Empty.PRESENTED_IMAGE_SIMPLE}>
        <Button type="primary" onClick={handleRefresh}>
          Load Topology
        </Button>
      </Empty>
    )
  }

  return (
    <div style={{ height: '100%' }}>
      {/* Action Bar - Removed Refresh button */}

      {/* Main Layout - Full width topology chart */}
      <div style={{ height: 'calc(100% - 50px)' }}>
        <PieNodeTopologyChart
          data={topologyData}
          onNodeClick={handleNodeClick}
          onHealthFilter={handleHealthFilter}
          height={600}
          filteredHealthStatuses={filteredHealthStatuses}
          highlightedServices={highlightedServices}
          servicesWithTabs={servicesWithTabs}
          filterMode="filter"
        />
      </div>
    </div>
  )
}

// Helper functions (commented out - not currently used)
// const getServiceType = (node: ServiceNode): string => {
//   // Try to infer from node properties or default to backend
//   if (node.name.includes('gateway')) return 'api'
//   if (
//     node.name.includes('database') ||
//     node.name.includes('postgres') ||
//     node.name.includes('mysql')
//   )
//     return 'database'
//   if (node.name.includes('redis') || node.name.includes('cache')) return 'cache'
//   if (node.name.includes('frontend') || node.name.includes('ui')) return 'frontend'
//   if (node.name.includes('queue') || node.name.includes('kafka')) return 'queue'
//   return 'backend'
// }

// const getHealthStatus = (color: string): string => {
//   switch (color) {
//     case '#52c41a':
//       return 'healthy'
//     case '#faad14':
//       return 'warning'
//     case '#fa8c16':
//       return 'degraded'
//     case '#f5222d':
//       return 'critical'
//     case '#262626':
//       return 'unavailable'
//     default:
//       return 'unknown'
//   }
// }

// Mock data generator for demonstration
const getMockTopologyData = (): TopologyVisualizationData => {
  return {
    nodes: [
      // Frontend service
      {
        id: 'frontend',
        name: 'frontend',
        category: 'javascript',
        symbolSize: 50,
        itemStyle: { color: '#52c41a' },
        label: { show: true },
        metrics: {
          rate: 45.2,
          errorRate: 0.5,
          duration: 120,
          spanCount: 15420,
          rateStatus: 0,
          errorStatus: 0,
          durationStatus: 0,
          otelStatus: 0
        }
      },
      // Checkout Flow services
      {
        id: 'cartservice',
        name: 'cartservice',
        category: 'csharp',
        symbolSize: 45,
        itemStyle: { color: '#52c41a' },
        label: { show: true },
        metrics: {
          rate: 78.3,
          errorRate: 0.3,
          duration: 85,
          spanCount: 21450,
          rateStatus: 0,
          errorStatus: 0,
          durationStatus: 0,
          otelStatus: 0
        }
      },
      {
        id: 'checkoutservice',
        name: 'checkoutservice',
        category: 'go',
        symbolSize: 48,
        itemStyle: { color: '#faad14' },
        label: { show: true },
        metrics: {
          rate: 32.5,
          errorRate: 1.2,
          duration: 250,
          spanCount: 8920,
          rateStatus: 0,
          errorStatus: 1,
          durationStatus: 1,
          otelStatus: 0
        }
      },
      {
        id: 'paymentservice',
        name: 'paymentservice',
        category: 'nodejs',
        symbolSize: 40,
        itemStyle: { color: '#f5222d' },
        label: { show: true },
        metrics: {
          rate: 25.8,
          errorRate: 8.5,
          duration: 450,
          spanCount: 7080,
          rateStatus: 0,
          errorStatus: 2,
          durationStatus: 1,
          otelStatus: 0
        }
      },
      {
        id: 'emailservice',
        name: 'emailservice',
        category: 'python',
        symbolSize: 38,
        itemStyle: { color: '#52c41a' },
        label: { show: true },
        metrics: {
          rate: 18.2,
          errorRate: 0.1,
          duration: 95,
          spanCount: 4990,
          rateStatus: 0,
          errorStatus: 0,
          durationStatus: 0,
          otelStatus: 0
        }
      },
      // Product Search services
      {
        id: 'productcatalogservice',
        name: 'productcatalogservice',
        category: 'go',
        symbolSize: 46,
        itemStyle: { color: '#52c41a' },
        label: { show: true },
        metrics: {
          rate: 125.5,
          errorRate: 0.2,
          duration: 35,
          spanCount: 34400,
          rateStatus: 0,
          errorStatus: 0,
          durationStatus: 0,
          otelStatus: 0
        }
      },
      {
        id: 'recommendationservice',
        name: 'recommendationservice',
        category: 'python',
        symbolSize: 42,
        itemStyle: { color: '#faad14' },
        label: { show: true },
        metrics: {
          rate: 89.3,
          errorRate: 2.8,
          duration: 380,
          spanCount: 24480,
          rateStatus: 0,
          errorStatus: 1,
          durationStatus: 1,
          otelStatus: 0
        }
      },
      {
        id: 'adservice',
        name: 'adservice',
        category: 'java',
        symbolSize: 40,
        itemStyle: { color: '#52c41a' },
        label: { show: true },
        metrics: {
          rate: 156.8,
          errorRate: 0.5,
          duration: 22,
          spanCount: 42990,
          rateStatus: 0,
          errorStatus: 0,
          durationStatus: 0,
          otelStatus: 0
        }
      },
      // User Authentication services
      {
        id: 'authservice',
        name: 'authservice',
        category: 'rust',
        symbolSize: 44,
        itemStyle: { color: '#52c41a' },
        label: { show: true },
        metrics: {
          rate: 67.2,
          errorRate: 0.8,
          duration: 55,
          spanCount: 18420,
          rateStatus: 0,
          errorStatus: 0,
          durationStatus: 0,
          otelStatus: 0
        }
      },
      {
        id: 'sessionservice',
        name: 'sessionservice',
        category: 'redis',
        symbolSize: 38,
        itemStyle: { color: '#52c41a' },
        label: { show: true },
        metrics: {
          rate: 245.5,
          errorRate: 0.01,
          duration: 3,
          spanCount: 67260,
          rateStatus: 0,
          errorStatus: 0,
          durationStatus: 0,
          otelStatus: 0
        }
      },
      {
        id: 'userservice',
        name: 'userservice',
        category: 'nodejs',
        symbolSize: 45,
        itemStyle: { color: '#52c41a' },
        label: { show: true },
        metrics: {
          rate: 85.3,
          errorRate: 0.4,
          duration: 125,
          spanCount: 23380,
          rateStatus: 0,
          errorStatus: 0,
          durationStatus: 0,
          otelStatus: 0
        }
      },
      // Shipping services
      {
        id: 'shippingservice',
        name: 'shippingservice',
        category: 'rust',
        symbolSize: 41,
        itemStyle: { color: '#f5222d' },
        label: { show: true },
        metrics: {
          rate: 12.3,
          errorRate: 5.2,
          duration: 1850,
          spanCount: 3370,
          rateStatus: 0,
          errorStatus: 2,
          durationStatus: 2,
          otelStatus: 0
        }
      },
      {
        id: 'currencyservice',
        name: 'currencyservice',
        category: 'nodejs',
        symbolSize: 36,
        itemStyle: { color: '#52c41a' },
        label: { show: true },
        metrics: {
          rate: 342.1,
          errorRate: 0.02,
          duration: 8,
          spanCount: 93810,
          rateStatus: 0,
          errorStatus: 0,
          durationStatus: 0,
          otelStatus: 0
        }
      },
      // Background services
      {
        id: 'inventoryservice',
        name: 'inventoryservice',
        category: 'java',
        symbolSize: 43,
        itemStyle: { color: '#52c41a' },
        label: { show: true },
        metrics: {
          rate: 8.5,
          errorRate: 0.1,
          duration: 2200,
          spanCount: 2330,
          rateStatus: 0,
          errorStatus: 0,
          durationStatus: 1,
          otelStatus: 0
        }
      },
      {
        id: 'notificationservice',
        name: 'notificationservice',
        category: 'python',
        symbolSize: 37,
        itemStyle: { color: '#52c41a' },
        label: { show: true },
        metrics: {
          rate: 22.7,
          errorRate: 0.3,
          duration: 145,
          spanCount: 6220,
          rateStatus: 0,
          errorStatus: 0,
          durationStatus: 0,
          otelStatus: 0
        }
      },
      // Data stores
      {
        id: 'postgres',
        name: 'postgres',
        category: 'postgresql',
        symbolSize: 55,
        itemStyle: { color: '#52c41a' },
        label: { show: true },
        metrics: {
          rate: 450.0,
          errorRate: 0.1,
          duration: 15,
          spanCount: 125000,
          rateStatus: 0,
          errorStatus: 0,
          durationStatus: 0,
          otelStatus: 0
        }
      },
      {
        id: 'redis',
        name: 'redis',
        category: 'redis',
        symbolSize: 35,
        itemStyle: { color: '#52c41a' },
        label: { show: true },
        metrics: {
          rate: 850.5,
          errorRate: 0.01,
          duration: 2,
          spanCount: 235000,
          rateStatus: 0,
          errorStatus: 0,
          durationStatus: 0,
          otelStatus: 0
        }
      }
    ],
    edges: [
      // Checkout Flow edges
      {
        source: 'frontend',
        target: 'cartservice',
        value: 80,
        lineStyle: { width: 3, color: '#52c41a' }
      },
      {
        source: 'frontend',
        target: 'checkoutservice',
        value: 60,
        lineStyle: { width: 3, color: '#faad14' }
      },
      {
        source: 'checkoutservice',
        target: 'paymentservice',
        value: 50,
        lineStyle: { width: 2, color: '#f5222d' }
      },
      {
        source: 'checkoutservice',
        target: 'emailservice',
        value: 45,
        lineStyle: { width: 2, color: '#52c41a' }
      },
      {
        source: 'checkoutservice',
        target: 'shippingservice',
        value: 40,
        lineStyle: { width: 2, color: '#faad14' }
      },

      // Product Search edges
      {
        source: 'frontend',
        target: 'productcatalogservice',
        value: 120,
        lineStyle: { width: 3, color: '#52c41a' }
      },
      {
        source: 'frontend',
        target: 'recommendationservice',
        value: 90,
        lineStyle: { width: 3, color: '#faad14' }
      },
      {
        source: 'recommendationservice',
        target: 'productcatalogservice',
        value: 85,
        lineStyle: { width: 2, color: '#faad14' }
      },
      {
        source: 'frontend',
        target: 'adservice',
        value: 150,
        lineStyle: { width: 3, color: '#52c41a' }
      },

      // User Authentication edges
      {
        source: 'frontend',
        target: 'authservice',
        value: 70,
        lineStyle: { width: 3, color: '#52c41a' }
      },
      {
        source: 'authservice',
        target: 'userservice',
        value: 65,
        lineStyle: { width: 2, color: '#52c41a' }
      },
      {
        source: 'authservice',
        target: 'sessionservice',
        value: 68,
        lineStyle: { width: 2, color: '#52c41a' }
      },

      // Shipping Calculator edges
      {
        source: 'shippingservice',
        target: 'currencyservice',
        value: 35,
        lineStyle: { width: 2, color: '#52c41a' }
      },

      // Inventory Update edges
      {
        source: 'inventoryservice',
        target: 'productcatalogservice',
        value: 15,
        lineStyle: { width: 2, color: '#52c41a' }
      },
      {
        source: 'inventoryservice',
        target: 'notificationservice',
        value: 12,
        lineStyle: { width: 2, color: '#52c41a' }
      },

      // Database connections
      {
        source: 'userservice',
        target: 'postgres',
        value: 85,
        lineStyle: { width: 3, color: '#52c41a' }
      },
      {
        source: 'productcatalogservice',
        target: 'postgres',
        value: 125,
        lineStyle: { width: 3, color: '#52c41a' }
      },
      {
        source: 'cartservice',
        target: 'redis',
        value: 78,
        lineStyle: { width: 3, color: '#52c41a' }
      },
      {
        source: 'sessionservice',
        target: 'redis',
        value: 245,
        lineStyle: { width: 4, color: '#52c41a' }
      },
      {
        source: 'paymentservice',
        target: 'postgres',
        value: 25,
        lineStyle: { width: 2, color: '#f5222d' }
      },
      {
        source: 'checkoutservice',
        target: 'postgres',
        value: 32,
        lineStyle: { width: 2, color: '#faad14' }
      }
    ],
    runtimeEnvironments: ['javascript', 'go', 'java', 'python', 'postgresql', 'redis'],
    healthSummary: {
      healthy: 4,
      warning: 1,
      degraded: 0,
      critical: 1,
      unavailable: 0
    }
  }
}

export default TopologyTab
