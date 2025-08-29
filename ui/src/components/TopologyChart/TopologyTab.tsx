import React, { useState, useEffect } from 'react'
import { Row, Col, Spin, Alert, Empty, Button, Space, message } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import TopologyChart from './TopologyChart'
import ServiceDetailsPanel from './ServiceDetailsPanel'
import type { ServiceNode, TopologyVisualizationData } from './TopologyChart'
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
        'http://localhost:3000/api/ai-analyzer/topology-visualization',
        {
          timeRange: params
        }
      )

      if (response.data) {
        setTopologyData(response.data)
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
    setSelectedNode(node)
  }

  const handleRefresh = () => {
    fetchTopologyData()
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
          <TopologyChart 
            data={topologyData}
            onNodeClick={handleNodeClick}
            height={selectedNode ? 500 : 600}
          />
        </Col>

        {/* Service Details Panel - 30% width when a node is selected */}
        {selectedNode && (
          <Col span={8}>
            <ServiceDetailsPanel
              serviceName={selectedNode.name.replace(/^[^\s]+\s/, '')} // Remove icon prefix
              serviceType={getServiceType(selectedNode)}
              metrics={selectedNode.metrics || {
                rate: 0,
                errorRate: 0,
                duration: 0
              }}
              healthStatus={getHealthStatus(selectedNode.itemStyle.color)}
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
        name: '🌐 frontend',
        category: 'javascript',
        symbolSize: 50,
        itemStyle: { color: '#52c41a' },
        label: { show: true },
        metrics: {
          rate: 45.2,
          errorRate: 0.5,
          duration: 120
        }
      },
      {
        id: 'api-gateway',
        name: '🐹 api-gateway',
        category: 'go',
        symbolSize: 60,
        itemStyle: { color: '#52c41a' },
        label: { show: true },
        metrics: {
          rate: 120.5,
          errorRate: 0.8,
          duration: 45
        }
      },
      {
        id: 'user-service',
        name: '☕ user-service',
        category: 'java',
        symbolSize: 45,
        itemStyle: { color: '#faad14' },
        label: { show: true },
        metrics: {
          rate: 85.3,
          errorRate: 2.1,
          duration: 180
        }
      },
      {
        id: 'payment-service',
        name: '🐍 payment-service',
        category: 'python',
        symbolSize: 40,
        itemStyle: { color: '#f5222d' },
        label: { show: true },
        metrics: {
          rate: 25.8,
          errorRate: 8.5,
          duration: 450
        }
      },
      {
        id: 'postgres',
        name: '🗄️ postgres',
        category: 'postgresql',
        symbolSize: 55,
        itemStyle: { color: '#52c41a' },
        label: { show: true },
        metrics: {
          rate: 450.0,
          errorRate: 0.1,
          duration: 15
        }
      },
      {
        id: 'redis',
        name: '📦 redis',
        category: 'redis',
        symbolSize: 35,
        itemStyle: { color: '#52c41a' },
        label: { show: true },
        metrics: {
          rate: 850.5,
          errorRate: 0.01,
          duration: 2
        }
      }
    ],
    edges: [
      {
        source: 'frontend',
        target: 'api-gateway',
        value: 150,
        lineStyle: { width: 3, color: '#52c41a' }
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