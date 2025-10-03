import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Spin, Alert, Space, Button, Typography } from 'antd'
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons'
import { TraceWaterfall } from './components/TraceWaterfall'
import { TraceMinimap } from './components/TraceMinimap'
import { SpanDetailsPanel } from './components/SpanDetailsPanel'
import { TraceControls } from './components/TraceControls'
import { useTraceData } from './hooks/useTraceData'
import { useCriticalPaths } from '../../hooks/useCriticalPaths'
import { TraceViewConfig, ViewportConfig, SpanTreeNode } from './types'
import { buildSpanTree } from './utils/trace-builder'

const { Title } = Typography

const DEFAULT_CONFIG: TraceViewConfig = {
  showMinimap: true,
  showCriticalPath: false,
  showErrors: false,
  expandAll: true,
  timeFormat: 'relative',
  colorScheme: 'default'
}

const DEFAULT_VIEWPORT: ViewportConfig = {
  startTime: 0,
  endTime: 0,
  zoom: 1,
  panX: 0
}

export const TraceView: React.FC = () => {
  const { traceId } = useParams<{ traceId: string }>()
  const navigate = useNavigate()

  const [config, setConfig] = useState<TraceViewConfig>(DEFAULT_CONFIG)
  const [viewport, setViewport] = useState<ViewportConfig>(DEFAULT_VIEWPORT)
  const [selectedSpan, setSelectedSpan] = useState<SpanTreeNode | null>(null)
  const [spanTree, setSpanTree] = useState<SpanTreeNode[] | null>(null)

  // Fetch trace data
  const { data: traceData, isLoading, error, refetch } = useTraceData(traceId || '')

  // Fetch critical paths for the trace's time range
  // Use a 1-hour window around the trace's start time
  const criticalPathsParams = traceData
    ? {
        startTime: new Date(traceData.metadata.startTime - 30 * 60 * 1000).toISOString(), // 30 min before
        endTime: new Date(traceData.metadata.endTime + 30 * 60 * 1000).toISOString() // 30 min after
      }
    : { startTime: '', endTime: '' }

  const {
    data: criticalPathsData,
    isLoading: criticalPathsLoading,
    error: criticalPathsError
  } = useCriticalPaths(criticalPathsParams, {
    enabled: !!traceData && config.showCriticalPath // Only fetch when trace data loaded and enabled
  })

  // Build span tree when data changes
  useEffect(() => {
    if (traceData?.spans) {
      // Debug: Log parent-child relationships
      console.log(
        'Building span tree. Spans:',
        traceData.spans.map((s) => ({
          spanId: s.spanId.substring(0, 8),
          parentSpanId: s.parentSpanId?.substring(0, 8) || 'ROOT',
          service: s.serviceName,
          operation: s.operationName
        }))
      )

      const tree = buildSpanTree(traceData.spans)

      console.log('Built tree. Root count:', tree.length)

      setSpanTree(tree)

      // Set initial viewport to show full trace
      if (traceData.metadata) {
        setViewport({
          startTime: traceData.metadata.startTime,
          endTime: traceData.metadata.endTime,
          zoom: 1,
          panX: 0
        })
      }
    }
  }, [traceData])

  const handleSpanClick = (span: SpanTreeNode) => {
    setSelectedSpan(span)
  }

  const handleViewportChange = (newViewport: ViewportConfig) => {
    setViewport(newViewport)
  }

  const handleConfigChange = (newConfig: Partial<TraceViewConfig>) => {
    setConfig({ ...config, ...newConfig })
  }

  const handleBack = () => {
    navigate('/traces')
  }

  if (isLoading) {
    return (
      <div
        style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}
      >
        <Spin size="large" tip="Loading trace data..." />
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          message="Error Loading Trace"
          description={error?.message || 'Failed to load trace data'}
          type="error"
          action={
            <Space>
              <Button onClick={handleBack} icon={<ArrowLeftOutlined />}>
                Back to Traces
              </Button>
              <Button onClick={() => refetch()} icon={<ReloadOutlined />}>
                Retry
              </Button>
            </Space>
          }
        />
      </div>
    )
  }

  if (!traceData || !spanTree) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          message="No Trace Data"
          description="No spans found for this trace ID"
          type="info"
          action={
            <Button onClick={handleBack} icon={<ArrowLeftOutlined />}>
              Back to Traces
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Card variant="borderless" style={{ borderRadius: 0 }}>
        <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>
              Back
            </Button>
            <Title level={4} style={{ margin: 0 }}>
              Trace: {traceId?.substring(0, 16)}...
            </Title>
            <Space>
              <span>Services: {traceData.metadata.services.length}</span>
              <span>Spans: {traceData.metadata.totalSpans}</span>
              <span>Duration: {Math.round(traceData.metadata.durationMs)}ms</span>
              {config.showCriticalPath && criticalPathsLoading && (
                <span>
                  <Spin size="small" /> Loading critical paths...
                </span>
              )}
              {config.showCriticalPath && criticalPathsError && (
                <span style={{ color: '#ff4d4f' }}>Critical paths unavailable</span>
              )}
              {config.showCriticalPath && criticalPathsData && (
                <span style={{ color: '#52c41a' }}>
                  {criticalPathsData.paths.length} critical paths found
                </span>
              )}
            </Space>
          </Space>
          <TraceControls
            config={config}
            onConfigChange={handleConfigChange}
            onRefresh={() => refetch()}
          />
        </Space>
      </Card>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Minimap */}
        {config.showMinimap && (
          <TraceMinimap
            spans={spanTree}
            viewport={viewport}
            onViewportChange={handleViewportChange}
            height={100}
          />
        )}

        {/* Waterfall */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <TraceWaterfall
            spans={spanTree}
            viewport={viewport}
            config={config}
            selectedSpan={selectedSpan}
            criticalPaths={criticalPathsData?.paths}
            onSpanClick={handleSpanClick}
            onViewportChange={handleViewportChange}
          />
        </div>
      </div>

      {/* Details Panel */}
      {selectedSpan && (
        <SpanDetailsPanel span={selectedSpan} onClose={() => setSelectedSpan(null)} />
      )}
    </div>
  )
}
