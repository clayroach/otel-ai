import React, { useState } from 'react'
import {
  Card,
  Tabs,
  Typography,
  Space,
  Tag,
  Alert,
  Spin,
  Button,
  Tooltip,
  Badge,
  Statistic,
  Row,
  Col,
  Progress,
  Timeline
} from 'antd'
import {
  GlobalOutlined,
  AppstoreOutlined,
  ReloadOutlined,
  BulbOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  ClockCircleOutlined
} from '@ant-design/icons'
import type { AnalysisTab, ServiceMetrics, PanelProps } from './types'

const { Text, Paragraph } = Typography
const { TabPane } = Tabs

interface AIAnalysisPanelProps extends PanelProps {
  tabs: AnalysisTab[]
  activeTabId: string
  onTabChange: (tabId: string) => void
  onTabClose: (tabId: string) => void
  onRefresh: (tabId: string) => void
  loading?: boolean
  selectedModel?: 'gpt-4' | 'claude' | 'llama'
}

export const AIAnalysisPanel: React.FC<AIAnalysisPanelProps> = ({
  tabs,
  activeTabId,
  onTabChange,
  onTabClose,
  onRefresh,
  loading = false,
  selectedModel = 'claude',
  width = '100%'
}) => {
  const [refreshingTabs, setRefreshingTabs] = useState<Set<string>>(new Set())

  const handleRefresh = async (tabId: string) => {
    setRefreshingTabs(prev => new Set(prev).add(tabId))
    await onRefresh(tabId)
    setTimeout(() => {
      setRefreshingTabs(prev => {
        const next = new Set(prev)
        next.delete(tabId)
        return next
      })
    }, 1000)
  }

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <WarningOutlined style={{ color: '#ff4d4f' }} />
      case 'warning':
        return <InfoCircleOutlined style={{ color: '#faad14' }} />
      case 'info':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />
      default:
        return <BulbOutlined style={{ color: '#1890ff' }} />
    }
  }

  const getInsightTypeColor = (type: string) => {
    switch (type) {
      case 'performance': return 'blue'
      case 'error': return 'red'
      case 'architecture': return 'purple'
      case 'recommendation': return 'green'
      default: return 'default'
    }
  }

  const renderMetrics = (metrics?: ServiceMetrics) => {
    if (!metrics) return null

    return (
      <Card size="small" style={{ marginTop: 16 }}>
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title="Request Rate"
              value={metrics.requestRate}
              suffix="req/s"
              prefix={<ThunderboltOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Error Rate"
              value={metrics.errorRate}
              suffix="%"
              valueStyle={{ color: metrics.errorRate > 5 ? '#ff4d4f' : '#52c41a' }}
              prefix={<WarningOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="P99 Latency"
              value={metrics.latency.p99}
              suffix="ms"
              prefix={<ClockCircleOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Saturation"
              value={metrics.saturation}
              suffix="%"
              prefix={
                <Progress
                  type="circle"
                  percent={metrics.saturation}
                  width={20}
                  strokeColor={metrics.saturation > 80 ? '#ff4d4f' : '#52c41a'}
                  showInfo={false}
                />
              }
            />
          </Col>
        </Row>
      </Card>
    )
  }

  const renderTabContent = (tab: AnalysisTab) => {
    const isRefreshing = refreshingTabs.has(tab.id)

    if (!tab.content) {
      return (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <Spin size="large" />
          <Paragraph style={{ marginTop: 16 }}>
            Analyzing {tab.type === 'service' ? 'service' : 'system'}...
          </Paragraph>
        </div>
      )
    }

    return (
      <div style={{ padding: '16px' }}>
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          {/* AI Model Badge */}
          <div style={{ textAlign: 'right' }}>
            <Tag icon={<RobotOutlined />} color="blue">
              Powered by {selectedModel}
            </Tag>
          </div>

          {/* Summary Section */}
          <Card
            title={
              <Space>
                {tab.type === 'global' ? <GlobalOutlined /> : <AppstoreOutlined />}
                <Text strong>Analysis Summary</Text>
              </Space>
            }
            size="small"
          >
            <Paragraph>{tab.content.summary}</Paragraph>
          </Card>

          {/* Metrics (for service tabs) */}
          {tab.type === 'service' && renderMetrics(tab.content.metrics)}

          {/* Insights Timeline */}
          <Card
            title={
              <Space>
                <BulbOutlined />
                <Text strong>Key Insights</Text>
                <Badge count={tab.content.insights.length} style={{ backgroundColor: '#1890ff' }} />
              </Space>
            }
            size="small"
            bodyStyle={{ maxHeight: '400px', overflow: 'auto' }}
          >
            <Timeline mode="left">
              {tab.content.insights.map(insight => (
                <Timeline.Item
                  key={insight.id}
                  dot={getSeverityIcon(insight.severity)}
                  color={
                    insight.severity === 'critical' ? 'red' :
                    insight.severity === 'warning' ? 'orange' : 'green'
                  }
                >
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Space>
                      <Tag color={getInsightTypeColor(insight.type)}>
                        {insight.type}
                      </Tag>
                      <Text strong>{insight.title}</Text>
                    </Space>
                    <Paragraph
                      style={{ margin: 0 }}
                      type="secondary"
                      ellipsis={{ rows: 3, expandable: true }}
                    >
                      {insight.description}
                    </Paragraph>
                  </Space>
                </Timeline.Item>
              ))}
            </Timeline>
          </Card>

          {/* Action Buttons */}
          <Space>
            <Button
              icon={<ReloadOutlined spin={isRefreshing} />}
              onClick={() => handleRefresh(tab.id)}
              loading={isRefreshing}
            >
              Refresh Analysis
            </Button>
          </Space>
        </Space>
      </div>
    )
  }

  return (
    <Card
      style={{ width, height: '100%' }}
      bodyStyle={{ padding: '12px', height: '100%' }}
      title={
        <Space>
          <RobotOutlined />
          <Text strong>AI-Powered Architecture Analysis</Text>
        </Space>
      }
    >
      {tabs.length === 0 ? (
        <Alert
          message="No Analysis Available"
          description="Select a path or click on a service to view AI-powered insights"
          type="info"
          showIcon
          icon={<InfoCircleOutlined />}
        />
      ) : (
        <Tabs
          activeKey={activeTabId}
          onChange={onTabChange}
          type="editable-card"
          hideAdd
          onEdit={(targetKey, action) => {
            if (action === 'remove' && typeof targetKey === 'string') {
              onTabClose(targetKey)
            }
          }}
          style={{ height: '100%' }}
        >
          {tabs.map(tab => (
            <TabPane
              tab={
                <Space size="small">
                  {tab.type === 'global' ? (
                    <GlobalOutlined />
                  ) : (
                    <AppstoreOutlined />
                  )}
                  <span>{tab.title}</span>
                  {tab.type === 'service' && (
                    <Tooltip title="Service Analysis">
                      <Badge status="processing" />
                    </Tooltip>
                  )}
                </Space>
              }
              key={tab.id}
              closable={tab.type === 'service'}
            >
              {loading && tab.id === activeTabId ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <Spin size="large" />
                </div>
              ) : (
                renderTabContent(tab)
              )}
            </TabPane>
          ))}
        </Tabs>
      )}
    </Card>
  )
}