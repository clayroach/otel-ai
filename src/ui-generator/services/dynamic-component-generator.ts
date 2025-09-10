import { Schema } from '@effect/schema'
import { Effect, Context, Layer } from 'effect'
import { ResultAnalysisService } from './result-analysis-service'
import { ChartConfigGenerator } from './chart-config-generator'
import type { ColumnAnalysis } from './types'

/**
 * Dynamic Component Generator Service - Phase 3C
 *
 * Orchestrates the complete pipeline from query results to React components.
 * This is the main integration point that combines analysis and configuration.
 */

// ========================
// Schema Definitions
// ========================

const DynamicComponentSchema = Schema.Struct({
  id: Schema.String,
  type: Schema.Literal('chart', 'table', 'metric-card', 'error'),
  title: Schema.String,
  description: Schema.optional(Schema.String),
  component: Schema.String, // Component name to render
  props: Schema.Unknown, // Props to pass to component
  metadata: Schema.Struct({
    generatedAt: Schema.Number,
    dataSource: Schema.String,
    rowCount: Schema.Number,
    confidence: Schema.Number
  })
})
type DynamicComponent = Schema.Schema.Type<typeof DynamicComponentSchema>

const GenerationRequestSchema = Schema.Struct({
  queryResults: Schema.Array(Schema.Unknown),
  userIntent: Schema.optional(Schema.String),
  preferredChartType: Schema.optional(Schema.String)
})
type GenerationRequest = Schema.Schema.Type<typeof GenerationRequestSchema>

// ========================
// Service Definition
// ========================

export interface DynamicComponentGeneratorService {
  generateComponent: (request: GenerationRequest) => Effect.Effect<DynamicComponent, Error, never>
}

export const DynamicComponentGeneratorServiceTag =
  Context.GenericTag<DynamicComponentGeneratorService>('DynamicComponentGeneratorService')

// ========================
// Service Implementation
// ========================

export const DynamicComponentGeneratorServiceLive = Layer.succeed(
  DynamicComponentGeneratorServiceTag,
  DynamicComponentGeneratorServiceTag.of({
    generateComponent: (request: GenerationRequest) =>
      Effect.gen(function* () {
        // Step 1: Analyze the query results
        const analysis = yield* ResultAnalysisService.analyzeResults([...request.queryResults])

        // Step 2: Generate chart configuration
        const chartConfig = yield* ChartConfigGenerator.generateConfig(
          {
            ...analysis,
            columns: analysis.columns.map((col) => ({
              name: col.name,
              type: col.type,
              isMetric: col.isMetric,
              isTemporal: col.isTemporal,
              cardinality: col.cardinality,
              sampleValues: [...col.sampleValues],
              ...(col.semanticType !== undefined && { semanticType: col.semanticType })
            })) as ColumnAnalysis[],
            detectedPatterns: [...analysis.detectedPatterns]
          },
          [...request.queryResults]
        )

        // Step 3: Map to React component
        const componentMapping = getComponentMapping(chartConfig.type)

        // Step 4: Create component specification
        const component: DynamicComponent = {
          id: `dynamic-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: chartConfig.type === 'table' ? 'table' : 'chart',
          title: chartConfig.title,
          description: chartConfig.description,
          component: componentMapping.component,
          props: {
            data: request.queryResults,
            config: chartConfig.config,
            analysis: {
              patterns: analysis.detectedPatterns,
              columns: analysis.columns,
              confidence: analysis.confidence
            }
          },
          metadata: {
            generatedAt: Date.now(),
            dataSource: request.userIntent || 'dynamic-query',
            rowCount: analysis.rowCount,
            confidence: analysis.confidence
          }
        }

        return component
      })
  })
)

// ========================
// Helper Functions
// ========================

interface ComponentMapping {
  component: string
  requiresECharts: boolean
}

function getComponentMapping(chartType: string): ComponentMapping {
  const mappings: Record<string, ComponentMapping> = {
    line: {
      component: 'DynamicLineChart',
      requiresECharts: true
    },
    bar: {
      component: 'DynamicBarChart',
      requiresECharts: true
    },
    heatmap: {
      component: 'DynamicHeatmap',
      requiresECharts: true
    },
    pie: {
      component: 'DynamicPieChart',
      requiresECharts: true
    },
    scatter: {
      component: 'DynamicScatterPlot',
      requiresECharts: true
    },
    table: {
      component: 'DynamicDataTable',
      requiresECharts: false
    }
  }

  const defaultMapping = mappings['table']
  if (!defaultMapping) {
    throw new Error('Default table mapping not found')
  }
  return mappings[chartType] || defaultMapping
}

// ========================
// Integrated Pipeline
// ========================

export class DynamicUIGenerator {
  /**
   * Complete pipeline from query results to component specification
   */
  static async generateFromQueryResults(
    queryResults: unknown[],
    options?: {
      userIntent?: string
      preferredChartType?: string
    }
  ): Promise<DynamicComponent> {
    const program = Effect.gen(function* () {
      const service = yield* DynamicComponentGeneratorServiceTag

      return yield* service.generateComponent({
        queryResults,
        userIntent: options?.userIntent,
        preferredChartType: options?.preferredChartType
      })
    })

    return Effect.runPromise(Effect.provide(program, DynamicComponentGeneratorServiceLive))
  }

  /**
   * Generate multiple components for a dashboard
   */
  static async generateDashboard(
    queries: Array<{
      name: string
      results: unknown[]
      intent?: string
    }>
  ): Promise<DynamicComponent[]> {
    const components = await Promise.all(
      queries.map((query) =>
        DynamicUIGenerator.generateFromQueryResults(query.results, {
          userIntent: query.intent || query.name
        })
      )
    )

    return components
  }

  /**
   * Validate component generation requirements
   */
  static validateQueryResults(results: unknown[]): boolean {
    if (!Array.isArray(results) || results.length === 0) {
      return false
    }

    const firstRow = results[0]
    if (typeof firstRow !== 'object' || firstRow === null) {
      return false
    }

    // Must have at least one column
    const columns = Object.keys(firstRow)
    return columns.length > 0
  }
}

// ========================
// Export Types
// ========================

export type { DynamicComponent, GenerationRequest }
export { DynamicComponentSchema, GenerationRequestSchema }
