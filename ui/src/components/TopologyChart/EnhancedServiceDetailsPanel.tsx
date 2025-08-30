import React from 'react'
import { 
  Card, 
  Row, 
  Col, 
  Statistic, 
  Progress, 
  Typography, 
  Space, 
  Tag, 
  Alert,
  List
} from 'antd'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import {
  ApiOutlined,
  DatabaseOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  BulbOutlined
} from '@ant-design/icons'
import type { ServiceMetricsDetail } from './PieNodeTopologyChart'
import { generateHealthExplanation } from './healthExplanations'

const { Title, Text } = Typography

interface ServiceMetrics extends ServiceMetricsDetail {
  totalSpans?: number
  dependencies?: Array<{
    service: string
    callCount: number
    avgLatency: number
    errorRate: number
  }>
}

interface EnhancedServiceDetailsPanelProps {
  serviceName: string
  serviceType: string
  metrics: ServiceMetrics
  healthStatus: string
  runtime?: string
}

const getHealthColor = (status: string): string => {
  switch (status) {
    case 'healthy': return '#52c41a'
    case 'warning': return '#faad14'
    case 'degraded': return '#fa8c16'
    case 'critical': return '#f5222d'
    case 'unavailable': return '#262626'
    default: return '#8c8c8c'
  }
}

const getServiceIcon = (type: string) => {
  switch (type) {
    case 'api': return <ApiOutlined />
    case 'database': return <DatabaseOutlined />
    case 'frontend': return '🌐'
    case 'backend': return '⚙️'
    case 'cache': return '📦'
    case 'queue': return '📬'
    default: return '🔧'
  }
}

const getMetricStatusIcon = (status: 'healthy' | 'warning' | 'critical') => {
  switch (status) {
    case 'critical': return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
    case 'warning': return <WarningOutlined style={{ color: '#faad14' }} />
    default: return <CheckCircleOutlined style={{ color: '#52c41a' }} />
  }
}

