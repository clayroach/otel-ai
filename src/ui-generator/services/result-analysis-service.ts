import { Schema } from '@effect/schema'
import { Effect } from 'effect'

/**
 * Result Analysis Service - Phase 3A
 * 
 * Analyzes query results to detect column types, data patterns, and optimal visualizations.
 * This is the foundation service for dynamic UI component generation.
 */

// ========================
// Schema Definitions
// ========================

const ColumnTypeSchema = Schema.Literal('string', 'number', 'datetime', 'boolean', 'json')
type ColumnType = Schema.Schema.Type<typeof ColumnTypeSchema>

const DataPatternSchema = Schema.Literal(
  'time-series',
  'categorical', 
  'metrics',
  'hierarchical',
  'correlation',
  'distribution'
)
type DataPattern = Schema.Schema.Type<typeof DataPatternSchema>

const ChartTypeSchema = Schema.Literal(
  'table',
  'line-chart',
  'bar-chart', 
  'heatmap',
  'pie-chart',
  'scatter-plot'
)
type ChartType = Schema.Schema.Type<typeof ChartTypeSchema>

const ColumnAnalysisSchema = Schema.Struct({
  name: Schema.String,
  type: ColumnTypeSchema,
  isMetric: Schema.Boolean,
  isTemporal: Schema.Boolean,
  cardinality: Schema.Number, // Unique value count
  sampleValues: Schema.Array(Schema.Unknown),
  semanticType: Schema.optional(Schema.String) // e.g., "latency_ms", "error_rate", "service_name"
})
type ColumnAnalysis = Schema.Schema.Type<typeof ColumnAnalysisSchema>

const ResultAnalysisSchema = Schema.Struct({
  rowCount: Schema.Number,
  columnCount: Schema.Number,
  columns: Schema.Array(ColumnAnalysisSchema),
  detectedPatterns: Schema.Array(DataPatternSchema),
  recommendedChartType: ChartTypeSchema,
  confidence: Schema.Number, // 0-1 confidence in recommendation
  reasoning: Schema.String
})
type ResultAnalysis = Schema.Schema.Type<typeof ResultAnalysisSchema>

// ========================
// Service Implementation
// ========================

