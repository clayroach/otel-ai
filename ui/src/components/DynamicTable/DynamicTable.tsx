import React, { useMemo } from 'react'
import { Table, Tag, Typography, Tooltip } from 'antd'
import { ClockCircleOutlined, BugOutlined, DatabaseOutlined, LineChartOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { ColumnAnalysis, ResultAnalysis } from '../../services/result-analysis'

const { Text } = Typography

/**
 * DynamicTable Component - Phase 3A
 * 
 * A table component that dynamically adapts its columns based on query result analysis.
 * Maintains the same column-oriented structure while providing intelligent formatting
 * based on detected column types and semantic meaning.
 */

interface DynamicTableProps {
  data: unknown[]
  analysis?: ResultAnalysis
  loading?: boolean
}

export const DynamicTable: React.FC<DynamicTableProps> = ({ 
  data, 
  analysis, 
  loading = false 
}) => {
  // Determine if we should show aggregated view for large datasets
  const shouldAggregate = data.length >= 100
  
  // Generate aggregated data for large datasets
  const processedData = useMemo(() => {
    console.log('DynamicTable: Processing data', { 
      dataLength: data.length, 
      shouldAggregate, 
      sampleRow: data[0] 
    })
    
    if (!shouldAggregate || data.length === 0) {
      console.log('DynamicTable: Not aggregating, returning original data')
      return data
    }

    // For trace data, aggregate by service and operation
    const aggregationMap = new Map<string, {
      service_name: string
      operation_name: string
      trace_count: number
      avg_duration_ms: number
      min_duration_ms: number
      max_duration_ms: number
      error_count: number
      error_rate: number
      latest_timestamp: string
    }>()

    data.forEach((row: any) => {
      const key = `${row.service_name || 'unknown'}_${row.operation_name || 'unknown'}`
      
      if (!aggregationMap.has(key)) {
        aggregationMap.set(key, {
          service_name: row.service_name || 'unknown',
          operation_name: row.operation_name || 'unknown',
          trace_count: 0,
          avg_duration_ms: 0,
          min_duration_ms: Infinity,
          max_duration_ms: 0,
          error_count: 0,
          error_rate: 0,
          latest_timestamp: row.timestamp || row.start_time || ''
        })
      }

      const agg = aggregationMap.get(key)!
      agg.trace_count += 1
      
      const duration = parseFloat(row.duration_ms) || 0
      agg.avg_duration_ms = ((agg.avg_duration_ms * (agg.trace_count - 1)) + duration) / agg.trace_count
      agg.min_duration_ms = Math.min(agg.min_duration_ms, duration)
      agg.max_duration_ms = Math.max(agg.max_duration_ms, duration)
      
      if (row.is_error || row.status_code === 'ERROR') {
        agg.error_count += 1
      }
      agg.error_rate = (agg.error_count / agg.trace_count) * 100
      
      // Keep the latest timestamp
      if (row.timestamp && row.timestamp > agg.latest_timestamp) {
        agg.latest_timestamp = row.timestamp
      }
    })

    const result = Array.from(aggregationMap.values()).sort((a, b) => b.trace_count - a.trace_count)
    console.log('DynamicTable: Aggregation complete', { 
      originalRowCount: data.length, 
      aggregatedRowCount: result.length,
      sampleAggregatedRow: result[0]
    })
    return result
  }, [data, shouldAggregate])

  // Generate dynamic columns based on analysis or infer from data
  const columns = useMemo(() => {
    if (!processedData || processedData.length === 0) {
      return []
    }

    if (shouldAggregate) {
      // Aggregated view columns
      return [
        {
          title: 'Service',
          dataIndex: 'service_name',
          key: 'service_name',
          width: 120,
          render: (value: string, record: any) => (
            <div>
              <Text strong style={{ color: record.error_rate > 5 ? '#ff4d4f' : '#1890ff' }}>
                {value}
              </Text>
              {record.error_rate > 5 && (
                <div style={{ fontSize: '10px', color: '#ff4d4f' }}>
                  🚨 High Error Rate
                </div>
              )}
            </div>
          )
        },
        {
          title: 'Operation',
          dataIndex: 'operation_name', 
          key: 'operation_name',
          width: 200,
          ellipsis: { showTitle: false },
          render: (value: string) => (
            <Tooltip title={value}>
              <Text>{value}</Text>
            </Tooltip>
          )
        },
        {
          title: 'Trace Count',
          dataIndex: 'trace_count',
          key: 'trace_count',
          width: 100,
          sorter: (a: any, b: any) => a.trace_count - b.trace_count,
          render: (value: number) => (
            <Text strong style={{ color: '#52c41a' }}>{value.toLocaleString()}</Text>
          )
        },
        {
          title: 'Performance',
          key: 'performance',
          width: 140,
          sorter: (a: any, b: any) => a.avg_duration_ms - b.avg_duration_ms,
          render: (record: any) => {
            const avgMs = record.avg_duration_ms
            const isSlowLatency = avgMs > 1000 // > 1 second is slow
            const isMediumLatency = avgMs > 100 // > 100ms is medium
            
            return (
              <div>
                <div style={{ 
                  color: isSlowLatency ? '#ff4d4f' : isMediumLatency ? '#fa8c16' : '#52c41a',
                  fontWeight: 'bold'
                }}>
                  <ClockCircleOutlined /> {avgMs.toFixed(1)}ms avg
                </div>
                <Text type="secondary" style={{ fontSize: '10px' }}>
                  {record.min_duration_ms.toFixed(0)}-{record.max_duration_ms.toFixed(0)}ms range
                </Text>
                {isSlowLatency && (
                  <div style={{ fontSize: '10px', color: '#ff4d4f' }}>
                    ⚠️ Slow response
                  </div>
                )}
              </div>
            )
          }
        },
        {
          title: 'Health Status',
          key: 'health_status',
          width: 120,
          sorter: (a: any, b: any) => b.error_rate - a.error_rate, // Sort by error rate desc
          render: (record: any) => {
            const errorRate = record.error_rate
            const errorCount = record.error_count
            const isUnhealthy = errorRate >= 5
            const hasErrors = errorRate > 0
            
            return (
              <div>
                <div style={{ 
                  color: isUnhealthy ? '#ff4d4f' : hasErrors ? '#fa8c16' : '#52c41a',
                  fontWeight: 'bold'
                }}>
                  {isUnhealthy ? '🔴' : hasErrors ? '🟡' : '🟢'} 
                  {errorRate > 0 ? `${errorRate.toFixed(1)}% errors` : 'Healthy'}
                </div>
                {errorCount > 0 && (
                  <Text type="secondary" style={{ fontSize: '10px' }}>
                    {errorCount} failed requests
                  </Text>
                )}
                {isUnhealthy && (
                  <div style={{ fontSize: '10px', color: '#ff4d4f' }}>
                    🚨 Needs attention
                  </div>
                )}
              </div>
            )
          }
        },
        {
          title: 'Activity & Trends',
          key: 'activity_trends', 
          width: 140,
          render: (record: any) => {
            const timestamp = record.latest_timestamp
            const traceCount = record.trace_count
            const isHighVolume = traceCount > 10
            const isLowVolume = traceCount <= 2
            
            return (
              <div>
                <div style={{ fontSize: '12px', fontWeight: 'bold' }}>
                  {isHighVolume ? '📈' : isLowVolume ? '📉' : '📊'} 
                  {traceCount} requests
                </div>
                {timestamp && (
                  <Text type="secondary" style={{ fontSize: '10px' }}>
                    Last: {dayjs(timestamp).format('HH:mm:ss')}
                  </Text>
                )}
                <div style={{ fontSize: '10px', color: isHighVolume ? '#52c41a' : isLowVolume ? '#fa8c16' : '#666' }}>
                  {isHighVolume ? 'High traffic' : isLowVolume ? 'Low usage' : 'Normal'}
                </div>
              </div>
            )
          }
        }
      ]
    } else if (analysis) {
      // Use analysis-based columns when available
      return analysis.columns.map((columnAnalysis: ColumnAnalysis) => {
        return createDynamicColumn(columnAnalysis)
      })
    } else {
      // Fallback: create basic columns from data structure  
      const firstRow = processedData[0] as Record<string, unknown>
      if (!firstRow) return []
      
      return Object.keys(firstRow).map((columnName) => ({
        title: columnName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        dataIndex: columnName,
        key: columnName,
        ellipsis: { showTitle: false },
        render: (value: unknown) => {
          if (value == null) return '-'
          return String(value)
        }
      }))
    }
  }, [processedData, analysis, shouldAggregate])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Enhanced Analysis Summary */}
      <div style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f0', marginBottom: '12px' }}>
        <Text type="secondary" style={{ fontSize: '12px' }}>
          <DatabaseOutlined /> 
          {shouldAggregate ? (
            <>
              {processedData.length} service operations (aggregated from {data.length} traces)
              {' • '}
              <LineChartOutlined /> 
              Showing summary statistics by service and operation
            </>
          ) : (
            <>
              {data.length} rows, {columns.length} columns
              {analysis && analysis.detectedPatterns.length > 0 && (
                <>
                  {' • '}
                  <LineChartOutlined /> Patterns: {analysis.detectedPatterns.join(', ')}
                </>
              )}
            </>
          )}
          {analysis && (
            <>
              {' • '}
              Recommended: {analysis.recommendedChartType}
            </>
          )}
        </Text>
        {shouldAggregate && (
          <div style={{ marginTop: '4px' }}>
            <Text type="secondary" style={{ fontSize: '11px', fontStyle: 'italic' }}>
              💡 Large dataset automatically aggregated for better insights. Showing performance summary by service and operation.
            </Text>
          </div>
        )}
      </div>

      {/* Dynamic Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <Table
          dataSource={processedData as Record<string, unknown>[]}
          columns={columns}
          loading={loading}
          size="small"
          scroll={{ x: 'max-content', y: 400 }}
          pagination={{
            pageSize: shouldAggregate ? 20 : 50,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} ${shouldAggregate ? 'service operations' : 'items'}`
          }}
          rowKey={(record, index) => `${record.trace_id || record.service_name || record.id || index}`}
        />
      </div>
    </div>
  )
}

/**
 * Create a dynamic column definition based on column analysis
 */
function createDynamicColumn(columnAnalysis: ColumnAnalysis) {
  const { name, type } = columnAnalysis

  const baseColumn = {
    title: createColumnTitle(name, columnAnalysis),
    dataIndex: name,
    key: name,
    width: getColumnWidth(type, name),
    ellipsis: type === 'string' ? { showTitle: false } : false,
    sorter: (a: Record<string, unknown>, b: Record<string, unknown>) => {
      const aVal = a[name]
      const bVal = b[name]
      
      if (type === 'number') {
        return (parseFloat(aVal) || 0) - (parseFloat(bVal) || 0)
      }
      if (type === 'datetime') {
        return dayjs(aVal).valueOf() - dayjs(bVal).valueOf()
      }
      return String(aVal).localeCompare(String(bVal))
    }
  }

  // Add custom render function based on column type
  return {
    ...baseColumn,
    render: (value: unknown) => renderCellValue(value, columnAnalysis)
  }
}

/**
 * Create column title with type indicators
 */
function createColumnTitle(name: string, analysis: ColumnAnalysis) {
  const { type, isMetric, isTemporal, semanticType } = analysis
  
  const typeIcon = getTypeIcon(type, isMetric, isTemporal)
  
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      {typeIcon}
      <span>{formatColumnName(name)}</span>
      {semanticType && (
        <Tooltip title={`Semantic type: ${semanticType}`}>
          <Tag size="small" color="blue" style={{ fontSize: '10px', margin: 0 }}>
            {semanticType.split('_')[0]}
          </Tag>
        </Tooltip>
      )}
    </div>
  )
}

/**
 * Get appropriate icon for column type
 */
function getTypeIcon(type: string, isMetric: boolean, isTemporal: boolean) {
  if (isTemporal) {
    return <ClockCircleOutlined style={{ color: '#52c41a' }} />
  }
  if (isMetric) {
    return <LineChartOutlined style={{ color: '#1890ff' }} />
  }
  if (type === 'string') {
    return <Text style={{ color: '#8c8c8c', fontSize: '12px' }}>Aa</Text>
  }
  if (type === 'number') {
    return <Text style={{ color: '#722ed1', fontSize: '12px' }}>123</Text>
  }
  return null
}

/**
 * Format column name for display
 */
function formatColumnName(name: string): string {
  return name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Get optimal column width based on type
 */
function getColumnWidth(type: string, name: string): number {
  if (type === 'datetime') return 180
  if (type === 'number') return 120
  if (name.includes('id') || name.includes('trace')) return 200
  if (name.includes('service') || name.includes('operation')) return 150
  return 100
}

/**
 * Render cell value with appropriate formatting
 */
function renderCellValue(value: unknown, analysis: ColumnAnalysis): React.ReactNode {
  const { type, semanticType } = analysis

  // Handle null/undefined
  if (value == null) {
    return <Text type="secondary">-</Text>
  }

  // Datetime formatting
  if (type === 'datetime') {
    const date = dayjs(value as string | number | Date)
    return (
      <Tooltip title={date.format('YYYY-MM-DD HH:mm:ss.SSS')}>
        <Text style={{ fontSize: '12px' }}>
          {date.format('MM-DD HH:mm:ss')}
        </Text>
      </Tooltip>
    )
  }

  // Numeric formatting with semantic awareness
  if (type === 'number') {
    const num = parseFloat(value as string)
    
    // Latency metrics - format as milliseconds
    if (semanticType === 'latency_ms' || analysis.name.includes('_ms')) {
      return (
        <Text style={{ color: num > 1000 ? '#ff4d4f' : num > 100 ? '#faad14' : '#52c41a' }}>
          {num.toFixed(1)}ms
        </Text>
      )
    }
    
    // Error rates - format as percentage
    if (semanticType === 'error_rate' || analysis.name.includes('rate')) {
      return (
        <Text style={{ color: num > 5 ? '#ff4d4f' : num > 1 ? '#faad14' : '#52c41a' }}>
          {num.toFixed(2)}%
        </Text>
      )
    }
    
    // Request counts - format with commas
    if (semanticType === 'request_count' || analysis.name.includes('count')) {
      return (
        <Text style={{ color: '#1890ff' }}>
          {num.toLocaleString()}
        </Text>
      )
    }
    
    // General numeric formatting
    if (num > 1000) {
      return <Text>{num.toLocaleString()}</Text>
    }
    return <Text>{num % 1 === 0 ? num.toString() : num.toFixed(2)}</Text>
  }

  // String formatting with special handling
  if (type === 'string') {
    const str = value as string
    
    // Service names - clean and highlight
    if (semanticType === 'service_name' || analysis.name.includes('service')) {
      return (
        <Tag color="blue" style={{ fontSize: '11px' }}>
          {str.replace(/^.*\//, '')} {/* Remove path prefixes */}
        </Tag>
      )
    }
    
    // Status codes - color coding
    if (analysis.name.includes('status')) {
      const isError = str !== 'OK' && str !== 'SUCCESS' && !str.startsWith('2')
      return (
        <Tag color={isError ? 'red' : 'green'} icon={isError ? <BugOutlined /> : undefined}>
          {str}
        </Tag>
      )
    }
    
    // Long strings - truncate with tooltip
    if (str.length > 50) {
      return (
        <Tooltip title={str}>
          <Text ellipsis style={{ maxWidth: '200px' }}>
            {str}
          </Text>
        </Tooltip>
      )
    }
    
    return <Text>{str}</Text>
  }

  // Boolean formatting
  if (type === 'boolean') {
    const bool = Boolean(value)
    return (
      <Tag color={bool ? 'green' : 'red'}>
        {bool ? 'True' : 'False'}
      </Tag>
    )
  }

  // JSON formatting
  if (type === 'json') {
    return (
      <Tooltip title={JSON.stringify(value, null, 2)}>
        <Text code style={{ fontSize: '11px' }}>
          {'{...}'}
        </Text>
      </Tooltip>
    )
  }

  // Fallback
  return <Text>{String(value)}</Text>
}