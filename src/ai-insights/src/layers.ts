/**
 * AI Insights Package Layers
 *
 * Composable Effect layers for the ai-insights package.
 */

import { Layer } from 'effect'
import { LLMManagerLive } from '../../llm-manager/index.js'
import {
  CriticalPathAnalyzerLive,
  CriticalPathAnalyzerTag
} from './critical-path-analyzer/analyzer.js'

/**
 * Complete AI Insights Layer with all dependencies
 */
export const AIInsightsLive = Layer.mergeAll(CriticalPathAnalyzerLive).pipe(
  Layer.provide(LLMManagerLive)
)

/**
 * Export individual services for granular composition
 */
export { CriticalPathAnalyzerLive, CriticalPathAnalyzerTag }
