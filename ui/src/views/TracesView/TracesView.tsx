import {
  ClearOutlined,
  CopyOutlined,
  DownOutlined,
  FormatPainterOutlined,
  HistoryOutlined,
  PlayCircleOutlined,
  SaveOutlined,
  InfoCircleOutlined
} from '@ant-design/icons'
import {
  Button,
  Card,
  Col,
  Dropdown,
  Row,
  Space,
  Spin,
  Tooltip,
  Typography,
  App,
  Table
} from 'antd'
import React, { useCallback, useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { format } from 'sql-formatter'
import { MonacoQueryEditor } from '../../components/MonacoEditor/MonacoQueryEditor'
import { TimeRangeSelector } from '../../components/TimeRangeSelector/TimeRangeSelector'
import { useClickhouseQuery } from '../../hooks/useClickhouseQuery'
import { useAppStore } from '../../store/appStore'

const { Title } = Typography

// Generate table columns from data
const generateColumns = (data: Record<string, unknown>[]) => {
  if (!data || data.length === 0) return []

  const firstRow = data[0]
  if (!firstRow) return []

  return Object.keys(firstRow).map((key) => ({
    title: key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
    dataIndex: key,
    key,
    render: (value: unknown) => {
      if (value === null || value === undefined) return '-'

      // Handle timestamps
      if (key.includes('time') && typeof value === 'string') {
        try {
          const date = new Date(value)
          if (!isNaN(date.getTime())) {
            return date.toLocaleString()
          }
        } catch (e) {
          // Ignore parsing errors
        }
      }

      // Handle duration
      if (key.includes('duration') && typeof value === 'number') {
        return `${value.toFixed(2)}ms`
      }

      // Handle boolean-like values
      if (key.includes('is_') && (value === 0 || value === 1)) {
        return value === 1 ? 'Yes' : 'No'
      }

      return String(value)
    },
    sorter: (a: Record<string, unknown>, b: Record<string, unknown>) => {
      const aVal = a[key]
      const bVal = b[key]

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return aVal - bVal
      }

      return String(aVal || '').localeCompare(String(bVal || ''))
    },
    width: key === 'trace_id' || key === 'span_id' ? 200 : undefined
  }))
}

const DEFAULT_QUERY = `-- Query traces from simplified single-path ingestion
SELECT 
  trace_id,
  service_name,
  operation_name,
  duration_ms,
  start_time as timestamp,
  status_code,
  is_error,
  span_kind,
  is_root,
  encoding_type
FROM otel.traces 
WHERE start_time >= subtractHours(now(), 3)
ORDER BY start_time DESC 
LIMIT 100`

interface LocationState {
  query?: string
  metadata?: {
    model: string
    generatedAt: number
    generationTime: number
    criticalPath: string
    description?: string
  }
}

