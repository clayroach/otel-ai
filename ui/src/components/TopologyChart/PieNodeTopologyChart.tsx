import {
  AlertOutlined,
  CheckCircleOutlined,
  HeartOutlined,
  StopOutlined,
  WarningOutlined
} from '@ant-design/icons'
import { Badge, Card, Col, Row, Space, Tag, Typography, Divider } from 'antd'
import type { EChartsOption, GraphSeriesOption } from 'echarts'
import ReactECharts from 'echarts-for-react'
import type { CallbackDataParams } from 'echarts/types/dist/shared'
import React, { useRef } from 'react'
import { generateHealthExplanation } from './healthExplanations'

const { Text } = Typography

export interface ServiceMetricsDetail {
  rate: number
  errorRate: number
  duration: number
  spanCount: number
  // Threshold status for each metric (0=healthy, 1=warning, 2=critical)
  rateStatus: number
  errorStatus: number
  durationStatus: number
  otelStatus: number
}

export interface ServiceNode {
  id: string
  name: string
  category?: string
  symbolSize: number
  itemStyle?: {
    color?: string
  }
  label?: {
    show: boolean
  }
  metrics?: ServiceMetricsDetail
  // Pie chart data for the node
  pieData?: Array<{
    value: number
    itemStyle: { color: string }
  }>
}

