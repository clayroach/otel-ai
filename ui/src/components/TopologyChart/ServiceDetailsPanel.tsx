import React from 'react'
import { Card, Row, Col, Statistic, Progress, Typography, Space, Tag, Divider, List } from 'antd'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import {
  ClockCircleOutlined,
  ThunderboltOutlined,
  ApiOutlined,
  DatabaseOutlined
} from '@ant-design/icons'

const { Title, Text } = Typography

interface ServiceMetrics {
  rate: number
  errorRate: number
  duration: number
  totalSpans?: number
  dependencies?: Array<{
    service: string
    callCount: number
    avgLatency: number
    errorRate: number
  }>
}

interface ServiceDetailsPanelProps {
  serviceName: string
  serviceType: string
  metrics: ServiceMetrics
  healthStatus: string
  runtime?: string
}

const getHealthColor = (status: string): string => {
  switch (status) {
    case 'healthy':
      return '#52c41a'
    case 'warning':
      return '#faad14'
    case 'degraded':
      return '#fa8c16'
    case 'critical':
      return '#f5222d'
    case 'unavailable':
      return '#262626'
    default:
      return '#8c8c8c'
  }
}

const getServiceIcon = (type: string) => {
  switch (type) {
    case 'api':
      return <ApiOutlined />
    case 'database':
      return <DatabaseOutlined />
    case 'frontend':
      return '🌐'
    case 'backend':
      return '⚙️'
    case 'cache':
      return '📦'
    case 'queue':
      return '📬'
    default:
      return '🔧'
  }
}

export const ServiceDetailsPanel: React.FC<ServiceDetailsPanelProps> = ({
  serviceName,
  serviceType,
  metrics,
  healthStatus,
  runtime
}) => {
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
    series: [
      {
        data: Array.from({ length: 20 }, () => metrics.rate * (0.8 + Math.random() * 0.4)),
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
      }
    ]
  })

  // Error rate gauge chart
  const getErrorGaugeOption = (): EChartsOption => ({
    series: [
      {
        type: 'gauge',
        startAngle: 180,
        endAngle: 0,
        radius: '100%',
        center: ['50%', '70%'],
        axisLine: {
          lineStyle: {
            width: 10,
            color: [
              [0.3, '#52c41a'],
              [0.7, '#faad14'],
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
        data: [
          {
            value: parseFloat(metrics.errorRate.toFixed(2))
          }
        ]
      }
    ]
  })

  // Duration histogram
  const getDurationChartOption = (): EChartsOption => ({
    grid: {
      left: 40,
      right: 20,
      top: 20,
      bottom: 30
    },
    xAxis: {
      type: 'category',
      data: ['P50', 'P75', 'P90', 'P95', 'P99'],
      axisLabel: {
        fontSize: 10
      }
    },
    yAxis: {
      type: 'value',
      name: 'ms',
      nameTextStyle: {
        fontSize: 10
      },
      axisLabel: {
        fontSize: 10
      }
    },
    series: [
      {
        data: [
          metrics.duration * 0.5,
          metrics.duration * 0.75,
          metrics.duration * 0.9,
          metrics.duration,
          metrics.duration * 1.5
        ],
        type: 'bar',
        itemStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: '#40a9ff' },
              { offset: 1, color: '#1890ff' }
            ]
          }
        }
      }
    ]
  })

  return (
    <Card
      title={
        <Space>
          <span style={{ fontSize: 18 }}>{getServiceIcon(serviceType)}</span>
          <Title level={4} style={{ margin: 0 }}>
            {serviceName}
          </Title>
          <Tag color={getHealthColor(healthStatus)}>{healthStatus.toUpperCase()}</Tag>
          {runtime && <Tag>{runtime}</Tag>}
        </Space>
      }
      style={{ height: '100%' }}
    >
      <Row gutter={[16, 16]}>
        {/* R.E.D Metrics */}
        <Col span={8}>
          <Card size="small" title="📈 Rate (requests/sec)">
            <Statistic
              value={metrics.rate}
              precision={2}
              prefix={<ThunderboltOutlined />}
              suffix="req/s"
              valueStyle={{ color: '#1890ff' }}
            />
            <div style={{ height: 60, marginTop: 10 }}>
              <ReactECharts
                option={getRateChartOption()}
                style={{ height: '100%', width: '100%' }}
              />
            </div>
          </Card>
        </Col>

        <Col span={8}>
          <Card size="small" title="⚠️ Errors">
            <div style={{ height: 120 }}>
              <ReactECharts
                option={getErrorGaugeOption()}
                style={{ height: '100%', width: '100%' }}
              />
            </div>
            <Text type={metrics.errorRate > 5 ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>
              Error threshold: 5%
            </Text>
          </Card>
        </Col>

        <Col span={8}>
          <Card size="small" title="⏱️ Duration (P95)">
            <Statistic
              value={metrics.duration}
              precision={0}
              prefix={<ClockCircleOutlined />}
              suffix="ms"
              valueStyle={{
                color:
                  metrics.duration > 1000
                    ? '#ff4d4f'
                    : metrics.duration > 500
                      ? '#faad14'
                      : '#52c41a'
              }}
            />
            <Progress
              percent={Math.min((metrics.duration / 2000) * 100, 100)}
              strokeColor={{
                '0%': '#52c41a',
                '50%': '#faad14',
                '100%': '#ff4d4f'
              }}
              showInfo={false}
              style={{ marginTop: 10 }}
            />
          </Card>
        </Col>
      </Row>

      <Divider />

      {/* Latency Distribution */}
      <Row gutter={[16, 16]}>
        <Col span={12}>
          <Card size="small" title="📊 Latency Distribution">
            <div style={{ height: 150 }}>
              <ReactECharts
                option={getDurationChartOption()}
                style={{ height: '100%', width: '100%' }}
              />
            </div>
          </Card>
        </Col>

        {/* Dependencies */}
        <Col span={12}>
          <Card
            size="small"
            title="🔗 Dependencies"
            bodyStyle={{ padding: '12px', maxHeight: 180, overflowY: 'auto' }}
          >
            {metrics.dependencies && metrics.dependencies.length > 0 ? (
              <List
                size="small"
                dataSource={metrics.dependencies}
                renderItem={(dep) => (
                  <List.Item>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                      <Text>{dep.service}</Text>
                      <Space>
                        <Tag color="blue">{dep.callCount} calls</Tag>
                        <Tag color={dep.errorRate > 0.05 ? 'red' : 'green'}>
                          {(dep.errorRate * 100).toFixed(1)}% err
                        </Tag>
                      </Space>
                    </Space>
                  </List.Item>
                )}
              />
            ) : (
              <Text type="secondary">No dependencies</Text>
            )}
          </Card>
        </Col>
      </Row>

      {/* Additional Stats */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={6}>
          <Statistic
            title="Total Spans"
            value={metrics.totalSpans || 0}
            valueStyle={{ fontSize: 14 }}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="Avg Latency"
            value={metrics.duration * 0.6}
            suffix="ms"
            precision={0}
            valueStyle={{ fontSize: 14 }}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="Success Rate"
            value={100 - metrics.errorRate}
            suffix="%"
            precision={2}
            valueStyle={{ fontSize: 14, color: '#52c41a' }}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="Service Type"
            value={serviceType.toUpperCase()}
            valueStyle={{ fontSize: 14 }}
          />
        </Col>
      </Row>
    </Card>
  )
}

export default ServiceDetailsPanel
