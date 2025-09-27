import React, { useRef, useEffect, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { SpanTreeNode, TraceViewConfig, ViewportConfig } from '../types'
import { flattenSpanTree } from '../utils/trace-builder'

interface TraceTimelineProps {
  spans: SpanTreeNode[]
  viewport: ViewportConfig
  config: TraceViewConfig
  selectedSpan: any
  onSpanClick: (span: any) => void
  onViewportChange: (viewport: ViewportConfig) => void
}

export const TraceTimeline: React.FC<TraceTimelineProps> = ({
  spans,
  viewport,
  config,
  // selectedSpan,  // TODO: Use for highlighting selected span
  onSpanClick
  // onViewportChange  // TODO: Use for zoom/pan updates
}) => {
  const chartRef = useRef<ReactECharts>(null)
  const [collapsedSpans] = useState<Set<string>>(new Set()) // TODO: Add collapse functionality

  // Flatten the tree for visualization
  const flatSpans = flattenSpanTree(spans, collapsedSpans)

  // Prepare data for ECharts
  const chartData = flatSpans.map((span, index) => {
    const startMs = Number(BigInt(span.startTimeUnixNano) / BigInt(1_000_000))
    const endMs = Number(BigInt(span.endTimeUnixNano) / BigInt(1_000_000))
    const duration = endMs - startMs

    return {
      name: span.operationName,
      value: [
        index, // Y-axis position
        startMs, // Start time
        endMs, // End time
        duration // Duration for tooltip
      ],
      itemStyle: {
        color: getSpanColor(span, config)
      },
      spanData: span
    }
  })

  // Create ECharts option
  const option: EChartsOption = {
    tooltip: {
      formatter: (params: any) => {
        const span = params.data.spanData
        return `
          <strong>${span.serviceName}</strong><br/>
          ${span.operationName}<br/>
          Duration: ${params.data.value[3]}ms<br/>
          Status: ${span.statusCode}
        `
      }
    },
    grid: {
      left: 200,
      right: 50,
      top: 20,
      bottom: 60,
      containLabel: false
    },
    xAxis: {
      type: 'value',
      min: viewport.startTime,
      max: viewport.endTime,
      axisLabel: {
        formatter: (value: number) => {
          const relative = value - viewport.startTime
          return `${relative.toFixed(1)}ms`
        }
      }
    },
    yAxis: {
      type: 'category',
      data: flatSpans.map((span) => {
        const indent = '  '.repeat(span.depth)
        return `${indent}${span.operationName.substring(0, 30)}`
      }),
      axisLabel: {
        interval: 0,
        fontSize: 11,
        color: '#666'
      }
    },
    series: [
      {
        type: 'custom',
        renderItem: (_params: any, api: any) => {
          const categoryIndex = api.value(0)
          const start = api.coord([api.value(1), categoryIndex])
          const end = api.coord([api.value(2), categoryIndex])
          const height = api.size([0, 1])[1] * 0.6

          return {
            type: 'rect',
            shape: {
              x: start[0],
              y: start[1] - height / 2,
              width: end[0] - start[0],
              height: height
            },
            style: api.style()
          }
        },
        data: chartData,
        encode: {
          x: [1, 2],
          y: 0
        }
      }
    ]
  }

  // Handle click events
  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance()
    if (chart) {
      chart.off('click')
      chart.on('click', (params: any) => {
        if (params.data?.spanData) {
          onSpanClick(params.data.spanData)
        }
      })
    }
  }, [onSpanClick])

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <ReactECharts
        ref={chartRef}
        option={option}
        style={{ height: '100%', width: '100%' }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  )
}

function getSpanColor(span: SpanTreeNode, config: TraceViewConfig): string {
  if (span.statusCode === 'STATUS_CODE_ERROR') {
    return '#ff4d4f' // Red for errors
  }

  if (config.colorScheme === 'service') {
    // Use a hash of service name to generate consistent colors
    const hash = span.serviceName.split('').reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0)
      return a & a
    }, 0)
    const hue = Math.abs(hash) % 360
    return `hsl(${hue}, 70%, 60%)`
  }

  // Default blue
  return '#1890ff'
}
