import React, { useState } from 'react'
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
  Checkbox,
  Empty
} from 'antd'
import {
  SearchOutlined,
  FilterOutlined,
  ForkOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  ThunderboltOutlined,
  UnorderedListOutlined
} from '@ant-design/icons'
import type { CriticalPath, PanelProps } from './types'

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
  const [searchTerm, setSearchTerm] = useState('')
  const [filterBy, setFilterBy] = useState<'all' | 'critical' | 'errors' | 'slow'>('all')
  const [multiSelectMode, setMultiSelectMode] = useState(false)

  // Filter paths based on search and filter criteria
  const filteredPaths = paths.filter(path => {
    const matchesSearch = path.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
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

  const handlePathClick = (pathId: string) => {
    if (multiSelectMode) {
      // Toggle selection in multi-select mode
      if (selectedPaths.includes(pathId)) {
        onPathSelect(selectedPaths.filter(id => id !== pathId))
      } else {
        onPathSelect([...selectedPaths, pathId])
      }
    } else {
      // Single selection mode
      onPathSelect([pathId])
    }
  }

  const handleSelectAll = () => {
    if (selectedPaths.length === filteredPaths.length) {
      onPathSelect([])
    } else {
      onPathSelect(filteredPaths.map(p => p.id))
    }
  }

  const getPriorityColor = (priority: CriticalPath['priority']) => {
    switch (priority) {
      case 'critical': return 'red'
      case 'high': return 'orange'
      case 'medium': return 'blue'
      case 'low': return 'green'
      default: return 'default'
    }
  }

  const getMetricIcon = (path: CriticalPath) => {
    if (path.metrics.errorRate > 0.05) return <WarningOutlined style={{ color: '#ff4d4f' }} />
    if (path.metrics.p99Latency > 2000) return <ClockCircleOutlined style={{ color: '#faad14' }} />
    return <ThunderboltOutlined style={{ color: '#52c41a' }} />
  }

  return (
    <Card
      style={{ width, height: '100%' }}
      bodyStyle={{ padding: '12px', height: '100%', display: 'flex', flexDirection: 'column' }}
      title={
        <Space>
          <ForkOutlined />
          <Text strong>Critical Request Paths</Text>
          <Badge count={selectedPaths.length} style={{ backgroundColor: '#1890ff' }} />
        </Space>
      }
      extra={
        <Space size="small">
          <Tooltip title={multiSelectMode ? 'Multi-select mode' : 'Single-select mode'}>
            <Button
              size="small"
              type={multiSelectMode ? 'primary' : 'default'}
              icon={<UnorderedListOutlined />}
              onClick={() => setMultiSelectMode(!multiSelectMode)}
            />
          </Tooltip>
          <Button size="small" onClick={onShowAll}>
            Show All
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%', marginBottom: 12 }}>
        <Search
          placeholder="Search paths..."
          size="small"
          prefix={<SearchOutlined />}
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          allowClear
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

        {multiSelectMode && filteredPaths.length > 0 && (
          <Checkbox
            checked={selectedPaths.length === filteredPaths.length}
            indeterminate={selectedPaths.length > 0 && selectedPaths.length < filteredPaths.length}
            onChange={handleSelectAll}
          >
            Select All ({filteredPaths.length})
          </Checkbox>
        )}
      </Space>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {filteredPaths.length === 0 ? (
          <Empty
            description="No paths found"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <List
            size="small"
            dataSource={filteredPaths}
            renderItem={path => (
              <List.Item
                key={path.id}
                style={{
                  cursor: 'pointer',
                  backgroundColor: selectedPaths.includes(path.id) ? '#e6f7ff' : 'transparent',
                  padding: '8px',
                  borderRadius: '4px',
                  marginBottom: '4px',
                  transition: 'all 0.2s'
                }}
                onClick={() => handlePathClick(path.id)}
              >
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Space>
                    {multiSelectMode && (
                      <Checkbox
                        checked={selectedPaths.includes(path.id)}
                        onClick={e => e.stopPropagation()}
                      />
                    )}
                    {getMetricIcon(path)}
                    <Text strong style={{ flex: 1 }}>{path.name}</Text>
                  </Space>
                  
                  <Space wrap size={[4, 0]}>
                    <Tag color={getPriorityColor(path.priority)}>
                      {path.priority}
                    </Tag>
                    <Tag>
                      {path.services.length} services
                    </Tag>
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
                </Space>
              </List.Item>
            )}
          />
        )}
      </div>
    </Card>
  )
}