export interface ServiceEdge {
  source: string
  target: string
  value: number
  lineStyle: {
    width: number
    color: string
    type?: string | number[]
    curveness?: number
  }
  // Operation-level breakdown
  operations?: Array<{
    name: string
    count: number
    errorRate: number
    avgDuration: number
  }>
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

interface PieNodeTopologyChartProps {
  data: TopologyVisualizationData
  onNodeClick?: (node: ServiceNode) => void
  onHealthFilter?: (status: string) => void
  height?: number
  filteredHealthStatuses?: string[]
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

// Used in tooltip to show metric status colors
// const getMetricColor = (status: number): string => {
//   switch (status) {
//     case 0: return '#52c41a' // Healthy
//     case 1: return '#faad14' // Warning
//     case 2: return '#f5222d' // Critical
//     default: return '#8c8c8c' // Unknown
//   }
// }

const getNodeHealthStatus = (metrics?: ServiceMetricsDetail): string => {
  if (!metrics) return 'unknown'

  const statuses = [
    metrics.rateStatus,
    metrics.errorStatus,
    metrics.durationStatus,
    metrics.otelStatus
  ]
  const maxStatus = Math.max(...statuses)

  if (maxStatus === 2) return 'critical'
  if (maxStatus === 1) return 'warning'
  return 'healthy'
}

// Calculate overall node health color based on metrics
const getNodeOverallHealthColor = (metrics?: ServiceMetricsDetail): string => {
  if (!metrics) return '#8c8c8c'

  const statuses = [
    metrics.rateStatus,
    metrics.errorStatus,
    metrics.durationStatus,
    metrics.otelStatus
  ]
  const maxStatus = Math.max(...statuses)

  if (maxStatus === 2) return '#f5222d' // Critical
  if (maxStatus === 1) return '#faad14' // Warning
  return '#52c41a' // Healthy
}

export const PieNodeTopologyChart: React.FC<PieNodeTopologyChartProps> = ({
  data,
  onNodeClick,
  onHealthFilter,
  height = 600,
  filteredHealthStatuses = []
}) => {
  const chartRef = useRef<ReactECharts | null>(null)

  // Process nodes to add health coloring
  const processedNodes = data.nodes.map((node) => {
    const healthColor = getNodeOverallHealthColor(node.metrics)

    return {
      ...node,
      name: `${getRuntimeIcon(node.category)} ${node.name}`,
      itemStyle: {
        ...node.itemStyle,
        color: healthColor,
        borderColor: healthColor,
        borderWidth: 2
      },
      value: node.metrics?.rate || 1
    }
  })

  // Filter nodes based on health status if filters are active
  const filteredNodes =
    filteredHealthStatuses.length > 0
      ? processedNodes.filter((node) => {
          const status = getNodeHealthStatus(node.metrics)
          return filteredHealthStatuses.includes(status)
        })
      : processedNodes

  // Filter edges to only show connections between visible nodes
  const visibleNodeIds = new Set(filteredNodes.map((n) => n.id))
  const filteredEdges = data.edges.filter(
    (edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
  )

  const getOption = (): EChartsOption => {
    const graphSeries: GraphSeriesOption = {
      name: 'Service Topology',
      type: 'graph',
      layout: 'force',
      data: filteredNodes,
      links: filteredEdges.map((edge) => ({
        ...edge,
        // Add arrow to show direction
        symbol: ['none', 'arrow'] as ['none', 'arrow'],
        symbolSize: [0, 10] as [number, number],
        lineStyle: {
          ...edge.lineStyle,
          curveness: 0.3,
          type: edge.lineStyle.type as 'solid' | 'dashed' | 'dotted' | undefined
        }
      })),
      roam: true,
      draggable: true,
      focusNodeAdjacency: true,
      categories: data.runtimeEnvironments?.map((runtime) => ({
        name: runtime,
        symbol: 'circle'
      })),
      force: {
        repulsion: 400,
        gravity: 0.1,
        edgeLength: [100, 250],
        friction: 0.6
      },
      label: {
        show: true,
        position: 'bottom',
        formatter: '{b}',
        fontSize: 11,
        distance: 8
      },
      emphasis: {
        focus: 'adjacency' as const,
        lineStyle: {
          width: 4
        }
      }
    }

    return {
      title: {
        text: 'Service Topology Overview',
        subtext: 'Pie nodes show: Rate | Errors | Duration | OTel Health',
        left: 'center',
        top: 10
      },
      tooltip: {
        trigger: 'item',
        position: function (point: number[]) {
          // Position tooltip to bottom-left of cursor
          return [point[0] - 10, point[1] + 10]
        },
        confine: true,
        formatter: (params: CallbackDataParams | CallbackDataParams[]) => {
          if (!Array.isArray(params)) {
            const param = params
            if (param.dataType === 'node' && param.data) {
              const nodeData = param.data as ServiceNode
              const metrics = nodeData.metrics
              const cleanName = nodeData.name?.replace(/^[^\s]+\s/, '') || 'Unknown'

              if (!metrics) {
                return `<div style="padding: 8px;">
                  <strong>${nodeData.name || 'Unknown'}</strong><br/>
                  No metrics available
                </div>`
              }

              const healthExplanation = generateHealthExplanation(cleanName, metrics)
              const getStatusEmoji = (status: number) =>
                status === 0 ? '✅' : status === 1 ? '⚠️' : '❌'
              const getStatusColor = (status: string) =>
                status === 'critical' ? '#ff4d4f' : status === 'warning' ? '#faad14' : '#52c41a'

              // Simplified, more concise tooltip
              const criticalIssues = healthExplanation.impactedMetrics.filter(
                (m) => m.status === 'critical'
              )
              const warningIssues = healthExplanation.impactedMetrics.filter(
                (m) => m.status === 'warning'
              )

              return `
                <div style="padding: 10px; max-width: 320px;">
                  <div style="margin-bottom: 8px;">
                    <strong style="font-size: 13px;">${nodeData.name || 'Unknown'}</strong>
                    <span style="margin-left: 8px; padding: 2px 6px; background: ${getStatusColor(healthExplanation.status)}; color: white; border-radius: 3px; font-size: 10px;">
                      ${healthExplanation.status.toUpperCase()}
                    </span>
                  </div>
                  
                  <table style="font-size: 11px; width: 100%; margin-bottom: 8px;">
                    <tr>
                      <td style="padding: 2px;">${getStatusEmoji(metrics.rateStatus)} Rate:</td>
                      <td style="padding: 2px; text-align: right;"><strong>${metrics.rate.toFixed(1)} req/s</strong></td>
                    </tr>
                    <tr>
                      <td style="padding: 2px;">${getStatusEmoji(metrics.errorStatus)} Errors:</td>
                      <td style="padding: 2px; text-align: right;"><strong>${metrics.errorRate.toFixed(1)}%</strong></td>
                    </tr>
                    <tr>
                      <td style="padding: 2px;">${getStatusEmoji(metrics.durationStatus)} P95:</td>
                      <td style="padding: 2px; text-align: right;"><strong>${metrics.duration}ms</strong></td>
                    </tr>
                    <tr>
                      <td style="padding: 2px;">${getStatusEmoji(metrics.otelStatus)} Spans:</td>
                      <td style="padding: 2px; text-align: right;"><strong>${metrics.spanCount.toLocaleString()}</strong></td>
                    </tr>
                  </table>
                  
                  ${
                    criticalIssues.length > 0
                      ? `
                    <div style="background: #fff2e8; padding: 6px; border-radius: 3px; margin-bottom: 6px;">
                      <div style="font-size: 10px; color: #d4380d; font-weight: bold;">⚠️ Critical Issues:</div>
                      ${criticalIssues.map((i) => `<div style="font-size: 10px; color: #8c5415;">• ${i.metric}: ${i.value}</div>`).join('')}
                    </div>
                  `
                      : warningIssues.length > 0
                        ? `
                    <div style="background: #fffbe6; padding: 6px; border-radius: 3px; margin-bottom: 6px;">
                      <div style="font-size: 10px; color: #d48806; font-weight: bold;">⚡ Warnings:</div>
                      ${warningIssues.map((i) => `<div style="font-size: 10px; color: #8c6516;">• ${i.metric}: ${i.value}</div>`).join('')}
                    </div>
                  `
                        : ''
                  }
                  
                  ${
                    healthExplanation.recommendations.length > 0 &&
                    healthExplanation.status !== 'healthy'
                      ? `
                    <div style="border-top: 1px solid #e8e8e8; padding-top: 6px;">
                      <div style="font-size: 10px; color: #666;">
                        💡 ${healthExplanation.recommendations[0].substring(0, 80)}${healthExplanation.recommendations[0].length > 80 ? '...' : ''}
                      </div>
                    </div>
                  `
                      : ''
                  }
                </div>
              `
            } else if (param.dataType === 'edge' && param.data) {
              const edgeData = param.data as ServiceEdge
              let tooltip = `
                <div style="padding: 8px;">
                  <strong>${edgeData.source || 'Unknown'} → ${edgeData.target || 'Unknown'}</strong><br/>
                  Total Calls: ${edgeData.value || 0}<br/>`

              if (edgeData.operations && edgeData.operations.length > 0) {
                tooltip += `<div style="margin-top: 8px; font-size: 11px;">
                  <strong>Operations:</strong><br/>`
                edgeData.operations.slice(0, 5).forEach((op) => {
                  tooltip += `• ${op.name}: ${op.count} calls (${op.avgDuration.toFixed(0)}ms)<br/>`
                })
                if (edgeData.operations.length > 5) {
                  tooltip += `<em>... and ${edgeData.operations.length - 5} more</em>`
                }
                tooltip += '</div>'
              }

              tooltip += '</div>'
              return tooltip
            }
          }
          return ''
        }
      },
      legend: [
        {
          data: ['Rate', 'Errors', 'Duration', 'OTel'],
          orient: 'horizontal',
          left: 'center',
          bottom: 20,
          itemWidth: 15,
          itemHeight: 15,
          formatter: (name: string) => {
            const icons: Record<string, string> = {
              Rate: '📊',
              Errors: '⚠️',
              Duration: '⏱️',
              OTel: '📡'
            }
            return `${icons[name] || ''} ${name}`
          }
        },
        {
          data: data.runtimeEnvironments || [],
          orient: 'vertical',
          left: 'left',
          top: 'center',
          formatter: (name: string) => `${getRuntimeIcon(name)} ${name}`
        }
      ],
      animationDuration: 1500,
      animationEasingUpdate: 'quinticInOut',
      series: [graphSeries]
    }
  }

  const onChartClick = (params: { dataType: string; data: ServiceNode }) => {
    if (params.dataType === 'node') {
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
      {/* Health Summary Bar with Clickable Filters */}
      {data.healthSummary && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={24}>
            <Card size="small">
              <Space size="large">
                <Text strong>Service Health (click to filter):</Text>
                <Badge count={data.healthSummary.healthy} showZero>
                  <Tag
                    color="green"
                    icon={<CheckCircleOutlined />}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onHealthFilter && onHealthFilter('healthy')}
                  >
                    Healthy
                  </Tag>
                </Badge>
                <Badge count={data.healthSummary.warning} showZero>
                  <Tag
                    color="yellow"
                    icon={<WarningOutlined />}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onHealthFilter && onHealthFilter('warning')}
                  >
                    Warning
                  </Tag>
                </Badge>
                <Badge count={data.healthSummary.degraded} showZero>
                  <Tag
                    color="orange"
                    icon={<AlertOutlined />}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onHealthFilter && onHealthFilter('degraded')}
                  >
                    Degraded
                  </Tag>
                </Badge>
                <Badge count={data.healthSummary.critical} showZero>
                  <Tag
                    color="red"
                    icon={<HeartOutlined />}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onHealthFilter && onHealthFilter('critical')}
                  >
                    Critical
                  </Tag>
                </Badge>
                <Badge count={data.healthSummary.unavailable} showZero>
                  <Tag
                    color="black"
                    icon={<StopOutlined />}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onHealthFilter && onHealthFilter('unavailable')}
                  >
                    Unavailable
                  </Tag>
                </Badge>
                {filteredHealthStatuses.length > 0 && (
                  <Tag color="blue" closable onClose={() => onHealthFilter && onHealthFilter('')}>
                    Clear Filter
                  </Tag>
                )}
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

      {/* Health Status Legend */}
      <Card size="small" style={{ marginTop: 16 }}>
        <Space wrap>
          <Text strong>Node Health Status:</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Node colors indicate overall health based on RED metrics (Rate, Errors, Duration) and
            telemetry health.
          </Text>
          <Divider type="vertical" />
          <Tag color="green" style={{ fontSize: 12 }}>
            🟢 Healthy
          </Tag>
          <Tag color="orange" style={{ fontSize: 12 }}>
            🟡 Warning
          </Tag>
          <Tag color="red" style={{ fontSize: 12 }}>
            🔴 Critical
          </Tag>
        </Space>
      </Card>
    </div>
  )
}

export default PieNodeTopologyChart
