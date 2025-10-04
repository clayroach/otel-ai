import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Spin, Alert, Space, Button, Typography } from 'antd'
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { TraceWaterfall } from './components/TraceWaterfall'
import { TraceMinimap } from './components/TraceMinimap'
import { SpanDetailsPanel } from './components/SpanDetailsPanel'
import { TraceControls } from './components/TraceControls'
import { SpanTree } from './components/SpanTree'
import { SpanSearch } from './components/SpanSearch'
import { useTraceData } from './hooks/useTraceData'
import { useCriticalPaths } from '../../hooks/useCriticalPaths'
import { TraceViewConfig, ViewportConfig, SpanTreeNode } from './types'
import { buildSpanTree, searchSpans, expandToSpan } from './utils/trace-builder'

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

  // Search and collapse state
  const [collapsedSpans, setCollapsedSpans] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)

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
      const tree = buildSpanTree(traceData.spans)
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

  // Search logic - find matching spans
  const searchResults = useMemo(() => {
    if (!spanTree || !searchQuery) return []
    return searchSpans(spanTree, searchQuery)
  }, [spanTree, searchQuery])

  const matchingSpans = useMemo(() => {
    return searchResults.map((r) => r.spanId)
  }, [searchResults])

  // Auto-expand to show search results
  useEffect(() => {
    if (matchingSpans.length > 0 && spanTree) {
      const currentMatchSpanId = matchingSpans[currentMatchIndex]
      if (currentMatchSpanId) {
        const toExpand = expandToSpan(currentMatchSpanId, spanTree)
        setCollapsedSpans((prev) => {
          const newSet = new Set(prev)
          toExpand.forEach((id) => newSet.delete(id)) // Remove from collapsed set = expand
          return newSet
        })
      }
    }
  }, [matchingSpans, currentMatchIndex, spanTree])

  // Event handlers
  const handleToggleCollapse = useCallback((spanId: string) => {
    setCollapsedSpans((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(spanId)) {
        newSet.delete(spanId)
      } else {
        newSet.add(spanId)
      }
      return newSet
    })
  }, [])

  const handleSearchQueryChange = useCallback((query: string) => {
    setSearchQuery(query)
    setCurrentMatchIndex(0) // Reset to first match
  }, [])

  const handleNavigatePrev = useCallback(() => {
    setCurrentMatchIndex((prev) => {
      if (prev === 0) return matchingSpans.length - 1
      return prev - 1
    })
  }, [matchingSpans.length])

  const handleNavigateNext = useCallback(() => {
    setCurrentMatchIndex((prev) => {
      if (prev === matchingSpans.length - 1) return 0
      return prev + 1
    })
  }, [matchingSpans.length])

  const handleClearSearch = useCallback(() => {
    setSearchQuery('')
    setCurrentMatchIndex(0)
  }, [])

  const handleExpandAll = useCallback(() => {
    setCollapsedSpans(new Set())
  }, [])

  const handleCollapseAll = useCallback(() => {
    if (!spanTree) return

    const allSpanIds = new Set<string>()
    const collectIds = (nodes: SpanTreeNode[]) => {
      nodes.forEach((node) => {
        if (node.children.length > 0) {
          allSpanIds.add(node.spanId)
        }
        collectIds(node.children)
      })
    }
    collectIds(spanTree)

    setCollapsedSpans(allSpanIds)
  }, [spanTree])

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
        <Spin size="large" />
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
            onExpandAll={handleExpandAll}
            onCollapseAll={handleCollapseAll}
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

        {/* Two-Panel Layout: Tree + Waterfall */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <PanelGroup direction="horizontal">
            {/* Left Panel: Span Tree */}
            <Panel defaultSize={25} minSize={15} maxSize={40}>
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden'
                }}
              >
                {/* Search Component */}
                <SpanSearch
                  query={searchQuery}
                  matchCount={matchingSpans.length}
                  currentIndex={currentMatchIndex}
                  onQueryChange={handleSearchQueryChange}
                  onNavigatePrev={handleNavigatePrev}
                  onNavigateNext={handleNavigateNext}
                  onClear={handleClearSearch}
                />

                {/* Tree Component */}
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <SpanTree
                    spans={spanTree}
                    selectedSpan={selectedSpan}
                    collapsedSpans={collapsedSpans}
                    searchQuery={searchQuery}
                    matchingSpans={matchingSpans}
                    currentMatchIndex={currentMatchIndex}
                    onSpanClick={handleSpanClick}
                    onToggleCollapse={handleToggleCollapse}
                  />
                </div>
              </div>
            </Panel>

            {/* Resize Handle */}
            <PanelResizeHandle
              style={{
                width: '4px',
                backgroundColor: '#e8e8e8',
                cursor: 'col-resize',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => {
                const target = e.currentTarget as unknown as HTMLElement
                target.style.backgroundColor = '#1890ff'
              }}
              onMouseLeave={(e) => {
                const target = e.currentTarget as unknown as HTMLElement
                target.style.backgroundColor = '#e8e8e8'
              }}
            />

            {/* Right Panel: Waterfall */}
            <Panel minSize={60}>
              <div style={{ height: '100%', overflow: 'hidden' }}>
                <TraceWaterfall
                  spans={spanTree}
                  viewport={viewport}
                  config={config}
                  selectedSpan={selectedSpan}
                  collapsedSpans={collapsedSpans}
                  criticalPaths={criticalPathsData?.paths}
                  onSpanClick={handleSpanClick}
                  onViewportChange={handleViewportChange}
                />
              </div>
            </Panel>
          </PanelGroup>
        </div>
      </div>

      {/* Details Panel */}
      {selectedSpan && (
        <SpanDetailsPanel span={selectedSpan} onClose={() => setSelectedSpan(null)} />
      )}
    </div>
  )
}
