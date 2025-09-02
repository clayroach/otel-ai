import React from 'react'
import { Button, Dropdown, Space, Tag, Radio, Switch, Typography } from 'antd'
import type { MenuProps } from 'antd'
import {
  RobotOutlined,
  ExperimentOutlined,
  CloudOutlined,
  DesktopOutlined,
  DatabaseOutlined,
  ApiOutlined
} from '@ant-design/icons'
import { useAppStore } from '../../store/appStore'

const { Text } = Typography

interface AnalysisConfigurationProps {
  darkMode?: boolean
}

export const AnalysisConfiguration: React.FC<AnalysisConfigurationProps> = ({
  darkMode = false
}) => {
  const { analysisModel, setAnalysisModel, useRealService, setUseRealService } = useAppStore()

  const menuItems: MenuProps['items'] = [
    {
      key: 'model-selection',
      label: (
        <div style={{ padding: '8px 0' }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            AI Model
          </Text>
          <Radio.Group
            value={analysisModel}
            onChange={(e) => setAnalysisModel(e.target.value)}
            size="small"
          >
            <Space direction="vertical">
              <Radio value="llama">
                <Space>
                  <DesktopOutlined />
                  Llama (Local)
                </Space>
              </Radio>
              <Radio value="claude">
                <Space>
                  <CloudOutlined />
                  Claude
                </Space>
              </Radio>
              <Radio value="gpt-4">
                <Space>
                  <CloudOutlined />
                  GPT-4
                </Space>
              </Radio>
            </Space>
          </Radio.Group>
        </div>
      )
    },
    {
      type: 'divider'
    },
    {
      key: 'data-source',
      label: (
        <div style={{ padding: '8px 0' }}>
          <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space>
              {useRealService ? <ApiOutlined /> : <DatabaseOutlined />}
              <Text>{useRealService ? 'Live Service' : 'Mock Data'}</Text>
            </Space>
            <Switch checked={useRealService} onChange={setUseRealService} size="small" />
          </Space>
        </div>
      )
    }
  ]

  const getModelIcon = () => {
    switch (analysisModel) {
      case 'llama':
        return <DesktopOutlined />
      case 'claude':
      case 'gpt-4':
        return <CloudOutlined />
      default:
        return <RobotOutlined />
    }
  }

  const getModelColor = () => {
    switch (analysisModel) {
      case 'llama':
        return 'green'
      case 'claude':
        return 'blue'
      case 'gpt-4':
        return 'purple'
      default:
        return 'default'
    }
  }

  return (
    <Dropdown menu={{ items: menuItems }} placement="bottomRight" trigger={['click']}>
      <Button
        type="text"
        style={{
          color: darkMode ? '#fff' : '#000',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}
      >
        <ExperimentOutlined />
        <Tag color={getModelColor()} style={{ margin: 0, fontSize: '11px' }} icon={getModelIcon()}>
          {analysisModel.toUpperCase()}
        </Tag>
        {useRealService && (
          <Tag color="orange" style={{ margin: 0, fontSize: '11px' }}>
            LIVE
          </Tag>
        )}
      </Button>
    </Dropdown>
  )
}
