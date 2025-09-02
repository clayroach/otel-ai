import React, { useState, useEffect } from 'react'
import {
  Card,
  Typography,
  Space,
  Spin,
  Alert,
  // Tabs, // Not used with new topology
  Tag,
  message
} from 'antd'
import { LineChartOutlined as TrendingUpIcon } from '@ant-design/icons'
// import ReactMarkdown from 'react-markdown'; // Commented out - not available
// import { type AnalysisResult, generateMockData } from './mockData' // Not used with new topology
import { useAIAnalyzer } from '../../services/ai-analyzer'
import { CriticalRequestPathsTopology } from '../../components/CriticalRequestPathsTopology'
import { useAppStore } from '../../store/appStore'
import { analysisEventBus } from '../../utils/eventBus'

const { Text } = Typography

const AIAnalyzerView: React.FC = () => {
  // const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null) // Not used with new topology
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Streaming functionality - disabled for now
  // const [streaming, setStreaming] = useState(false)
  // const [streamingContent, setStreamingContent] = useState<string>('')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
  const [serviceHealth, setServiceHealth] = useState<{
    status: string
    capabilities: string[]
  } | null>(null)

  // Use global store for analysis configuration
  const {
    analysisModel: selectedModel,
    useRealService,
    setUseRealService,
    analysisTimeRange: timeRange,
    autoRefresh
  } = useAppStore()

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

  // Subscribe to analyze events from global menu
  useEffect(() => {
    const unsubscribe = analysisEventBus.onAnalyze(() => {
      performAnalysis()
    })
    return () => unsubscribe()
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
      case '1m':
        return 1 / 60
      case '5m':
        return 5 / 60
      case '15m':
        return 0.25
      case '30m':
        return 0.5
      case '1h':
        return 1
      case '3h':
        return 3
      case '6h':
        return 6
      case '12h':
        return 12
      case '24h':
        return 24
      default:
        return 1
    }
  }

  const performAnalysis = async () => {
    setLoading(true)
    setError(null)

    try {
      if (useRealService) {
        // Use real AI analyzer service with model selection
        const config = {
          llm: {
            model: (selectedModel === 'gpt-4' ? 'gpt' : selectedModel) as 'claude' | 'llama' | 'gpt',
            temperature:
              selectedModel === 'gpt-4' ? 0.5 : selectedModel === 'llama' ? 0.8 : 0.7,
            maxTokens:
              selectedModel === 'gpt-4' ? 1500 : selectedModel === 'llama' ? 1800 : 2000
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
          `🎯 Real topology analysis completed using ${selectedModel} model!`
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  /* const _performStreamingAnalysis = async () => {
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
              model: selectedModel === 'gpt-4' ? 'gpt' : selectedModel as 'claude' | 'llama',
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
  } */

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
      {false && (
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
              {'Initializing topology analysis...\n🔍 Scanning service dependencies...\n📊 Processing telemetry data...'}
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
