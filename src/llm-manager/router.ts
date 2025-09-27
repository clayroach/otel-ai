/**
 * LLM Manager Package Router
 * Handles LLM interactions, model management, and generation endpoints
 */

import { Context, Effect, Layer } from 'effect'
import express from 'express'
import { LLMManagerAPIClientTag } from './index.js'
import { interactionLogger, type LLMInteraction } from './interaction-logger.js'

export interface LLMManagerRouter {
  readonly router: express.Router
}

export const LLMManagerRouterTag = Context.GenericTag<LLMManagerRouter>('LLMManagerRouter')

export const LLMManagerRouterLive = Layer.effect(
  LLMManagerRouterTag,
  Effect.gen(function* () {
    const llmManager = yield* LLMManagerAPIClientTag

    const router = express.Router()

    // Get LLM interactions
    router.get('/api/llm/interactions', async (req, res) => {
      try {
        const limit = parseInt(req.query.limit as string) || 50
        const model = req.query.model as string | undefined

        // Only return real interactions from the logger - NO MOCK DATA
        const realInteractions = interactionLogger.getInteractions(limit, model)

        console.log(`📊 Serving ${realInteractions.length} real Portkey interactions`)

        // Get unique models from real interactions
        const modelsUsed = Array.from(new Set(realInteractions.map((i) => i.model)))

        res.json({
          interactions: realInteractions,
          total: realInteractions.length,
          modelsUsed,
          source: 'portkey'
        })
      } catch (error) {
        res.status(500).json({
          error: 'Failed to fetch LLM interactions',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // LLM Model Comparison Endpoint
    router.get('/api/llm/comparison', async (req, res) => {
      try {
        const taskType = req.query.taskType as string | undefined
        const timeWindowMs = parseInt(req.query.timeWindow as string) || 24 * 60 * 60 * 1000

        // Only return real comparison data from the logger - NO MOCK DATA
        const realComparison = interactionLogger.getModelComparison(timeWindowMs)

        console.log(`📊 Serving real model comparison for ${realComparison.length} models`)
        res.json({
          comparison: realComparison,
          source: 'portkey',
          taskType: taskType || 'all',
          timeWindowMs
        })
      } catch (error) {
        res.status(500).json({
          error: 'Failed to fetch model comparison',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // LLM Live Feed (Server-Sent Events)
    router.get('/api/llm/live', (req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      })

      // Send initial connection event
      res.write(
        `data: ${JSON.stringify({
          type: 'connected',
          timestamp: Date.now(),
          message: 'Connected to LLM interaction live feed (with real Portkey data)'
        })}\n\n`
      )

      // Set up listeners for real interaction events
      const handleInteractionStart = (interaction: LLMInteraction) => {
        res.write(
          `data: ${JSON.stringify({
            type: 'request_start',
            entry: interaction,
            timestamp: Date.now()
          })}\n\n`
        )
      }

      const handleInteractionComplete = (interaction: LLMInteraction) => {
        res.write(
          `data: ${JSON.stringify({
            type: 'request_complete',
            entry: interaction,
            timestamp: Date.now()
          })}\n\n`
        )
      }

      const handleInteractionError = (interaction: LLMInteraction) => {
        res.write(
          `data: ${JSON.stringify({
            type: 'request_error',
            entry: interaction,
            timestamp: Date.now()
          })}\n\n`
        )
      }

      // Register listeners
      interactionLogger.on('start', handleInteractionStart)
      interactionLogger.on('complete', handleInteractionComplete)
      interactionLogger.on('error', handleInteractionError)

      // Clean up on client disconnect
      req.on('close', () => {
        console.log('📡 Client disconnected from LLM live feed')
        interactionLogger.off('start', handleInteractionStart)
        interactionLogger.off('complete', handleInteractionComplete)
        interactionLogger.off('error', handleInteractionError)
      })

      // Send periodic heartbeats to keep connection alive
      const heartbeat = setInterval(() => {
        res.write(
          `data: ${JSON.stringify({
            type: 'heartbeat',
            timestamp: Date.now(),
            activeConnections: 1
          })}\n\n`
        )
      }, 30000)

      req.on('close', () => {
        clearInterval(heartbeat)
      })
    })

    // Clear LLM interactions
    router.delete('/api/llm/interactions', async (_req, res) => {
      try {
        // Clear real interaction logs
        interactionLogger.clearInteractions()

        console.log('🧹 Cleared all LLM interaction logs')

        res.json({
          message: 'LLM interaction logs cleared',
          timestamp: Date.now(),
          source: 'portkey'
        })
      } catch (error) {
        res.status(500).json({
          error: 'Failed to clear logs',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // LLM Manager Implementation Info
    router.get('/api/llm-manager/implementation', async (_req, res) => {
      const usePortkey = process.env.USE_PORTKEY_GATEWAY === 'true'

      res.json({
        implementation: usePortkey ? 'portkey-gateway' : 'original-llm-manager',
        usePortkey,
        details: usePortkey
          ? {
              gatewayUrl: process.env.PORTKEY_GATEWAY_URL || 'http://localhost:8787',
              configPath: '/config/config.json',
              features: [
                'Configuration-driven routing',
                'Automatic failover',
                'Semantic caching',
                'Native observability',
                '1,600+ model support'
              ],
              healthCheck: `${process.env.PORTKEY_GATEWAY_URL || 'http://localhost:8787'}/health`
            }
          : {
              models: ['gpt', 'claude', 'llama'],
              routing: 'Code-based routing',
              features: [
                'Multi-model support',
                'Fallback strategies',
                'Response caching',
                'Custom routing logic'
              ]
            },
        timestamp: new Date().toISOString()
      })
    })

    // LLM Manager Status endpoint
    router.get('/api/llm-manager/status', async (_req, res) => {
      try {
        const status = await Effect.runPromise(llmManager.getStatus())

        res.json({
          ...status,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        console.error('❌ Error getting LLM Manager status:', error)
        res.status(500).json({
          error: 'Failed to get LLM Manager status',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // LLM Manager Models endpoint
    router.get('/api/llm-manager/models', async (_req, res) => {
      try {
        const models = await Effect.runPromise(llmManager.getLoadedModels())

        res.json({
          models,
          count: models.length,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        console.error('❌ Error getting loaded models:', error)
        res.status(500).json({
          error: 'Failed to get loaded models',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // LLM Manager Model Selection endpoint
    router.post('/api/llm-manager/select-model', async (req, res) => {
      try {
        const { taskType, requirements } = req.body

        if (!taskType) {
          res.status(400).json({
            error: 'Bad Request',
            message: 'taskType is required'
          })
          return
        }

        const selection = await Effect.runPromise(
          llmManager.selectModel({
            taskType,
            requirements
          })
        )

        res.json({
          ...selection,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        console.error('❌ Error selecting model:', error)
        res.status(500).json({
          error: 'Failed to select model',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // LLM Manager Health Check endpoint
    router.get('/api/llm-manager/health', async (_req, res) => {
      try {
        const status = await Effect.runPromise(llmManager.getStatus())

        const httpStatus =
          status.status === 'operational' ? 200 : status.status === 'degraded' ? 207 : 503

        res.status(httpStatus).json({
          status: status.status,
          loadedModels: status.loadedModels?.length || 0,
          healthyModels: status.loadedModels?.filter((m) => m.status === 'available').length || 0,
          uptime: status.systemMetrics?.uptime,
          timestamp: new Date().toISOString(),
          config: status.config
        })
      } catch (error) {
        console.error('❌ LLM Manager health check error:', error)
        res.status(503).json({
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        })
      }
    })

    // LLM Manager Reload Models endpoint
    router.post('/api/llm-manager/reload', async (_req, res) => {
      try {
        const result = await Effect.runPromise(
          Effect.gen(function* () {
            // Reload models from environment variables
            yield* llmManager.reloadModels()

            // Get updated status
            const loadedModels = yield* llmManager.getLoadedModels()
            const categories = yield* llmManager.getModelCategories()

            return { loadedModels, categories }
          })
        )

        res.json({
          message: 'Models reloaded successfully',
          loadedModels: result.loadedModels.map((m) => ({
            id: m.id,
            provider: m.provider,
            status: m.status
          })),
          categories: result.categories,
          totalModels: result.loadedModels.length,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        console.error('❌ Failed to reload models:', error)
        res.status(500).json({
          error: 'Failed to reload models',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // LLM Manager Generate endpoint
    router.post('/api/llm-manager/generate', async (req, res) => {
      try {
        const { prompt, model, taskType, maxTokens, temperature } = req.body

        if (!prompt) {
          res.status(400).json({
            error: 'Bad Request',
            message: 'prompt is required'
          })
          return
        }

        const response = await Effect.runPromise(
          llmManager.generate({
            prompt,
            taskType: taskType || 'analysis',
            preferences: {
              model,
              maxTokens: maxTokens || 1000,
              temperature: temperature || 0.7,
              requireStructuredOutput: false
            }
          })
        )

        res.json({
          response,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        console.error('❌ Generation error:', error)
        res.status(500).json({
          error: 'Failed to generate response',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    return LLMManagerRouterTag.of({ router })
  })
)
