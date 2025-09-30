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

        // Validate required fields
        if (!timeRange || !timeRange.startTime || !timeRange.endTime) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'timeRange with startTime and endTime is required'
          })
        }

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
        return
      } catch (error) {
        console.error('❌ AI Analyzer analysis error:', error)
        res.status(500).json({
          error: 'Analysis failed',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
        return
      }
    })

    // Service topology endpoint
    router.post('/api/ai-analyzer/topology', async (req, res) => {
      try {
        // Add validation and default values for timeRange
        const timeRange = req.body?.timeRange || {
          startTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          endTime: new Date().toISOString()
        }

        // Validate timeRange format
        if (!timeRange.startTime || !timeRange.endTime) {
          return res.status(400).json({
            error: 'Invalid request',
            message: 'timeRange with startTime and endTime is required'
          })
        }

        const topologyRequest = {
          startTime: new Date(timeRange.startTime),
          endTime: new Date(timeRange.endTime)
        }

        // Execute the topology request using Effect and the service layer
        const topology = await Effect.runPromise(aiAnalyzer.getServiceTopology(topologyRequest))

        return res.json(topology)
      } catch (error) {
        console.error('❌ AI Analyzer topology error:', error)
        return res.status(500).json({
          error: 'Topology analysis failed',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Topology visualization endpoint
    router.post('/api/ai-analyzer/topology-visualization', async (req, res) => {
      try {
        console.log('🎨 AI Analyzer topology visualization endpoint hit')
        console.log('📋 Request body:', JSON.stringify(req.body, null, 2))

        // Require timeRange - no defaults to mask issues
        const { timeRange } = req.body || {}

        if (!timeRange) {
          return res.status(400).json({
            error: 'Invalid request',
            message:
              'timeRange is required: provide either {hours: number} or {startTime: string, endTime: string}'
          })
        }

        // Accept either hours or startTime/endTime
        let timeRangeHours: number
        if (timeRange.hours) {
          timeRangeHours = timeRange.hours
        } else if (timeRange.startTime && timeRange.endTime) {
          timeRangeHours =
            Math.abs(
              new Date(timeRange.endTime).getTime() - new Date(timeRange.startTime).getTime()
            ) /
            (1000 * 60 * 60)
        } else {
          return res.status(400).json({
            error: 'Invalid request',
            message: 'timeRange must have either hours or both startTime and endTime'
          })
        }

        // Import the necessary functions
        const { ArchitectureQueries, OptimizedQueries } = await import('./queries.js')
        const { discoverTopologyWithVisualization } = await import('./topology.js')

        // Execute queries to get raw topology data using Effect
        const result = await Effect.runPromise(
          Effect.gen(function* () {
            // Default to using raw topology query (no aggregated table for this yet)
            const topologyQuery = ArchitectureQueries.getServiceTopology(timeRangeHours)
            let dependencyQuery: string

            // For dependencies, use our aggregated tables populated by dependency-aggregator
            // Convert timeRangeHours to minutes for sub-hour windows
            const timeRangeMinutes = timeRangeHours * 60

            if (timeRangeMinutes <= 60) {
              // For windows <= 1 hour, use getServiceDependenciesForMinutes
              console.log(
                `📊 Using aggregated service_dependencies_5min table for ${timeRangeMinutes} minute window`
              )
              dependencyQuery = OptimizedQueries.getServiceDependenciesForMinutes(timeRangeMinutes)
            } else {
              // For longer windows, use the standard view query
              console.log(`📊 Using aggregated dependency tables for ${timeRangeHours} hour window`)
              dependencyQuery = OptimizedQueries.getServiceDependenciesFromView(timeRangeHours)
            }

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

        return res.json(result)
      } catch (error) {
        console.error('❌ Topology visualization error:', error)
        return res.status(500).json({
          error: 'Topology visualization failed',
          message: error instanceof Error ? error.message : 'Unknown error',
          details: error instanceof Error ? error.stack : undefined
        })
      }
    })

    // Query performance metrics endpoint
    router.get('/api/ai-analyzer/topology/performance', async (_req, res) => {
      try {
        // Query to check recent query performance from system tables
        const perfQuery = `
          SELECT
            query_duration_ms,
            memory_usage,
            read_rows,
            result_rows,
            substring(query, 1, 100) as query_start,
            event_time
          FROM system.query_log
          WHERE query LIKE '%service_dependencies%' OR query LIKE '%service_topology%'
            AND type = 'QueryFinish'
            AND event_time >= now() - INTERVAL 1 HOUR
          ORDER BY event_time DESC
          LIMIT 20
        `

        const performance = await Effect.runPromise(storageClient.queryRaw(perfQuery))

        res.json({
          success: true,
          recent_queries: performance,
          message: 'Query performance metrics retrieved'
        })
      } catch (error) {
        console.error('❌ Failed to get performance metrics:', error)
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve performance metrics',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    return AIAnalyzerRouterTag.of({ router })
  })
)
