import {
  BarChartOutlined,
  ClearOutlined,
  CopyOutlined,
  DownOutlined,
  FormatPainterOutlined,
  HistoryOutlined,
  InfoCircleOutlined,
  PlayCircleOutlined,
  SaveOutlined,
  TableOutlined
} from '@ant-design/icons'
import {
  App,
  Button,
  Card,
  Col,
  Dropdown,
  Row,
  Space,
  Spin,
  Switch,
  Tooltip,
  Typography
} from 'antd'
import React, { useCallback, useEffect, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useLocation } from 'react-router-dom'
import { format } from 'sql-formatter'
import { DynamicChartRenderer } from '../../components/DynamicCharts/DynamicChartRenderer'
import { MonacoQueryEditor } from '../../components/MonacoEditor/MonacoQueryEditor'
import { TimeRangeSelector } from '../../components/TimeRangeSelector/TimeRangeSelector'
import { TraceResults } from '../../components/TraceResults/TraceResults'
import { useClickhouseQuery } from '../../hooks/useClickhouseQuery'
import { useAppStore } from '../../store/appStore'

const { Title } = Typography

// Interface for trace data from ClickHouse matching what TraceResults expects
interface TraceRow {
  trace_id: string
  service_name: string
  operation_name: string
  duration_ms: number
  timestamp: string
  status_code: string
  is_error: number
  span_kind?: string
  span_id?: string
  parent_span_id?: string
  is_root?: number
  encoding_type?: 'json' | 'protobuf'
  attributes?: Record<string, unknown>
  resource_attributes?: Record<string, unknown>
}

