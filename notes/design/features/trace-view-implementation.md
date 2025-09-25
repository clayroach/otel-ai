# Trace View Implementation with Apache ECharts

**Date**: 2025-09-24
**Status**: Design Phase
**Related**: [Trace View Strategy](otel_ai_trace_view_strategy.md)

## Executive Summary

Implement a comprehensive trace visualization component using Apache ECharts that displays OpenTelemetry trace data in a Gantt-style timeline, similar to Jaeger/Tempo but optimized for the otel-ai platform's AI-native capabilities.

## Key Design Decisions

Based on industry best practices from Grafana Tempo, Jaeger, Zipkin, and Datadog:

1. **Primary Timeline View**: Gantt-style chart for spans using ECharts custom series
2. **Hierarchical Display**: Parent-child relationships with collapsible tree structure
3. **Linked Views Pattern**: Separate panels for logs/metrics (not intermixed in timeline)
4. **Span Events**: Display as markers within spans (OTel events/logs)
5. **Critical Path Highlighting**: AI-identified bottlenecks emphasized
6. **Minimap Overview**: Bird's eye view for navigation in long traces

## Component Architecture

```typescript
// Main trace view component structure
interface TraceViewProps {
  traceId: string
  spans: SpanData[]
  criticalPath?: string[]  // AI-identified span IDs
  onSpanClick?: (span: SpanData) => void
  onTraceToLogs?: (traceId: string, spanId?: string) => void
  onTraceToMetrics?: (service: string, operation: string) => void
}

interface SpanData {
  traceId: string
  spanId: string
  parentSpanId?: string
  serviceName: string
  operationName: string
  startTime: number  // Unix timestamp in nanoseconds
  endTime: number
  duration: number
  status: 'ok' | 'error' | 'unset'
  attributes: Record<string, any>
  events?: SpanEvent[]  // OTel events within span
  kind: 'server' | 'client' | 'producer' | 'consumer' | 'internal'
}

interface SpanEvent {
  timestamp: number
  name: string
  attributes: Record<string, any>
}
```

## ECharts Implementation Strategy

### 1. Timeline Chart Configuration

```typescript
const createTraceTimelineOption = (spans: SpanData[]): EChartsOption => {
  // Calculate trace boundaries
  const traceStart = Math.min(...spans.map(s => s.startTime))
  const traceEnd = Math.max(...spans.map(s => s.endTime))
  const traceDuration = traceEnd - traceStart

  // Build hierarchical tree from spans
  const spanTree = buildSpanTree(spans)
  const flattenedSpans = flattenTreeWithLevels(spanTree)

  // Prepare data for ECharts custom series
  const timelineData = flattenedSpans.map((span, index) => ({
    name: span.spanId,
    value: [
      index,  // Y-axis position (service/operation level)
      (span.startTime - traceStart) / 1000000,  // Start time in ms
      (span.endTime - traceStart) / 1000000,     // End time in ms
      span.duration / 1000000,                    // Duration in ms
      span.serviceName,
      span.operationName,
      span.status
    ],
    itemStyle: {
      color: getSpanColor(span),
      borderColor: span.status === 'error' ? '#ff4444' : undefined,
      borderWidth: span.status === 'error' ? 2 : 0
    }
  }))

  return {
    tooltip: {
      formatter: (params: any) => {
        const span = findSpanById(params.name)
        return `
          <b>${span.serviceName}</b><br/>
          ${span.operationName}<br/>
          <hr/>
          Duration: ${(span.duration / 1000000).toFixed(2)}ms<br/>
          Status: ${span.status}<br/>
          ${span.events ? `Events: ${span.events.length}` : ''}
        `
      }
    },
    grid: {
      left: 200,  // Space for service/operation labels
      right: 50,
      top: 60,
      bottom: 100
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: traceDuration / 1000000,  // Convert to ms
      axisLabel: {
        formatter: (value: number) => `${value.toFixed(0)}ms`
      }
    },
    yAxis: {
      type: 'category',
      data: flattenedSpans.map(s => `${s.serviceName} | ${s.operationName}`),
      axisLabel: {
        width: 180,
        overflow: 'truncate',
        fontSize: 11
      }
    },
    series: [{
      type: 'custom',
      renderItem: renderSpanBar,
      data: timelineData,
      encode: {
        x: [1, 2],  // Start and end time
        y: 0        // Y-axis index
      }
    }],
    dataZoom: [
      {
        type: 'slider',
        xAxisIndex: 0,
        height: 20,
        bottom: 40
      },
      {
        type: 'inside',
        xAxisIndex: 0
      }
    ]
  }
}

// Custom render function for span bars
const renderSpanBar = (params: any, api: any) => {
  const categoryIndex = api.value(0)
  const start = api.coord([api.value(1), categoryIndex])
  const end = api.coord([api.value(2), categoryIndex])
  const height = api.size([0, 1])[1] * 0.6

  const rect = {
    type: 'rect',
    shape: {
      x: start[0],
      y: start[1] - height / 2,
      width: end[0] - start[0],
      height: height
    },
    style: api.style()
  }

  // Add span events as markers
  const events = getSpanEvents(params.name)
  const eventMarkers = events.map(event => ({
    type: 'circle',
    shape: {
      cx: api.coord([(event.timestamp - traceStart) / 1000000, categoryIndex])[0],
      cy: start[1],
      r: 3
    },
    style: {
      fill: event.name.includes('error') ? '#ff4444' : '#1890ff'
    }
  }))

  return {
    type: 'group',
    children: [rect, ...eventMarkers]
  }
}
```

