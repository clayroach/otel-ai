/**
 * AI Insights Package
 *
 * LLM-powered analysis services for observability:
 * - Critical path discovery
 * - Root cause analysis (Phase 2)
 * - Investigation orchestration (Phase 3)
 */

// Types
export type { CriticalPath, ServiceMetrics } from './src/types.js'
export { CriticalPathSchema, ServiceMetricsSchema } from './src/types.js'
export { CriticalPathDiscoveryError, RootCauseAnalysisError } from './src/types.js'

// Services
export {
  CriticalPathAnalyzerTag,
  type CriticalPathAnalyzer
} from './src/critical-path-analyzer/analyzer.js'

// Layers
export {
  AIInsightsLive,
  CriticalPathAnalyzerLive,
  CriticalPathAnalyzerTag as CriticalPathAnalyzerServiceTag
} from './src/layers.js'

// Utilities
export {
  calculatePathMetrics,
  statisticalPathDiscovery
} from './src/critical-path-analyzer/path-discovery.js'

export {
  classifySeverity,
  classifyPriority
} from './src/critical-path-analyzer/severity-classifier.js'

// Router
export type { AIInsightsRouter } from './src/router.js'
export { AIInsightsRouterTag, AIInsightsRouterLive } from './src/router.js'
