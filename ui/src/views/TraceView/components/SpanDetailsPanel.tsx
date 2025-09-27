import React from 'react'
import { Drawer, Descriptions, Tag, Typography, Space, Divider } from 'antd'
import { CloseOutlined } from '@ant-design/icons'
import { SpanData } from '../types'

const { Text, Title } = Typography

interface SpanDetailsPanelProps {
  span: SpanData
  onClose: () => void
}

export const SpanDetailsPanel: React.FC<SpanDetailsPanelProps> = ({ span, onClose }) => {
  const durationMs = span.durationNs / 1_000_000

  return (
    <Drawer
      title={
        <Space>
          <Text strong>Span Details</Text>
          <Tag color={span.statusCode === 'STATUS_CODE_ERROR' ? 'red' : 'green'}>
            {span.statusCode}
          </Tag>
        </Space>
      }
      placement="right"
      onClose={onClose}
      open={true}
      width={480}
      closeIcon={<CloseOutlined />}
    >
      <Title level={5}>{span.operationName}</Title>
      <Text type="secondary">{span.serviceName}</Text>

      <Divider />

      <Descriptions column={1} size="small">
        <Descriptions.Item label="Span ID">
          <Text code copyable>
            {span.spanId}
          </Text>
        </Descriptions.Item>
        <Descriptions.Item label="Trace ID">
          <Text code copyable>
            {span.traceId}
          </Text>
        </Descriptions.Item>
        <Descriptions.Item label="Parent Span ID">
          {span.parentSpanId ? <Text code>{span.parentSpanId}</Text> : <Tag>Root Span</Tag>}
        </Descriptions.Item>
        <Descriptions.Item label="Duration">{durationMs.toFixed(2)}ms</Descriptions.Item>
        <Descriptions.Item label="Span Kind">
          <Tag>{span.spanKind}</Tag>
        </Descriptions.Item>
        {span.statusMessage && (
          <Descriptions.Item label="Status Message">{span.statusMessage}</Descriptions.Item>
        )}
      </Descriptions>

      {span.attributes && Object.keys(span.attributes).length > 0 && (
        <>
          <Divider />
          <Title level={5}>Attributes</Title>
          <pre style={{ fontSize: 12, overflow: 'auto' }}>
            {JSON.stringify(span.attributes, null, 2)}
          </pre>
        </>
      )}

      {span.resourceAttributes && Object.keys(span.resourceAttributes).length > 0 && (
        <>
          <Divider />
          <Title level={5}>Resource Attributes</Title>
          <pre style={{ fontSize: 12, overflow: 'auto' }}>
            {JSON.stringify(span.resourceAttributes, null, 2)}
          </pre>
        </>
      )}
    </Drawer>
  )
}
