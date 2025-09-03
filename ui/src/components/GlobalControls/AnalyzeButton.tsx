import React from 'react'
import { Button } from 'antd'
import { ThunderboltOutlined } from '@ant-design/icons'
import { analysisEventBus } from '../../utils/eventBus'

interface AnalyzeButtonProps {
  darkMode?: boolean
}

export const AnalyzeButton: React.FC<AnalyzeButtonProps> = ({ darkMode = false }) => {
  const handleAnalyze = () => {
    analysisEventBus.triggerAnalysis()
  }

  return (
    <Button
      type="primary"
      icon={<ThunderboltOutlined />}
      onClick={handleAnalyze}
      size="small"
      style={{
        background: darkMode ? '#1890ff' : undefined
      }}
    >
      Analyze
    </Button>
  )
}