export class ResultAnalysisService {
  /**
   * Analyze query results to determine optimal visualization
   */
  static analyzeResults(results: unknown[]): Effect.Effect<ResultAnalysis, Error, never> {
    return Effect.gen(function* () {
      if (!Array.isArray(results) || results.length === 0) {
        return {
          rowCount: 0,
          columnCount: 0,
          columns: [],
          detectedPatterns: [],
          recommendedChartType: 'table' as const,
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
        const columnAnalysis = yield* ResultAnalysisService.analyzeColumn(
          columnName, 
          results.map(row => (row as Record<string, unknown>)[columnName])
        )
        columns.push(columnAnalysis)
      }

      // Detect patterns
      const patterns = yield* ResultAnalysisService.detectPatterns(columns, results)
      
      // Recommend chart type
      const { chartType, confidence, reasoning } = yield* ResultAnalysisService.recommendChart(
        columns, 
        patterns
      )

      return {
        rowCount: results.length,
        columnCount: columnNames.length,
        columns,
        detectedPatterns: patterns,
        recommendedChartType: chartType,
        confidence,
        reasoning
      }
    })
  }

  /**
   * Analyze a single column to determine its characteristics
   */
  private static analyzeColumn(
    name: string, 
    values: unknown[]
  ): Effect.Effect<ColumnAnalysis, Error, never> {
    const nonNullValues = values.filter(v => v != null)
    
    // Determine column type
    const type = ResultAnalysisService.inferColumnType(nonNullValues)
    
    // Calculate cardinality (unique values)
    const uniqueValues = new Set(nonNullValues)
    const cardinality = uniqueValues.size
    
    // Get sample values (first 5 unique values)
    const sampleValues = Array.from(uniqueValues).slice(0, 5)
    
    // Detect semantic meaning
    const semanticType = ResultAnalysisService.detectSemanticType(name, type, sampleValues)
    
    return Effect.succeed({
      name,
      type,
      isMetric: ResultAnalysisService.isMetricColumn(name, type),
      isTemporal: ResultAnalysisService.isTemporalColumn(name, type),
      cardinality,
      sampleValues,
      semanticType
    })
  }

  /**
   * Infer column data type from values
   */
  private static inferColumnType(values: unknown[]): ColumnType {
    if (values.length === 0) return 'string'
    
    const firstValue = values[0]
    
    // Check for datetime patterns
    if (typeof firstValue === 'string') {
      // Check if it looks like a timestamp
      if (/^\d{4}-\d{2}-\d{2}/.test(firstValue) || 
          /^\d{10,13}$/.test(firstValue) ||
          firstValue.includes('T') && firstValue.includes(':')) {
        return 'datetime'
      }
    }
    
    // Check for numbers
    if (typeof firstValue === 'number' || 
        (typeof firstValue === 'string' && !isNaN(Number(firstValue)))) {
      return 'number'
    }
    
    // Check for booleans
    if (typeof firstValue === 'boolean' || 
        (typeof firstValue === 'string' && ['true', 'false'].includes(firstValue.toLowerCase()))) {
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
  private static isMetricColumn(name: string, type: ColumnType): boolean {
    if (type !== 'number') return false
    
    const metricKeywords = [
      'count', 'rate', 'duration', 'latency', 'time', 'ms', 'seconds',
      'p50', 'p95', 'p99', 'avg', 'max', 'min', 'sum', 'percent'
    ]
    
    return metricKeywords.some(keyword => 
      name.toLowerCase().includes(keyword)
    )
  }

  /**
   * Detect if column represents temporal data
   */
  private static isTemporalColumn(name: string, type: ColumnType): boolean {
    if (type !== 'datetime') return false
    
    const timeKeywords = ['time', 'timestamp', 'date', 'minute', 'hour', 'day']
    return timeKeywords.some(keyword => 
      name.toLowerCase().includes(keyword)
    )
  }

  /**
   * Detect semantic meaning of column
   */
  private static detectSemanticType(
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
    if ((lowerName.includes('latency') || lowerName.includes('duration') || lowerName.includes('_ms')) && type === 'number') {
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
  private static detectPatterns(
    columns: ColumnAnalysis[], 
    results: unknown[]
  ): Effect.Effect<DataPattern[], Error, never> {
    const patterns: DataPattern[] = []
    
    // Time-series: has temporal column + metrics
    const hasTimeColumn = columns.some(c => c.isTemporal)
    const hasMetrics = columns.some(c => c.isMetric)
    if (hasTimeColumn && hasMetrics) {
      patterns.push('time-series')
    }
    
    // Categorical: string columns with low cardinality + metrics
    const categoricalColumns = columns.filter(c => 
      c.type === 'string' && 
      c.cardinality > 1 && 
      c.cardinality < results.length * 0.5 // Less than 50% unique
    )
    if (categoricalColumns.length > 0 && hasMetrics) {
      patterns.push('categorical')
    }
    
    // Metrics: multiple numeric columns
    const metricColumns = columns.filter(c => c.isMetric)
    if (metricColumns.length >= 2) {
      patterns.push('metrics')
    }
    
    return Effect.succeed(patterns)
  }

  /**
   * Recommend optimal chart type based on analysis
   */
  private static recommendChart(
    columns: ColumnAnalysis[], 
    patterns: DataPattern[]
  ): Effect.Effect<{chartType: ChartType, confidence: number, reasoning: string}, Error, never> {
    // High confidence recommendations
    if (patterns.includes('time-series')) {
      return Effect.succeed({
        chartType: 'line-chart' as const,
        confidence: 0.9,
        reasoning: 'Time-series data detected - line chart optimal for temporal trends'
      })
    }
    
    if (patterns.includes('categorical')) {
      return Effect.succeed({
        chartType: 'bar-chart' as const,
        confidence: 0.8,
        reasoning: 'Categorical data with metrics - bar chart optimal for comparisons'
      })
    }
    
    // Medium confidence
    const hasMultipleMetrics = columns.filter(c => c.isMetric).length >= 3
    if (hasMultipleMetrics) {
      return Effect.succeed({
        chartType: 'heatmap' as const,
        confidence: 0.6,
        reasoning: 'Multiple metrics detected - heatmap shows correlations effectively'
      })
    }
    
    // Default to table for safety
    return Effect.succeed({
      chartType: 'table' as const,
      confidence: 0.5,
      reasoning: 'No clear pattern detected - table provides safe default visualization'
    })
  }
}