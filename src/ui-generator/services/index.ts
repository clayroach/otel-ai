// Result Analysis Service
export {
  ResultAnalysisServiceTag,
  ResultAnalysisServiceLive,
  type ResultAnalysisService
} from './result-analysis-service.js'

// Chart Config Generator Service
export {
  ChartConfigGeneratorServiceTag,
  ChartConfigGeneratorServiceLive,
  type ChartConfigGeneratorService
} from './chart-config-generator.js'

// Dynamic Component Generator Service
export {
  DynamicComponentGeneratorServiceTag,
  DynamicComponentGeneratorServiceLive,
  type DynamicComponentGeneratorService,
  DynamicUIGenerator,
  type DynamicComponent,
  type GenerationRequest
} from './dynamic-component-generator.js'

// Removed bogus UI Generation Pipeline - the real flow is:
// Service Topology → Critical Paths → generate-query → clickhouse → from-sql

// Types
export type { ColumnAnalysis, ResultAnalysis, ChartAnalysisInput } from './types.js'
