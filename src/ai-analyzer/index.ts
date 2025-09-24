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
export { AIAnalyzerLayer, AIAnalyzerMockLayer, defaultAnalyzerConfig } from './service.js'
export { AIAnalyzerClientLive, AIAnalyzerClientMock, AIAnalyzerClientTag } from './api-client.js'

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
