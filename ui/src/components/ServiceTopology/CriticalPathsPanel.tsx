import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  List,
  Badge,
  Typography,
  Space,
  Tag,
  Tooltip,
  Input,
  Select,
  Button,
  Empty
} from 'antd'
import {
  SearchOutlined,
  FilterOutlined,
  ForkOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  ThunderboltOutlined,
  CodeOutlined,
  LoadingOutlined
} from '@ant-design/icons'
import type { CriticalPath, PanelProps } from './types'
import { useQueryGenerator } from '../../services/query-generator'
import { useModelSelectionContext } from '../../contexts/ModelSelectionContext'

const { Text } = Typography
const { Search } = Input

interface CriticalPathsPanelProps extends PanelProps {
  paths: CriticalPath[]
  selectedPaths: string[]
  onPathSelect: (pathIds: string[]) => void
  onShowAll: () => void
  isLoading?: boolean
  discoveryModel?: string
}

export const CriticalPathsPanel: React.FC<CriticalPathsPanelProps> = ({
  paths,
  selectedPaths,
  onPathSelect,
  onShowAll,
  width = '100%',
  isLoading = false,
  discoveryModel
}) => {
  const navigate = useNavigate()
  const queryGenerator = useQueryGenerator()
  const { selectedModels, useClickHouseAI } = useModelSelectionContext()
  const [searchTerm, setSearchTerm] = useState('')
  const [filterBy, setFilterBy] = useState<'all' | 'critical' | 'errors' | 'slow'>('all')
  const [generatingQuery, setGeneratingQuery] = useState<string | null>(null)
  const [generatingModel, setGeneratingModel] = useState<string | null>(null)
  const [optimizationStatus, setOptimizationStatus] = useState<{
    pathId: string
    attempt: number
    message: string
  } | null>(null)

  // Filter paths based on search and filter criteria
  const filteredPaths = paths.filter((path) => {
    const matchesSearch =
      path.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      path.description?.toLowerCase().includes(searchTerm.toLowerCase())

    let matchesFilter = true
    switch (filterBy) {
      case 'critical':
        matchesFilter = path.priority === 'critical'
        break
      case 'errors':
        matchesFilter = path.metrics.errorRate > 0.01 // > 1% error rate
        break
      case 'slow':
        matchesFilter = path.metrics.p99Latency > 1000 // > 1s P99
        break
    }

    return matchesSearch && matchesFilter
  })

  const handlePathClick = (pathId: string, event: React.MouseEvent) => {
    const isMultiSelect = event.metaKey || event.ctrlKey

    if (isMultiSelect) {
      // Multi-select mode with Cmd/Ctrl key
      if (selectedPaths.includes(pathId)) {
        onPathSelect(selectedPaths.filter((id) => id !== pathId))
      } else {
        onPathSelect([...selectedPaths, pathId])
      }
    } else {
      // Single select mode - toggle selection
      if (selectedPaths.includes(pathId) && selectedPaths.length === 1) {
        // Clicking the only selected path deselects it
        onPathSelect([])
      } else {
        // Select only this path
        onPathSelect([pathId])
      }
    }
  }

  const handleClearSelection = () => {
    onPathSelect([])
  }

  const handleGenerateQuery = async (path: CriticalPath, event: React.MouseEvent) => {
    // Prevent path selection when clicking the button
    event.stopPropagation()

    setGeneratingQuery(path.id)

    // Determine which model to use based on ClickHouse AI setting
    const modelToUse = useClickHouseAI
      ? selectedModels.general // Use general model when ClickHouse AI is enabled
      : selectedModels.sql // Use SQL model otherwise

    setGeneratingModel(modelToUse || 'default')

    try {
      // Generate the query using the service with the selected model
      const result = await queryGenerator.generateQuery({
        path,
        preferredModel: modelToUse || undefined,
        isClickHouseAI: useClickHouseAI
      })

      // Check if query was optimized and update status
      if (result.optimizationStatus) {
        const { wasOptimized, attempts, finalValid } = result.optimizationStatus
        if (wasOptimized) {
          setOptimizationStatus({
            pathId: path.id,
            attempt: attempts,
            message: finalValid
              ? `✅ Query optimized successfully after ${attempts} attempts`
              : `⚠️ Query optimization attempted ${attempts} times, some issues remain`
          })

          // Clear optimization status after 3 seconds
          setTimeout(() => setOptimizationStatus(null), 3000)
        }
      }

      // Navigate to Traces view with the generated query
      navigate('/traces', {
        state: {
          query: result.sql,
          metadata: {
            model: result.model || modelToUse || 'unknown',
            modelUsed: modelToUse || 'default', // Track which model was requested
            isClickHouseAI: useClickHouseAI, // Track if ClickHouse AI was used
            generatedAt: Date.now(),
            generationTime: result.generationTime,
            criticalPath: path.name,
            description: result.description,
            optimizationStatus: result.optimizationStatus // Include optimization info
          }
        }
      })
    } catch (error) {
      console.error('Failed to generate query:', error)
      setOptimizationStatus({
        pathId: path.id,
        attempt: 0,
        message: '❌ Query generation failed'
      })
      setTimeout(() => setOptimizationStatus(null), 3000)
    } finally {
      setGeneratingQuery(null)
      setGeneratingModel(null)
    }
  }

  const getPriorityColor = (priority: CriticalPath['priority']) => {
    switch (priority) {
      case 'critical':
        return 'red'
      case 'high':
        return 'orange'
      case 'medium':
        return 'blue'
      case 'low':
        return 'green'
      default:
        return 'default'
    }
  }

  const getMetricIcon = (path: CriticalPath) => {
    if (path.metrics.errorRate > 0.05) return <WarningOutlined style={{ color: '#ff4d4f' }} />
    if (path.metrics.p99Latency > 2000) return <ClockCircleOutlined style={{ color: '#faad14' }} />
    return <ThunderboltOutlined style={{ color: '#52c41a' }} />
  }

  return (
    <Card
      style={{
        width,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
      styles={{
        body: {
          padding: '12px',
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }
      }}
      data-testid="critical-paths-panel"
      title={
        <Space size="small" style={{ fontSize: '14px' }}>
          <ForkOutlined style={{ fontSize: '14px' }} />
          <Text strong style={{ fontSize: '14px', whiteSpace: 'nowrap' }}>
            Critical Paths
          </Text>
          {discoveryModel && (
            <Text type="secondary" style={{ fontSize: '11px' }}>
              ({discoveryModel})
            </Text>
          )}
          {selectedPaths.length > 0 && (
            <Badge
              count={selectedPaths.length}
              style={{ backgroundColor: '#1890ff' }}
              data-testid="selected-paths-count"
            />
          )}
        </Space>
      }
      extra={
        <Space size="small">
          {selectedPaths.length > 0 && (
            <Button size="small" onClick={handleClearSelection} type="text" danger>
              Clear
            </Button>
          )}
          <Button size="small" onClick={onShowAll}>
            All
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%', marginBottom: 8, flexShrink: 0 }}>
        <Search
          placeholder="Search paths..."
          size="small"
          prefix={<SearchOutlined />}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          allowClear
          suffix={
            <Tooltip title="Hold Cmd/Ctrl to select multiple paths">
              <Text type="secondary" style={{ fontSize: '11px' }}>
                ⌘+Click
              </Text>
            </Tooltip>
          }
        />

        <Select
          size="small"
          style={{ width: '100%' }}
          placeholder="Filter by..."
          value={filterBy}
          onChange={setFilterBy}
          suffixIcon={<FilterOutlined />}
        >
          <Select.Option value="all">All Paths</Select.Option>
          <Select.Option value="critical">Critical Only</Select.Option>
          <Select.Option value="errors">High Errors</Select.Option>
          <Select.Option value="slow">Slow Paths</Select.Option>
        </Select>
      </Space>

      <div className="critical-paths-scroll-container">
        {isLoading ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '200px'
            }}
          >
            <Space direction="vertical" align="center">
              <LoadingOutlined style={{ fontSize: 32 }} />
              <Text type="secondary">
                Discovering critical paths
                {discoveryModel && <> with {discoveryModel}</>}...
              </Text>
            </Space>
          </div>
        ) : filteredPaths.length === 0 ? (
          <Empty description="No paths match filters" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <List
            size="small"
            dataSource={filteredPaths}
            style={{ overflow: 'visible' }}
            renderItem={(path) => (
              <List.Item
                key={path.id}
                data-testid={`critical-path-item-${path.id}`}
                style={{
                  cursor: 'pointer',
                  backgroundColor: selectedPaths.includes(path.id) ? '#e6f7ff' : 'transparent',
                  padding: '8px',
                  borderRadius: '4px',
                  marginBottom: '4px',
                  transition: 'all 0.2s'
                }}
                onClick={(e) => handlePathClick(path.id, e)}
              >
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Space>
                    {getMetricIcon(path)}
                    <Text strong style={{ flex: 1 }} data-testid="path-name">
                      {path.name}
                    </Text>
                  </Space>

                  <Space wrap size={[4, 0]}>
                    <Tag color={getPriorityColor(path.priority)}>{path.priority}</Tag>
                    <Tag>{path.services.length} services</Tag>
                    <Tooltip title="Request Count">
                      <Tag icon={<ThunderboltOutlined />}>
                        {path.metrics.requestCount.toLocaleString()}/min
                      </Tag>
                    </Tooltip>
                  </Space>

                  <Space size="small" style={{ fontSize: '12px' }}>
                    <Tooltip title="Average Latency">
                      <Text type="secondary">
                        <ClockCircleOutlined /> {Math.round(path.metrics.avgLatency)}ms
                      </Text>
                    </Tooltip>
                    {path.metrics.errorRate > 0 && (
                      <Tooltip title="Error Rate">
                        <Text type="danger">
                          <WarningOutlined /> {(path.metrics.errorRate * 100).toFixed(2)}%
                        </Text>
                      </Tooltip>
                    )}
                  </Space>

                  {path.description && (
                    <Text type="secondary" style={{ fontSize: '11px' }}>
                      {path.description}
                    </Text>
                  )}

                  {/* Show optimization status message if active */}
                  {optimizationStatus?.pathId === path.id && (
                    <Text type="secondary" style={{ fontSize: '11px', marginTop: '4px' }}>
                      {optimizationStatus.message}
                    </Text>
                  )}

                  <Tooltip
                    title={
                      generatingQuery === path.id
                        ? optimizationStatus?.pathId === path.id
                          ? optimizationStatus.message
                          : `Generating query with ${generatingModel || 'selected model'}...`
                        : `Will use ${useClickHouseAI ? 'ClickHouse AI with ' + (selectedModels.general || 'general model') : selectedModels.sql || 'SQL model'}`
                    }
                  >
                    <Button
                      size="small"
                      type="primary"
                      data-testid={`diagnostic-query-button-${path.id}`}
                      icon={
                        generatingQuery === path.id ? <LoadingOutlined spin /> : <CodeOutlined />
                      }
                      onClick={(e) => handleGenerateQuery(path, e)}
                      loading={generatingQuery === path.id}
                      style={{ marginTop: '8px', width: '100%' }}
                    >
                      {generatingQuery === path.id ? (
                        <Space size={4}>
                          <span>
                            {optimizationStatus?.pathId === path.id &&
                            optimizationStatus.attempt > 0
                              ? `Optimizing (Attempt ${optimizationStatus.attempt})`
                              : 'Generating with'}
                          </span>
                          <Tag color="processing" style={{ margin: 0, fontSize: '11px' }}>
                            {generatingModel?.split('-')[0]?.toUpperCase() || 'MODEL'}
                          </Tag>
                        </Space>
                      ) : (
                        'Generate Diagnostic Query'
                      )}
                    </Button>
                  </Tooltip>
                </Space>
              </List.Item>
            )}
          />
        )}
      </div>
    </Card>
  )
}