### 2. Minimap Implementation

```typescript
const createMinimapOption = (spans: SpanData[]): EChartsOption => {
  // Simplified view showing service-level aggregation
  const serviceSpans = aggregateByService(spans)

  return {
    height: 100,
    grid: {
      left: 200,
      right: 50,
      top: 10,
      bottom: 10
    },
    xAxis: {
      type: 'value',
      show: false
    },
    yAxis: {
      type: 'category',
      data: Object.keys(serviceSpans),
      axisLabel: { show: false }
    },
    series: [{
      type: 'custom',
      renderItem: renderServiceBar,
      data: serviceSpans,
      silent: false  // Allow interaction for navigation
    }],
    brush: {
      xAxisIndex: 0,
      brushStyle: {
        borderWidth: 1,
        color: 'rgba(120, 140, 180, 0.1)',
        borderColor: 'rgba(120, 140, 180, 0.8)'
      }
    }
  }
}
```

### 3. Critical Path Highlighting

```typescript
const highlightCriticalPath = (
  chartInstance: echarts.ECharts,
  criticalSpanIds: string[]
) => {
  const option = chartInstance.getOption()
  const series = option.series[0]

  // Update data items to highlight critical path
  series.data = series.data.map((item: any) => {
    if (criticalSpanIds.includes(item.name)) {
      return {
        ...item,
        itemStyle: {
          ...item.itemStyle,
          shadowBlur: 10,
          shadowColor: 'rgba(255, 165, 0, 0.5)',
          borderColor: '#ffa500',
          borderWidth: 2
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 20,
            shadowColor: 'rgba(255, 165, 0, 0.8)'
          }
        }
      }
    }
    return item
  })

  chartInstance.setOption(option)
}
```

## React Component Implementation

