import { Schema } from '@effect/schema'
import { Effect, Context, Layer } from 'effect'
import type { EChartsOption } from 'echarts'
import type { ChartAnalysisInput } from './types.js'

// Type guard for ECharts formatter parameters
function isValidFormatterParams(params: unknown): params is { data: unknown[] } {
  return (
    typeof params === 'object' &&
    params !== null &&
    'data' in params &&
    Array.isArray((params as Record<string, unknown>).data)
  )
}

/**
 * Chart Configuration Generator Service - Phase 3B
 *
 * Generates ECharts configurations based on data patterns detected by ResultAnalysisService.
 * This service bridges the gap between data analysis and visual representation.
 */

// ========================
// Schema Definitions
// ========================

const _ChartConfigSchema = Schema.Struct({
  type: Schema.Literal('line', 'bar', 'heatmap', 'pie', 'scatter', 'table'),
  title: Schema.String,
  description: Schema.optional(Schema.String),
  config: Schema.Unknown, // EChartsOption
  dataRequirements: Schema.Struct({
    minRows: Schema.Number,
    requiredColumns: Schema.Array(Schema.String),
    optionalColumns: Schema.Array(Schema.String)
  })
})
type ChartConfig = Schema.Schema.Type<typeof _ChartConfigSchema>

// ========================
// Service Definition
// ========================

export interface ChartConfigGeneratorService {
  generateConfig: (
    analysis: ChartAnalysisInput,
    data: unknown[]
  ) => Effect.Effect<ChartConfig, Error, never>
}

export const ChartConfigGeneratorServiceTag = Context.GenericTag<ChartConfigGeneratorService>(
  'ChartConfigGeneratorService'
)

// ========================
// Service Implementation
// ========================

export const ChartConfigGeneratorServiceLive = Layer.succeed(
  ChartConfigGeneratorServiceTag,
  ChartConfigGeneratorServiceTag.of({
    generateConfig: (analysis: ChartAnalysisInput, data: unknown[]) =>
      Effect.gen(function* () {
        const chartType = analysis.recommendedChartType

        switch (chartType) {
          case 'line-chart':
            return yield* generateLineChartConfig(analysis, data)
          case 'bar-chart':
            return yield* generateBarChartConfig(analysis, data)
          case 'heatmap':
            return yield* generateHeatmapConfig(analysis, data)
          case 'pie-chart':
            return yield* generatePieChartConfig(analysis, data)
          case 'scatter-plot':
            return yield* generateScatterConfig(analysis, data)
          default:
            return yield* generateTableConfig(analysis, data)
        }
      })
  })
)

// ========================
// Helper Functions (No longer static methods)
// ========================

/**
 * Generate line chart configuration for time-series data
 */
function generateLineChartConfig(
  analysis: ChartAnalysisInput,
  data: unknown[]
): Effect.Effect<ChartConfig, Error, never> {
  const timeColumn = analysis.columns.find((c) => c.isTemporal)
  const metricColumns = analysis.columns.filter((c) => c.isMetric)

  if (!timeColumn || metricColumns.length === 0) {
    return generateTableConfig(analysis, data)
  }

  const chartOption: EChartsOption = {
    title: {
      text: 'Time Series Analysis',
      left: 'center'
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross'
      }
    },
    legend: {
      data: metricColumns.map((c) => c.name),
      bottom: 0
    },
    xAxis: {
      type: 'time',
      name: timeColumn.name
    },
    yAxis: {
      type: 'value',
      name: 'Value',
      axisLabel: {
        formatter: (value: number) => {
          // Format based on semantic type
          const firstMetric = metricColumns[0]
          if (firstMetric?.semanticType === 'latency_ms') {
            return `${value}ms`
          } else if (firstMetric?.semanticType === 'error_rate') {
            return `${value}%`
          }
          return value.toString()
        }
      }
    },
    series: metricColumns.map((col) => ({
      name: col.name,
      type: 'line' as const,
      smooth: true,
      emphasis: {
        focus: 'series'
      },
      data: data.map((row) => {
        const rowRecord = row as Record<string, unknown>
        return [rowRecord[timeColumn.name] as string | number, rowRecord[col.name] as number]
      })
    }))
  }

  return Effect.succeed({
    type: 'line' as const,
    title: 'Time Series Visualization',
    description: `Showing ${metricColumns.length} metrics over time`,
    config: chartOption,
    dataRequirements: {
      minRows: 2,
      requiredColumns: [timeColumn.name, ...metricColumns.map((c) => c.name)],
      optionalColumns: []
    }
  })
}

