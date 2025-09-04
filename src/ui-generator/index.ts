// UI Generator Package Exports
export {
  UIGeneratorAPIClient,
  generateQuery,
  generateMultipleQueries,
  getAvailableModels,
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