```tsx
import React, { useRef, useEffect, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { Card, Row, Col, Drawer, Descriptions, Tag, Button, Space } from 'antd'
import { ZoomInOutlined, BranchesOutlined, BugOutlined } from '@ant-design/icons'

export const TraceView: React.FC<TraceViewProps> = ({
  traceId,
  spans,
  criticalPath,
  onSpanClick,
  onTraceToLogs,
  onTraceToMetrics
}) => {
  const [selectedSpan, setSelectedSpan] = useState<SpanData | null>(null)
  const [showMinimap, setShowMinimap] = useState(true)
  const mainChartRef = useRef<ReactECharts>(null)
  const minimapRef = useRef<ReactECharts>(null)

  // Main timeline options
  const timelineOption = useMemo(
    () => createTraceTimelineOption(spans),
    [spans]
  )

  // Minimap options
  const minimapOption = useMemo(
    () => createMinimapOption(spans),
    [spans]
  )

  // Handle span click
  const handleSpanClick = (params: any) => {
    const span = spans.find(s => s.spanId === params.name)
    if (span) {
      setSelectedSpan(span)
      onSpanClick?.(span)
    }
  }

  // Highlight critical path if provided
  useEffect(() => {
    if (criticalPath && mainChartRef.current) {
      const chart = mainChartRef.current.getEchartsInstance()
      highlightCriticalPath(chart, criticalPath)
    }
  }, [criticalPath])

  // Sync minimap with main chart zoom
  const handleDataZoom = (params: any) => {
    if (minimapRef.current) {
      // Update minimap brush to show current viewport
      const minimapChart = minimapRef.current.getEchartsInstance()
      minimapChart.dispatchAction({
        type: 'brush',
        areas: [{
          xAxisIndex: 0,
          coordRange: [params.start, params.end]
        }]
      })
    }
  }

  return (
    <div className="trace-view">
      {/* Header with trace info and actions */}
      <Card
        title={`Trace: ${traceId.slice(0, 16)}...`}
        extra={
          <Space>
            <Button
              icon={<BranchesOutlined />}
              onClick={() => onTraceToLogs?.(traceId)}
            >
              View Logs
            </Button>
            <Button
              icon={<ZoomInOutlined />}
              onClick={() => setShowMinimap(!showMinimap)}
            >
              {showMinimap ? 'Hide' : 'Show'} Minimap
            </Button>
          </Space>
        }
      >
        {/* Minimap */}
        {showMinimap && (
          <div className="trace-minimap" style={{ marginBottom: 16 }}>
            <ReactECharts
              ref={minimapRef}
              option={minimapOption}
              style={{ height: 100 }}
              opts={{ renderer: 'canvas' }}
            />
          </div>
        )}

        {/* Main Timeline */}
        <ReactECharts
          ref={mainChartRef}
          option={timelineOption}
          style={{ height: 600 }}
          opts={{ renderer: 'canvas' }}
          onEvents={{
            click: handleSpanClick,
            datazoom: handleDataZoom
          }}
        />
      </Card>

      {/* Span Details Drawer */}
      <Drawer
        title="Span Details"
        placement="right"
        onClose={() => setSelectedSpan(null)}
        open={!!selectedSpan}
        width={500}
      >
        {selectedSpan && (
          <>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Service">
                {selectedSpan.serviceName}
              </Descriptions.Item>
              <Descriptions.Item label="Operation">
                {selectedSpan.operationName}
              </Descriptions.Item>
              <Descriptions.Item label="Duration">
                {(selectedSpan.duration / 1000000).toFixed(2)}ms
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={selectedSpan.status === 'error' ? 'red' : 'green'}>
                  {selectedSpan.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Span Kind">
                {selectedSpan.kind}
              </Descriptions.Item>
            </Descriptions>

            {/* Span Events */}
            {selectedSpan.events && selectedSpan.events.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h4>Span Events</h4>
                {selectedSpan.events.map((event, idx) => (
                  <div key={idx} style={{ marginBottom: 8 }}>
                    <Tag color={event.name.includes('error') ? 'red' : 'blue'}>
                      {event.name}
                    </Tag>
                    <span style={{ fontSize: 12, color: '#666' }}>
                      {new Date(event.timestamp / 1000000).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Attributes */}
            <div style={{ marginTop: 16 }}>
              <h4>Attributes</h4>
              <pre style={{ fontSize: 12, overflow: 'auto' }}>
                {JSON.stringify(selectedSpan.attributes, null, 2)}
              </pre>
            </div>

            {/* Actions */}
            <div style={{ marginTop: 16 }}>
              <Space>
                <Button
                  onClick={() => onTraceToLogs?.(selectedSpan.traceId, selectedSpan.spanId)}
                >
                  View Logs for this Span
                </Button>
                <Button
                  onClick={() => onTraceToMetrics?.(
                    selectedSpan.serviceName,
                    selectedSpan.operationName
                  )}
                >
                  View Metrics
                </Button>
              </Space>
            </div>
          </>
        )}
      </Drawer>
    </div>
  )
}
```

