/**
 * AI Insights Router
 *
 * HTTP endpoints for LLM-powered analysis services.
 * Follows Layer pattern for composable service integration.
 */

import express, { type Request, type Response } from 'express'
import { Effect, Context, Layer } from 'effect'
import { CriticalPathAnalyzerTag } from './critical-path-analyzer/analyzer.js'
import { TopologyAnalyzerService } from '../../topology-analyzer/index.js'
import { CriticalPathDiscoveryError } from './types.js'

/**
 * Router interface
 */
export interface AIInsightsRouter {
  readonly router: express.Router
}

export const AIInsightsRouterTag = Context.GenericTag<AIInsightsRouter>('AIInsightsRouter')

/**
 * Live implementation of AI Insights Router
 */
export const AIInsightsRouterLive = Layer.effect(
  AIInsightsRouterTag,
  Effect.gen(function* () {
    const criticalPathAnalyzer = yield* CriticalPathAnalyzerTag
    const topologyAnalyzer = yield* TopologyAnalyzerService

    const router = express.Router()

    console.log('🔍 AI Insights Router initialized')

    /**
     * POST /api/ai-insights/critical-paths
     *
     * Discover critical paths from service topology using LLM analysis
     *
     * Request body:
     * {
     *   "startTime": "2024-01-01T00:00:00Z",  // ISO 8601 timestamp
     *   "endTime": "2024-01-01T01:00:00Z"     // ISO 8601 timestamp
     * }
     *
     * Response:
     * {
     *   "paths": [CriticalPath[]],
     *   "metadata": {
     *     "discoveredBy": "llm" | "statistical",
     *     "executionTimeMs": number
     *   }
     * }
     */
    router.post('/api/ai-insights/critical-paths', async (req: Request, res: Response) => {
      try {
        const startTime = new Date()

        // Parse time range from request body
        const { startTime: startTimeStr, endTime: endTimeStr } = req.body

        if (!startTimeStr || !endTimeStr) {
          return res.status(400).json({
            error: 'Missing required parameters',
            message: 'Both startTime and endTime are required'
          })
        }

        const timeRange = {
          startTime: new Date(startTimeStr),
          endTime: new Date(endTimeStr)
        }

        // Validate time range
        if (isNaN(timeRange.startTime.getTime()) || isNaN(timeRange.endTime.getTime())) {
          return res.status(400).json({
            error: 'Invalid time range',
            message: 'startTime and endTime must be valid ISO 8601 timestamps'
          })
        }

        if (timeRange.startTime >= timeRange.endTime) {
          return res.status(400).json({
            error: 'Invalid time range',
            message: 'startTime must be before endTime'
          })
        }

        // Get service topology from topology-analyzer
        const topologyData = await Effect.runPromise(topologyAnalyzer.getServiceTopology(timeRange))

        // Transform topology-analyzer's ServiceTopology to ServiceMetrics
        const serviceMetrics = topologyData.map((service) => ({
          serviceName: service.service,
          callCount: (service.metadata.totalSpans as number) || 0,
          errorRate: service.metadata.errorRate || 0,
          avgLatency: service.metadata.avgLatencyMs || 0,
          p99Latency: service.metadata.p95LatencyMs || 0, // Use p95 as proxy for p99
          dependencies: service.dependencies.map((dep) => ({
            targetService: dep.service,
            callCount: dep.callCount,
            errorRate: dep.errorRate,
            avgLatency: dep.avgLatencyMs
          }))
        }))

        // Discover critical paths using LLM
        const paths = await Effect.runPromise(
          criticalPathAnalyzer.discoverCriticalPaths({
            topology: serviceMetrics,
            timeRange
          })
        )

        const endTime = new Date()
        const executionTimeMs = endTime.getTime() - startTime.getTime()

        return res.json({
          paths,
          metadata: {
            discoveredBy: paths[0]?.metadata?.discoveredBy || 'llm',
            model: paths[0]?.metadata?.model || 'unknown',
            executionTimeMs,
            topologyServicesCount: serviceMetrics.length,
            pathsDiscovered: paths.length
          }
        })
      } catch (error) {
        console.error('❌ Critical path discovery error:', error)

        if (error instanceof CriticalPathDiscoveryError) {
          return res.status(500).json({
            error: 'Critical path discovery failed',
            message: error.message,
            cause: error.cause
          })
        }

        return res.status(500).json({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    /**
     * GET /api/ai-insights/health
     *
     * Health check endpoint
     */
    router.get('/api/ai-insights/health', (_req: Request, res: Response) => {
      res.json({
        status: 'ok',
        service: 'ai-insights',
        timestamp: new Date().toISOString()
      })
    })

    return AIInsightsRouterTag.of({ router })
  })
)
