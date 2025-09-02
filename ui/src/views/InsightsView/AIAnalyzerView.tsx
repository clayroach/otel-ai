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
  const [timeRange, setTimeRange] = useState<string>('5m') // Simple time range selector
  const [streaming, setStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState<string>('')
  const [useRealService, setUseRealService] = useState(false) // Default to mock data
  const [serviceHealth, setServiceHealth] = useState<{
    status: string
    capabilities: string[]
  } | null>(null)
  const [selectedModel, setSelectedModel] = useState<string>('llama') // Default to Llama/Local
  const [autoRefresh, setAutoRefresh] = useState<'manual' | '1m' | '5m'>('manual')

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

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefresh === 'manual') {
      return
    }

    const intervalMs = autoRefresh === '1m' ? 60000 : 300000 // 1 minute or 5 minutes
    const interval = setInterval(() => {
      performAnalysis()
    }, intervalMs)

    // Run immediately on setting auto-refresh
    performAnalysis()

    return () => clearInterval(interval)
  }, [autoRefresh])

  // Helper function to convert time range to hours
  const getTimeRangeHours = () => {
    switch (timeRange) {
      case '1m': return 1/60
      case '5m': return 5/60
      case '15m': return 0.25
      case '30m': return 0.5
      case '1h': return 1
      case '3h': return 3
      case '6h': return 6
      case '12h': return 12
      case '24h': return 24
      default: return 1
    }
  }

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
                  timeWindowHours: getTimeRangeHours(),
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
                  timeWindowHours: getTimeRangeHours(),
                  minSpanCount: 100
                },
                output: {
                  format: 'markdown' as const,
                  includeDigrams: true,
                  detailLevel: 'comprehensive' as const
                }
              }

        const endTime = new Date()
        const startTime = new Date(endTime.getTime() - getTimeRangeHours() * 60 * 60 * 1000)

        await aiAnalyzer.analyzeArchitecture({
          type: 'architecture', // Always analyze all types
          timeRange: {
            startTime,
            endTime
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
        // const result = generateMockData('architecture', selectedModel)
        // setAnalysisResult(result) // Commented out - using new topology component
        message.success(
          `🚀 Enhanced topology analysis completed with ${selectedModel === 'llama' ? 'Llama/Local' : selectedModel + ' model'}!`
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
        const endTime = new Date()
        const startTime = new Date(endTime.getTime() - getTimeRangeHours() * 60 * 60 * 1000)
        
        const stream = aiAnalyzer.streamAnalysis({
          type: 'architecture', // Always analyze all types
          timeRange: {
            startTime,
            endTime
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

      {/* Simplified Analysis Controls - Right-aligned Box */}
      <div style={{ 
        marginBottom: '24px',
        display: 'flex',
        justifyContent: 'flex-end'
      }}>
        <div style={{
          padding: '12px 16px',
          background: '#ffffff',
          border: '1px solid #d9d9d9',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.08)'
        }}>
          <Space size="middle">
            {/* AI Model Selector */}
            <Space size="small">
              <Text>Model:</Text>
              <Select
                data-testid="ai-model-selector"
                value={selectedModel}
                onChange={setSelectedModel}
                style={{ width: '140px' }}
                size="small"
              >
                <Select.Option value="llama">🦙 Llama/Local</Select.Option>
                <Select.Option value="claude">🧠 Claude</Select.Option>
                <Select.Option value="gpt">🤖 GPT-4</Select.Option>
                <Select.Option value="local-statistical-analyzer">🔬 Statistical</Select.Option>
              </Select>
            </Space>

            {/* Data Source Toggle */}
            <Space size="small">
              <Text>Data:</Text>
              <Switch
                checked={useRealService}
                onChange={setUseRealService}
                checkedChildren="Real"
                unCheckedChildren="Mock"
                size="small"
              />
              {serviceHealth && (
                <Tag 
                  color={serviceHealth.status === 'healthy' ? 'green' : 'orange'} 
                  style={{ marginLeft: 4 }}
                >
                  {serviceHealth.status === 'healthy' ? '✓' : 'Demo'}
                </Tag>
              )}
            </Space>

            {/* Time Range Selector */}
            <Space size="small">
              <Text>Time:</Text>
              <Select
                value={timeRange}
                onChange={setTimeRange}
                style={{ width: '100px' }}
                size="small"
                data-testid="time-range-selector"
              >
                <Select.Option value="1m">Last 1m</Select.Option>
                <Select.Option value="5m">Last 5m</Select.Option>
                <Select.Option value="15m">Last 15m</Select.Option>
                <Select.Option value="30m">Last 30m</Select.Option>
                <Select.Option value="1h">Last 1h</Select.Option>
                <Select.Option value="3h">Last 3h</Select.Option>
                <Select.Option value="6h">Last 6h</Select.Option>
                <Select.Option value="12h">Last 12h</Select.Option>
                <Select.Option value="24h">Last 24h</Select.Option>
              </Select>
            </Space>

            {/* Auto Refresh Selector */}
            <Space size="small">
              <Text>Refresh:</Text>
              <Select
                value={autoRefresh}
                onChange={setAutoRefresh}
                style={{ width: '100px' }}
                size="small"
              >
                <Select.Option value="manual">Manual</Select.Option>
                <Select.Option value="1m">Every 1m</Select.Option>
                <Select.Option value="5m">Every 5m</Select.Option>
              </Select>
            </Space>

            {/* Analyze Button */}
            <Button
              type="primary"
              icon={<AnalysisIcon />}
              onClick={performAnalysis}
              loading={loading}
              disabled={autoRefresh !== 'manual'}
              data-testid="analyze-button"
            >
              Analyze
            </Button>
          </Space>
        </div>
      </div>

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

      {/* Streaming Content - Hidden for now as we simplified the interface */}
      {false && streaming && (
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
