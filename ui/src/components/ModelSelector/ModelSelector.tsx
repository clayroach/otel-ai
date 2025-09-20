/**
 * ModelSelector Component - Main component for model selection
 */

import React from 'react'
import { Button, Dropdown, Tag, Space, Spin, Typography } from 'antd'
import type { MenuProps } from 'antd'
import {
  GlobalOutlined,
  CloudOutlined,
  DesktopOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  QuestionCircleOutlined
} from '@ant-design/icons'
import { useModelSelection } from '../../hooks/useModelSelection'
import type { ModelSelectorProps } from './types'

const { Text } = Typography

const ModelSelector: React.FC<ModelSelectorProps> = ({
  taskType,
  label,
  className = '',
  disabled = false,
  onModelChange,
  refreshInterval = 30000 // Default 30 seconds
}) => {
  const {
    models,
    selectedModelId,
    isLoading,
    error,
    selectModel,
    refreshModels,
    modelHealth,
    providerGroups
  } = useModelSelection({
    taskType,
    refreshInterval,
    onModelChange,
    onError: (err) => console.error(`Model selection error (${taskType}):`, err)
  })

  const selectedModel = models.find((m) => m.id === selectedModelId)
  const displayLabel = label || (taskType === 'sql' ? 'SQL' : 'General')

  // Get icon for provider
  const getProviderIcon = (provider: string) => {
    if (provider === 'lm-studio' || provider === 'ollama') {
      return <DesktopOutlined />
    }
    return <CloudOutlined />
  }

  // Get health icon
  const getHealthIcon = (modelId: string) => {
    const health = modelHealth.get(modelId)
    switch (health?.status) {
      case 'healthy':
        return <CheckCircleOutlined style={{ color: '#52c41a', fontSize: '12px' }} />
      case 'unhealthy':
        return <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: '12px' }} />
      case 'checking':
        return <LoadingOutlined style={{ color: '#faad14', fontSize: '12px' }} />
      default:
        return <QuestionCircleOutlined style={{ color: '#8c8c8c', fontSize: '12px' }} />
    }
  }

  // Get model color based on provider
  const getModelColor = (provider: string) => {
    switch (provider) {
      case 'openai':
        return 'green'
      case 'anthropic':
        return 'blue'
      case 'lm-studio':
        return 'orange'
      case 'ollama':
        return 'purple'
      default:
        return 'default'
    }
  }

  // Build menu items for dropdown
  const menuItems: MenuProps['items'] = providerGroups.map((group) => ({
    key: group.provider,
    type: 'group',
    label: (
      <div style={{ fontWeight: 500, fontSize: '12px', color: '#8c8c8c' }}>
        {group.displayName}
        {group.allUnavailable && (
          <Tag color="error" style={{ marginLeft: 8, fontSize: '10px' }}>
            Offline
          </Tag>
        )}
      </div>
    ),
    children: group.models.map((model) => ({
      key: model.id,
      label: (
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            {getProviderIcon(model.provider)}
            <Text style={{ fontSize: '13px' }}>{model.name}</Text>
          </Space>
          <Space size={4}>
            {model.isDefault && (
              <Tag color="blue" style={{ fontSize: '10px', margin: 0 }}>
                Default
              </Tag>
            )}
            {getHealthIcon(model.id)}
          </Space>
        </Space>
      ),
      disabled: model.status === 'unavailable',
      onClick: () => selectModel(model.id)
    }))
  }))

  // Add retry option if there's an error
  if (error) {
    menuItems.push(
      {
        key: 'retry',
        type: 'divider'
      },
      {
        key: 'retry-action',
        label: (
          <Space>
            <Text type="danger" style={{ fontSize: '12px' }}>
              Error loading models
            </Text>
            <Button size="small" type="link" onClick={refreshModels}>
              Retry
            </Button>
          </Space>
        )
      }
    )
  }

  // Loading state
  if (isLoading && models.length === 0) {
    return (
      <Space className={className}>
        <Spin size="small" />
        <Text style={{ fontSize: '12px' }}>Loading models...</Text>
      </Space>
    )
  }

  return (
    <Dropdown
      menu={{ items: menuItems }}
      placement="bottomRight"
      trigger={['click']}
      disabled={disabled || isLoading}
    >
      <Button
        type="text"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          minWidth: '120px',
          padding: '4px 8px'
        }}
        loading={isLoading && models.length === 0}
      >
        <GlobalOutlined />
        <Text style={{ fontSize: '11px' }}>{displayLabel}:</Text>
        {selectedModel ? (
          <Tag
            color={getModelColor(selectedModel.provider)}
            style={{ margin: 0, fontSize: '11px' }}
            icon={getProviderIcon(selectedModel.provider)}
          >
            {selectedModel.name}
          </Tag>
        ) : (
          <Tag style={{ margin: 0, fontSize: '11px' }}>None</Tag>
        )}
      </Button>
    </Dropdown>
  )
}

export default ModelSelector
