/**
 * Frontend Result Analysis Service
 *
 * Client-side implementation for analyzing query results and generating component configurations.
 * This mirrors the backend service but runs in the browser for immediate analysis.
 */

export type ColumnType = 'string' | 'number' | 'datetime' | 'boolean' | 'json'
export type DataPattern =
  | 'time-series'
  | 'categorical'
  | 'metrics'
  | 'hierarchical'
  | 'correlation'
  | 'distribution'
export type ChartType =
  | 'table'
  | 'line-chart'
  | 'bar-chart'
  | 'heatmap'
  | 'pie-chart'
  | 'scatter-plot'

export interface ColumnAnalysis {
  name: string
  type: ColumnType
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
  detectedPatterns: DataPattern[]
  recommendedChartType: ChartType
  confidence: number
  reasoning: string
}

/**
 * Analyze query results to determine optimal visualization
 */
export function analyzeResults(results: unknown[]): ResultAnalysis {
  if (!Array.isArray(results) || results.length === 0) {
    return {
      rowCount: 0,
      columnCount: 0,
      columns: [],
      detectedPatterns: [],
      recommendedChartType: 'table',
      confidence: 1.0,
      reasoning: 'No data available - defaulting to table view'
    }
  }

  // Analyze columns from first row
  const firstRow = results[0] as Record<string, unknown>
  const columnNames = Object.keys(firstRow)
  const columns: ColumnAnalysis[] = []

  // Analyze each column
  for (const columnName of columnNames) {
    const columnAnalysis = analyzeColumn(
      columnName,
      results.map((row) => (row as Record<string, unknown>)[columnName])
    )
    columns.push(columnAnalysis)
  }

  // Detect patterns
  const patterns = detectPatterns(columns, results)

  // Recommend chart type
  const { chartType, confidence, reasoning } = recommendChart(columns, patterns)

  return {
    rowCount: results.length,
    columnCount: columnNames.length,
    columns,
    detectedPatterns: patterns,
    recommendedChartType: chartType,
    confidence,
    reasoning
  }
}

/**
 * Analyze a single column to determine its characteristics
 */
function analyzeColumn(name: string, values: unknown[]): ColumnAnalysis {
  const nonNullValues = values.filter((v) => v != null)

  // Determine column type
  const type = inferColumnType(nonNullValues)

  // Calculate cardinality (unique values)
  const uniqueValues = new Set(nonNullValues)
  const cardinality = uniqueValues.size

  // Get sample values (first 5 unique values)
  const sampleValues = Array.from(uniqueValues).slice(0, 5)

  // Detect semantic meaning
  const semanticType = detectSemanticType(name, type, sampleValues)

  return {
    name,
    type,
    isMetric: isMetricColumn(name, type),
    isTemporal: isTemporalColumn(name, type),
    cardinality,
    sampleValues,
    semanticType
  }
}

/**
 * Infer column data type from values
 */
function inferColumnType(values: unknown[]): ColumnType {
  if (values.length === 0) return 'string'

  const firstValue = values[0]

  // Check for datetime patterns
  if (typeof firstValue === 'string') {
    // Check if it looks like a timestamp
    if (
      /^\d{4}-\d{2}-\d{2}/.test(firstValue) ||
      /^\d{10,13}$/.test(firstValue) ||
      (firstValue.includes('T') && firstValue.includes(':'))
    ) {
      return 'datetime'
    }
  }

  // Check for numbers
  if (
    typeof firstValue === 'number' ||
    (typeof firstValue === 'string' && !isNaN(Number(firstValue)))
  ) {
    return 'number'
  }

  // Check for booleans
  if (
    typeof firstValue === 'boolean' ||
    (typeof firstValue === 'string' && ['true', 'false'].includes(firstValue.toLowerCase()))
  ) {
    return 'boolean'
  }

  // Check for JSON objects
  if (typeof firstValue === 'object' && firstValue !== null) {
    return 'json'
  }

  return 'string'
}

