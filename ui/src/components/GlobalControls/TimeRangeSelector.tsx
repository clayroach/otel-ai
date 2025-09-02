import React from 'react'
import { Select } from 'antd'
import { ClockCircleOutlined } from '@ant-design/icons'
import { useAppStore } from '../../store/appStore'

interface TimeRangeSelectorProps {
  darkMode?: boolean
}

export const TimeRangeSelector: React.FC<TimeRangeSelectorProps> = ({ darkMode = false }) => {
  const { analysisTimeRange, setAnalysisTimeRange } = useAppStore()

  return (
    <Select
      value={analysisTimeRange}
      onChange={setAnalysisTimeRange}
      style={{
        width: '100px',
        color: darkMode ? '#fff' : '#000'
      }}
      size="small"
      suffixIcon={<ClockCircleOutlined />}
    >
      <Select.Option value="1m">1m</Select.Option>
      <Select.Option value="5m">5m</Select.Option>
      <Select.Option value="15m">15m</Select.Option>
      <Select.Option value="30m">30m</Select.Option>
      <Select.Option value="1h">1h</Select.Option>
      <Select.Option value="3h">3h</Select.Option>
      <Select.Option value="6h">6h</Select.Option>
      <Select.Option value="12h">12h</Select.Option>
      <Select.Option value="24h">24h</Select.Option>
    </Select>
  )
}
