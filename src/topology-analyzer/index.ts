/**
 * AI Analyzer Package
 *
 * LLM-based analysis of trace data for application architecture discovery.
 * Provides insights into service topology, dependencies, and performance patterns.
 */

export * from './types.js'
export * from './service.js'
export * from './topology.js'
export * from './queries.js'
export * from './prompts.js'

// Main Layer exports for service consumption
export { AIAnalyzerLayer, defaultAnalyzerConfig } from './service.js'
export { AIAnalyzerClientLive, AIAnalyzerClientTag } from './api-client.js'

// Service tags and types
export { AIAnalyzerService } from './types.js'
export type { AIAnalyzerClient } from './api-client.js'

export type {
  AnalysisRequest,
  AnalysisResult,
  ApplicationArchitecture,
  ServiceTopology,
  AnalysisError
} from './types.js'

// Router exports - Layer pattern for HTTP endpoints
export type { AIAnalyzerRouter } from './router.js'
export { AIAnalyzerRouterTag, AIAnalyzerRouterLive } from './router.js'
