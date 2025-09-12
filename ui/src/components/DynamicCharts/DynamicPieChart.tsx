import React from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'

interface DynamicPieChartProps {
  config: EChartsOption
  height?: string
  loading?: boolean
  error?: string
}

export const DynamicPieChart: React.FC<DynamicPieChartProps> = ({
  config,
  height = '400px',
  loading = false,
  error
}) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
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

  return <ReactECharts option={config} style={{ height, width: '100%' }} />
}
