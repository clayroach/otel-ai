import React from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { Card, Empty, Space, Typography } from 'antd'
import { BranchesOutlined } from '@ant-design/icons'
import type { CriticalPath } from './types'

const { Text } = Typography

interface PathFlowChartPanelProps {
  path: CriticalPath | null
  services: Array<{
    id: string
    name: string
    metrics?: {
      rate: number
      errorRate: number
      duration: number
    }
  }>
  height?: number
}

export const PathFlowChartPanel: React.FC<PathFlowChartPanelProps> = ({
  path,
  services,
  height = 600
}) => {
  const cardTitle = (
    <Space size="small" style={{ fontSize: '14px' }}>
      <BranchesOutlined style={{ fontSize: '14px' }} />
      <Text strong style={{ fontSize: '14px', whiteSpace: 'nowrap' }}>
        {path ? path.name : 'Path Flow'}
      </Text>
    </Space>
  )

  if (!path) {
    return (
      <Card
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        styles={{
          body: {
            padding: '12px',
            flex: 1,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center'
          }
        }}
        title={cardTitle}
      >
        <Empty description="Select a critical path to view the flow" />
      </Card>
    )
  }

  // Create a Sankey diagram option with request volume as line width
  const getSankeyOption = (): EChartsOption => {
    // Build nodes for Sankey
    const nodes = path.services.map((serviceId, _index) => {
      const service = services.find((s) => s.id === serviceId)
      return {
        name: serviceId,
        label: {
          show: true,
          formatter: service?.name || serviceId,
          position: 'right' as const
        },
        itemStyle: {
          color: getServiceColor(service?.metrics?.errorRate || 0),
          borderColor: '#fff',
          borderWidth: 2
        }
      }
    })

    // Build links for Sankey with request volume as value and error rate as color
    const links = path.edges.map((edge) => {
      const sourceService = services.find((s) => s.id === edge.source)
      const targetService = services.find((s) => s.id === edge.target)
      // Use the minimum rate between source and target as the flow volume
      const volume = Math.min(
        sourceService?.metrics?.rate || 100,
        targetService?.metrics?.rate || 100
      )

      // Use the target service's error rate to determine link color
      const errorRate = targetService?.metrics?.errorRate || 0
      const linkColor = getServiceColor(errorRate)

      return {
        source: edge.source,
        target: edge.target,
        value: volume, // Line width will be proportional to request volume
        lineStyle: {
          color: linkColor,
          opacity: errorRate > 0.01 ? 0.9 : 0.6, // Make problematic flows more visible
          curveness: 0.5
        },
        // Store error rate for tooltip
        errorRate: errorRate
      }
    })

    return {
      legend: {
        data: ['🟢 Healthy (<1%)', '🟡 Warning (1-5%)', '🔴 Critical (>5%)'],
        top: 20,
        left: 'center',
        itemGap: 20,
        textStyle: {
          fontSize: 12
        }
      },
      tooltip: {
        trigger: 'item',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (params: any) => {
          if (params.dataType === 'node') {
            const service = services.find((s) => s.id === params.name)
            if (service?.metrics) {
              const healthStatus =
                service.metrics.errorRate > 0.05
                  ? '🔴 Critical'
                  : service.metrics.errorRate > 0.01
                    ? '🟡 Warning'
                    : '🟢 Healthy'
              return `
                <b>${service.name}</b> ${healthStatus}<br/>
                <hr style="margin: 4px 0; border-color: #ddd"/>
                📊 Rate: <b>${service.metrics.rate.toFixed(1)}</b> req/s<br/>
                ⚠️ Error Rate: <b>${(service.metrics.errorRate * 100).toFixed(2)}%</b><br/>
                ⏱️ Duration: <b>${service.metrics.duration.toFixed(0)}ms</b>
              `
            }
            return params.name
          } else if (params.dataType === 'edge') {
            const sourceService = services.find((s) => s.id === params.data.source)
            const targetService = services.find((s) => s.id === params.data.target)
            const errorRate = params.data.errorRate || 0
            const errorStatus =
              errorRate > 0.05 ? '🔴 Critical' : errorRate > 0.01 ? '🟡 Warning' : '🟢 Healthy'
            return `
              <b>Flow: ${sourceService?.name || params.data.source} → ${targetService?.name || params.data.target}</b><br/>
              <hr style="margin: 4px 0; border-color: #ddd"/>
              📈 Volume: <b>${params.value.toFixed(0)}</b> req/s<br/>
              ⚠️ Error Rate: <b>${(errorRate * 100).toFixed(2)}%</b> ${errorStatus}<br/>
              💡 Line width shows request volume, color shows health
            `
          }
          return ''
        }
      },
      series: [
        {
          type: 'sankey',
          emphasis: {
            focus: 'adjacency'
          },
          nodeAlign: 'left',
          layoutIterations: 0,
          orient: 'horizontal',
          data: nodes,
          links: links,
          lineStyle: {
            color: 'gradient',
            curveness: 0.5
          },
          label: {
            position: 'right',
            fontSize: 14
          },
          itemStyle: {
            borderWidth: 2,
            borderColor: '#fff'
          }
        }
      ]
    }
  }

  // Alternative: Create a hierarchical left-to-right graph
  /* const _getFlowGraphOption = (): EChartsOption => {
    // Calculate positions for nodes in a left-to-right layout
    const nodePositions = new Map<string, { x: number; y: number }>()
    const levels = new Map<string, number>()

    // Determine levels for each node
    const calculateLevels = () => {
      // Start nodes (no incoming edges)
      const incomingEdges = new Map<string, number>()
      path.services.forEach((s) => incomingEdges.set(s, 0))
      path.edges.forEach((e) => {
        incomingEdges.set(e.target, (incomingEdges.get(e.target) || 0) + 1)
      })

      // Find start nodes
      const queue: string[] = []
      path.services.forEach((s) => {
        if (incomingEdges.get(s) === 0) {
          levels.set(s, 0)
          queue.push(s)
        }
      })

      // BFS to assign levels
      while (queue.length > 0) {
        const current = queue.shift()
        if (!current) continue
        const currentLevel = levels.get(current) || 0

        path.edges
          .filter((e) => e.source === current)
          .forEach((e) => {
            if (!levels.has(e.target)) {
              levels.set(e.target, currentLevel + 1)
              queue.push(e.target)
            }
          })
      }
    }

    calculateLevels()

    // Position nodes based on levels
    const maxLevel = Math.max(...Array.from(levels.values()))
    const levelCounts = new Map<number, number>()

    levels.forEach((level, nodeId) => {
      const count = levelCounts.get(level) || 0
      const x = (level / Math.max(maxLevel, 1)) * 80 + 10
      const y = count * 15 + 30
      nodePositions.set(nodeId, { x, y })
      levelCounts.set(level, count + 1)
    })

    // Build nodes for graph
    const nodes = path.services.map((serviceId) => {
      const service = services.find((s) => s.id === serviceId)
      const pos = nodePositions.get(serviceId) || { x: 50, y: 50 }
      const level = levels.get(serviceId) || 0

      return {
        id: serviceId,
        name: service?.name || serviceId,
        x: pos.x,
        y: pos.y,
        value: service?.metrics?.rate || 1,
        symbolSize: 40 + (service?.metrics?.rate || 0) / 10,
        category: level,
        itemStyle: {
          color: getServiceColor(service?.metrics?.errorRate || 0),
          borderColor: level === 0 ? '#1890ff' : '#999',
          borderWidth: level === 0 ? 3 : 1
        },
        label: {
          show: true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
          formatter: (_params: any) => {
            const name = service?.name || serviceId
            return level === 0 ? `▶ ${name}` : name
          },
          fontSize: 12
        }
      }
    })

    // Build edges
    const edges = path.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      symbol: ['none', 'arrow'],
      symbolSize: [0, 12],
      lineStyle: {
        width: 3,
        color: '#1890ff',
        curveness: 0.2
      }
    }))

    return {
      title: {
        text: `Flow: ${path.name}`,
        subtext: path.description,
        left: 'center'
      },
      tooltip: {
        trigger: 'item',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (params: any) => {
          if (params.dataType === 'node') {
            const service = services.find((s) => s.id === params.data.id)
            if (service?.metrics) {
              return `
                <b>${service.name}</b><br/>
                Rate: ${service.metrics.rate.toFixed(1)} req/s<br/>
                Error Rate: ${(service.metrics.errorRate * 100).toFixed(2)}%<br/>
                Duration: ${service.metrics.duration.toFixed(0)}ms
              `
            }
            return params.name
          }
          return ''
        }
      },
      animationDurationUpdate: 1500,
      animationEasingUpdate: 'quinticInOut',
      xAxis: {
        show: false,
        type: 'value',
        min: 0,
        max: 100
      },
      yAxis: {
        show: false,
        type: 'value',
        min: 0,
        max: 100
      },
      series: [
        {
          type: 'graph',
          layout: 'none',
          coordinateSystem: 'cartesian2d',
          symbolSize: 50,
          roam: false,
          label: {
            show: true
          },
          edgeSymbol: ['circle', 'arrow'],
          edgeSymbolSize: [4, 10],
          data: nodes,
          links: edges,
          lineStyle: {
            opacity: 0.9,
            width: 2,
            curveness: 0.1
          },
          emphasis: {
            focus: 'adjacency',
            lineStyle: {
              width: 4
            }
          }
        }
      ]
    }
  } */

  const getServiceColor = (errorRate: number): string => {
    if (errorRate > 0.05) return '#ff4d4f' // >5% errors - red
    if (errorRate > 0.01) return '#faad14' // >1% errors - yellow
    return '#52c41a' // healthy - green
  }

  // Use Sankey diagram for better flow visualization with request volumes
  return (
    <Card
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
      styles={{
        body: {
          padding: '12px',
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }
      }}
      title={cardTitle}
    >
      <ReactECharts
        option={getSankeyOption()}
        style={{ height: height, width: '100%' }}
        notMerge={true}
        lazyUpdate={true}
      />
    </Card>
  )
}

export default PathFlowChartPanel
