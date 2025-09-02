import React from 'react'
import { Switch, Space, Typography, Tooltip } from 'antd'
import { DatabaseOutlined, ExperimentOutlined } from '@ant-design/icons'
import { useAppStore } from '../../store/appStore'

const { Text } = Typography

interface DataSourceToggleProps {
  darkMode?: boolean
}

export const DataSourceToggle: React.FC<DataSourceToggleProps> = ({ darkMode = false }) => {
  const { useMockData, setUseMockData } = useAppStore()

  const handleToggle = (checked: boolean) => {
    setUseMockData(!checked)
    
    // Show notification about data source change
    if (!checked) {
      console.log('Switched to DEMO mode')
    } else {
      console.log('Switched to LIVE mode')
    }
  }

  return (
    <Space 
      style={{ 
        padding: '4px 12px',
        background: useMockData ? 'rgba(250, 173, 20, 0.1)' : 'rgba(82, 196, 26, 0.1)',
        borderRadius: '6px',
        border: `1px solid ${useMockData ? '#faad14' : '#52c41a'}`
      }}
    >
      <Tooltip title={useMockData ? "Using demo data for demonstration" : "Connected to live backend"}>
        {useMockData ? (
          <ExperimentOutlined style={{ color: '#faad14', fontSize: '16px' }} />
        ) : (
          <DatabaseOutlined style={{ color: '#52c41a', fontSize: '16px' }} />
        )}
      </Tooltip>
      
      <Text 
        strong 
        style={{ 
          fontSize: '12px',
          color: darkMode ? '#fff' : '#000',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}
      >
        {useMockData ? 'Demo' : 'Live'}
      </Text>
      
      <Tooltip 
        title={
          useMockData 
            ? "Switch to live data (requires backend connection)" 
            : "Switch to demo mode (for testing/demonstration)"
        }
      >
        <Switch
          size="small"
          checked={!useMockData}
          onChange={handleToggle}
          checkedChildren="Live"
          unCheckedChildren="Demo"
          style={{
            background: useMockData ? '#faad14' : undefined
          }}
        />
      </Tooltip>
    </Space>
  )
}

export default DataSourceToggle