export const EnhancedServiceDetailsPanel: React.FC<EnhancedServiceDetailsPanelProps> = ({
  serviceName,
  serviceType,
  metrics,
  healthStatus: _healthStatus, // Using AI-generated status instead
  runtime
}) => {
  // Generate intelligent health explanation
  const healthExplanation = generateHealthExplanation(serviceName, metrics)
  
  // Rate chart options (mini sparkline)
  const getRateChartOption = (): EChartsOption => ({
    grid: {
      left: 0,
      right: 0,
      top: 0,
      bottom: 0
    },
    xAxis: {
      type: 'category',
      show: false,
      data: Array.from({ length: 20 }, (_, i) => i)
    },
    yAxis: {
      type: 'value',
      show: false
    },
    series: [{
      data: Array.from({ length: 20 }, () => 
        metrics.rate * (0.8 + Math.random() * 0.4)
      ),
      type: 'line',
      smooth: true,
      symbol: 'none',
      lineStyle: {
        color: '#1890ff',
        width: 2
      },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(24, 144, 255, 0.3)' },
            { offset: 1, color: 'rgba(24, 144, 255, 0.05)' }
          ]
        }
      }
    }]
  })

  // Error rate gauge chart
  const getErrorGaugeOption = (): EChartsOption => ({
    series: [{
      type: 'gauge',
      startAngle: 180,
      endAngle: 0,
      radius: '100%',
      center: ['50%', '70%'],
      axisLine: {
        lineStyle: {
          width: 10,
          color: [
            [0.01, '#52c41a'],
            [0.05, '#faad14'],
            [1, '#f5222d']
          ]
        }
      },
      pointer: {
        itemStyle: {
          color: 'auto'
        },
        length: '60%',
        width: 4
      },
      axisTick: {
        show: false
      },
      splitLine: {
        show: false
      },
      axisLabel: {
        show: false
      },
      detail: {
        valueAnimation: true,
        formatter: '{value}%',
        fontSize: 14,
        offsetCenter: [0, '-10%']
      },
      data: [{
        value: parseFloat(metrics.errorRate.toFixed(2))
      }]
    }]
  })

  return (
    <Card 
      title={
        <Space>
          <span style={{ fontSize: 18 }}>{getServiceIcon(serviceType)}</span>
          <Title level={4} style={{ margin: 0 }}>{serviceName}</Title>
          <Tag color={getHealthColor(healthExplanation.status)}>
            {healthExplanation.status.toUpperCase()}
          </Tag>
          {runtime && <Tag>{runtime}</Tag>}
        </Space>
      }
      style={{ height: '100%', overflowY: 'auto' }}
      bodyStyle={{ padding: '12px' }}
    >
      {/* R.E.D Metrics Charts - NOW AT THE TOP */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col span={8}>
          <Card size="small" title="📈 Rate" bodyStyle={{ padding: '8px' }}>
            <Statistic
              value={metrics.rate}
              precision={1}
              suffix="req/s"
              valueStyle={{ 
                fontSize: 16,
                color: metrics.rateStatus === 2 ? '#ff4d4f' : 
                       metrics.rateStatus === 1 ? '#faad14' : '#1890ff' 
              }}
            />
            <div style={{ height: 40, marginTop: 8 }}>
              <ReactECharts
                option={getRateChartOption()}
                style={{ height: '100%', width: '100%' }}
              />
            </div>
          </Card>
        </Col>

        <Col span={8}>
          <Card size="small" title="⚠️ Errors" bodyStyle={{ padding: '8px' }}>
            <div style={{ height: 80 }}>
              <ReactECharts
                option={getErrorGaugeOption()}
                style={{ height: '100%', width: '100%' }}
              />
            </div>
            <Text type={metrics.errorRate > 5 ? 'danger' : 'secondary'} style={{ fontSize: 10 }}>
              Threshold: {metrics.errorStatus === 2 ? '>5%' : metrics.errorStatus === 1 ? '1-5%' : '<1%'}
            </Text>
          </Card>
        </Col>

        <Col span={8}>
          <Card size="small" title="⏱️ P95" bodyStyle={{ padding: '8px' }}>
            <Statistic
              value={metrics.duration}
              precision={0}
              suffix="ms"
              valueStyle={{ 
                fontSize: 16,
                color: metrics.duration > 500 ? '#ff4d4f' : 
                       metrics.duration > 100 ? '#faad14' : '#52c41a' 
              }}
            />
            <Progress
              percent={Math.min((metrics.duration / 1000) * 100, 100)}
              strokeColor={{
                '0%': '#52c41a',
                '50%': '#faad14',
                '100%': '#ff4d4f'
              }}
              showInfo={false}
              size="small"
              style={{ marginTop: 8 }}
            />
          </Card>
        </Col>
      </Row>

      {/* AI Health Analysis - Full Text */}
      <Alert
        message={
          <div>
            <span style={{ fontSize: 12 }}>🤖 <strong>AI Analysis:</strong> {healthExplanation.summary}</span>
          </div>
        }
        type={
          healthExplanation.status === 'critical' ? 'error' : 
          healthExplanation.status === 'warning' ? 'warning' : 
          'success'
        }
        style={{ marginBottom: 12 }}
        closable
      />

      {/* Metrics Status Table - Compact */}
      {healthExplanation.impactedMetrics.filter(m => m.status !== 'healthy').length > 0 && (
        <Card size="small" title="⚡ Issues Detected" style={{ marginBottom: 12 }} bodyStyle={{ padding: '8px' }}>
          <List
            size="small"
            dataSource={healthExplanation.impactedMetrics.filter(m => m.status !== 'healthy')}
            renderItem={metric => (
              <List.Item style={{ padding: '4px 0' }}>
                <Space style={{ width: '100%' }}>
                  {getMetricStatusIcon(metric.status)}
                  <Text style={{ fontSize: 12 }}><strong>{metric.metric}:</strong></Text>
                  <Tag color={
                    metric.status === 'critical' ? 'red' : 'orange'
                  } style={{ fontSize: 11 }}>
                    {metric.value}
                  </Tag>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {metric.explanation}
                  </Text>
                </Space>
              </List.Item>
            )}
          />
        </Card>
      )}

      {/* AI Recommendations - Compact */}
      {healthExplanation.recommendations.length > 0 && healthExplanation.status !== 'healthy' && (
        <Card 
          size="small" 
          title={
            <Space>
              <BulbOutlined style={{ color: '#1890ff' }} />
              <span style={{ fontSize: 12 }}>Recommendations</span>
            </Space>
          }
          style={{ marginBottom: 12 }}
          bodyStyle={{ padding: '8px' }}
        >
          {healthExplanation.recommendations.slice(0, 2).map((rec, idx) => (
            <div key={idx} style={{ marginBottom: 4 }}>
              <Text style={{ fontSize: 11 }}>• {rec}</Text>
            </div>
          ))}
        </Card>
      )}


      {/* Additional Stats - Compact Grid */}
      <Row gutter={[8, 8]}>
        <Col span={12}>
          <Card size="small" bodyStyle={{ padding: '8px' }}>
            <Statistic
              title="Total Spans"
              value={metrics.spanCount || 0}
              valueStyle={{ fontSize: 14 }}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" bodyStyle={{ padding: '8px' }}>
            <Statistic
              title="Success Rate"
              value={100 - metrics.errorRate}
              suffix="%"
              precision={1}
              valueStyle={{ fontSize: 14, color: metrics.errorRate > 5 ? '#ff4d4f' : '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>
    </Card>
  )
}

export default EnhancedServiceDetailsPanel