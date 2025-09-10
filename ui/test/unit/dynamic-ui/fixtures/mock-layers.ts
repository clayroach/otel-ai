/**
 * Effect Layer mocks for testing with real checkout data
 * Using Effect-TS Layers for type-safe, composable mocking
 */

import { Effect, Layer, Context } from 'effect'
import type {
  QueryGenerationResult,
  QueryGenerationRequest,
  LLMModel
} from '../../../../src/services/query-generator'
import { checkoutFlowQuery } from './diagnostic-queries'
import checkoutResultsData from './checkout-service-results.json'

/**
 * Query Generator Service Interface
 */
export interface QueryGeneratorService {
  readonly generateQuery: (
    request: QueryGenerationRequest
  ) => Effect.Effect<QueryGenerationResult, Error, never>
  readonly getAvailableModels: () => Effect.Effect<LLMModel[], Error, never>
  readonly validateQuery: (sql: string) => { valid: boolean; errors: string[] }
}

/**
 * Mock Query Generator Service Tag
 */
export const MockQueryGeneratorService = Context.GenericTag<QueryGeneratorService>(
  'MockQueryGeneratorService'
)

/**
 * Successful Query Generation Layer - Returns real checkout query
 */
export const MockQueryGeneratorSuccessLayer = Layer.succeed(MockQueryGeneratorService, {
  generateQuery: (request: QueryGenerationRequest) =>
    Effect.succeed({
      sql: checkoutFlowQuery.sql,
      model: 'codellama',
      generationTime: 250,
      description: 'Analyzing checkout flow performance',
      criticalPath: request.path.name,
      analysisType: 'latency' as const
    }),
  getAvailableModels: () =>
    Effect.succeed([
      {
        name: 'claude-3-5-sonnet-20241022',
        provider: 'anthropic',
        description: 'Claude 3.5 Sonnet - Best for complex SQL generation',
        available: true
      },
      {
        name: 'gpt-4o',
        provider: 'openai',
        description: 'GPT-4 Optimized - Good balance of speed and quality',
        available: true
      },
      {
        name: 'codellama',
        provider: 'meta',
        description: 'CodeLlama - Specialized for code generation',
        available: true
      },
      {
        name: 'rule-based',
        provider: 'local',
        description: 'Rule-based - Fast local generation',
        available: true
      }
    ]),
  validateQuery: (_sql: string) => ({
    valid: _sql.includes('SELECT') && _sql.includes('FROM'),
    errors: []
  })
})

/**
 * Failed Query Generation Layer - Simulates API failure
 */
export const MockQueryGeneratorFailureLayer = Layer.succeed(MockQueryGeneratorService, {
  generateQuery: () => Effect.fail(new Error('Query generation API unavailable')),
  getAvailableModels: () => Effect.fail(new Error('Models API unavailable')),
  validateQuery: (_sql: string) => ({
    valid: false,
    errors: ['Service unavailable']
  })
})

/**
 * ClickHouse Service Interface
 */
export interface ClickHouseService {
  readonly executeQuery: (sql: string) => Effect.Effect<typeof checkoutResultsData, Error, never>
  readonly getTableSchema: (
    table: string
  ) => Effect.Effect<Array<{ name: string; type: string }>, Error, never>
}

/**
 * Mock ClickHouse Service Tag
 */
export const MockClickHouseService = Context.GenericTag<ClickHouseService>('MockClickHouseService')

/**
 * Mock ClickHouse Layer with Real Checkout Data
 */
export const MockClickHouseWithCheckoutDataLayer = Layer.succeed(MockClickHouseService, {
  executeQuery: () => Effect.succeed(checkoutResultsData),
  getTableSchema: () =>
    Effect.succeed([
      { name: 'service_name', type: 'LowCardinality(String)' },
      { name: 'operation_name', type: 'LowCardinality(String)' },
      { name: 'minute', type: 'DateTime' },
      { name: 'p50_ms', type: 'Float64' },
      { name: 'p95_ms', type: 'Float64' },
      { name: 'p99_ms', type: 'Float64' },
      { name: 'request_count', type: 'UInt64' }
    ])
})

/**
 * Chart configuration type
 */
export interface ChartConfig {
  chartType: string
  dataPoints: number
  services: string[]
}

/**
 * Chart component result
 */
