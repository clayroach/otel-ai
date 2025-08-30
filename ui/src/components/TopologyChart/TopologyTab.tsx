import React, { useState, useEffect } from 'react'
import { Row, Col, Spin, Alert, Empty, Button, Space, message } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import PieNodeTopologyChart from './PieNodeTopologyChart'
import EnhancedServiceDetailsPanel from './EnhancedServiceDetailsPanel'
import type { ServiceNode, TopologyVisualizationData } from './PieNodeTopologyChart'
import axios from 'axios'

interface TopologyTabProps {
  timeRange?: [Date, Date]
  autoRefresh?: boolean
  refreshInterval?: number
}

export const TopologyTab: React.FC<TopologyTabProps> = ({ 
  timeRange,
  autoRefresh = false,
  refreshInterval = 30000 // 30 seconds
}) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [topologyData, setTopologyData] = useState<TopologyVisualizationData | null>(null)
  const [selectedNode, setSelectedNode] = useState<ServiceNode | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
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
          nodes: response.data.nodes?.map((node: ServiceNode) => ({
            ...node,
            // Ensure metrics have the expected structure
            metrics: node.metrics ? {
              rate: node.metrics.rate || 0,
              errorRate: node.metrics.errorRate || 0,
              duration: node.metrics.duration || 0,
              spanCount: node.metrics.spanCount || Math.floor(node.metrics.rate * 1000) || 1000,
              // Calculate status based on service-specific thresholds
              // Rate status: detect anomalies (too low or too high)
              rateStatus: node.metrics.rate < 1 ? 1 : node.metrics.rate > 200 ? 1 : 0,
              // Error status: stricter for critical services like payment
              errorStatus: (() => {
                const serviceName = node.name?.toLowerCase() || ''
                if (serviceName.includes('payment') || serviceName.includes('checkout')) {
                  // Critical services: stricter thresholds
                  return node.metrics.errorRate > 0.5 ? 2 : node.metrics.errorRate > 0.1 ? 1 : 0
                } else if (serviceName.includes('recommendation') || serviceName.includes('ad')) {
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
                  return node.metrics.duration > 1000 ? 2 : node.metrics.duration > 500 ? 1 : 0
                } else {
                  // Backend services: standard thresholds
                  return node.metrics.duration > 500 ? 2 : node.metrics.duration > 200 ? 1 : 0
                }
              })(),
              // OTel status: based on span count (detect collection issues)
              otelStatus: node.metrics.spanCount < 100 ? 1 : 0
            } : {
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
        setLastUpdated(new Date())
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
    console.log('Node clicked:', node)
    setSelectedNode(node)
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
      setFilteredHealthStatuses(prev => {
        if (prev.includes(status)) {
          return prev.filter(s => s !== status)
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
            Retry
          </Button>
        }
      />
    )
  }

  if (!topologyData) {
    return (
      <Empty
        description="No topology data available"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      >
        <Button type="primary" onClick={handleRefresh}>
          Load Topology
        </Button>
      </Empty>
    )
  }

  return (
    <div style={{ height: '100%' }}>
      {/* Action Bar */}
      <div style={{ marginBottom: 16 }}>
        <Space>
          <Button 
            icon={<ReloadOutlined spin={loading} />} 
            onClick={handleRefresh}
            disabled={loading}
          >
            Refresh
          </Button>
          {lastUpdated && (
            <span style={{ color: '#8c8c8c', fontSize: 12 }}>
              Last updated: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          {autoRefresh && (
            <span style={{ color: '#52c41a', fontSize: 12 }}>
              ⚡ Auto-refresh enabled
            </span>
          )}
        </Space>
      </div>

      {/* Main Layout */}
      <Row gutter={16} style={{ height: 'calc(100% - 50px)' }}>
        {/* Topology Chart - Takes 70% width or 100% if no node selected */}
        <Col span={selectedNode ? 16 : 24}>
          <PieNodeTopologyChart 
            data={topologyData}
            onNodeClick={handleNodeClick}
            onHealthFilter={handleHealthFilter}
            height={selectedNode ? 500 : 600}
            filteredHealthStatuses={filteredHealthStatuses}
          />
        </Col>

        {/* Service Details Panel - 30% width when a node is selected */}
        {selectedNode && (
          <Col span={8}>
            <EnhancedServiceDetailsPanel
              serviceName={selectedNode.name.replace(/^[^\s]+\s/, '')} // Remove icon prefix
              serviceType={getServiceType(selectedNode)}
              metrics={selectedNode.metrics || {
                rate: 0,
                errorRate: 0,
                duration: 0,
                spanCount: 0,
                rateStatus: 0,
                errorStatus: 0,
                durationStatus: 0,
                otelStatus: 0
              }}
              healthStatus={getHealthStatus(selectedNode.itemStyle?.color || '#8c8c8c')}
              runtime={selectedNode.category}
            />
          </Col>
        )}
      </Row>
    </div>
  )
}

// Helper functions
const getServiceType = (node: ServiceNode): string => {
  // Try to infer from node properties or default to backend
  if (node.name.includes('gateway')) return 'api'
  if (node.name.includes('database') || node.name.includes('postgres') || node.name.includes('mysql')) return 'database'
  if (node.name.includes('redis') || node.name.includes('cache')) return 'cache'
  if (node.name.includes('frontend') || node.name.includes('ui')) return 'frontend'
  if (node.name.includes('queue') || node.name.includes('kafka')) return 'queue'
  return 'backend'
}

const getHealthStatus = (color: string): string => {
  switch (color) {
    case '#52c41a': return 'healthy'
    case '#faad14': return 'warning'
    case '#fa8c16': return 'degraded'
    case '#f5222d': return 'critical'
    case '#262626': return 'unavailable'
    default: return 'unknown'
  }
}

// Mock data generator for demonstration
const getMockTopologyData = (): TopologyVisualizationData => {
  return {
    nodes: [
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
          rateStatus: 0, // healthy
          errorStatus: 0, // healthy
          durationStatus: 0, // healthy
          otelStatus: 0 // healthy
        }
      },
      {
        id: 'api-gateway',
        name: 'api-gateway',
        category: 'go',
        symbolSize: 60,
        itemStyle: { color: '#52c41a' },
        label: { show: true },
        metrics: {
          rate: 120.5,
          errorRate: 0.8,
          duration: 45,
          spanCount: 32150,
          rateStatus: 0, // healthy
          errorStatus: 0, // healthy
          durationStatus: 0, // healthy
          otelStatus: 0 // healthy
        }
      },
      {
        id: 'user-service',
        name: 'user-service',
        category: 'java',
        symbolSize: 45,
        itemStyle: { color: '#faad14' },
        label: { show: true },
        metrics: {
          rate: 85.3,
          errorRate: 2.1,
          duration: 180,
          spanCount: 24850,
          rateStatus: 0, // healthy
          errorStatus: 1, // warning (>1% errors)
          durationStatus: 1, // warning (>100ms)
          otelStatus: 0 // healthy
        }
      },
      {
        id: 'payment-service',
        name: 'payment-service',
        category: 'python',
        symbolSize: 40,
        itemStyle: { color: '#f5222d' },
        label: { show: true },
        metrics: {
          rate: 25.8,
          errorRate: 8.5,
          duration: 450,
          spanCount: 8920,
          rateStatus: 0, // healthy
          errorStatus: 2, // critical (>5% errors)
          durationStatus: 1, // warning (>100ms)
          otelStatus: 0 // healthy
        }
      },
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
          rateStatus: 0, // healthy
          errorStatus: 0, // healthy
          durationStatus: 0, // healthy
          otelStatus: 0 // healthy
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
          rateStatus: 0, // healthy
          errorStatus: 0, // healthy
          durationStatus: 0, // healthy
          otelStatus: 0 // healthy
        }
      }
    ],
    edges: [
      {
        source: 'frontend',
        target: 'api-gateway',
        value: 150,
        lineStyle: { width: 3, color: '#52c41a' },
        operations: [
          { name: 'GET /api/products', count: 45, errorRate: 0.001, avgDuration: 35 },
          { name: 'GET /api/cart', count: 60, errorRate: 0.002, avgDuration: 42 },
          { name: 'POST /api/checkout', count: 45, errorRate: 0.005, avgDuration: 55 }
        ]
      },
      {
        source: 'api-gateway',
        target: 'user-service',
        value: 120,
        lineStyle: { width: 3, color: '#faad14' }
      },
      {
        source: 'api-gateway',
        target: 'payment-service',
        value: 50,
        lineStyle: { width: 2, color: '#f5222d' }
      },
      {
        source: 'user-service',
        target: 'postgres',
        value: 200,
        lineStyle: { width: 4, color: '#52c41a' }
      },
      {
        source: 'payment-service',
        target: 'postgres',
        value: 80,
        lineStyle: { width: 2, color: '#52c41a' }
      },
      {
        source: 'user-service',
        target: 'redis',
        value: 300,
        lineStyle: { width: 4, color: '#52c41a' }
      },
      {
        source: 'api-gateway',
        target: 'redis',
        value: 150,
        lineStyle: { width: 3, color: '#52c41a' }
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