import React from 'react'
import { Card, Tabs, Typography, Space, Alert, Tooltip, Badge, Spin } from 'antd'
import {
  GlobalOutlined,
  AppstoreOutlined,
  InfoCircleOutlined,
  RobotOutlined
} from '@ant-design/icons'
import AllServicesTab from './AllServicesTab'
import ServiceDetailsTab from './ServiceDetailsTab'
import type { AnalysisTab, PanelProps } from './types'

const { Text } = Typography

interface AIAnalysisPanelProps extends PanelProps {
  tabs: AnalysisTab[]
  activeTabId: string
  onTabChange: (tabId: string) => void
  onTabClose: (tabId: string) => void
  loading?: boolean
  selectedModel?: 'gpt-4' | 'claude' | 'llama'
}

export const AIAnalysisPanel: React.FC<AIAnalysisPanelProps> = ({
  tabs,
  activeTabId,
  onTabChange,
  onTabClose,
  loading = false,
  width = '100%'
}) => {
  const renderTabContent = (tab: AnalysisTab) => {
    // For service tabs with metrics, use the EnhancedServiceDetailsPanel
    if (tab.type === 'service' && tab.content?.metrics) {
      // Determine service type based on name
      const getServiceType = (name: string): string => {
        const lowername = name.toLowerCase()
        if (lowername.includes('frontend') || lowername.includes('ui')) return 'frontend'
        if (lowername.includes('gateway') || lowername.includes('api')) return 'api'
        if (
          lowername.includes('database') ||
          lowername.includes('postgres') ||
          lowername.includes('mysql')
        )
          return 'database'
        if (lowername.includes('redis') || lowername.includes('cache')) return 'cache'
        if (lowername.includes('queue') || lowername.includes('kafka')) return 'queue'
        if (lowername.includes('payment') || lowername.includes('checkout')) return 'backend'
        return 'backend'
      }

      // Determine runtime based on service
      const getRuntime = (name: string): string => {
        const lowername = name.toLowerCase()
        if (lowername.includes('frontend')) return 'javascript'
        if (lowername.includes('cart') || lowername.includes('checkout')) return 'dotnet'
        if (lowername.includes('product') || lowername.includes('currency')) return 'go'
        if (lowername.includes('recommendation')) return 'python'
        if (lowername.includes('payment') || lowername.includes('email')) return 'java'
        return 'nodejs'
      }

      return (
        <ServiceDetailsTab
          serviceName={tab.title}
          serviceType={getServiceType(tab.title)}
          metrics={{
            rate: tab.content.metrics.requestRate,
            errorRate: tab.content.metrics.errorRate,
            duration: tab.content.metrics.latency.p95,
            spanCount: Math.floor(tab.content.metrics.requestRate * 60 * 5), // Estimate based on 5 min window
            rateStatus:
              tab.content.metrics.requestRate > 1000
                ? 2
                : tab.content.metrics.requestRate > 500
                  ? 1
                  : 0,
            errorStatus:
              tab.content.metrics.errorRate > 5 ? 2 : tab.content.metrics.errorRate > 1 ? 1 : 0,
            durationStatus:
              tab.content.metrics.latency.p99 > 500
                ? 2
                : tab.content.metrics.latency.p99 > 200
                  ? 1
                  : 0,
            otelStatus: 0,
            // Add mock dependencies
            dependencies: [
              {
                service: 'database',
                callCount: Math.floor(tab.content.metrics.requestRate * 2),
                avgLatency: 25,
                errorRate: 0.1
              },
              {
                service: 'cache',
                callCount: Math.floor(tab.content.metrics.requestRate * 0.8),
                avgLatency: 5,
                errorRate: 0.01
              }
            ]
          }}
          healthStatus={
            tab.content.metrics.errorRate > 5
              ? 'critical'
              : tab.content.metrics.errorRate > 1
                ? 'warning'
                : 'healthy'
          }
          runtime={getRuntime(tab.title)}
        />
      )
    }

    // For global overview tab, use the All Services Tab
    return <AllServicesTab tabType={tab.type} serviceName={tab.title} serviceId={tab.targetId} />
  }

  return (
    <Card
      style={{ width, height: '100%' }}
      styles={{ body: { padding: '12px', height: '100%' } }}
      data-testid="ai-analysis-panel"
      title={
        <Space>
          <RobotOutlined />
          <Text strong>AI Analysis</Text>
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
          data-testid="no-analysis-alert"
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
          data-testid="analysis-tabs"
          items={tabs.map((tab) => ({
            key: tab.id,
            label: (
              <Space size="small">
                {tab.type === 'global' ? <GlobalOutlined /> : <AppstoreOutlined />}
                <span>{tab.title}</span>
                {tab.type === 'service' && (
                  <Tooltip title="Service Analysis">
                    <Badge status="processing" />
                  </Tooltip>
                )}
              </Space>
            ),
            closable: tab.type === 'service',
            children:
              loading && tab.id === activeTabId ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <Spin size="large" />
                </div>
              ) : (
                renderTabContent(tab)
              )
          }))}
        />
      )}
    </Card>
  )
}
