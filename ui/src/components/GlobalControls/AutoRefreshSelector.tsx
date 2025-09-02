import React from 'react'
import { Select } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { useAppStore } from '../../store/appStore'

interface AutoRefreshSelectorProps {
  darkMode?: boolean
}

export const AutoRefreshSelector: React.FC<AutoRefreshSelectorProps> = ({ darkMode = false }) => {
  const { autoRefresh, setAutoRefresh } = useAppStore()

  return (
    <Select
      value={autoRefresh}
      onChange={setAutoRefresh}
      style={{
        width: '100px',
        color: darkMode ? '#fff' : '#000'
      }}
      size="small"
      suffixIcon={<ReloadOutlined spin={autoRefresh !== 'manual'} />}
    >
      <Select.Option value="manual">Manual</Select.Option>
      <Select.Option value="1m">Every 1m</Select.Option>
      <Select.Option value="5m">Every 5m</Select.Option>
    </Select>
  )
}
