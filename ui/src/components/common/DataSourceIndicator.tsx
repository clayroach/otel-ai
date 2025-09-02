import React from 'react'
import { Tag, Tooltip } from 'antd'
import { DatabaseOutlined, ExperimentOutlined } from '@ant-design/icons'

interface DataSourceIndicatorProps {
  isUsingMockData: boolean
  dataSource?: string
  style?: React.CSSProperties
}

export const DataSourceIndicator: React.FC<DataSourceIndicatorProps> = ({ 
  isUsingMockData, 
  dataSource,
  style 
}) => {
  if (isUsingMockData) {
    return (
      <Tooltip title="This component is displaying mock/demo data for demonstration purposes">
        <Tag 
          icon={<ExperimentOutlined />} 
          color="warning"
          style={{ 
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 10,
            ...style 
          }}
        >
          MOCK DATA
        </Tag>
      </Tooltip>
    )
  }

  return (
    <Tooltip title={`Connected to: ${dataSource || 'Backend API'}`}>
      <Tag 
        icon={<DatabaseOutlined />} 
        color="success"
        style={{ 
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 10,
          ...style 
        }}
      >
        LIVE DATA
      </Tag>
    </Tooltip>
  )
}

export default DataSourceIndicator