/**
 * Generate bar chart configuration for categorical data
 */
function generateBarChartConfig(
  analysis: ChartAnalysisInput,
  data: unknown[]
): Effect.Effect<ChartConfig, Error, never> {
  const categoryColumn = analysis.columns.find((c) => c.type === 'string' && !c.isTemporal)
  const metricColumns = analysis.columns.filter((c) => c.isMetric)

  if (!categoryColumn || metricColumns.length === 0) {
    return generateTableConfig(analysis, data)
  }

  const chartOption: EChartsOption = {
    title: {
      text: 'Category Comparison',
      left: 'center'
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      }
    },
    legend: {
      data: metricColumns.map((c) => c.name),
      bottom: 0
    },
    xAxis: {
      type: 'category',
      name: categoryColumn.name,
      data: data.map((row) => {
        const rowRecord = row as Record<string, unknown>
        return String(rowRecord[categoryColumn.name])
      }),
      axisLabel: {
        rotate: 45,
        interval: 0
      }
    },
    yAxis: {
      type: 'value',
      name: 'Value'
    },
    series: metricColumns.map((col) => ({
      name: col.name,
      type: 'bar' as const,
      emphasis: {
        focus: 'series'
      },
      data: data.map((row) => {
        const rowRecord = row as Record<string, unknown>
        return Number(rowRecord[col.name]) || 0
      })
    }))
  }

  return Effect.succeed({
    type: 'bar' as const,
    title: 'Category Analysis',
    description: `Comparing ${metricColumns.length} metrics across ${categoryColumn.name}`,
    config: chartOption,
    dataRequirements: {
      minRows: 1,
      requiredColumns: [categoryColumn.name, ...metricColumns.map((c) => c.name)],
      optionalColumns: []
    }
  })
}

/**
 * Generate heatmap configuration for correlation data
 */
function generateHeatmapConfig(
  analysis: ChartAnalysisInput,
  data: unknown[]
): Effect.Effect<ChartConfig, Error, never> {
  const metricColumns = analysis.columns.filter((c) => c.isMetric)

  if (metricColumns.length < 2) {
    return generateTableConfig(analysis, data)
  }

  // Create correlation matrix data
  const heatmapData: number[][] = []
  for (let i = 0; i < metricColumns.length; i++) {
    for (let j = 0; j < metricColumns.length; j++) {
      // Simple correlation calculation (placeholder)
      const correlation = i === j ? 1 : Math.random()
      heatmapData.push([i, j, correlation])
    }
  }

  const chartOption: EChartsOption = {
    title: {
      text: 'Metric Correlation Heatmap',
      left: 'center'
    },
    tooltip: {
      position: 'top',
      formatter: (params: unknown) => {
        if (isValidFormatterParams(params)) {
          const data = params.data
          const [x, y, value] = data
          const xIndex = typeof x === 'number' ? x : 0
          const yIndex = typeof y === 'number' ? y : 0
          const val = typeof value === 'number' ? value : 0
          return `${metricColumns[xIndex]?.name || 'Unknown'} vs ${metricColumns[yIndex]?.name || 'Unknown'}: ${val.toFixed(2)}`
        }
        return 'Unknown'
      }
    },
    grid: {
      height: '50%',
      top: '10%'
    },
    xAxis: {
      type: 'category',
      data: metricColumns.map((c) => c.name),
      splitArea: {
        show: true
      }
    },
    yAxis: {
      type: 'category',
      data: metricColumns.map((c) => c.name),
      splitArea: {
        show: true
      }
    },
    visualMap: {
      min: -1,
      max: 1,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: '15%',
      inRange: {
        color: [
          '#313695',
          '#4575b4',
          '#74add1',
          '#abd9e9',
          '#e0f3f8',
          '#ffffbf',
          '#fee090',
          '#fdae61',
          '#f46d43',
          '#d73027',
          '#a50026'
        ]
      }
    },
    series: [
      {
        name: 'Correlation',
        type: 'heatmap',
        data: heatmapData,
        label: {
          show: true,
          formatter: (params: unknown) => {
            if (isValidFormatterParams(params)) {
              const data = params.data
              const value = data[2]
              return typeof value === 'number' ? value.toFixed(2) : '0.00'
            }
            return '0.00'
          }
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        }
      }
    ]
  }

  return Effect.succeed({
    type: 'heatmap' as const,
    title: 'Correlation Analysis',
    description: `Showing correlations between ${metricColumns.length} metrics`,
    config: chartOption,
    dataRequirements: {
      minRows: 1,
      requiredColumns: metricColumns.map((c) => c.name),
      optionalColumns: []
    }
  })
}

