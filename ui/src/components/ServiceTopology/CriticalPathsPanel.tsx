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

const { Text } = Typography
const { Search } = Input

interface CriticalPathsPanelProps extends PanelProps {
  paths: CriticalPath[]
  selectedPaths: string[]
  onPathSelect: (pathIds: string[]) => void
  onShowAll: () => void
}

export const CriticalPathsPanel: React.FC<CriticalPathsPanelProps> = ({
  paths,
  selectedPaths,
  onPathSelect,
  onShowAll,
  width = '100%'
}) => {
  const navigate = useNavigate()
  const queryGenerator = useQueryGenerator()
  const [searchTerm, setSearchTerm] = useState('')
  const [filterBy, setFilterBy] = useState<'all' | 'critical' | 'errors' | 'slow'>('all')
  const [generatingQuery, setGeneratingQuery] = useState<string | null>(null)

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

    try {
      // Generate the query using the service
      const result = await queryGenerator.generateQuery({ path })

      // Navigate to Traces view with the generated query
      navigate('/traces', {
        state: {
          query: result.sql,
          metadata: {
            model: result.model,
            generatedAt: Date.now(),
            generationTime: result.generationTime,
            criticalPath: path.name,
            description: result.description
          }
        }
      })
    } catch (error) {
      console.error('Failed to generate query:', error)
      // Could show a notification here
    } finally {
      setGeneratingQuery(null)
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
        {filteredPaths.length === 0 ? (
          <Empty description="No paths found" image={Empty.PRESENTED_IMAGE_SIMPLE} />
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
                    <Text strong style={{ flex: 1 }}>
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
                        <ClockCircleOutlined /> {path.metrics.avgLatency}ms
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

                  <Button
                    size="small"
                    type="primary"
                    data-testid={`diagnostic-query-button-${path.id}`}
                    icon={generatingQuery === path.id ? <LoadingOutlined /> : <CodeOutlined />}
                    onClick={(e) => handleGenerateQuery(path, e)}
                    loading={generatingQuery === path.id}
                    style={{ marginTop: '8px', width: '100%' }}
                  >
                    {generatingQuery === path.id
                      ? 'Generating Diagnostic Query...'
                      : 'Generate Diagnostic Query'}
                  </Button>
                </Space>
              </List.Item>
            )}
          />
        )}
      </div>
    </Card>
  )
}
