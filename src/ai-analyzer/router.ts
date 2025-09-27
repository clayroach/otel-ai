/**
 * AI Analyzer Package Router
 * Handles architecture analysis, topology discovery, and visualization
 */

import { Context, Effect, Layer } from 'effect'
import express from 'express'
import { AIAnalyzerService } from './index.js'
import { StorageAPIClientTag } from '../storage/index.js'
import type { ServiceTopologyRaw, ServiceDependencyRaw, TraceFlowRaw } from './queries.js'

export interface AIAnalyzerRouter {
  readonly router: express.Router
}

export const AIAnalyzerRouterTag = Context.GenericTag<AIAnalyzerRouter>('AIAnalyzerRouter')

export const AIAnalyzerRouterLive = Layer.effect(
  AIAnalyzerRouterTag,
  Effect.gen(function* () {
    const aiAnalyzer = yield* AIAnalyzerService
    const storageClient = yield* StorageAPIClientTag

    const router = express.Router()

    // Health check endpoint
    router.get('/api/ai-analyzer/health', async (_req, res) => {
      try {
        // AI Analyzer service is always available through the layer
        res.json({
          status: 'healthy',
          capabilities: [
            'architecture-analysis',
            'topology-discovery',
            'streaming-analysis',
            'documentation-generation'
          ],
          message: 'AI Analyzer service ready (using mock layer)'
        })
      } catch (error) {
        res.status(500).json({
          status: 'error',
          capabilities: [],
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Architecture analysis endpoint
    router.post('/api/ai-analyzer/analyze', async (req, res) => {
      try {
        const { type, timeRange, filters, config } = req.body

        const analysisRequest = {
          type: type || 'architecture',
          timeRange: {
            startTime: new Date(timeRange.startTime),
            endTime: new Date(timeRange.endTime)
          },
          filters,
          config
        }

        // Execute the analysis using Effect and the service layer
        const result = await Effect.runPromise(aiAnalyzer.analyzeArchitecture(analysisRequest))

        res.json(result)
      } catch (error) {
        console.error('❌ AI Analyzer analysis error:', error)
        res.status(500).json({
          error: 'Analysis failed',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Service topology endpoint
    router.post('/api/ai-analyzer/topology', async (req, res) => {
      try {
        const { timeRange } = req.body

        const topologyRequest = {
          startTime: new Date(timeRange.startTime),
          endTime: new Date(timeRange.endTime)
        }

        // Execute the topology request using Effect and the service layer
        const topology = await Effect.runPromise(aiAnalyzer.getServiceTopology(topologyRequest))

        res.json(topology)
      } catch (error) {
        console.error('❌ AI Analyzer topology error:', error)
        res.status(500).json({
          error: 'Topology analysis failed',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Topology visualization endpoint
    router.post('/api/ai-analyzer/topology-visualization', async (req, res) => {
      try {
        console.log('🎨 AI Analyzer topology visualization endpoint hit')

        const { timeRange } = req.body
        const timeRangeHours = timeRange?.hours || 24

        // Import the necessary functions
        const { ArchitectureQueries } = await import('./queries.js')
        const { discoverTopologyWithVisualization } = await import('./topology.js')

        // Execute queries to get raw topology data using Effect
        const result = await Effect.runPromise(
          Effect.gen(function* () {
            const topologyQuery = ArchitectureQueries.getServiceTopology(timeRangeHours)
            const dependencyQuery = ArchitectureQueries.getServiceDependencies(timeRangeHours)
            const traceFlowQuery = ArchitectureQueries.getTraceFlows(100, timeRangeHours)

            // Run queries in parallel
            const [topologyData, dependencyData, traceFlows] = yield* Effect.all(
              [
                storageClient.queryRaw(topologyQuery),
                storageClient.queryRaw(dependencyQuery),
                storageClient.queryRaw(traceFlowQuery)
              ],
              { concurrency: 3 }
            )

            console.log(`📊 Topology data: ${topologyData.length} services found`)
            console.log(`🔗 Dependency data: ${dependencyData.length} dependencies found`)
            console.log(`🌊 Trace flows: ${traceFlows.length} flows found`)

            // Generate visualization data with nodes and edges
            const visualizationData = yield* discoverTopologyWithVisualization(
              topologyData as ServiceTopologyRaw[],
              dependencyData as ServiceDependencyRaw[],
              traceFlows as TraceFlowRaw[]
            )

            console.log(
              `✨ Generated visualization with ${visualizationData.nodes.length} nodes and ${visualizationData.edges.length} edges`
            )
            console.log(`🎯 Health summary:`, visualizationData.healthSummary)

            return visualizationData
          })
        )

        res.json(result)
      } catch (error) {
        console.error('❌ Topology visualization error:', error)
        res.status(500).json({
          error: 'Topology visualization failed',
          message: error instanceof Error ? error.message : 'Unknown error',
          details: error instanceof Error ? error.stack : undefined
        })
      }
    })

    return AIAnalyzerRouterTag.of({ router })
  })
)