/**
 * Detect if column represents a metric
 */
function isMetricColumn(name: string, type: ColumnType): boolean {
  if (type !== 'number') return false

  const metricKeywords = [
    'count',
    'rate',
    'duration',
    'latency',
    'time',
    'ms',
    'seconds',
    'p50',
    'p95',
    'p99',
    'avg',
    'max',
    'min',
    'sum',
    'percent'
  ]

  return metricKeywords.some((keyword) => name.toLowerCase().includes(keyword))
}

/**
 * Detect if column represents temporal data
 */
function isTemporalColumn(name: string, type: ColumnType): boolean {
  if (type !== 'datetime') return false

  const timeKeywords = ['time', 'timestamp', 'date', 'minute', 'hour', 'day']
  return timeKeywords.some((keyword) => name.toLowerCase().includes(keyword))
}

/**
 * Detect semantic meaning of column
 */
function detectSemanticType(
  name: string,
  type: ColumnType,
  _sampleValues: unknown[]
): string | undefined {
  const lowerName = name.toLowerCase()

  // Service/component names
  if (lowerName.includes('service') && type === 'string') {
    return 'service_name'
  }

  // Latency metrics
  if (
    (lowerName.includes('latency') ||
      lowerName.includes('duration') ||
      lowerName.includes('_ms')) &&
    type === 'number'
  ) {
    return 'latency_ms'
  }

  // Error rates
  if (lowerName.includes('error') && lowerName.includes('rate') && type === 'number') {
    return 'error_rate'
  }

  // Request counts
  if ((lowerName.includes('count') || lowerName.includes('request')) && type === 'number') {
    return 'request_count'
  }

  return undefined
}

/**
 * Detect data patterns for visualization selection
 */
function detectPatterns(columns: ColumnAnalysis[], results: unknown[]): DataPattern[] {
  const patterns: DataPattern[] = []

  // Time-series: has temporal column + metrics
  const hasTimeColumn = columns.some((c) => c.isTemporal)
  const hasMetrics = columns.some((c) => c.isMetric)
  if (hasTimeColumn && hasMetrics) {
    patterns.push('time-series')
  }

  // Categorical: string columns with low cardinality + metrics
  const categoricalColumns = columns.filter(
    (c) => c.type === 'string' && c.cardinality > 1 && c.cardinality < results.length * 0.5 // Less than 50% unique
  )
  if (categoricalColumns.length > 0 && hasMetrics) {
    patterns.push('categorical')
  }

  // Metrics: multiple numeric columns
  const metricColumns = columns.filter((c) => c.isMetric)
  if (metricColumns.length >= 2) {
    patterns.push('metrics')
  }

  return patterns
}

/**
 * Recommend optimal chart type based on analysis
 */
function recommendChart(
  columns: ColumnAnalysis[],
  patterns: DataPattern[]
): { chartType: ChartType; confidence: number; reasoning: string } {
  // High confidence recommendations
  if (patterns.includes('time-series')) {
    return {
      chartType: 'line-chart',
      confidence: 0.9,
      reasoning: 'Time-series data detected - line chart optimal for temporal trends'
    }
  }

  if (patterns.includes('categorical')) {
    return {
      chartType: 'bar-chart',
      confidence: 0.8,
      reasoning: 'Categorical data with metrics - bar chart optimal for comparisons'
    }
  }

  // Medium confidence
  const hasMultipleMetrics = columns.filter((c) => c.isMetric).length >= 3
  if (hasMultipleMetrics) {
    return {
      chartType: 'heatmap',
      confidence: 0.6,
      reasoning: 'Multiple metrics detected - heatmap shows correlations effectively'
    }
  }

  // Default to table for safety
  return {
    chartType: 'table',
    confidence: 0.5,
    reasoning: 'No clear pattern detected - table provides safe default visualization'
  }
}