/**
 * Generate pie chart configuration for proportion data
 */
function generatePieChartConfig(
  analysis: ChartAnalysisInput,
  data: unknown[]
): Effect.Effect<ChartConfig, Error, never> {
  const categoryColumn = analysis.columns.find((c) => c.type === 'string' && !c.isTemporal)
  const metricColumn = analysis.columns.find((c) => c.isMetric)

  if (!categoryColumn || !metricColumn) {
    return generateTableConfig(analysis, data)
  }

  const pieData = data.map((row) => {
    const rowRecord = row as Record<string, unknown>
    return {
      name: String(rowRecord[categoryColumn.name] || 'Unknown'),
      value: Number(rowRecord[metricColumn.name]) || 0
    }
  })

  const chartOption: EChartsOption = {
    title: {
      text: 'Distribution Analysis',
      left: 'center'
    },
    tooltip: {
      trigger: 'item',
      formatter: '{a} <br/>{b}: {c} ({d}%)'
    },
    legend: {
      orient: 'vertical',
      left: 'left'
    },
    series: [
      {
        name: metricColumn.name,
        type: 'pie',
        radius: '50%',
        data: pieData,
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        }
      }
    ]
  }

  return Effect.succeed({
    type: 'pie' as const,
    title: 'Distribution Visualization',
    description: `Showing distribution of ${metricColumn.name} by ${categoryColumn.name}`,
    config: chartOption,
    dataRequirements: {
      minRows: 1,
      requiredColumns: [categoryColumn.name, metricColumn.name],
      optionalColumns: []
    }
  })
}

/**
 * Generate scatter plot configuration for correlation analysis
 */
function generateScatterConfig(
  analysis: ChartAnalysisInput,
  data: unknown[]
): Effect.Effect<ChartConfig, Error, never> {
  const metricColumns = analysis.columns.filter((c) => c.isMetric)

  if (metricColumns.length < 2) {
    return generateTableConfig(analysis, data)
  }

  const xMetric = metricColumns[0]
  const yMetric = metricColumns[1]

  const scatterData = data.map((row) => {
    const rowRecord = row as Record<string, unknown>
    return [
      Number(rowRecord[xMetric?.name || 'unknown']) || 0,
      Number(rowRecord[yMetric?.name || 'unknown']) || 0
    ]
  })

  const chartOption: EChartsOption = {
    title: {
      text: 'Correlation Analysis',
      left: 'center'
    },
    tooltip: {
      trigger: 'item',
      formatter: (params: unknown) => {
        if (isValidFormatterParams(params)) {
          const data = params.data
          return `${xMetric?.name || 'X'}: ${data[0]}<br/>${yMetric?.name || 'Y'}: ${data[1]}`
        }
        return 'No data'
      }
    },
    xAxis: {
      type: 'value',
      name: xMetric?.name || 'X Metric',
      nameLocation: 'middle',
      nameGap: 30
    },
    yAxis: {
      type: 'value',
      name: yMetric?.name || 'Y Metric',
      nameLocation: 'middle',
      nameGap: 30
    },
    series: [
      {
        type: 'scatter',
        symbolSize: 8,
        data: scatterData,
        emphasis: {
          focus: 'series',
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        }
      }
    ]
  }

  return Effect.succeed({
    type: 'scatter' as const,
    title: 'Scatter Plot Analysis',
    description: `Analyzing correlation between ${xMetric?.name || 'X'} and ${yMetric?.name || 'Y'}`,
    config: chartOption,
    dataRequirements: {
      minRows: 2,
      requiredColumns: [xMetric?.name || 'x', yMetric?.name || 'y'],
      optionalColumns: metricColumns.slice(2).map((c) => c.name)
    }
  })
}

/**
 * Generate table configuration as fallback
 */
function generateTableConfig(
  analysis: ChartAnalysisInput,
  _data: unknown[]
): Effect.Effect<ChartConfig, Error, never> {
  return Effect.succeed({
    type: 'table' as const,
    title: 'Data Table',
    description: 'Tabular view of query results',
    config: {
      // Table doesn't use ECharts, this is a placeholder
      columns: analysis.columns.map((c) => ({
        field: c.name,
        title: c.name,
        type: c.type,
        format: c.semanticType
      }))
    },
    dataRequirements: {
      minRows: 0,
      requiredColumns: [],
      optionalColumns: analysis.columns.map((c) => c.name)
    }
  })
}
