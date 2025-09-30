import React from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { extractEChartsConfig, validateChartConfig } from './chartValidation'

interface DynamicHeatmapProps {
  config: EChartsOption
  height?: string
  loading?: boolean
  error?: string
}

export const DynamicHeatmap: React.FC<DynamicHeatmapProps> = ({
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

  // Extract the actual ECharts config (may be wrapped in metadata)
  const extractedConfig = extractEChartsConfig(config) as EChartsOption

  // Validate chart configuration
  const validationError = validateChartConfig(extractedConfig)
  if (validationError) {
    return validationError
  }

  if (!extractedConfig) {
    return null
  }

  return <ReactECharts option={extractedConfig} style={{ height, width: '100%' }} />
}
