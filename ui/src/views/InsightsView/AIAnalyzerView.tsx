import React, { useState, useEffect } from 'react';
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
  message,
} from 'antd';
import {
  BarChartOutlined as AnalysisIcon,
  ClockCircleOutlined as ClockIcon,
  LineChartOutlined as TrendingUpIcon,
  ThunderboltOutlined as ZapIcon,
  DatabaseOutlined as DatabaseIcon,
} from '@ant-design/icons';
// import ReactMarkdown from 'react-markdown'; // Commented out - not available
import dayjs from 'dayjs';
import { 
  type AnalysisResult,
  generateMockData
} from './mockData';
import { AIAnalyzerService, useAIAnalyzer } from '../../services/ai-analyzer';

const { Title, Paragraph, Text } = Typography;
const { TabPane } = Tabs;
const { RangePicker } = DatePicker;

const AIAnalyzerView: React.FC = () => {
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisType, setAnalysisType] = useState<'architecture' | 'dataflow' | 'dependencies' | 'insights'>('architecture');
  const [timeRange, setTimeRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(4, 'hours'),
    dayjs()
  ]);
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [useRealService, setUseRealService] = useState(true);
  const [serviceHealth, setServiceHealth] = useState<{ status: string; capabilities: string[] } | null>(null);

  const aiAnalyzer = useAIAnalyzer();

  // Check service health on mount
  useEffect(() => {
    const checkServiceHealth = async () => {
      try {
        const health = await aiAnalyzer.healthCheck();
        setServiceHealth(health);
        
        if (health.status !== 'healthy') {
          setUseRealService(false);
          message.warning('AI Analyzer service unavailable - using mock data');
        }
      } catch (error) {
        console.log('AI Analyzer service not available:', error);
        setServiceHealth({ status: 'unavailable', capabilities: [] });
        setUseRealService(false);
      }
    };

    checkServiceHealth();
  }, []);


  const performAnalysis = async () => {
    setLoading(true);
    setError(null);
    
    try {
      if (useRealService) {
        // Use real AI analyzer service
        const result = await aiAnalyzer.analyzeArchitecture({
          type: analysisType,
          timeRange: {
            startTime: timeRange[0].toDate(),
            endTime: timeRange[1].toDate()
          },
          filters: {
            // Add any service filters if needed
          }
        });
        
        setAnalysisResult(result);
        message.success('Topology analysis completed successfully!');
      } else {
        // Fallback to mock data
        await new Promise(resolve => setTimeout(resolve, 2000));
        const result = generateMockData(analysisType);
        setAnalysisResult(result);
        message.success('Mock analysis completed successfully!');
      }
    } catch (err) {
      console.error('Analysis failed:', err);
      setError(`Failed to perform analysis: ${err instanceof Error ? err.message : 'Unknown error'}`);
      message.error('Analysis failed - falling back to mock data');
      
      // Fallback to mock data on error
      const result = generateMockData(analysisType);
      setAnalysisResult(result);
    } finally {
      setLoading(false);
    }
  };

  const performStreamingAnalysis = async () => {
    setStreaming(true);
    setStreamingContent('');
    setError(null);
    
    try {
      if (useRealService) {
        // Use real streaming service
        const stream = aiAnalyzer.streamAnalysis({
          type: analysisType,
          timeRange: {
            startTime: timeRange[0].toDate(),
            endTime: timeRange[1].toDate()
          }
        });

        let content = '';
        for await (const chunk of stream) {
          content += chunk;
          setStreamingContent(content);
        }
      } else {
        // Mock streaming for demo
        const fullText = generateMockData(analysisType).summary;
        const words = fullText.split(' ');
        
        for (let i = 0; i < words.length; i++) {
          await new Promise(resolve => setTimeout(resolve, 50));
          setStreamingContent(words.slice(0, i + 1).join(' '));
        }
      }
    } catch (err) {
      console.error('Streaming analysis failed:', err);
      setError(`Streaming failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      
      // Fallback to mock streaming
      const fullText = generateMockData(analysisType).summary;
      const words = fullText.split(' ');
      
      for (let i = 0; i < words.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 50));
        setStreamingContent(words.slice(0, i + 1).join(' '));
      }
    } finally {
      setStreaming(false);
    }
  };

  const getServiceTypeIcon = (type: string) => {
    switch (type) {
      case 'frontend': return '🌐';
      case 'api': return '🚪';
      case 'backend': return '⚙️';
      case 'database': return '🗄️';
      case 'cache': return '💾';
      case 'external': return '🔗';
      case 'queue': return '📬';
      default: return '📦';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'red';
      case 'warning': return 'orange';
      case 'info': return 'blue';
      default: return 'default';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'performance': return 'green';
      case 'reliability': return 'red';
      case 'architecture': return 'blue';
      case 'optimization': return 'purple';
      default: return 'default';
    }
  };

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <Title level={2}>
          <ZapIcon style={{ marginRight: '12px', color: '#1890ff', fontSize: '28px' }} />
          AI-Powered Architecture Analysis
        </Title>
        <Paragraph>
          Leverage machine learning to analyze your OpenTelemetry data and discover architectural insights,
          performance bottlenecks, and optimization opportunities.
        </Paragraph>
      </div>

      {/* Analysis Controls */}
      <Card title="Analysis Configuration" style={{ marginBottom: '24px' }}>
        <Row gutter={16} align="middle">
          <Col span={5}>
            <div>
              <Text strong>Analysis Type:</Text>
              <Select
                value={analysisType}
                onChange={setAnalysisType}
                style={{ width: '100%', marginTop: 8 }}
              >
                <Select.Option value="architecture">🏗️ Architecture Overview</Select.Option>
                <Select.Option value="dependencies">🔄 Service Dependencies</Select.Option>
                <Select.Option value="dataflow">📊 Data Flow Analysis</Select.Option>
                <Select.Option value="insights">💡 Performance Insights</Select.Option>
              </Select>
            </div>
          </Col>
          <Col span={7}>
            <div>
              <Text strong>Time Range:</Text>
              <RangePicker
                value={timeRange}
                onChange={(dates) => dates && setTimeRange([dates[0]!, dates[1]!])}
                showTime
                style={{ width: '100%', marginTop: 8 }}
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
                  Status: <Tag color={serviceHealth.status === 'healthy' ? 'green' : 'red'}>
                    {serviceHealth.status}
                  </Tag>
                </div>
              )}
            </div>
          </Col>
          <Col span={4}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button
                type="primary"
                icon={<AnalysisIcon />}
                onClick={performAnalysis}
                loading={loading}
                block
              >
                Generate Topology
              </Button>
            </Space>
          </Col>
          <Col span={4}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button
                icon={<TrendingUpIcon />}
                onClick={performStreamingAnalysis}
                loading={streaming}
                block
              >
                Stream Analysis
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
        <Card title="Real-time Analysis Stream" style={{ marginBottom: '24px' }}>
          <div style={{ minHeight: '200px', padding: '16px', background: '#f5f5f5', borderRadius: '6px' }}>
            <div style={{ whiteSpace: 'pre-wrap' }}>{streamingContent}</div>
            <Spin size="small" style={{ marginLeft: '8px' }} />
          </div>
        </Card>
      )}

      {/* Analysis Results */}
      {analysisResult && (
        <Tabs defaultActiveKey="overview" size="large">
          <TabPane tab="📊 Overview" key="overview">
            <Row gutter={24}>
              <Col span={24}>
                <Card title="Analysis Summary">
                  <div style={{ whiteSpace: 'pre-wrap' }}>{analysisResult.summary}</div>
                </Card>
              </Col>
            </Row>
            
            <Row gutter={16} style={{ marginTop: '24px' }}>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="Spans Analyzed"
                    value={analysisResult.metadata.analyzedSpans}
                    prefix={<DatabaseIcon />}
                    suffix="spans"
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="Analysis Time"
                    value={analysisResult.metadata.analysisTimeMs}
                    prefix={<ClockIcon />}
                    suffix="ms"
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="LLM Tokens"
                    value={analysisResult.metadata.llmTokensUsed}
                    prefix={<ZapIcon />}
                    suffix="tokens"
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <div>
                    <Text strong>Confidence Score</Text>
                    <Progress
                      percent={Math.round(analysisResult.metadata.confidence * 100)}
                      status={analysisResult.metadata.confidence > 0.8 ? 'success' : 'normal'}
                      style={{ marginTop: 8 }}
                    />
                  </div>
                </Card>
              </Col>
            </Row>
          </TabPane>

          {analysisResult.architecture && (
            <TabPane tab="🏗️ Architecture" key="architecture">
              <Row gutter={24}>
                <Col span={16}>
                  <Card title="Service Topology" style={{ marginBottom: '24px' }}>
                    <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                      {analysisResult.architecture.services.map((service) => (
                        <Card
                          key={service.service}
                          size="small"
                          style={{ marginBottom: '12px' }}
                          title={
                            <Space>
                              <span>{getServiceTypeIcon(service.type)}</span>
                              <Text strong>{service.service}</Text>
                              <Tag color={getTypeColor(service.type)}>{service.type}</Tag>
                            </Space>
                          }
                        >
                          <Row gutter={16}>
                            <Col span={12}>
                              <Text strong>Operations:</Text>
                              <div>{service.operations.join(', ')}</div>
                              <Text strong>Dependencies:</Text>
                              <div>{service.dependencies.length} services</div>
                            </Col>
                            <Col span={12}>
                              <Space direction="vertical" size="small">
                                <div>
                                  <Text strong>Avg Latency:</Text> {service.metadata.avgLatencyMs}ms
                                </div>
                                <div>
                                  <Text strong>Error Rate:</Text> {(service.metadata.errorRate * 100).toFixed(2)}%
                                </div>
                                <div>
                                  <Text strong>Total Spans:</Text> {service.metadata.totalSpans}
                                </div>
                              </Space>
                            </Col>
                          </Row>
                        </Card>
                      ))}
                    </div>
                  </Card>
                </Col>
                <Col span={8}>
                  <Card title="Critical Paths" style={{ marginBottom: '24px' }}>
                    <Timeline>
                      {analysisResult.architecture.criticalPaths.map((path, index) => (
                        <Timeline.Item key={index}>
                          <Text strong>{path.name}</Text>
                          <div style={{ marginTop: '8px' }}>
                            <Tag>🕐 {path.avgLatencyMs.toFixed(0)}ms</Tag>
                            <Tag color={path.errorRate > 0.01 ? 'red' : 'green'}>
                              ❌ {(path.errorRate * 100).toFixed(2)}%
                            </Tag>
                          </div>
                          <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                            {path.services.join(' → ')}
                          </div>
                        </Timeline.Item>
                      ))}
                    </Timeline>
                  </Card>

                  <Card title="Application Info">
                    <Space direction="vertical" size="small" style={{ width: '100%' }}>
                      <div>
                        <Text strong>Name:</Text> {analysisResult.architecture.applicationName}
                      </div>
                      <div>
                        <Text strong>Services:</Text> {analysisResult.architecture.services.length}
                      </div>
                      <div>
                        <Text strong>Data Flows:</Text> {analysisResult.architecture.dataFlows.length}
                      </div>
                      <div>
                        <Text strong>Generated:</Text> {dayjs(analysisResult.architecture.generatedAt).format('MMM D, YYYY HH:mm')}
                      </div>
                    </Space>
                  </Card>
                </Col>
              </Row>
            </TabPane>
          )}

          <TabPane tab="💡 Insights" key="insights">
            <Row gutter={16}>
              {analysisResult.insights.map((insight, index) => (
                <Col span={12} key={index} style={{ marginBottom: '16px' }}>
                  <Card
                    title={
                      <Space>
                        <Tag color={getSeverityColor(insight.severity)}>
                          {insight.severity === 'critical' ? '🚨' : 
                           insight.severity === 'warning' ? '⚠️' : 'ℹ️'}
                          {insight.severity}
                        </Tag>
                        <Tag color={getTypeColor(insight.type)}>{insight.type}</Tag>
                      </Space>
                    }
                  >
                    <Title level={5}>{insight.title}</Title>
                    <Paragraph>{insight.description}</Paragraph>
                    {insight.recommendation && (
                      <>
                        <Divider />
                        <Paragraph>
                          <Text strong>💡 Recommendation:</Text>
                          <br />
                          {insight.recommendation}
                        </Paragraph>
                      </>
                    )}
                  </Card>
                </Col>
              ))}
            </Row>
          </TabPane>

          {analysisResult.documentation && (
            <TabPane tab="📚 Documentation" key="documentation">
              <Card>
                <div style={{ whiteSpace: 'pre-wrap' }}>{analysisResult.documentation.markdown}</div>
              </Card>
            </TabPane>
          )}
        </Tabs>
      )}

      {!analysisResult && !loading && (
        <Card style={{ textAlign: 'center', padding: '48px' }}>
          <ZapIcon style={{ color: '#d9d9d9', marginBottom: '16px', fontSize: '48px' }} />
          <Title level={4} style={{ color: '#999' }}>
            Ready for AI Analysis
          </Title>
          <Paragraph style={{ color: '#999' }}>
            Configure your analysis parameters above and click "Analyze" to discover insights about your application architecture.
          </Paragraph>
        </Card>
      )}
    </div>
  );
};

export default AIAnalyzerView;