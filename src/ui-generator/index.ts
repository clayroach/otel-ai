// UI Generator Package Exports
export {
  UIGeneratorAPIClient,
  generateQuery,
  generateMultipleQueries,
  validateQuery
} from './api-client.js'
export type { QueryGenerationAPIRequest, QueryGenerationAPIResponse } from './api-client.js'

// Export query generator functionality
export {
  generateQueryWithLLM,
  generateStandardQueries,
  generateQueryWithSQLModel,
  ANALYSIS_GOALS
} from './query-generator/llm-query-generator.js'

// Export types
export type {
  CriticalPath,
  GeneratedQuery,
  QueryResult,
  QueryPattern
} from './query-generator/types.js'

// API Client Layer for server integration
export {
  UIGeneratorAPIClientTag,
  UIGeneratorAPIClientLayer,
  type UIGeneratorAPIClientService,
  generateQuery as generateQueryEffect,
  generateMultipleQueries as generateMultipleQueriesEffect,
  validateQuery as validateQueryEffect
} from './api-client-layer.js'

// Export all services and their layers
export {
  // Result Analysis Service
  ResultAnalysisServiceTag,
  ResultAnalysisServiceLive,
  type ResultAnalysisService,

  // Chart Config Generator Service
  ChartConfigGeneratorServiceTag,
  ChartConfigGeneratorServiceLive,
  type ChartConfigGeneratorService,

  // Dynamic Component Generator Service
  DynamicComponentGeneratorServiceTag,
  DynamicComponentGeneratorServiceLive,
  type DynamicComponentGeneratorService,
  DynamicUIGenerator,
  type DynamicComponent,
  type GenerationRequest,

  // Types
  type ColumnAnalysis,
  type ResultAnalysis,
  type ChartAnalysisInput
} from './services/index.js'
