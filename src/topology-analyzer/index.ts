/**
 * Topology Analyzer Package
 *
 * Statistical analysis of trace data for application architecture discovery.
 * Provides insights into service topology, dependencies, and performance patterns.
 */

export * from './types.js'
export * from './service.js'
export * from './topology.js'
export * from './queries.js'

// Main Layer exports for service consumption
export { TopologyAnalyzerLayer, defaultAnalyzerConfig } from './service.js'
export { TopologyAnalyzerClientLive, TopologyAnalyzerClientTag } from './api-client.js'

// Service tags and types
export { TopologyAnalyzerService } from './types.js'
export type { TopologyAnalyzerClient } from './api-client.js'

export type {
  AnalysisRequest,
  AnalysisResult,
  ApplicationArchitecture,
  ServiceTopology,
  AnalysisError
} from './types.js'

// Router exports - Layer pattern for HTTP endpoints
export type { TopologyAnalyzerRouter } from './router.js'
export { TopologyAnalyzerRouterTag, TopologyAnalyzerRouterLive } from './router.js'