export interface ChartResult {
  component: string
  config: ChartConfig
}

/**
 * Visualization Service Interface
 */
export interface VisualizationService {
  readonly generateChart: (
    data: typeof checkoutResultsData,
    chartType: string
  ) => Effect.Effect<ChartResult, Error, never>
  readonly selectOptimalChart: (
    data: typeof checkoutResultsData
  ) => Effect.Effect<string, Error, never>
}

/**
 * Mock Visualization Service Tag
 */
export const MockVisualizationService = Context.GenericTag<VisualizationService>(
  'MockVisualizationService'
)

/**
 * Mock Visualization Layer - Generates ECharts components
 */
export const MockVisualizationLayer = Layer.succeed(MockVisualizationService, {
  generateChart: (data: typeof checkoutResultsData, chartType: string) =>
    Effect.succeed({
      component: `
import ReactECharts from 'echarts-for-react'

export const CheckoutFlowChart = () => {
  const option = {
    title: { text: 'Checkout Flow Performance' },
    xAxis: { type: 'time' },
    yAxis: { type: 'value', name: 'Latency (ms)' },
    series: [
      { name: 'p50', type: 'line', data: [] },
      { name: 'p95', type: 'line', data: [] },
      { name: 'p99', type: 'line', data: [] }
    ]
  }
  return <ReactECharts option={option} />
}`,
      config: {
        chartType,
        dataPoints: data.data?.length || 0,
        services: Array.from(new Set(data.data?.map((d) => d.service_name) || []))
      }
    }),
  selectOptimalChart: (data: typeof checkoutResultsData) => {
    // Analyze data structure to select optimal visualization
    const hasTimeComponent = data.meta?.some((m) => m.type.includes('DateTime'))
    const hasPercentiles = data.meta?.some(
      (m) => m.name.includes('p50') || m.name.includes('p95') || m.name.includes('p99')
    )

    if (hasTimeComponent && hasPercentiles) {
      return Effect.succeed('line-percentiles')
    } else if (hasTimeComponent) {
      return Effect.succeed('line-time-series')
    } else {
      return Effect.succeed('bar-comparison')
    }
  }
})

/**
 * Composite Layer for Full Pipeline Testing
 */
export const MockFullPipelineLayer = Layer.mergeAll(
  MockQueryGeneratorSuccessLayer,
  MockClickHouseWithCheckoutDataLayer,
  MockVisualizationLayer
)

/**
 * Test helper to extract checkout data by service
 */
export function getCheckoutDataByService(serviceName: string) {
  return checkoutResultsData.data.filter((row) => row.service_name === serviceName)
}

/**
 * Test helper to extract checkout data by operation
 */
export function getCheckoutDataByOperation(operationName: string) {
  return checkoutResultsData.data.filter((row) => row.operation_name === operationName)
}

/**
 * Test helper to get time range from checkout data
 */
export function getCheckoutTimeRange() {
  const minutes = checkoutResultsData.data.map((row) => row.minute)
  return {
    start: Math.min(...minutes.map((m) => new Date(m).getTime())),
    end: Math.max(...minutes.map((m) => new Date(m).getTime())),
    duration:
      Math.max(...minutes.map((m) => new Date(m).getTime())) -
      Math.min(...minutes.map((m) => new Date(m).getTime()))
  }
}

/**
 * Test helper to calculate service metrics
 */
export function calculateServiceMetrics(serviceName: string) {
  const serviceData = getCheckoutDataByService(serviceName)

  if (serviceData.length === 0) {
    return null
  }

  const p50Values = serviceData.map((d) => d.p50_ms).filter((v) => v !== null)
  const p95Values = serviceData.map((d) => d.p95_ms).filter((v) => v !== null)
  const p99Values = serviceData.map((d) => d.p99_ms).filter((v) => v !== null)
  const requestCounts = serviceData.map((d) => parseInt(d.request_count))

  return {
    service: serviceName,
    avgP50: p50Values.reduce((a, b) => a + b, 0) / p50Values.length,
    avgP95: p95Values.reduce((a, b) => a + b, 0) / p95Values.length,
    avgP99: p99Values.reduce((a, b) => a + b, 0) / p99Values.length,
    totalRequests: requestCounts.reduce((a, b) => a + b, 0),
    dataPoints: serviceData.length
  }
}
