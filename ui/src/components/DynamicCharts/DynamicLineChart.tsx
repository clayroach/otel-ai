import React from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'

interface DynamicLineChartProps {
  config: EChartsOption
  height?: string
  loading?: boolean
  error?: string
}

export const DynamicLineChart: React.FC<DynamicLineChartProps> = ({
  config,
  height = '400px',
  loading = false,
  error
}) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded p-4">
        <p className="text-red-600">Error: {error}</p>
      </div>
    )
  }

  if (!config) {
    return null
  }

  return (
    <ReactECharts
      option={config}
      style={{ height, width: '100%' }}
      notMerge={true}
      lazyUpdate={true}
      theme="light"
      opts={{
        renderer: 'svg'
      }}
    />
  )
}
