import React, { useRef, useEffect, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { SpanTreeNode, TraceViewConfig, ViewportConfig } from '../types'
import { flattenSpanTree } from '../utils/trace-builder'
import type { CriticalPath } from '../../../api/critical-paths'

interface TraceWaterfallProps {
  spans: SpanTreeNode[]
  viewport: ViewportConfig
  config: TraceViewConfig
  selectedSpan: SpanTreeNode | null
  criticalPaths?: CriticalPath[]
  onSpanClick: (span: SpanTreeNode) => void
  onViewportChange: (viewport: ViewportConfig) => void
}

export const TraceWaterfall: React.FC<TraceWaterfallProps> = ({
  spans,
  viewport,
  config,
  // selectedSpan,  // TODO: Use for highlighting selected span
  criticalPaths,
  onSpanClick
  // onViewportChange  // TODO: Use for zoom/pan updates
}) => {
  const chartRef = useRef<ReactECharts>(null)
  const [collapsedSpans] = useState<Set<string>>(new Set()) // TODO: Add collapse functionality

  // Flatten the tree for visualization
  const flatSpans = flattenSpanTree(spans, collapsedSpans)

  // Build a map of services in critical paths with their severity
  const criticalServices = new Map<string, number>()
  if (config.showCriticalPath && criticalPaths) {
    criticalPaths.forEach((path) => {
      path.services.forEach((service) => {
        const currentSeverity = criticalServices.get(service) || 0
        criticalServices.set(service, Math.max(currentSeverity, path.severity))
      })
    })
  }

  // Prepare data for ECharts with relative times
  // Convert absolute timestamps to relative (starting from 0)
  const traceStartMs = viewport.startTime

  // Calculate the actual min/max times from the data
  let minRelativeTime = Infinity
  let maxRelativeTime = -Infinity

  flatSpans.forEach((span) => {
    const startMs = Number(BigInt(span.startTimeUnixNano) / BigInt(1_000_000))
    const endMs = Number(BigInt(span.endTimeUnixNano) / BigInt(1_000_000))
    const relStart = startMs - traceStartMs
    const relEnd = endMs - traceStartMs

    minRelativeTime = Math.min(minRelativeTime, relStart)
    maxRelativeTime = Math.max(maxRelativeTime, relEnd)
  })

  // Normalize so the timeline starts at 0ms
  const timeOffset = minRelativeTime
  const normalizedDuration = maxRelativeTime - minRelativeTime

  const chartData = flatSpans.map((span, index) => {
    const startMs = Number(BigInt(span.startTimeUnixNano) / BigInt(1_000_000))
    const endMs = Number(BigInt(span.endTimeUnixNano) / BigInt(1_000_000))
    const duration = endMs - startMs

    // Convert to relative times, then normalize to start at 0
    const relativeStart = startMs - traceStartMs - timeOffset
    const relativeEnd = endMs - traceStartMs - timeOffset

    // Check if this span's service is in a critical path
    const severity = criticalServices.get(span.serviceName)
    const isCritical = severity !== undefined

    return {
      id: span.spanId, // Unique key for React
      name: `${span.serviceName}:${span.operationName}`,
      value: [
        index, // Y-axis position
        relativeStart, // Actual start time (no offset)
        relativeEnd, // Actual end time (no offset)
        duration // Duration for tooltip
      ],
      itemStyle: {
        color: getSpanColor(span, config, isCritical, severity),
        borderColor: isCritical ? getCriticalBorderColor(severity) : undefined,
        borderWidth: isCritical ? 2 : 0,
        shadowColor: isCritical ? getCriticalBorderColor(severity) : undefined,
        shadowBlur: isCritical ? 8 : 0
      },
      spanData: span,
      isCritical,
      severity,
      depth: span.depth
    }
  })

  // Create ECharts option
  const option: EChartsOption = {
    tooltip: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      formatter: (params: any) => {
        const span = params.data.spanData
        const isCritical = params.data.isCritical
        const severity = params.data.severity
        const relativeStart = params.data.value[1]
        const relativeEnd = params.data.value[2]

        // Get absolute timestamps
        const startMs = Number(BigInt(span.startTimeUnixNano) / BigInt(1_000_000))
        const endMs = Number(BigInt(span.endTimeUnixNano) / BigInt(1_000_000))

        let tooltip = `
          <strong>${span.serviceName}</strong><br/>
          ${span.operationName}<br/>
          <br/>
          <strong>Trace Timing (normalized to 0):</strong><br/>
          Start: ${relativeStart.toFixed(2)}ms<br/>
          End: ${relativeEnd.toFixed(2)}ms<br/>
          Duration: ${params.data.value[3].toFixed(2)}ms<br/>
          Depth: ${span.depth}<br/>
          <br/>
          <strong>Absolute Timestamps:</strong><br/>
          Start: ${startMs.toFixed(3)}ms (epoch)<br/>
          End: ${endMs.toFixed(3)}ms (epoch)<br/>
          Start (nano): ${span.startTimeUnixNano}<br/>
          End (nano): ${span.endTimeUnixNano}<br/>
          <br/>
          Status: ${span.statusCode}`

        if (isCritical && severity !== undefined) {
          tooltip += `<br/><br/>
          <span style="color: ${getCriticalBorderColor(severity)}">⚠️ Critical Path</span><br/>
          Severity: ${(severity * 100).toFixed(0)}%`
        }

        return tooltip
      }
    },
    grid: {
      left: 320, // Fixed space for service:operation labels
      right: 20,
      top: 60, // Space for X-axis at top
      bottom: 20
      // Remove containLabel to have precise control
    },
    xAxis: {
      type: 'value',
      min: 0, // Start at 0ms
      max: normalizedDuration, // Total duration
      position: 'top', // Time axis at top (standard waterfall pattern)
      axisLabel: {
        formatter: (value: number) => {
          // Value is already relative (0-based), just format it
          // Use whole numbers for cleaner display
          return `${Math.round(value)}ms`
        }
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: '#e0e0e0',
          type: 'dashed'
        }
      }
    },
    yAxis: {
      type: 'category',
      data: flatSpans.map((span) => {
        // Use visible characters for indentation (└── style)
        const indent = span.depth > 0 ? '│  '.repeat(span.depth - 1) + '├─ ' : ''
        const label = `${span.serviceName}:${span.operationName}`
        return `${indent}${label}` // No truncation
      }),
      inverse: true, // Invert so index 0 (parent) is at top, children cascade down
      position: 'left', // Labels on left side
      axisLabel: {
        interval: 0,
        fontSize: 11,
        color: '#333',
        fontFamily: 'monospace', // Monospace for consistent indentation
        align: 'right',
        width: 300, // Match grid.left minus some padding
        overflow: 'truncate'
      }
    },
    series: [
      {
        type: 'custom',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        renderItem: (params: any, api: any) => {
          const categoryIndex = api.value(0)
          const startTime = api.value(1)
          const endTime = api.value(2)

          const start = api.coord([startTime, categoryIndex])
          const end = api.coord([endTime, categoryIndex])
          const height = api.size([0, 1])[1] * 0.6

          // Calculate bar width
          const calculatedWidth = end[0] - start[0]
          const duration = endTime - startTime

          // Get item style from data (with safety check)
          const itemStyle = params?.data?.itemStyle || {}

          // For zero or near-zero duration spans, show a vertical line instead of a bar
          if (duration < 0.1) {
            // Less than 0.1ms is essentially instantaneous
            return {
              type: 'group',
              children: [
                // Vertical line to mark the instant
                {
                  type: 'line',
                  shape: {
                    x1: start[0],
                    y1: start[1] - height / 2,
                    x2: start[0],
                    y2: start[1] + height / 2
                  },
                  style: {
                    stroke: itemStyle.color || '#1890ff',
                    lineWidth: 2
                  }
                },
                // Small diamond marker
                {
                  type: 'polygon',
                  shape: {
                    points: [
                      [start[0], start[1] - height / 2 - 2],
                      [start[0] + 3, start[1]],
                      [start[0], start[1] + height / 2 + 2],
                      [start[0] - 3, start[1]]
                    ]
                  },
                  style: {
                    fill: itemStyle.color || '#1890ff'
                  }
                }
              ]
            }
          }

          // For normal duration spans, show a bar
          return {
            type: 'rect',
            shape: {
              x: start[0],
              y: start[1] - height / 2,
              width: Math.max(calculatedWidth, 1), // At least 1px for visibility
              height: height
            },
            style: {
              fill: itemStyle.color || '#1890ff',
              stroke: itemStyle.borderColor,
              lineWidth: itemStyle.borderWidth || 0,
              shadowColor: itemStyle.shadowColor,
              shadowBlur: itemStyle.shadowBlur || 0
            }
          }
        },
        data: chartData
        // No encode needed since we're using custom renderItem
      }
    ]
  }

  // Handle click events
  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance()
    if (chart) {
      chart.off('click')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chart.on('click', (params: any) => {
        if (params.data?.spanData) {
          onSpanClick(params.data.spanData)
        }
      })
    }
  }, [onSpanClick])

  // Calculate appropriate height based on number of spans
  // Use Math.max to ensure minimum height and allow chart to grow as needed
  const chartHeight = Math.max(flatSpans.length * 30, 400)

  return (
    <div style={{ height: '100%', width: '100%', overflow: 'auto' }}>
      <ReactECharts
        ref={chartRef}
        option={option}
        style={{ height: `${chartHeight}px`, width: '100%', minHeight: '400px' }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  )
}

function getSpanColor(
  span: SpanTreeNode,
  config: TraceViewConfig,
  isCritical?: boolean,
  severity?: number
): string {
  // Errors always take precedence
  if (span.statusCode === 'STATUS_CODE_ERROR') {
    return '#ff4d4f' // Red for errors
  }

  // Critical path highlighting
  if (isCritical && severity !== undefined) {
    if (severity >= 0.8) return '#ff4d4f' // Critical (red)
    if (severity >= 0.6) return '#ff7a45' // High (orange)
    if (severity >= 0.4) return '#ffa940' // Medium (amber)
    return '#fadb14' // Low (yellow)
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

function getCriticalBorderColor(severity?: number): string {
  if (severity === undefined) return '#fadb14'
  if (severity >= 0.8) return '#ff4d4f' // Critical (red)
  if (severity >= 0.6) return '#ff7a45' // High (orange)
  if (severity >= 0.4) return '#ffa940' // Medium (amber)
  return '#fadb14' // Low (yellow)
}
