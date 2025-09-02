import React, { useState, useEffect } from 'react'
import {
  Card,
  Typography,
  Button,
  Space,
  Spin,
  Alert,
  // Tabs, // Not used with new topology
  Tag,
  Row,
  Col,
  Select,
  DatePicker,
  Switch,
  message
} from 'antd'
import {
  BarChartOutlined as AnalysisIcon,
  LineChartOutlined as TrendingUpIcon,
  ThunderboltOutlined as ZapIcon
} from '@ant-design/icons'
// import ReactMarkdown from 'react-markdown'; // Commented out - not available
import dayjs from 'dayjs'
// import { type AnalysisResult, generateMockData } from './mockData' // Not used with new topology
import { useAIAnalyzer } from '../../services/ai-analyzer'
import { CriticalRequestPathsTopology } from '../../components/CriticalRequestPathsTopology'

const { Title, Paragraph, Text } = Typography
const { RangePicker } = DatePicker

const AIAnalyzerView: React.FC = () => {
  // const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null) // Not used with new topology
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

        await aiAnalyzer.analyzeArchitecture({
          type: analysisType,
          timeRange: {
            startTime: timeRange[0].toDate(),
            endTime: timeRange[1].toDate()
          },
          filters: {},
          config
        })

        // setAnalysisResult(result) // Commented out - using new topology component
        message.success(
          `🎯 Real topology analysis completed using ${selectedModel === 'local-statistical-analyzer' ? 'statistical analysis' : selectedModel + ' model'}!`
        )
      } else {
        // Fallback to mock data with model awareness
        await new Promise((resolve) => setTimeout(resolve, 2000))
        // const result = generateMockData(analysisType, selectedModel)
        // setAnalysisResult(result) // Commented out - using new topology component
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
      // const result = generateMockData(analysisType, selectedModel)
      // setAnalysisResult(result) // Commented out - using new topology component
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
        const fullText = 'Mock streaming analysis result for demonstration purposes.' // generateMockData(analysisType, selectedModel).summary
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
      const fullText = 'Mock streaming analysis result for demonstration purposes.' // generateMockData(analysisType, selectedModel).summary
      const words = fullText.split(' ')

      for (let i = 0; i < words.length; i++) {
        await new Promise((resolve) => setTimeout(resolve, 50))
        setStreamingContent(words.slice(0, i + 1).join(' '))
      }
    } finally {
      setStreaming(false)
    }
  }

  /* Unused helper functions
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
  */

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
                onChange={(dates) => {
                  if (dates && dates[0] && dates[1]) {
                    setTimeRange([dates[0], dates[1]])
                  }
                }}
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

      {/* Critical Request Paths Topology - New Three-Panel Layout */}
      <div data-testid="insights-results" style={{ height: 'calc(100vh - 250px)' }}>
        <CriticalRequestPathsTopology 
          defaultPanelSizes={{
            paths: 15,
            topology: 55,
            analysis: 30
          }}
          resizable={true}
        />
      </div>

      {/* Original Tabs Structure removed - using new CriticalRequestPathsTopology component instead */}
    </div>
  )
}

export default AIAnalyzerView
