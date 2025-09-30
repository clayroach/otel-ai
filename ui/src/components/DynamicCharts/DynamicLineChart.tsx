import React from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { extractEChartsConfig, validateChartConfig } from './chartValidation'

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

  try {
    return (
      <ReactECharts
        option={extractedConfig}
        style={{ height, width: '100%' }}
        notMerge={true}
        lazyUpdate={true}
        theme="light"
        opts={{
          renderer: 'svg'
        }}
      />
    )
  } catch (err) {
    console.error('ECharts rendering error:', err, 'Config:', extractedConfig)
    return (
      <div className="bg-red-50 border border-red-200 rounded p-4">
        <p className="text-red-600">Chart rendering failed</p>
        <p className="text-sm text-red-500 mt-2">
          {err instanceof Error ? err.message : String(err)}
        </p>
        <details className="mt-2">
          <summary className="text-xs text-red-600 cursor-pointer">Show config</summary>
          <pre className="text-xs mt-2 overflow-auto max-h-40">
            {JSON.stringify(extractedConfig, null, 2)}
          </pre>
        </details>
      </div>
    )
  }
}
