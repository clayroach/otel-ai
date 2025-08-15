import React, { useState } from 'react';
import { Table, Tag, Typography, Button, Space, Modal, Descriptions, Timeline } from 'antd';
import { EyeOutlined, ClockCircleOutlined, BugOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';

const { Text, Title } = Typography;

// Types for unified traces from ai_traces_unified view
interface UnifiedTrace {
  trace_id: string;
  service_name: string;
  operation_name: string;
  duration_ms: number;
  timestamp: string;
  status_code: string;
  ingestion_path: 'collector' | 'direct';
  schema_version: string;
  is_error: number;
  attribute_count: number;
  span_id?: string;
  parent_span_id?: string;
  attributes?: Record<string, any>;
  resource_attributes?: Record<string, any>;
}

interface QueryResult {
  data: UnifiedTrace[];
  rows: number;
  statistics: {
    elapsed: number;
    rows_read: number;
    bytes_read: number;
  };
}

interface TraceResultsProps {
  data: QueryResult;
}

export const TraceResults: React.FC<TraceResultsProps> = ({ data }) => {
  const [selectedTrace, setSelectedTrace] = useState<UnifiedTrace | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(false);

  const handleViewTrace = (trace: UnifiedTrace) => {
    setSelectedTrace(trace);
    setDetailsVisible(true);
  };

  const columns: ColumnsType<UnifiedTrace> = [
    {
      title: 'Trace ID',
      dataIndex: 'trace_id',
      key: 'trace_id',
      width: 180,
      render: (traceId: string) => (
        <Text
          code
          copyable={{ text: traceId, tooltips: ['Copy Trace ID', 'Copied!'] }}
          style={{ fontSize: '12px' }}
        >
          {traceId.substring(0, 16)}...
        </Text>
      ),
    },
    {
      title: 'Service',
      dataIndex: 'service_name',
      key: 'service_name',
      width: 150,
      render: (service: string) => (
        <Tag color="geekblue">{service}</Tag>
      ),
    },
    {
      title: 'Operation',
      dataIndex: 'operation_name',
      key: 'operation_name',
      width: 200,
      ellipsis: true,
    },
    {
      title: 'Duration',
      dataIndex: 'duration_ms',
      key: 'duration_ms',
      width: 100,
      render: (duration: number) => {
        const ms = Math.round(duration);
        const color = ms > 1000 ? 'red' : ms > 500 ? 'orange' : 'green';
        return (
          <Text style={{ color }}>
            {ms}ms
          </Text>
        );
      },
      sorter: (a: UnifiedTrace, b: UnifiedTrace) => a.duration_ms - b.duration_ms,
    },
    {
      title: 'Status',
      dataIndex: 'status_code',
      key: 'status_code',
      width: 80,
      render: (status: string, record: UnifiedTrace) => (
        <Tag
          color={record.is_error ? 'red' : 'green'}
          icon={record.is_error ? <BugOutlined /> : <ClockCircleOutlined />}
        >
          {status}
        </Tag>
      ),
    },
    {
      title: 'Ingestion',
      dataIndex: 'ingestion_path',
      key: 'ingestion_path',
      width: 100,
      render: (path: string) => (
        <Tag color={path === 'collector' ? 'blue' : 'orange'}>
          {path === 'collector' ? 'Collector' : 'Direct'}
        </Tag>
      ),
      filters: [
        { text: 'Collector', value: 'collector' },
        { text: 'Direct', value: 'direct' },
      ],
      onFilter: (value, record) => record.ingestion_path === value,
    },
    {
      title: 'Schema',
      dataIndex: 'schema_version',
      key: 'schema_version',
      width: 120,
      render: (version: string) => (
        <Text type="secondary" style={{ fontSize: '11px' }}>
          {version}
        </Text>
      ),
    },
    {
      title: 'Timestamp',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 160,
      render: (timestamp: string) => (
        <Text style={{ fontSize: '12px' }}>
          {dayjs(timestamp).format('MM/DD HH:mm:ss.SSS')}
        </Text>
      ),
      sorter: (a: UnifiedTrace, b: UnifiedTrace) => 
        dayjs(a.timestamp).valueOf() - dayjs(b.timestamp).valueOf(),
      defaultSortOrder: 'descend',
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
      ),
    },
  ];

  // Calculate summary statistics
  const stats = {
    total: data.data.length,
    errors: data.data.filter(t => t.is_error).length,
    avgDuration: data.data.length > 0 
      ? Math.round(data.data.reduce((sum, t) => sum + t.duration_ms, 0) / data.data.length)
      : 0,
    collectorTraces: data.data.filter(t => t.ingestion_path === 'collector').length,
    directTraces: data.data.filter(t => t.ingestion_path === 'direct').length,
    uniqueServices: new Set(data.data.map(t => t.service_name)).size,
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Statistics Bar */}
      <div style={{ 
        padding: '12px 16px', 
        background: '#fafafa', 
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <Space size="large">
          <Text><strong>Total:</strong> {stats.total}</Text>
          <Text><strong>Errors:</strong> <span style={{color: stats.errors > 0 ? '#ff4d4f' : 'inherit'}}>{stats.errors}</span></Text>
          <Text><strong>Avg Duration:</strong> {stats.avgDuration}ms</Text>
          <Text><strong>Services:</strong> {stats.uniqueServices}</Text>
        </Space>
        <Space size="large">
          <Text><strong>Collector:</strong> <Tag color="blue">{stats.collectorTraces}</Tag></Text>
          <Text><strong>Direct:</strong> <Tag color="orange">{stats.directTraces}</Tag></Text>
        </Space>
      </div>

      {/* Results Table */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Table
          columns={columns}
          dataSource={data.data}
          rowKey="trace_id"
          pagination={{
            pageSize: 50,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => 
              `${range[0]}-${range[1]} of ${total} traces`,
          }}
          scroll={{ x: 1200, y: 'calc(100vh - 300px)' }}
          size="small"
          showSorterTooltip={false}
        />
      </div>

      {/* Query Statistics */}
      <div style={{ 
        padding: '8px 16px', 
        background: '#fafafa', 
        borderTop: '1px solid #f0f0f0',
        fontSize: '11px',
        color: '#666'
      }}>
        Query executed in {data.statistics.elapsed.toFixed(3)}s • 
        Read {data.statistics.rows_read.toLocaleString()} rows • 
        {(data.statistics.bytes_read / 1024).toFixed(1)} KB
      </div>

      {/* Trace Details Modal */}
      <Modal
        title={
          <Space>
            <BugOutlined />
            <span>Trace Details</span>
            {selectedTrace && (
              <Tag color={selectedTrace.ingestion_path === 'collector' ? 'blue' : 'orange'}>
                {selectedTrace.ingestion_path}
              </Tag>
            )}
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
                {selectedTrace.service_name}
              </Descriptions.Item>
              <Descriptions.Item label="Operation">
                {selectedTrace.operation_name}
              </Descriptions.Item>
              <Descriptions.Item label="Duration">
                {Math.round(selectedTrace.duration_ms)}ms
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={selectedTrace.is_error ? 'red' : 'green'}>
                  {selectedTrace.status_code}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Ingestion Path">
                <Tag color={selectedTrace.ingestion_path === 'collector' ? 'blue' : 'orange'}>
                  {selectedTrace.ingestion_path}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Schema Version">
                {selectedTrace.schema_version}
              </Descriptions.Item>
              <Descriptions.Item label="Timestamp">
                {dayjs(selectedTrace.timestamp).format('YYYY-MM-DD HH:mm:ss.SSS')}
              </Descriptions.Item>
              <Descriptions.Item label="Span ID" span={2}>
                <Text code>{selectedTrace.span_id || 'N/A'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Attributes Count" span={2}>
                {selectedTrace.attribute_count} attributes
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
                    ),
                  },
                ]}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};