export const TracesView: React.FC = () => {
  const { message } = App.useApp()
  const location = useLocation()
  const locationState = location.state as LocationState | null
  const { activeQuery, setActiveQuery, queryHistory, addToQueryHistory } = useAppStore()
  const [query, setQuery] = useState(activeQuery || DEFAULT_QUERY)
  const [isRunning, setIsRunning] = useState(false)
  const [queryMetadata, setQueryMetadata] = useState<LocationState['metadata'] | null>(null)

  const {
    data: queryResults,
    isLoading,
    error,
    refetch
  } = useClickhouseQuery(query, {
    enabled: false // Don't auto-run, only on explicit execution
  })

  const handleRunQuery = useCallback(async () => {
    setIsRunning(true)
    setActiveQuery(query)
    addToQueryHistory(query)
    try {
      await refetch()
    } finally {
      setIsRunning(false)
    }
  }, [query, setActiveQuery, addToQueryHistory, refetch])

  const handleFormatQuery = useCallback(() => {
    try {
      // First fix common function name issues
      const fixedQuery = query
        .replace(/subtracthours/gi, 'subtractHours') // Fix case-sensitive function
        .replace(/substracthours/gi, 'subtractHours') // Fix common typo
        .replace(/now\(\s*\)/gi, 'now()') // Fix spacing in now()

      const formatted = format(fixedQuery, {
        language: 'sql',
        tabWidth: 2,
        keywordCase: 'upper',
        functionCase: 'preserve', // Keep function names as-is
        identifierCase: 'preserve', // Keep identifiers as-is
        linesBetweenQueries: 2
      })
      setQuery(formatted)
    } catch (error) {
      console.error('Error formatting SQL:', error)
    }
  }, [query])

  const handleClearQuery = useCallback(() => {
    setQuery('')
  }, [])

  const handleCopyQuery = useCallback(() => {
    navigator.clipboard.writeText(query)
  }, [query])

  const handleSaveQuery = useCallback(() => {
    // TODO: Implement query saving to file
    console.log('Save query')
  }, [])

  const handleHistorySelect = useCallback(
    (historyItem: { query: string; timestamp: string; description: string }) => {
      setQuery(historyItem.query)
      setActiveQuery(historyItem.query)
      // Auto-run the historical query
      setTimeout(() => {
        handleRunQuery()
      }, 100)
    },
    [setActiveQuery, handleRunQuery]
  )

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value)
  }, [])

  // Log query results
  React.useEffect(() => {
    if (queryResults?.data && Array.isArray(queryResults.data)) {
      console.log('TracesView: Query results:', queryResults.data.length, 'rows')
      if (queryResults.data.length > 0) {
        console.log(
          'TracesView: Sample columns:',
          Object.keys(queryResults.data[0] as Record<string, unknown>)
        )
      }
    }
  }, [queryResults])

  // Handle incoming generated query from navigation
  useEffect(() => {
    if (locationState?.query) {
      setQuery(locationState.query)
      setQueryMetadata(locationState.metadata || null)

      // Show notification about the generated query
      if (locationState.metadata) {
        message.info({
          content: `Query generated with ${locationState.metadata.model} for ${locationState.metadata.criticalPath}`,
          duration: 5,
          icon: <InfoCircleOutlined />
        })
      }

      // Auto-run the generated query
      setTimeout(() => {
        handleRunQuery()
      }, 500)

      // Clear the location state to prevent re-running on navigation
      window.history.replaceState({}, document.title)
    }
  }, [locationState, handleRunQuery])

  return (
    <div
      style={{
        padding: '24px',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: '16px', flexShrink: 0 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }} data-testid="traces-page-title">
            Trace Analysis - Unified Processing
          </Title>
        </Col>
        <Col>
          <Space>
            <TimeRangeSelector />
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleRunQuery}
              loading={isRunning || isLoading}
              data-testid="traces-run-query-button"
            >
              Run Query
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Main Content - Resizable Panels */}
      <PanelGroup direction="horizontal" style={{ flex: 1 }}>
        {/* Query Editor Panel */}
        <Panel defaultSize={30} minSize={20} maxSize={60}>
          <Card
            title={
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <Space>
                  <span>Query Editor</span>
                  {queryMetadata && (
                    <Tooltip
                      title={`Generated with ${queryMetadata.model} in ${queryMetadata.generationTime}ms`}
                    >
                      <span style={{ fontSize: '12px', color: '#1890ff' }}>
                        (AI Generated for {queryMetadata.criticalPath})
                      </span>
                    </Tooltip>
                  )}
                </Space>
                <Space size="small">
                  {queryHistory.length > 0 && (
                    <Dropdown
                      menu={{
                        items: queryHistory.map((histItem, index) => ({
                          key: index,
                          label: (
                            <div style={{ maxWidth: '350px', padding: '4px 0' }}>
                              <div
                                style={{
                                  fontWeight: 'medium',
                                  marginBottom: '2px',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {histItem.description}
                              </div>
                              <div
                                style={{
                                  fontSize: '11px',
                                  color: '#888',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {histItem.timestamp}
                              </div>
                            </div>
                          ),
                          onClick: () => handleHistorySelect(histItem)
                        }))
                      }}
                      trigger={['click']}
                    >
                      <Tooltip title="Query History">
                        <Button size="small" icon={<HistoryOutlined />}>
                          History <DownOutlined />
                        </Button>
                      </Tooltip>
                    </Dropdown>
                  )}
                  <Tooltip title="Format & Fix SQL">
                    <Button
                      size="small"
                      icon={<FormatPainterOutlined />}
                      onClick={handleFormatQuery}
                    />
                  </Tooltip>
                  <Tooltip title="Copy Query">
                    <Button size="small" icon={<CopyOutlined />} onClick={handleCopyQuery} />
                  </Tooltip>
                  <Tooltip title="Clear Query">
                    <Button size="small" icon={<ClearOutlined />} onClick={handleClearQuery} />
                  </Tooltip>
                  <Tooltip title="Save Query">
                    <Button size="small" icon={<SaveOutlined />} onClick={handleSaveQuery} />
                  </Tooltip>
                </Space>
              </div>
            }
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              marginRight: '8px'
            }}
            styles={{ body: { flex: 1, padding: '4px', overflow: 'hidden' } }}
          >
            <MonacoQueryEditor
              value={query}
              onChange={handleQueryChange}
              onRunQuery={handleRunQuery}
              height="100%"
            />
          </Card>
        </Panel>

        {/* Resizable Handle */}
        <PanelResizeHandle
          style={{
            width: '4px',
            backgroundColor: '#d9d9d9',
            cursor: 'col-resize',
            position: 'relative'
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '20px',
              height: '40px',
              backgroundColor: '#bfbfbf',
              borderRadius: '2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.7
            }}
          >
            <div
              style={{
                width: '2px',
                height: '16px',
                backgroundColor: '#8c8c8c',
                marginRight: '2px'
              }}
            />
            <div
              style={{
                width: '2px',
                height: '16px',
                backgroundColor: '#8c8c8c'
              }}
            />
          </div>
        </PanelResizeHandle>

        {/* Results Panel */}
        <Panel defaultSize={70} minSize={40}>
          <Card
            title="Query Results"
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              marginLeft: '8px'
            }}
            styles={{ body: { flex: 1, padding: '0', overflow: 'auto' } }}
            extra={
              queryResults && (
                <span style={{ fontSize: '12px', color: '#666' }}>{queryResults.rows} rows</span>
              )
            }
          >
            {isLoading || isRunning ? (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  height: '100%'
                }}
              >
                <Spin size="large" />
              </div>
            ) : error ? (
              <div
                style={{
                  padding: '24px',
                  textAlign: 'center',
                  color: '#ff4d4f'
                }}
              >
                Query Error: {error.message}
              </div>
            ) : queryResults ? (
              // Simple table showing actual query columns
              <Table
                dataSource={(queryResults.data as Record<string, unknown>[]) || []}
                columns={generateColumns((queryResults.data as Record<string, unknown>[]) || [])}
                loading={isLoading}
                size="small"
                scroll={{ x: true, y: 400 }}
                pagination={{
                  showSizeChanger: true,
                  showQuickJumper: true,
                  showTotal: (total) => `${total} rows`,
                  defaultPageSize: 50,
                  pageSizeOptions: ['20', '50', '100', '200']
                }}
                rowKey={(record, index) => {
                  // Generate unique keys safely
                  const typedRecord = record as Record<string, unknown>
                  const traceId = typedRecord?.trace_id
                  const spanId = typedRecord?.span_id
                  const timestamp = typedRecord?.timestamp || typedRecord?.start_time
                  return `${traceId || 'unknown'}-${spanId || index}-${timestamp || Math.random()}`
                }}
              />
            ) : (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  height: '100%',
                  color: '#666'
                }}
              >
                Run a query to see results
              </div>
            )}
          </Card>
        </Panel>
      </PanelGroup>
    </div>
  )
}
