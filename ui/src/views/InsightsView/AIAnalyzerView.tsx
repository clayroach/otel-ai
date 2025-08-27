import React, { useState, useEffect } from 'react'
import {
  Card,
  Typography,
  Button,
  Space,
  Spin,
  Alert,
  Tabs,
  Timeline,
  Tag,
  Statistic,
  Row,
  Col,
  Progress,
  Divider,
  Select,
  DatePicker,
  Switch,
  message
} from 'antd'
import {
  BarChartOutlined as AnalysisIcon,
  ClockCircleOutlined as ClockIcon,
  LineChartOutlined as TrendingUpIcon,
  ThunderboltOutlined as ZapIcon,
  DatabaseOutlined as DatabaseIcon
} from '@ant-design/icons'
// import ReactMarkdown from 'react-markdown'; // Commented out - not available
import dayjs from 'dayjs'
import { type AnalysisResult, generateMockData } from './mockData'
import { useAIAnalyzer } from '../../services/ai-analyzer'
import { cleanServiceName } from '../../utils/protobuf-cleaner'

const { Title, Paragraph, Text } = Typography
const { TabPane } = Tabs
const { RangePicker } = DatePicker

const AIAnalyzerView: React.FC = () => {
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analysisType, setAnalysisType] = useState<
    'architecture' | 'dataflow' | 'dependencies' | 'insights'
  >('architecture')
  const [timeRange, setTimeRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(4, 'hours'),
    dayjs()
  ])
  const [streaming, setStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState<string>('')
  const [useRealService, setUseRealService] = useState(true)
  const [serviceHealth, setServiceHealth] = useState<{
    status: string
    capabilities: string[]
  } | null>(null)
  const [selectedModel, setSelectedModel] = useState<string>('claude')

  const aiAnalyzer = useAIAnalyzer()

  // Check service health on mount
  useEffect(() => {
    const checkServiceHealth = async () => {
      try {
        const health = await aiAnalyzer.healthCheck()
        setServiceHealth(health)

        if (health.status !== 'healthy') {
          setUseRealService(false)
          message.info('Using enhanced mock data for topology demonstration', 3)
        } else {
          message.success('AI Analyzer service connected - ready for real topology analysis!', 3)
        }
      } catch (error) {
        console.log('AI Analyzer service not available, using mock data:', error)
        setServiceHealth({
          status: 'demo-mode',
          capabilities: ['mock-topology', 'enhanced-visualization']
        })
        setUseRealService(false)
        message.info('🚀 Demo mode: Using enhanced mock topology data with real-world scenarios', 4)
      }
    }

    checkServiceHealth()
  }, [])

  const performAnalysis = async () => {
    setLoading(true)
    setError(null)

    try {
      if (useRealService) {
        // Use real AI analyzer service with model selection
        const config =
          selectedModel !== 'local-statistical-analyzer'
            ? {
                llm: {
                  model: selectedModel as 'gpt' | 'claude' | 'llama',
                  temperature:
                    selectedModel === 'gpt' ? 0.5 : selectedModel === 'llama' ? 0.8 : 0.7,
                  maxTokens:
                    selectedModel === 'gpt' ? 1500 : selectedModel === 'llama' ? 1800 : 2000
                },
                analysis: {
                  timeWindowHours: 4,
                  minSpanCount: 100
                },
                output: {
                  format: 'markdown' as const,
                  includeDigrams: true,
                  detailLevel: 'comprehensive' as const
                }
              }
            : {
                analysis: {
                  timeWindowHours: 4,
                  minSpanCount: 100
                },
                output: {
                  format: 'markdown' as const,
                  includeDigrams: true,
                  detailLevel: 'comprehensive' as const
                }
              }

        const result = await aiAnalyzer.analyzeArchitecture({
          type: analysisType,
          timeRange: {
            startTime: timeRange[0].toDate(),
            endTime: timeRange[1].toDate()
          },
          filters: {},
          config
        })

        setAnalysisResult(result)
        message.success(
          `🎯 Real topology analysis completed using ${selectedModel === 'local-statistical-analyzer' ? 'statistical analysis' : selectedModel + ' model'}!`
        )
      } else {
        // Fallback to mock data with model awareness
        await new Promise((resolve) => setTimeout(resolve, 2000))
        const result = generateMockData(analysisType, selectedModel)
        setAnalysisResult(result)
        message.success(
          `🚀 Enhanced topology analysis completed with ${selectedModel === 'local-statistical-analyzer' ? 'statistical analysis' : selectedModel + ' model'}!`
        )
      }
    } catch (err) {
      console.error('Analysis failed:', err)
      setError(
        `Failed to perform analysis: ${err instanceof Error ? err.message : 'Unknown error'}`
      )
      message.error('Analysis failed - falling back to mock data')

      // Fallback to mock data on error
      const result = generateMockData(analysisType, selectedModel)
      setAnalysisResult(result)
    } finally {
      setLoading(false)
    }
  }

  const performStreamingAnalysis = async () => {
    setStreaming(true)
    setStreamingContent('')
    setError(null)

    try {
      if (useRealService) {
        // Use real streaming service with model selection
        const stream = aiAnalyzer.streamAnalysis({
          type: analysisType,
          timeRange: {
            startTime: timeRange[0].toDate(),
            endTime: timeRange[1].toDate()
          },
          config: {
            llm: {
              model: selectedModel as 'gpt' | 'claude' | 'llama',
              temperature: 0.7,
              maxTokens: 4000
            },
            analysis: {
              timeWindowHours: 4,
              minSpanCount: 100
            },
            output: {
              format: 'markdown' as const,
              includeDigrams: true,
              detailLevel: 'comprehensive' as const
            }
          }
        })

        let content = ''
        for await (const chunk of stream) {
          content += chunk
          setStreamingContent(content)
        }
      } else {
        // Mock streaming for demo with model awareness
        const fullText = generateMockData(analysisType, selectedModel).summary
        const words = fullText.split(' ')

        for (let i = 0; i < words.length; i++) {
          await new Promise((resolve) => setTimeout(resolve, 50))
          setStreamingContent(words.slice(0, i + 1).join(' '))
        }
      }
    } catch (err) {
      console.error('Streaming analysis failed:', err)
      setError(`Streaming failed: ${err instanceof Error ? err.message : 'Unknown error'}`)

      // Fallback to mock streaming
      const fullText = generateMockData(analysisType, selectedModel).summary
      const words = fullText.split(' ')

      for (let i = 0; i < words.length; i++) {
        await new Promise((resolve) => setTimeout(resolve, 50))
        setStreamingContent(words.slice(0, i + 1).join(' '))
      }
    } finally {
      setStreaming(false)
    }
  }

  const getServiceTypeIcon = (type: string) => {
    switch (type) {
      case 'frontend':
        return '🌐'
      case 'api':
        return '🚪'
      case 'backend':
        return '⚙️'
      case 'database':
        return '🗄️'
      case 'cache':
        return '💾'
      case 'external':
        return '🔗'
      case 'queue':
        return '📬'
      default:
        return '📦'
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'red'
      case 'warning':
        return 'orange'
      case 'info':
        return 'blue'
      default:
        return 'default'
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'performance':
        return 'green'
      case 'reliability':
        return 'red'
      case 'architecture':
        return 'blue'
      case 'optimization':
        return 'purple'
      default:
        return 'default'
    }
  }

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <Title level={2}>
          <ZapIcon style={{ marginRight: '12px', color: '#1890ff', fontSize: '28px' }} />
          AI-Powered Architecture Analysis
        </Title>
        <Paragraph>
          Leverage machine learning to analyze your OpenTelemetry data and discover architectural
          insights, performance bottlenecks, and optimization opportunities.
        </Paragraph>
      </div>

      {/* Analysis Controls */}
      <Card title="Analysis Configuration" style={{ marginBottom: '24px' }}>
        <Row gutter={16} align="middle">
          <Col span={4}>
            <div>
              <Text strong>Analysis Type:</Text>
              <Select
                value={analysisType}
                onChange={setAnalysisType}
                style={{ width: '100%', marginTop: 8 }}
                data-testid="analysis-type-selector"
              >
                <Select.Option value="architecture">🏗️ Architecture Overview</Select.Option>
                <Select.Option value="dependencies">🔄 Service Dependencies</Select.Option>
                <Select.Option value="dataflow">📊 Data Flow Analysis</Select.Option>
                <Select.Option value="insights">💡 Performance Insights</Select.Option>
              </Select>
            </div>
          </Col>
          <Col span={4}>
            <div>
              <Text strong>AI Model:</Text>
              <Select
                data-testid="ai-model-selector"
                value={selectedModel}
                onChange={setSelectedModel}
                style={{ width: '100%', marginTop: 8 }}
                placeholder="Select AI Model"
              >
                <Select.Option value="claude" data-testid="model-option-claude">
                  🧠 Claude
                </Select.Option>
                <Select.Option value="gpt" data-testid="model-option-gpt">
                  🤖 GPT-4
                </Select.Option>
                <Select.Option value="llama" data-testid="model-option-llama">
                  🦙 Llama
                </Select.Option>
                <Select.Option
                  value="local-statistical-analyzer"
                  data-testid="model-option-statistical"
                >
                  🔬 Statistical Analysis
                </Select.Option>
              </Select>
            </div>
          </Col>
          <Col span={6}>
            <div>
              <Text strong>Time Range:</Text>
              <RangePicker
                value={timeRange}
                onChange={(dates) => dates && setTimeRange([dates[0]!, dates[1]!])}
                showTime
                style={{ width: '100%', marginTop: 8 }}
                data-testid="time-range-picker"
              />
            </div>
          </Col>
          <Col span={4}>
            <div>
              <Space align="baseline">
                <Text strong>Use Real Service:</Text>
                <Switch
                  checked={useRealService}
                  onChange={setUseRealService}
                  checkedChildren="Real"
                  unCheckedChildren="Mock"
                />
              </Space>
              {serviceHealth && (
                <div style={{ marginTop: 4, fontSize: '12px' }}>
                  Status:{' '}
                  <Tag color={serviceHealth.status === 'healthy' ? 'green' : 'red'}>
                    {serviceHealth.status}
                  </Tag>
                </div>
              )}
            </div>
          </Col>
          <Col span={3}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button
                type="primary"
                icon={<AnalysisIcon />}
                onClick={performAnalysis}
                loading={loading}
                block
                size="large"
                data-testid="analyze-button"
              >
                🔍 Analyze Topology
              </Button>
            </Space>
          </Col>
          <Col span={3}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button
                icon={<TrendingUpIcon />}
                onClick={performStreamingAnalysis}
                loading={streaming}
                block
                size="large"
              >
                ⚡ Stream Insights
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Error Display */}
      {error && (
        <Alert
          message="Analysis Error"
          description={error}
          type="error"
          closable
          style={{ marginBottom: '24px' }}
        />
      )}

      {/* Streaming Content */}
      {streaming && (
        <Card
          title={
            <Space>
              <Spin size="small" />
              <TrendingUpIcon style={{ color: '#1890ff' }} />
              Real-time Topology Analysis Stream
            </Space>
          }
          extra={<Tag color="processing">⚡ Live Analysis</Tag>}
          style={{ marginBottom: '24px' }}
        >
          <div
            style={{
              minHeight: '250px',
              padding: '16px',
              background: 'linear-gradient(to bottom, #f0f9ff, #f5f5f5)',
              borderRadius: '8px',
              border: '1px solid #e6f7ff'
            }}
          >
            <div
              style={{
                whiteSpace: 'pre-wrap',
                fontFamily:
                  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
                fontSize: '13px',
                lineHeight: '1.5',
                color: '#2c3e50'
              }}
            >
              {streamingContent ||
                'Initializing topology analysis...\n🔍 Scanning service dependencies...\n📊 Processing telemetry data...'}
            </div>
            <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Spin size="small" />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Analyzing service topology and generating insights...
              </Text>
            </div>
          </div>
        </Card>
      )}

      {/* Analysis Results */}
      {analysisResult && (
        <div data-testid="insights-results">
          <Tabs defaultActiveKey="overview" size="large">
            <TabPane tab="📊 Topology Overview" key="overview">
              <Row gutter={24}>
                <Col span={24}>
                  <Card
                    title={
                      <Space>
                        <ZapIcon style={{ color: '#1890ff' }} />
                        AI-Generated Architecture Analysis
                      </Space>
                    }
                    extra={
                      <Space>
                        <Tag color="green">✅ Analysis Complete</Tag>
                        <Tag color="blue" data-testid="analysis-metadata">
                          🤖 Model:{' '}
                          {selectedModel === 'local-statistical-analyzer'
                            ? 'Statistical'
                            : selectedModel}
                        </Tag>
                      </Space>
                    }
                  >
                    <div
                      style={{
                        padding: '16px',
                        backgroundColor: '#fafafa',
                        borderRadius: '8px',
                        border: '1px solid #f0f0f0',
                        marginBottom: '16px'
                      }}
                    >
                      <div
                        style={{
                          whiteSpace: 'pre-wrap',
                          lineHeight: '1.6',
                          fontSize: '14px'
                        }}
                      >
                        {analysisResult.summary}
                      </div>
                    </div>

                    {analysisResult.architecture && (
                      <Alert
                        message="🏗️ Architecture Discovery"
                        description={
                          <div>
                            <Text>
                              Discovered{' '}
                              <strong>
                                {analysisResult.architecture.services.length} services
                              </strong>{' '}
                              with{' '}
                              <strong>
                                {analysisResult.architecture.dataFlows.length} data flows
                              </strong>{' '}
                              and identified{' '}
                              <strong>
                                {analysisResult.architecture.criticalPaths.length} critical paths
                              </strong>{' '}
                              in your <strong>{analysisResult.architecture.applicationName}</strong>{' '}
                              application.
                            </Text>
                          </div>
                        }
                        type="info"
                        showIcon
                        style={{ marginTop: '16px' }}
                      />
                    )}
                  </Card>
                </Col>
              </Row>

              <Row gutter={16} style={{ marginTop: '24px' }}>
                <Col span={6}>
                  <Card>
                    <Statistic
                      title="📊 Telemetry Data"
                      value={analysisResult.metadata.analyzedSpans}
                      prefix={<DatabaseIcon style={{ color: '#1890ff' }} />}
                      suffix="spans"
                      valueStyle={{ color: '#1890ff' }}
                    />
                    <Text type="secondary" style={{ fontSize: '11px' }}>
                      Raw telemetry processed for topology discovery
                    </Text>
                  </Card>
                </Col>
                <Col span={6}>
                  <Card>
                    <Statistic
                      title="⚡ Processing Speed"
                      value={analysisResult.metadata.analysisTimeMs}
                      prefix={<ClockIcon style={{ color: '#52c41a' }} />}
                      suffix="ms"
                      valueStyle={{ color: '#52c41a' }}
                    />
                    <Text type="secondary" style={{ fontSize: '11px' }}>
                      End-to-end analysis including LLM processing
                    </Text>
                  </Card>
                </Col>
                <Col span={6}>
                  <Card>
                    <Statistic
                      title="🤖 AI Processing"
                      value={analysisResult.metadata.llmTokensUsed}
                      prefix={<ZapIcon style={{ color: '#fa8c16' }} />}
                      suffix="tokens"
                      valueStyle={{ color: '#fa8c16' }}
                    />
                    <Text type="secondary" style={{ fontSize: '11px' }}>
                      Multi-model LLM analysis for architectural insights
                    </Text>
                  </Card>
                </Col>
                <Col span={6}>
                  <Card>
                    <div>
                      <Text strong style={{ fontSize: '14px' }}>
                        🎯 Analysis Confidence
                      </Text>
                      <Progress
                        percent={Math.round(analysisResult.metadata.confidence * 100)}
                        status={analysisResult.metadata.confidence > 0.8 ? 'success' : 'normal'}
                        strokeColor={
                          analysisResult.metadata.confidence > 0.8
                            ? '#52c41a'
                            : analysisResult.metadata.confidence > 0.6
                              ? '#faad14'
                              : '#ff4d4f'
                        }
                        style={{ marginTop: 8 }}
                      />
                      <Text type="secondary" style={{ fontSize: '11px' }}>
                        AI confidence in topology analysis accuracy
                      </Text>
                    </div>
                  </Card>
                </Col>
              </Row>
            </TabPane>

            {analysisResult.architecture && (
              <TabPane tab="🏗️ Service Architecture" key="architecture">
                <Row gutter={24}>
                  <Col span={16}>
                    <Card
                      title={
                        <Space>
                          <DatabaseIcon style={{ color: '#1890ff' }} />
                          Service Topology & Dependencies
                        </Space>
                      }
                      style={{ marginBottom: '24px' }}
                      extra={
                        <Tag color="blue">
                          {analysisResult.architecture.services.length} Services Discovered
                        </Tag>
                      }
                    >
                      <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                        {analysisResult.architecture.services.map((service) => (
                          <Card
                            key={service.service}
                            size="small"
                            style={{ marginBottom: '12px' }}
                            title={
                              <Space>
                                <span style={{ fontSize: '18px' }}>
                                  {getServiceTypeIcon(service.type)}
                                </span>
                                <Text strong style={{ fontSize: '16px' }}>
                                  {cleanServiceName(service.service)}
                                </Text>
                                <Tag
                                  color={getTypeColor(service.type)}
                                  style={{ fontSize: '12px' }}
                                >
                                  {service.type.toUpperCase()}
                                </Tag>
                              </Space>
                            }
                            extra={
                              <Space>
                                {service.dependencies.length > 0 && (
                                  <Tag color="orange">🔗 {service.dependencies.length} deps</Tag>
                                )}
                                {(service.metadata.errorRate as number) > 0.01 && (
                                  <Tag color="red">⚠️ High errors</Tag>
                                )}
                                {(service.metadata.avgLatencyMs as number) > 1000 && (
                                  <Tag color="red">🐌 Slow</Tag>
                                )}
                              </Space>
                            }
                          >
                            <Row gutter={16}>
                              <Col span={12}>
                                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                                  <div>
                                    <Text strong>🔧 Operations:</Text>
                                    <div style={{ marginLeft: '16px', color: '#666' }}>
                                      {service.operations.slice(0, 3).join(', ')}
                                      {service.operations.length > 3 &&
                                        ` (+${service.operations.length - 3} more)`}
                                    </div>
                                  </div>
                                  <div>
                                    <Text strong>🔗 Dependencies:</Text>
                                    <div style={{ marginLeft: '16px' }}>
                                      {service.dependencies.length === 0 ? (
                                        <Text type="secondary">No dependencies (leaf service)</Text>
                                      ) : (
                                        service.dependencies.slice(0, 2).map((dep) => (
                                          <div
                                            key={dep.service}
                                            style={{ fontSize: '12px', color: '#666' }}
                                          >
                                            → {cleanServiceName(dep.service)} ({dep.callCount}{' '}
                                            calls)
                                          </div>
                                        ))
                                      )}
                                      {service.dependencies.length > 2 && (
                                        <Text type="secondary" style={{ fontSize: '12px' }}>
                                          ... and {service.dependencies.length - 2} more
                                        </Text>
                                      )}
                                    </div>
                                  </div>
                                </Space>
                              </Col>
                              <Col span={12}>
                                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Text strong>⏱️ Avg Latency:</Text>
                                    <Text
                                      style={{
                                        color:
                                          (service.metadata.avgLatencyMs as number) > 1000
                                            ? '#ff4d4f'
                                            : (service.metadata.avgLatencyMs as number) > 500
                                              ? '#faad14'
                                              : '#52c41a'
                                      }}
                                    >
                                      {(service.metadata.avgLatencyMs as number).toFixed(0)}ms
                                    </Text>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Text strong>❌ Error Rate:</Text>
                                    <Text
                                      style={{
                                        color:
                                          (service.metadata.errorRate as number) > 0.05
                                            ? '#ff4d4f'
                                            : (service.metadata.errorRate as number) > 0.01
                                              ? '#faad14'
                                              : '#52c41a'
                                      }}
                                    >
                                      {((service.metadata.errorRate as number) * 100).toFixed(2)}%
                                    </Text>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Text strong>📊 Total Spans:</Text>
                                    <Text>
                                      {(service.metadata.totalSpans as number).toLocaleString()}
                                    </Text>
                                  </div>
                                  {typeof service.metadata.p95LatencyMs === 'number' && (
                                    <div
                                      style={{ display: 'flex', justifyContent: 'space-between' }}
                                    >
                                      <Text strong>🎯 P95 Latency:</Text>
                                      <Text type="secondary">
                                        {(service.metadata.p95LatencyMs as number).toFixed(0)}ms
                                      </Text>
                                    </div>
                                  )}
                                </Space>
                              </Col>
                            </Row>
                          </Card>
                        ))}
                      </div>
                    </Card>
                  </Col>
                  <Col span={8}>
                    <Card
                      title={
                        <Space>
                          <ClockIcon style={{ color: '#fa8c16' }} />
                          Critical Request Paths
                        </Space>
                      }
                      style={{ marginBottom: '24px' }}
                    >
                      <Timeline>
                        {analysisResult.architecture.criticalPaths
                          .slice(0, 5)
                          .map((path, index) => (
                            <Timeline.Item
                              key={index}
                              color={
                                path.errorRate > 0.01
                                  ? 'red'
                                  : path.avgLatencyMs > 1000
                                    ? 'orange'
                                    : 'green'
                              }
                              dot={
                                path.errorRate > 0.01
                                  ? '🚨'
                                  : path.avgLatencyMs > 1000
                                    ? '⚠️'
                                    : '✅'
                              }
                            >
                              <div style={{ marginBottom: '8px' }}>
                                <Text strong style={{ fontSize: '14px' }}>
                                  {path.name}
                                </Text>
                              </div>
                              <Space wrap style={{ marginBottom: '8px' }}>
                                <Tag
                                  color={
                                    path.avgLatencyMs > 1000
                                      ? 'red'
                                      : path.avgLatencyMs > 500
                                        ? 'orange'
                                        : 'green'
                                  }
                                >
                                  ⏱️ {path.avgLatencyMs.toFixed(0)}ms avg
                                </Tag>
                                <Tag
                                  color={
                                    path.errorRate > 0.05
                                      ? 'red'
                                      : path.errorRate > 0.01
                                        ? 'orange'
                                        : 'green'
                                  }
                                >
                                  📉 {(path.errorRate * 100).toFixed(2)}% errors
                                </Tag>
                                <Tag color="blue">🔗 {path.services.length} services</Tag>
                              </Space>
                              <div
                                style={{
                                  fontSize: '12px',
                                  color: '#666',
                                  backgroundColor: '#f5f5f5',
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  fontFamily: 'monospace'
                                }}
                              >
                                {path.services.map(cleanServiceName).join(' → ')}
                              </div>
                            </Timeline.Item>
                          ))}
                      </Timeline>
                      {analysisResult.architecture.criticalPaths.length > 5 && (
                        <div style={{ textAlign: 'center', marginTop: '16px' }}>
                          <Text type="secondary">
                            ... and {analysisResult.architecture.criticalPaths.length - 5} more
                            paths
                          </Text>
                        </div>
                      )}
                    </Card>

                    <Card
                      title={
                        <Space>
                          <DatabaseIcon style={{ color: '#52c41a' }} />
                          Application Insights
                        </Space>
                      }
                    >
                      <Space direction="vertical" size="small" style={{ width: '100%' }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                        >
                          <Text strong>📱 Application:</Text>
                          <Text style={{ fontWeight: 'bold', color: '#1890ff' }}>
                            {analysisResult.architecture.applicationName}
                          </Text>
                        </div>

                        <Divider style={{ margin: '8px 0' }} />

                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Text strong>🏗️ Services:</Text>
                          <Tag color="blue">{analysisResult.architecture.services.length}</Tag>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Text strong>🔄 Data Flows:</Text>
                          <Tag color="green">{analysisResult.architecture.dataFlows.length}</Tag>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Text strong>🛤️ Critical Paths:</Text>
                          <Tag color="orange">
                            {analysisResult.architecture.criticalPaths.length}
                          </Tag>
                        </div>

                        <Divider style={{ margin: '8px 0' }} />

                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Text strong>⏱️ Generated:</Text>
                          <Text type="secondary" style={{ fontSize: '12px' }}>
                            {dayjs(analysisResult.architecture.generatedAt).format(
                              'MMM D, YYYY HH:mm'
                            )}
                          </Text>
                        </div>

                        <div
                          style={{
                            marginTop: '12px',
                            padding: '8px',
                            backgroundColor: '#f6ffed',
                            borderRadius: '4px'
                          }}
                        >
                          <Text type="secondary" style={{ fontSize: '11px', fontStyle: 'italic' }}>
                            💡 {analysisResult.architecture.description}
                          </Text>
                        </div>
                      </Space>
                    </Card>
                  </Col>
                </Row>
              </TabPane>
            )}

            <TabPane
              tab={<span data-testid="insights-tab-button">💡 AI-Powered Insights</span>}
              key="insights"
            >
              <div style={{ marginBottom: '16px' }} data-testid="analysis-summary">
                <Alert
                  message="🤖 AI Analysis Complete"
                  description={`Generated ${analysisResult.insights.length} insights from ${analysisResult.metadata.analyzedSpans.toLocaleString()} spans using ${selectedModel === 'local-statistical-analyzer' ? 'statistical analysis' : selectedModel + ' model'}`}
                  type="success"
                  showIcon
                  style={{ marginBottom: '24px' }}
                />
              </div>

              <Row gutter={16}>
                {analysisResult.insights.map((insight, index) => (
                  <Col span={12} key={index} style={{ marginBottom: '16px' }}>
                    <Card
                      title={
                        <Space>
                          <span style={{ fontSize: '18px' }}>
                            {insight.severity === 'critical'
                              ? '🚨'
                              : insight.severity === 'warning'
                                ? '⚠️'
                                : '💡'}
                          </span>
                          <Text strong style={{ fontSize: '16px' }} data-testid="insight-title">
                            {insight.title}
                          </Text>
                        </Space>
                      }
                      extra={
                        <Space>
                          <Tag
                            color={getSeverityColor(insight.severity)}
                            style={{ fontSize: '11px' }}
                          >
                            {insight.severity.toUpperCase()}
                          </Tag>
                          <Tag color={getTypeColor(insight.type)} style={{ fontSize: '11px' }}>
                            {insight.type.toUpperCase()}
                          </Tag>
                        </Space>
                      }
                      style={{
                        borderLeft: `4px solid ${
                          insight.severity === 'critical'
                            ? '#ff4d4f'
                            : insight.severity === 'warning'
                              ? '#faad14'
                              : '#1890ff'
                        }`
                      }}
                    >
                      <div style={{ marginBottom: '12px' }}>
                        <Text>{insight.description}</Text>
                      </div>

                      {insight.evidence && insight.evidence.length > 0 && (
                        <div style={{ marginBottom: '12px' }}>
                          <Text strong style={{ fontSize: '12px', color: '#666' }}>
                            📊 Evidence:
                          </Text>
                          <div
                            style={{
                              backgroundColor: '#f5f5f5',
                              padding: '8px',
                              borderRadius: '4px',
                              marginTop: '4px',
                              fontSize: '11px',
                              fontFamily: 'monospace'
                            }}
                          >
                            {insight.evidence.slice(0, 2).map((evidence, i) => (
                              <div key={i} style={{ marginBottom: '2px' }}>
                                •{' '}
                                {typeof evidence === 'string' ? evidence : JSON.stringify(evidence)}
                              </div>
                            ))}
                            {insight.evidence.length > 2 && (
                              <Text type="secondary">
                                ... and {insight.evidence.length - 2} more data points
                              </Text>
                            )}
                          </div>
                        </div>
                      )}

                      {insight.recommendation && (
                        <>
                          <Divider style={{ margin: '12px 0' }} />
                          <div
                            style={{
                              backgroundColor: '#f6ffed',
                              border: '1px solid #b7eb8f',
                              borderRadius: '4px',
                              padding: '12px'
                            }}
                          >
                            <div style={{ marginBottom: '8px' }}>
                              <Text strong style={{ color: '#389e0d' }}>
                                💡 AI Recommendation
                              </Text>
                            </div>
                            <Text style={{ fontSize: '13px' }}>{insight.recommendation}</Text>
                          </div>
                        </>
                      )}
                    </Card>
                  </Col>
                ))}
              </Row>

              {analysisResult.insights.length === 0 && (
                <div style={{ textAlign: 'center', padding: '48px' }}>
                  <DatabaseIcon
                    style={{ color: '#d9d9d9', marginBottom: '16px', fontSize: '48px' }}
                  />
                  <Title level={4} style={{ color: '#999' }}>
                    No Issues Detected
                  </Title>
                  <Paragraph style={{ color: '#999' }}>
                    Your application architecture appears to be well-optimized based on the current
                    analysis.
                  </Paragraph>
                </div>
              )}
            </TabPane>

            {analysisResult.documentation && (
              <TabPane tab="📚 Documentation" key="documentation">
                <Card>
                  <div style={{ whiteSpace: 'pre-wrap' }}>
                    {analysisResult.documentation.markdown}
                  </div>
                </Card>
              </TabPane>
            )}
          </Tabs>
        </div>
      )}

      {!analysisResult && !loading && (
        <Card style={{ textAlign: 'center', padding: '48px' }}>
          <ZapIcon style={{ color: '#d9d9d9', marginBottom: '16px', fontSize: '48px' }} />
          <Title level={4} style={{ color: '#999' }}>
            Ready for AI Analysis
          </Title>
          <Paragraph style={{ color: '#999' }}>
            Configure your analysis parameters above and click "Analyze" to discover insights about
            your application architecture.
          </Paragraph>
        </Card>
      )}
    </div>
  )
}

export default AIAnalyzerView
