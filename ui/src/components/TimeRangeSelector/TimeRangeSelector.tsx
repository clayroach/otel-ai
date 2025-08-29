import React from 'react'
import { DatePicker, Select, Space } from 'antd'
import { ClockCircleOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useAppStore } from '../../store/appStore'

const { RangePicker } = DatePicker

interface TimeRangeSelectorProps {
  onChange?: (start: string, end: string) => void
}

export const TimeRangeSelector: React.FC<TimeRangeSelectorProps> = ({ onChange }) => {
  const { timeRange, setTimeRange } = useAppStore()

  const quickRanges = [
    { label: 'Last 15 minutes', value: 15 },
    { label: 'Last hour', value: 60 },
    { label: 'Last 3 hours', value: 180 },
    { label: 'Last 6 hours', value: 360 },
    { label: 'Last 12 hours', value: 720 },
    { label: 'Last 24 hours', value: 1440 },
    { label: 'Last 3 days', value: 4320 },
    { label: 'Last 7 days', value: 10080 }
  ]

  const handleQuickRangeChange = (minutes: number) => {
    const end = dayjs()
    const start = end.subtract(minutes, 'minute')

    const startISO = start.toISOString()
    const endISO = end.toISOString()

    setTimeRange(startISO, endISO)
    onChange?.(startISO, endISO)
  }

  const handleDateRangeChange = (dates: [dayjs.Dayjs, dayjs.Dayjs] | null) => {
    if (dates) {
      const [start, end] = dates
      const startISO = start.toISOString()
      const endISO = end.toISOString()

      setTimeRange(startISO, endISO)
      onChange?.(startISO, endISO)
    }
  }

  const getCurrentRange = (): [dayjs.Dayjs, dayjs.Dayjs] => {
    return [dayjs(timeRange.start), dayjs(timeRange.end)]
  }

  return (
    <Space.Compact>
      <Select
        value={undefined}
        placeholder="Quick ranges"
        style={{ width: 140 }}
        suffixIcon={<ClockCircleOutlined />}
        onSelect={(minutes: number | undefined) => minutes && handleQuickRangeChange(minutes)}
        options={quickRanges.map((range) => ({
          label: range.label,
          value: range.value
        }))}
      />
      <RangePicker
        value={getCurrentRange()}
        onChange={(dates: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => {
          if (dates && dates[0] && dates[1]) {
            handleDateRangeChange([dates[0], dates[1]])
          }
        }}
        showTime={{
          format: 'HH:mm:ss',
          defaultValue: [dayjs().startOf('hour'), dayjs().endOf('hour')]
        }}
        format="MM/DD HH:mm:ss"
        style={{ width: 300 }}
        allowClear={false}
        presets={[
          {
            label: 'Last Hour',
            value: [dayjs().subtract(1, 'hour'), dayjs()]
          },
          {
            label: 'Last 6 Hours',
            value: [dayjs().subtract(6, 'hour'), dayjs()]
          },
          {
            label: 'Last 24 Hours',
            value: [dayjs().subtract(1, 'day'), dayjs()]
          },
          {
            label: 'Last 7 Days',
            value: [dayjs().subtract(7, 'day'), dayjs()]
          }
        ]}
      />
    </Space.Compact>
  )
}
