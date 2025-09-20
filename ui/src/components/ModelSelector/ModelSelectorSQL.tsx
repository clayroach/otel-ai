/**
 * ModelSelectorSQL Component - SQL-specific model selector with ClickHouse AI option
 */

import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CloudOutlined,
  ConsoleSqlOutlined,
  DesktopOutlined,
  LoadingOutlined,
  QuestionCircleOutlined
} from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { Button, Checkbox, Dropdown, Space, Spin, Tag, Typography } from 'antd'
import React from 'react'
import { useModelSelectionContext } from '../../contexts/ModelSelectionContext'
import { useModelSelection } from '../../hooks/useModelSelection'
import type { ModelSelectorProps } from './types'

const { Text } = Typography

const ModelSelectorSQL: React.FC<Omit<ModelSelectorProps, 'taskType'>> = ({
  label = 'SQL',
  className = '',
  disabled = false,
  onModelChange,
  refreshInterval = 30000
}) => {
  const { useClickHouseAI, toggleClickHouseAI, selectedModels } = useModelSelectionContext()

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
    taskType: 'sql',
    refreshInterval,
    onModelChange,
    onError: (err) => console.error(`Model selection error (SQL):`, err)
  })

  const selectedModel = models.find((m) => m.id === selectedModelId)

  // Get icon for provider
  const getProviderIcon = (provider: string) => {
    if (provider === 'lm-studio' || provider === 'ollama') {
      return <DesktopOutlined /> // Local models
    }
    return <CloudOutlined /> // Cloud models
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
  const menuItems: MenuProps['items'] = [
    // ClickHouse AI option at the top
    {
      key: 'clickhouse-ai',
      label: (
        <div style={{ padding: '8px 0' }}>
          <Checkbox
            checked={useClickHouseAI}
            onChange={(e) => toggleClickHouseAI(e.target.checked)}
          >
            <Space>
              <ConsoleSqlOutlined />
              <Text strong>Use ClickHouse AI</Text>
            </Space>
          </Checkbox>
          <div style={{ marginLeft: 24, marginTop: 4 }}>
            <Text style={{ fontSize: '12px', color: '#8c8c8c' }}>
              {useClickHouseAI
                ? `Using general model: ${selectedModels.general || 'None selected'}`
                : 'Select to use general model for SQL'}
            </Text>
          </div>
        </div>
      )
    },
    {
      key: 'divider-1',
      type: 'divider'
    }
  ]

  // Add SQL model groups only if ClickHouse AI is not enabled
  if (!useClickHouseAI) {
    providerGroups.forEach((group) => {
      menuItems.push({
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
      })
    })
  } else {
    // Show disabled message when ClickHouse AI is enabled
    menuItems.push({
      key: 'disabled-info',
      label: (
        <div style={{ padding: '12px', textAlign: 'center' }}>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            SQL models disabled when using ClickHouse AI
          </Text>
        </div>
      ),
      disabled: true
    })
  }

  // Add retry option if there's an error
  if (error && !useClickHouseAI) {
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
          gap: '8px',
          minWidth: '120px',
          padding: '4px 8px'
        }}
        loading={isLoading && models.length === 0}
      >
        {useClickHouseAI ? (
          <>
            <ConsoleSqlOutlined style={{ marginRight: '4px' }} />
            <Text style={{ fontSize: '11px' }}>SQL:</Text>
            <Tag color="cyan" style={{ margin: 0, fontSize: '11px' }} icon={<ConsoleSqlOutlined />}>
              ClickHouse AI
            </Tag>
          </>
        ) : (
          <>
            <ConsoleSqlOutlined style={{ marginRight: '4px' }} />
            <Text style={{ fontSize: '11px' }}>{label}:</Text>
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
          </>
        )}
      </Button>
    </Dropdown>
  )
}

export default ModelSelectorSQL
