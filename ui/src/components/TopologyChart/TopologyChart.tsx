import React, { useRef, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption, GraphSeriesOption } from 'echarts'
import type { CallbackDataParams } from 'echarts/types/dist/shared'
import { Card, Space, Tag, Typography, Badge } from 'antd'
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
    const nodesWithIcons = data.nodes.map((node) => ({
      ...node,
      name: `${getRuntimeIcon(node.category)} ${node.name}`,
      value: node.metrics?.rate || 1
    }))

    const graphSeries: GraphSeriesOption = {
      name: 'Service Topology',
      type: 'graph',
      layout: 'force',
      data: nodesWithIcons,
      links: data.edges,
      roam: true,
      draggable: true,
      focusNodeAdjacency: true,
      categories: data.runtimeEnvironments?.map((runtime) => ({
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
        focus: 'adjacency' as const,
        lineStyle: {
          width: 3
        }
      }
    }

    return {
      title: {
        text: 'Service Topology Overview',
        subtext: 'Force-directed graph showing service dependencies and health',
        left: 'center',
        top: 10
      },
      tooltip: {
        trigger: 'item',
        formatter: (params: CallbackDataParams | CallbackDataParams[]) => {
          if (!Array.isArray(params)) {
            const param = params
            if (param.dataType === 'node' && param.data) {
              const nodeData = param.data as {
                name?: string
                metrics?: { rate: number; errorRate: number; duration: number }
              }
              const metrics = nodeData.metrics
              return `
                <div style="padding: 8px;">
                  <strong>${nodeData.name || 'Unknown'}</strong><br/>
                  ${
                    metrics
                      ? `
                    <div style="margin-top: 8px;">
                      📊 Rate: ${metrics.rate.toFixed(2)} req/s<br/>
                      ⚠️ Error Rate: ${metrics.errorRate.toFixed(2)}%<br/>
                      ⏱️ P95 Duration: ${metrics.duration.toFixed(0)}ms
                    </div>
                  `
                      : 'No metrics available'
                  }
                </div>
              `
            } else if (param.dataType === 'edge' && param.data) {
              const edgeData = param.data as { source?: string; target?: string; value?: number }
              return `
                <div style="padding: 8px;">
                  <strong>${edgeData.source || 'Unknown'} → ${edgeData.target || 'Unknown'}</strong><br/>
                  Call Volume: ${edgeData.value || 0} calls
                </div>
              `
            }
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
      series: [graphSeries]
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
        <div style={{ marginBottom: 8, padding: '4px 8px', background: '#fafafa', borderRadius: 4 }}>
          <Space size="small" style={{ fontSize: 11 }}>
            <Text strong style={{ fontSize: 11 }}>Health:</Text>
                <Badge count={data.healthSummary.healthy} showZero size="small">
                  <Tag color="green" icon={<CheckCircleOutlined />} style={{ fontSize: 11 }}>
                    Healthy
                  </Tag>
                </Badge>
                <Badge count={data.healthSummary.warning} showZero size="small">
                  <Tag color="yellow" icon={<WarningOutlined />} style={{ fontSize: 11 }}>
                    Warning
                  </Tag>
                </Badge>
                <Badge count={data.healthSummary.degraded} showZero size="small">
                  <Tag color="orange" icon={<AlertOutlined />} style={{ fontSize: 11 }}>
                    Degraded
                  </Tag>
                </Badge>
                <Badge count={data.healthSummary.critical} showZero size="small">
                  <Tag color="red" icon={<HeartOutlined />} style={{ fontSize: 11 }}>
                    Critical
                  </Tag>
                </Badge>
            <Badge count={data.healthSummary.unavailable} showZero size="small">
              <Tag color="black" icon={<StopOutlined />} style={{ fontSize: 11 }}>
                Unavailable
              </Tag>
            </Badge>
          </Space>
        </div>
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
            {data.runtimeEnvironments.map((runtime) => (
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