const DEFAULT_QUERY = `-- Query traces from simplified single-path ingestion
SELECT 
  trace_id,
  span_id,
  service_name,
  operation_name,
  duration_ms,
  start_time as timestamp,
  status_code,
  is_error,
  span_kind,
  is_root,
  encoding_type,
  parent_span_id
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

// Helper function to infer natural language description from SQL query
function inferNaturalLanguageFromSQL(sql: string): string {
  const lowerSQL = sql.toLowerCase()

  // Look for common patterns in the SQL
  if (lowerSQL.includes('count(') && lowerSQL.includes('group by')) {
    if (lowerSQL.includes('service_name')) {
      if (lowerSQL.includes('error') || lowerSQL.includes('status_code')) {
        return 'Show error count by service'
      }
      return 'Show request count by service'
    }
    if (lowerSQL.includes('minute') || lowerSQL.includes('tostartofsecond')) {
      return 'Show request count over time'
    }
  }

  if (lowerSQL.includes('quantile') || lowerSQL.includes('p95') || lowerSQL.includes('p99')) {
    if (lowerSQL.includes('service_name')) {
      return 'Show latency percentiles by service'
    }
    return 'Show latency percentiles over time'
  }

  if (lowerSQL.includes('duration_ms') || lowerSQL.includes('duration_ns')) {
    if (lowerSQL.includes('avg(')) {
      return 'Show average duration by service'
    }
    if (lowerSQL.includes('max(')) {
      return 'Show maximum duration by service'
    }
    return 'Show trace durations'
  }

  if (lowerSQL.includes('is_error') || lowerSQL.includes('status_code')) {
    return 'Show error analysis'
  }

  // Default fallback
  if (lowerSQL.includes('service_name') && lowerSQL.includes('operation_name')) {
    return 'Show service operations analysis'
  }

  return 'Analyze trace data'
}

export const TracesView: React.FC = () => {
  const { message } = App.useApp()
  const location = useLocation()
  const locationState = location.state as LocationState | null
  const { activeQuery, setActiveQuery, queryHistory, addToQueryHistory } = useAppStore()
  const [query, setQuery] = useState(activeQuery || DEFAULT_QUERY)
  const [isRunning, setIsRunning] = useState(false)
  const [queryMetadata, setQueryMetadata] = useState<LocationState['metadata'] | null>(null)
  const [viewMode, setViewMode] = useState<'dynamic' | 'table'>('dynamic')
  const [dynamicViewError, setDynamicViewError] = useState<string | null>(null)
  const [dynamicComponent, setDynamicComponent] = useState<{
    component: string
    props: {
      config?: unknown
      data?: unknown[]
      height?: string
    }
  } | null>(null)

  const {
    data: queryResults,
    isLoading,
    error,
    refetch
  } = useClickhouseQuery<TraceRow>(query, {
    enabled: false // Don't auto-run, only on explicit execution
  })

  // Dynamic UI generation hook - available for future use
  // const { data: dynamicUIData, loading: dynamicUILoading, error: dynamicUIError, generateUI } = useUIGeneration()

  const handleRunQuery = useCallback(async () => {
    setIsRunning(true)
    setActiveQuery(query)
    addToQueryHistory(query)
    setDynamicViewError(null)

    try {
      // Run the query first
      const result = await refetch()

      // If in dynamic mode and query succeeded, try to generate dynamic UI
      // We pass the SQL query directly to the backend, which will execute it and generate UI
      if (viewMode === 'dynamic' && result && result.data) {
        try {
          // The backend expects the actual SQL query to analyze the results
          // Use the proxy to reach the backend
          const response = await fetch('/api/ui-generator/from-sql', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              sql: query,
              queryResults: result.data, // Pass the actual results
              context: {
                criticalPath: queryMetadata?.criticalPath,
                description: queryMetadata?.description || inferNaturalLanguageFromSQL(query)
              }
            })
          })

          if (response.ok) {
            const uiData = await response.json()
            // Set the dynamic UI data directly
            if (uiData && uiData.component) {
              setDynamicComponent(uiData.component)
              console.log('Generated UI component:', uiData.component)
            }
          } else {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }
        } catch (uiError) {
          console.error('Failed to generate dynamic UI:', uiError)
          setDynamicViewError('Unable to generate visualization. Showing table view instead.')
          // Don't throw - fall back to table view
        }
      }
    } finally {
      setIsRunning(false)
    }
  }, [query, setActiveQuery, addToQueryHistory, refetch, viewMode, queryMetadata])

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
        console.log('TracesView: Sample columns:', Object.keys(queryResults.data[0]))
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

  // Generate dynamic UI when switching to dynamic mode with existing results
  useEffect(() => {
    if (viewMode === 'dynamic' && queryResults && !dynamicComponent) {
      // Generate the dynamic UI
      fetch('/api/ui-generator/from-sql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sql: query,
          queryResults: queryResults.data,
          context: {
            criticalPath: queryMetadata?.criticalPath,
            description: queryMetadata?.description || inferNaturalLanguageFromSQL(query)
          }
        })
      })
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return response.json()
        })
        .then((uiData) => {
          if (uiData && uiData.component) {
            setDynamicComponent(uiData.component)
            console.log('Generated UI component on mode switch:', uiData.component)
          }
        })
        .catch((error) => {
          console.error('Failed to generate dynamic UI on mode switch:', error)
          setDynamicViewError('Unable to generate visualization. Use table view to see results.')
        })
    }
  }, [viewMode, queryResults, dynamicComponent, query, queryMetadata])

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
            title={
              <Space>
                <span>Query Results</span>
                {queryResults && (
                  <Switch
                    checkedChildren={
                      <>
                        <BarChartOutlined /> Dynamic
                      </>
                    }
                    unCheckedChildren={
                      <>
                        <TableOutlined /> Table
                      </>
                    }
                    checked={viewMode === 'dynamic'}
                    onChange={(checked) => {
                      setViewMode(checked ? 'dynamic' : 'table')
                      if (!checked) {
                        // Reset error when switching to table view
                        setDynamicViewError(null)
                      }
                    }}
                    style={{ marginLeft: 16 }}
                    data-testid="view-mode-toggle"
                  />
                )}
              </Space>
            }
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
                data-testid="query-error-message"
                style={{
                  padding: '24px',
                  textAlign: 'center',
                  color: '#ff4d4f'
                }}
              >
                Query Error: {error.message}
              </div>
            ) : queryResults ? (
              // Render based on view mode
              viewMode === 'dynamic' && dynamicComponent && !dynamicViewError ? (
                // Dynamic view with generated charts
                <div
                  style={{ padding: '16px', height: '100%', overflow: 'auto' }}
                  data-testid="dynamic-view-container"
                >
                  <DynamicChartRenderer
                    component={dynamicComponent}
                    loading={false}
                    error={dynamicViewError || undefined}
                  />
                  {dynamicViewError && (
                    <div style={{ marginTop: '16px', color: '#ff7875', textAlign: 'center' }}>
                      {dynamicViewError}
                    </div>
                  )}
                </div>
              ) : (
                // Table view (fallback or selected)
                <TraceResults
                  data={{
                    data: queryResults.data,
                    rows: queryResults.rows,
                    statistics: queryResults.statistics
                  }}
                />
              )
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
