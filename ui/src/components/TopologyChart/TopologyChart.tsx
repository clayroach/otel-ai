import React, { useRef, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { Card, Space, Tag, Row, Col, Typography, Badge } from 'antd'
import { 
  HeartOutlined,
  WarningOutlined,
  AlertOutlined,
  StopOutlined,
  CheckCircleOutlined 
} from '@ant-design/icons'

const { Text } = Typography

export interface ServiceNode {
  id: string
  name: string
  category?: string
  symbolSize: number
  itemStyle: {
    color: string
  }
  label: {
    show: boolean
  }
  metrics?: {
    rate: number
    errorRate: number
    duration: number
  }
}

export interface ServiceEdge {
  source: string
  target: string
  value: number
  lineStyle: {
    width: number
    color: string
  }
}

export interface TopologyVisualizationData {
  nodes: ServiceNode[]
  edges: ServiceEdge[]
  runtimeEnvironments?: string[]
  healthSummary?: {
    healthy: number
    warning: number
    degraded: number
    critical: number
    unavailable: number
  }
}

interface TopologyChartProps {
  data: TopologyVisualizationData
  onNodeClick?: (node: ServiceNode) => void
  height?: number
}

const getRuntimeIcon = (runtime?: string): string => {
  const iconMap: Record<string, string> = {
    go: '🐹',
    java: '☕',
    python: '🐍',
    javascript: '⚡',
    nodejs: '⚡',
    csharp: '🔷',
    dotnet: '🔷',
    ruby: '💎',
    php: '🐘',
    rust: '🦀',
    postgresql: '🗄️',
    redis: '📦',
    kafka: '📬',
    elasticsearch: '🔎'
  }
  return iconMap[runtime?.toLowerCase() || ''] || '🔥'
}

// Commented out - not used currently
// const getHealthIcon = (color: string) => {
//   if (color === '#52c41a') return <CheckCircleOutlined style={{ color }} />
//   if (color === '#faad14') return <WarningOutlined style={{ color }} />
//   if (color === '#fa8c16') return <AlertOutlined style={{ color }} />
//   if (color === '#f5222d') return <HeartOutlined style={{ color }} />
//   return <StopOutlined style={{ color: '#262626' }} />
// }

export const TopologyChart: React.FC<TopologyChartProps> = ({ 
  data, 
  onNodeClick,
  height = 600 
}) => {
  // Track selected node for future enhancements
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null)
  
  // Log selected node (for debugging)
  if (selectedNode) {
    console.debug('Selected node:', selectedNode)
  }

  const getOption = (): EChartsOption => {
    // Transform nodes to include runtime icons in labels
    const nodesWithIcons = data.nodes.map(node => ({
      ...node,
      name: `${getRuntimeIcon(node.category)} ${node.name}`,
      value: node.metrics?.rate || 1,
      // Add emphasis state for hover
      emphasis: {
        focus: 'adjacency',
        itemStyle: {
          shadowBlur: 10,
          shadowColor: 'rgba(0, 0, 0, 0.3)'
        }
      }
    }))

    return {
      title: {
        text: 'Service Topology Overview',
        subtext: 'Force-directed graph showing service dependencies and health',
        left: 'center',
        top: 10
      },
      tooltip: {
        trigger: 'item',
        formatter: (params: { dataType: string; data: ServiceNode & { source?: string; target?: string; value?: number } }) => {
          if (params.dataType === 'node') {
            const node = params.data as ServiceNode
            const metrics = node.metrics
            return `
              <div style="padding: 8px;">
                <strong>${node.name}</strong><br/>
                ${metrics ? `
                  <div style="margin-top: 8px;">
                    📊 Rate: ${metrics.rate.toFixed(2)} req/s<br/>
                    ⚠️ Error Rate: ${metrics.errorRate.toFixed(2)}%<br/>
                    ⏱️ P95 Duration: ${metrics.duration.toFixed(0)}ms
                  </div>
                ` : 'No metrics available'}
              </div>
            `
          } else if (params.dataType === 'edge') {
            const edge = params.data
            return `
              <div style="padding: 8px;">
                <strong>${edge.source} → ${edge.target}</strong><br/>
                Call Volume: ${edge.value} calls
              </div>
            `
          }
          return ''
        }
      },
      legend: {
        data: data.runtimeEnvironments || [],
        orient: 'vertical',
        left: 'left',
        top: 'center'
      },
      animationDuration: 1500,
      animationEasingUpdate: 'quinticInOut',
      series: [
        {
          name: 'Service Topology',
          type: 'graph',
          layout: 'force',
          data: nodesWithIcons,
          links: data.edges,
          roam: true,
          draggable: true,
          focusNodeAdjacency: true,
          categories: data.runtimeEnvironments?.map(runtime => ({
            name: runtime,
            symbol: 'circle'
          })),
          force: {
            repulsion: 300,
            gravity: 0.1,
            edgeLength: [50, 200],
            friction: 0.6
          },
          label: {
            show: true,
            position: 'bottom',
            formatter: '{b}',
            fontSize: 11
          },
          lineStyle: {
            curveness: 0.3,
            opacity: 0.7
          },
          emphasis: {
            focus: 'adjacency',
            lineStyle: {
              width: 3
            }
          }
        }
      ]
    }
  }

  const onChartClick = (params: { dataType: string; data: ServiceNode }) => {
    if (params.dataType === 'node') {
      setSelectedNode(params.data.id)
      if (onNodeClick) {
        onNodeClick(params.data)
      }
    }
  }

  const onEvents = {
    click: onChartClick
  }

  return (
    <div>
      {/* Health Summary Bar */}
      {data.healthSummary && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={24}>
            <Card size="small">
              <Space size="large">
                <Text strong>Service Health:</Text>
                <Badge count={data.healthSummary.healthy} showZero>
                  <Tag color="green" icon={<CheckCircleOutlined />}>Healthy</Tag>
                </Badge>
                <Badge count={data.healthSummary.warning} showZero>
                  <Tag color="yellow" icon={<WarningOutlined />}>Warning</Tag>
                </Badge>
                <Badge count={data.healthSummary.degraded} showZero>
                  <Tag color="orange" icon={<AlertOutlined />}>Degraded</Tag>
                </Badge>
                <Badge count={data.healthSummary.critical} showZero>
                  <Tag color="red" icon={<HeartOutlined />}>Critical</Tag>
                </Badge>
                <Badge count={data.healthSummary.unavailable} showZero>
                  <Tag color="black" icon={<StopOutlined />}>Unavailable</Tag>
                </Badge>
              </Space>
            </Card>
          </Col>
        </Row>
      )}

      {/* Main Chart */}
      <Card>
        <ReactECharts
          ref={chartRef}
          option={getOption()}
          style={{ height: `${height}px`, width: '100%' }}
          onEvents={onEvents}
        />
      </Card>

      {/* Runtime Legend */}
      {data.runtimeEnvironments && data.runtimeEnvironments.length > 0 && (
        <Card size="small" style={{ marginTop: 16 }}>
          <Space wrap>
            <Text strong>Runtime Environments:</Text>
            {data.runtimeEnvironments.map(runtime => (
              <Tag key={runtime} style={{ fontSize: 14 }}>
                {getRuntimeIcon(runtime)} {runtime}
              </Tag>
            ))}
          </Space>
        </Card>
      )}
    </div>
  )
}

export default TopologyChart