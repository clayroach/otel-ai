import { BugOutlined, ClockCircleOutlined, EyeOutlined } from '@ant-design/icons'
import { Button, Descriptions, Modal, Space, Table, Tag, Timeline, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import React, { useState } from 'react'
import { cleanServiceName } from '../../utils/protobuf-cleaner'

const { Text, Title } = Typography

// Types for traces from simplified single-table schema
interface UnifiedTrace {
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

interface QueryResult {
  data: UnifiedTrace[]
  rows: number
  statistics: {
    elapsed: number
    rows_read: number
    bytes_read: number
  }
}

interface TraceResultsProps {
  data: QueryResult
}

export const TraceResults: React.FC<TraceResultsProps> = ({ data }) => {
  const [selectedTrace, setSelectedTrace] = useState<UnifiedTrace | null>(null)
  const [detailsVisible, setDetailsVisible] = useState(false)
  
  // Debug: Log the data to see what columns we're receiving
  React.useEffect(() => {
    if (data?.data?.length > 0) {
      console.log('TraceResults received data:', {
        rowCount: data.data.length,
        firstRow: data.data[0],
        columns: Object.keys(data.data[0])
      })
    }
  }, [data])

  const handleViewTrace = (trace: UnifiedTrace) => {
    setSelectedTrace(trace)
    setDetailsVisible(true)
  }

  const columns: ColumnsType<UnifiedTrace> = [
    {
      title: 'Trace ID',
      dataIndex: 'trace_id',
      key: 'trace_id',
      width: 180,
      render: (traceId: string) => {
        if (!traceId) return '-'
        return (
          <Text
            code
            copyable={{ text: traceId, tooltips: ['Copy Trace ID', 'Copied!'] }}
            style={{ fontSize: '12px' }}
          >
            {traceId.substring(0, 16)}...
          </Text>
        )
      }
    },
    {
      title: 'Service',
      dataIndex: 'service_name',
      key: 'service_name',
      width: 150,
      render: (service: string) => <Tag color="geekblue">{cleanServiceName(service)}</Tag>
    },
    {
      title: 'Operation',
      dataIndex: 'operation_name',
      key: 'operation_name',
      width: 200,
      ellipsis: true
    },
    {
      title: 'Duration',
      dataIndex: 'duration_ms',
      key: 'duration_ms',
      width: 100,
      render: (duration: number) => {
        const ms = Math.round(duration)
        const color = ms > 1000 ? 'red' : ms > 500 ? 'orange' : 'green'
        return <Text style={{ color }}>{ms}ms</Text>
      },
      sorter: (a: UnifiedTrace, b: UnifiedTrace) => a.duration_ms - b.duration_ms
    },
    {
      title: 'Status',
      dataIndex: 'status_code',
      key: 'status_code',
      width: 80,
      render: (status: string, record: UnifiedTrace) => {
        // Convert long OpenTelemetry status codes to short UI labels
        const statusMap: Record<string, string> = {
          STATUS_CODE_UNSET: 'UNSET',
          STATUS_CODE_OK: 'OK',
          STATUS_CODE_ERROR: 'ERROR'
        }
        const displayStatus = statusMap[status] || status

        return (
          <Tag
            color={record.is_error ? 'red' : 'green'}
            icon={record.is_error ? <BugOutlined /> : <ClockCircleOutlined />}
            title={status} // Show full status on hover
          >
            {displayStatus}
          </Tag>
        )
      }
    },
    {
      title: 'Span Kind',
      dataIndex: 'span_kind',
      key: 'span_kind',
      width: 100,
      render: (kind: string) => {
        const kindMap: Record<string, { label: string; color: string }> = {
          '1': { label: 'Internal', color: 'default' },
          '2': { label: 'Server', color: 'blue' },
          '3': { label: 'Client', color: 'green' },
          '4': { label: 'Producer', color: 'orange' },
          '5': { label: 'Consumer', color: 'purple' }
        }
        const kindInfo = kindMap[kind] || { label: kind || 'Unknown', color: 'default' }
        return <Tag color={kindInfo.color}>{kindInfo.label}</Tag>
      },
      filters: [
        { text: 'Internal', value: '1' },
        { text: 'Server', value: '2' },
        { text: 'Client', value: '3' },
        { text: 'Producer', value: '4' },
        { text: 'Consumer', value: '5' }
      ],
      onFilter: (value, record) => record.span_kind === value
    },
    {
      title: 'Type',
      dataIndex: 'is_root',
      key: 'is_root',
      width: 80,
      render: (isRoot: number) => (
        <Tag color={isRoot ? 'red' : 'default'}>{isRoot ? 'Root' : 'Child'}</Tag>
      ),
      filters: [
        { text: 'Root Spans', value: 1 },
        { text: 'Child Spans', value: 0 }
      ],
      onFilter: (value, record) => record.is_root === value
    },
    {
      title: 'Timestamp',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 160,
      render: (timestamp: string) => (
        <Text style={{ fontSize: '12px' }}>{dayjs(timestamp).format('MM/DD HH:mm:ss.SSS')}</Text>
      ),
      sorter: (a: UnifiedTrace, b: UnifiedTrace) =>
        dayjs(a.timestamp).valueOf() - dayjs(b.timestamp).valueOf(),
      defaultSortOrder: 'descend'
    },
    {
      title: 'Encoding',
      dataIndex: 'encoding_type',
      key: 'encoding_type',
      width: 100,
      render: (encoding: string) => {
        const isJson = encoding === 'json'
        return <Tag color={isJson ? 'orange' : 'blue'}>{isJson ? 'JSON' : 'Protobuf'}</Tag>
      },
      filters: [
        { text: 'JSON', value: 'json' },
        { text: 'Protobuf', value: 'protobuf' }
      ],
      onFilter: (value, record) =>
        record.encoding_type === value || (!record.encoding_type && value === 'protobuf')
    },
    {
      title: 'Actions',
      key: 'action',
      width: 80,
      render: (_, record: UnifiedTrace) => (
        <Button
          type="text"
          icon={<EyeOutlined />}
          onClick={() => handleViewTrace(record)}
          size="small"
          title="View trace details"
        />
      )
    }
  ]

  // Calculate summary statistics
  const stats = {
    total: data.data.length,
    errors: data.data.filter((t) => t.is_error).length,
    avgDuration:
      data.data.length > 0
        ? Math.round(data.data.reduce((sum, t) => sum + t.duration_ms, 0) / data.data.length)
        : 0,
    rootSpans: data.data.filter((t) => t.is_root === 1).length,
    childSpans: data.data.filter((t) => t.is_root === 0).length,
    uniqueServices: new Set(data.data.map((t) => t.service_name)).size,
    // Count by actual encoding type stored in traces
    protobufTraces: data.data.filter((t) => !t.encoding_type || t.encoding_type === 'protobuf')
      .length,
    jsonTraces: data.data.filter((t) => t.encoding_type === 'json').length
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Statistics Bar */}
      <div
        style={{
          padding: '12px 16px',
          background: '#fafafa',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px'
        }}
      >
        <Space size="large">
          <Text>
            <strong>Total:</strong> {stats.total}
          </Text>
          <Text>
            <strong>Errors:</strong>{' '}
            <span style={{ color: stats.errors > 0 ? '#ff4d4f' : 'inherit' }}>{stats.errors}</span>
          </Text>
          <Text>
            <strong>Avg Duration:</strong> {stats.avgDuration}ms
          </Text>
          <Text>
            <strong>Services:</strong> {stats.uniqueServices}
          </Text>
        </Space>
        <Space size="large">
          <Text>
            <strong>Protobuf:</strong> <Tag color="blue">{stats.protobufTraces}</Tag>
          </Text>
          <Text>
            <strong>JSON:</strong> <Tag color="orange">{stats.jsonTraces}</Tag>
          </Text>
        </Space>
      </div>

      {/* Results Table */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Table
          columns={columns}
          dataSource={data.data}
          rowKey={(record) => record.trace_id || `row-${Math.random().toString(36).substring(7)}`}
          pagination={{
            pageSize: 50,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} traces`
          }}
          scroll={{ x: 1200, y: 'calc(100vh - 300px)' }}
          size="small"
          showSorterTooltip={false}
        />
      </div>

      {/* Query Statistics */}
      <div
        style={{
          padding: '8px 16px',
          background: '#fafafa',
          borderTop: '1px solid #f0f0f0',
          fontSize: '11px',
          color: '#666'
        }}
      >
        Query executed in {data.statistics.elapsed.toFixed(3)}s • Read{' '}
        {data.statistics.rows_read.toLocaleString()} rows •
        {(data.statistics.bytes_read / 1024).toFixed(1)} KB
      </div>

      {/* Trace Details Modal */}
      <Modal
        title={
          <Space>
            <BugOutlined />
            <span>Trace Details</span>
            <Tag color={selectedTrace?.encoding_type === 'json' ? 'orange' : 'blue'}>
              OTLP/{selectedTrace?.encoding_type === 'json' ? 'JSON' : 'Protobuf'}
            </Tag>
          </Space>
        }
        open={detailsVisible}
        onCancel={() => setDetailsVisible(false)}
        width={800}
        footer={null}
      >
        {selectedTrace && (
          <div>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="Trace ID">
                <Text code copyable={{ text: selectedTrace.trace_id }}>
                  {selectedTrace.trace_id}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Service">
                {cleanServiceName(selectedTrace.service_name)}
              </Descriptions.Item>
              <Descriptions.Item label="Operation">
                {selectedTrace.operation_name}
              </Descriptions.Item>
              <Descriptions.Item label="Duration">
                {Math.round(selectedTrace.duration_ms)}ms
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag
                  color={selectedTrace.is_error ? 'red' : 'green'}
                  title={selectedTrace.status_code}
                >
                  {(() => {
                    const statusMap: Record<string, string> = {
                      STATUS_CODE_UNSET: 'UNSET',
                      STATUS_CODE_OK: 'OK',
                      STATUS_CODE_ERROR: 'ERROR'
                    }
                    return statusMap[selectedTrace.status_code] || selectedTrace.status_code
                  })()}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Encoding">
                <Tag color={selectedTrace.encoding_type === 'json' ? 'orange' : 'blue'}>
                  OTLP/{selectedTrace.encoding_type === 'json' ? 'JSON' : 'Protobuf'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Span Type">
                <Tag color={selectedTrace.is_root ? 'red' : 'default'}>
                  {selectedTrace.is_root ? 'Root Span' : 'Child Span'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Timestamp">
                {dayjs(selectedTrace.timestamp).format('YYYY-MM-DD HH:mm:ss.SSS')}
              </Descriptions.Item>
              <Descriptions.Item label="Span ID" span={2}>
                <Text code>{selectedTrace.span_id || 'N/A'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Span Kind" span={2}>
                {(() => {
                  const kindMap: Record<string, string> = {
                    '1': 'Internal',
                    '2': 'Server',
                    '3': 'Client',
                    '4': 'Producer',
                    '5': 'Consumer'
                  }
                  return (
                    kindMap[selectedTrace.span_kind || ''] || selectedTrace.span_kind || 'Unknown'
                  )
                })()}
              </Descriptions.Item>
            </Descriptions>

            {/* Timeline view placeholder for future span hierarchy */}
            <div style={{ marginTop: '16px' }}>
              <Title level={5}>Span Timeline</Title>
              <Timeline
                items={[
                  {
                    children: (
                      <div>
                        <Text strong>{selectedTrace.operation_name}</Text>
                        <br />
                        <Text type="secondary">
                          Duration: {Math.round(selectedTrace.duration_ms)}ms
                        </Text>
                      </div>
                    )
                  }
                ]}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
