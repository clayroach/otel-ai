import React from 'react'
import { Button, Dropdown, Space, Tag, Radio, Typography } from 'antd'
import type { MenuProps } from 'antd'
import { RobotOutlined, CloudOutlined, DesktopOutlined } from '@ant-design/icons'
import { useAppStore } from '../../store/appStore'

const { Text } = Typography

interface AnalysisConfigurationProps {
  darkMode?: boolean
}

export const AnalysisConfiguration: React.FC<AnalysisConfigurationProps> = ({
  darkMode = false
}) => {
  const { analysisModel, setAnalysisModel } = useAppStore()

  const menuItems: MenuProps['items'] = [
    {
      key: 'model-selection',
      label: (
        <div style={{ padding: '8px 0' }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            Select AI Model
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
        <RobotOutlined />
        <Tag color={getModelColor()} style={{ margin: 0, fontSize: '11px' }} icon={getModelIcon()}>
          {analysisModel.toUpperCase()}
        </Tag>
      </Button>
    </Dropdown>
  )
}
