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

// Export types from query generator
export type { GeneratedQuery, QueryResult, QueryPattern } from './query-generator/types.js'

// Service Interface and Implementation
export type { UIGeneratorService, ValidationResult } from './service.js'
export { UIGeneratorServiceTag } from './service.js'

export { UIGeneratorServiceLive, makeUIGeneratorService } from './service-live.js'

// Error Types
export {
  type UIGeneratorError,
  InvalidRequestError,
  QueryGenerationError,
  ValidationError,
  ServiceDependencyError,
  ModelUnavailableError,
  UIGeneratorErrors
} from './errors.js'

// Schema Types and Validation
export {
  type CriticalPath,
  type QueryGenerationAPIRequest as SchemaQueryGenerationAPIRequest,
  type QueryGenerationAPIResponse as SchemaQueryGenerationAPIResponse,
  type MultipleQueryGenerationRequest,
  type ValidationResult as SchemaValidationResult,
  type ExpectedColumn,
  type LLMConfig,
  type AnalysisGoal,
  type ServiceConfig,
  validateRequest,
  validateResponse,
  validateMultipleRequest,
  validateValidationResult
} from './schemas.js'

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