## Integration with otel-ai Platform

### 1. Data Fetching from ClickHouse

```typescript
// Query to fetch trace spans from ClickHouse
const getTraceSpans = async (traceId: string): Promise<SpanData[]> => {
  const query = `
    SELECT
      trace_id,
      span_id,
      parent_span_id,
      service_name,
      operation_name,
      start_time,
      end_time,
      duration_ns,
      status_code,
      span_kind,
      attributes,
      events
    FROM traces
    WHERE trace_id = '${traceId}'
    ORDER BY start_time ASC
  `

  const results = await clickhouse.query(query)
  return results.map(row => ({
    traceId: row.trace_id,
    spanId: row.span_id,
    parentSpanId: row.parent_span_id,
    serviceName: row.service_name,
    operationName: row.operation_name,
    startTime: row.start_time,
    endTime: row.end_time,
    duration: row.duration_ns,
    status: mapStatusCode(row.status_code),
    kind: row.span_kind,
    attributes: JSON.parse(row.attributes),
    events: JSON.parse(row.events || '[]')
  }))
}
```

### 2. AI-Enhanced Critical Path Detection

```typescript
// Use AI analyzer to identify critical path
const identifyCriticalPath = async (spans: SpanData[]): Promise<string[]> => {
  const analysis = await aiAnalyzer.analyzeCriticalPath({
    spans,
    strategy: 'longest-duration',  // or 'most-errors', 'bottleneck'
  })

  return analysis.criticalSpanIds
}
```

### 3. Trace-to-Logs Correlation

```typescript
// Navigate to logs view filtered by trace/span
const handleTraceToLogs = (traceId: string, spanId?: string) => {
  const filter = spanId
    ? `trace_id = '${traceId}' AND span_id = '${spanId}'`
    : `trace_id = '${traceId}'`

  navigate('/logs', {
    state: {
      filter,
      timeRange: getTraceTimeRange(traceId)
    }
  })
}
```

## Performance Optimizations

1. **Virtual Rendering**: For traces with >100 spans, use virtual scrolling
2. **Progressive Loading**: Load span details on demand
3. **Canvas Rendering**: Use canvas instead of SVG for better performance
4. **Debounced Updates**: Batch chart updates when filtering/zooming
5. **Memoization**: Cache calculated positions and hierarchies

## Testing Strategy

1. **Unit Tests**: Test span tree building, time calculations
2. **Integration Tests**: Test with real OTel demo data
3. **Performance Tests**: Validate with traces containing 1000+ spans
4. **Visual Tests**: Screenshot testing for different trace patterns

## Success Metrics

- [ ] Render traces with 1000+ spans in <2 seconds
- [ ] Support all OTel span kinds and attributes
- [ ] Critical path highlighting with <100ms calculation
- [ ] Seamless navigation to logs/metrics views
- [ ] Mobile-responsive design for tablet viewing

## References

- [OpenTelemetry Trace Data Model](https://opentelemetry.io/docs/reference/specification/trace/api/)
- [Apache ECharts Custom Series](https://echarts.apache.org/en/option.html#series-custom)
- [Jaeger UI Architecture](https://www.jaegertracing.io/docs/1.21/frontend-ui/)
- [Grafana Tempo UI](https://grafana.com/docs/tempo/latest/operations/tempo-ui/)