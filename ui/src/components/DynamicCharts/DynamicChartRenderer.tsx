import React from 'react'
import type { EChartsOption } from 'echarts'
import { DynamicLineChart } from './DynamicLineChart'
import { DynamicBarChart } from './DynamicBarChart'
import { DynamicDataTable } from './DynamicDataTable'
import { DynamicHeatmap } from './DynamicHeatmap'
import { DynamicPieChart } from './DynamicPieChart'
import { DynamicScatterPlot } from './DynamicScatterPlot'

interface ChartProps {
  config?: unknown
  data?: unknown[]
  height?: string
  maxRows?: number
}

interface DynamicChartRendererProps {
  component: {
    component: string
    props: ChartProps
  }
  loading?: boolean
  error?: string
}

export const DynamicChartRenderer: React.FC<DynamicChartRendererProps> = ({
  component,
  loading,
  error
}) => {
  const renderComponent = () => {
    const { config, data, height = '400px', maxRows } = component.props

    // Debug logging to understand what's being passed
    console.log('DynamicChartRenderer rendering:', {
      componentType: component.component,
      hasConfig: !!config,
      hasData: !!data,
      height,
      propsKeys: Object.keys(component.props)
    })

    switch (component.component) {
      case 'DynamicLineChart':
        return (
          <DynamicLineChart
            config={config as EChartsOption}
            height={height}
            loading={loading}
            error={error}
          />
        )
      case 'DynamicBarChart':
        return (
          <DynamicBarChart
            config={config as EChartsOption}
            height={height}
            loading={loading}
            error={error}
          />
        )
      case 'DynamicHeatmap':
        return (
          <DynamicHeatmap
            config={config as EChartsOption}
            height={height}
            loading={loading}
            error={error}
          />
        )
      case 'DynamicPieChart':
        return (
          <DynamicPieChart
            config={config as EChartsOption}
            height={height}
            loading={loading}
            error={error}
          />
        )
      case 'DynamicScatterPlot':
        return (
          <DynamicScatterPlot
            config={config as EChartsOption}
            height={height}
            loading={loading}
            error={error}
          />
        )
      case 'DynamicDataTable':
        return (
          <DynamicDataTable data={data || []} maxRows={maxRows} loading={loading} error={error} />
        )
      default:
        console.warn('Unknown component type:', component.component)
        return (
          <div className="p-4 bg-gray-100 rounded">
            <p>Unknown component type: {component.component}</p>
            <pre className="mt-2 text-xs text-gray-600">{JSON.stringify(component, null, 2)}</pre>
          </div>
        )
    }
  }

  return <div className="w-full">{renderComponent()}</div>
}
