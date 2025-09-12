/**
 * Shared types for UI Generator services
 */

export interface ColumnAnalysis {
  name: string
  type: 'string' | 'number' | 'datetime' | 'boolean' | 'json'
  isMetric: boolean
  isTemporal: boolean
  cardinality: number
  sampleValues: unknown[]
  semanticType?: string
}

export interface ResultAnalysis {
  rowCount: number
  columnCount: number
  columns: ColumnAnalysis[]
  detectedPatterns: Array<
    'time-series' | 'categorical' | 'metrics' | 'hierarchical' | 'correlation' | 'distribution'
  >
  recommendedChartType:
    | 'table'
    | 'line-chart'
    | 'bar-chart'
    | 'heatmap'
    | 'pie-chart'
    | 'scatter-plot'
  confidence: number
  reasoning: string
}

export interface ChartAnalysisInput {
  recommendedChartType:
    | 'table'
    | 'line-chart'
    | 'bar-chart'
    | 'heatmap'
    | 'pie-chart'
    | 'scatter-plot'
  columns: ColumnAnalysis[]
  rowCount: number
  columnCount: number
  detectedPatterns: Array<
    'time-series' | 'categorical' | 'metrics' | 'hierarchical' | 'correlation' | 'distribution'
  >
  confidence: number
  reasoning: string
}
