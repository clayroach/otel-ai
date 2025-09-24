// UI Generator Package Exports - Types Only
export type {
  UIGeneratorAPIClient,
  QueryGenerationAPIRequest,
  QueryGenerationAPIResponse
} from './api-client.js'

// Export types from query generator
export type { GeneratedQuery, QueryResult, QueryPattern } from './query-generator/types.js'

// Constants are okay to export
export { ANALYSIS_GOALS } from './query-generator/llm-query-generator.js'

// Service Tags and Types
export type { UIGeneratorService, ValidationResult } from './service.js'
export { UIGeneratorServiceTag } from './service.js'

// Layer exports ONLY - no factory functions
export { UIGeneratorServiceLive } from './service-live.js'

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

// Schema Types Only - no validation functions exported
export type {
  CriticalPath,
  QueryGenerationAPIRequest as SchemaQueryGenerationAPIRequest,
  QueryGenerationAPIResponse as SchemaQueryGenerationAPIResponse,
  MultipleQueryGenerationRequest,
  ValidationResult as SchemaValidationResult,
  ExpectedColumn,
  LLMConfig,
  AnalysisGoal,
  ServiceConfig
} from './schemas.js'

// API Client Layer for server integration - Layers and Types Only
export { UIGeneratorAPIClientTag, UIGeneratorAPIClientLayer } from './api-client-layer.js'
export type { UIGeneratorAPIClientService } from './api-client-layer.js'

// Service Layers and Tags - External consumption via Layers only
export {
  // Service Tags (for dependency injection)
  ResultAnalysisServiceTag,
  ChartConfigGeneratorServiceTag,
  DynamicComponentGeneratorServiceTag,

  // Service Layers (the ONLY way to get service instances)
  ResultAnalysisServiceLive,
  ChartConfigGeneratorServiceLive,
  DynamicComponentGeneratorServiceLive,

  // Class for type reference only (not for direct instantiation)
  DynamicUIGenerator
} from './services/index.js'

// Types for external use
export type {
  ResultAnalysisService,
  ChartConfigGeneratorService,
  DynamicComponentGeneratorService,
  DynamicComponent,
  GenerationRequest,
  ColumnAnalysis,
  ResultAnalysis,
  ChartAnalysisInput
} from './services/index.js'
