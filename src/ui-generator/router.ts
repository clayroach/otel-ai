/**
 * UI Generator Package Router
 * Handles SQL-to-UI generation and query generation
 */

import { Context, Effect, Layer } from 'effect'
import express from 'express'
import {
  UIGeneratorAPIClientTag,
  ResultAnalysisServiceTag,
  ResultAnalysisServiceLive,
  ChartConfigGeneratorServiceTag,
  ChartConfigGeneratorServiceLive
} from './index.js'
import { LLMManagerAPIClientTag } from '../llm-manager/index.js'

export interface UIGeneratorRouter {
  readonly router: express.Router
}

export const UIGeneratorRouterTag = Context.GenericTag<UIGeneratorRouter>('UIGeneratorRouter')

export const UIGeneratorRouterLive = Layer.effect(
  UIGeneratorRouterTag,
  Effect.gen(function* () {
    const uiGenerator = yield* UIGeneratorAPIClientTag
    const llmManager = yield* LLMManagerAPIClientTag

    // Create layer composition for local services
    const ServiceLayers = Layer.mergeAll(ResultAnalysisServiceLive, ChartConfigGeneratorServiceLive)

    const router = express.Router()

    // Helper function to determine analysis goal from metrics
    const determineAnalysisGoal = (metrics?: {
      errorRate?: number
      p99Latency?: number
    }): string => {
      if (!metrics) return 'General diagnostics for critical path analysis'

      if (metrics.errorRate && metrics.errorRate > 0.05) {
        return 'Identify error patterns, distribution, and root causes across services to improve reliability'
      } else if (metrics.p99Latency && metrics.p99Latency > 2000) {
        return 'Detect performance bottlenecks by finding slowest operations and their impact on the critical path'
      } else if (metrics.p99Latency && metrics.p99Latency > 1000) {
        return 'Analyze service latency patterns showing p50, p95, p99 percentiles over time for performance monitoring'
      }

      return 'General diagnostics for critical path analysis'
    }

    // Helper function to determine analysis type from description
    const determineAnalysisType = (description: string): string => {
      const lowerDesc = description.toLowerCase()
      if (lowerDesc.includes('error')) return 'errors'
      if (lowerDesc.includes('bottleneck')) return 'bottlenecks'
      if (lowerDesc.includes('latency')) return 'latency'
      if (lowerDesc.includes('throughput')) return 'throughput'
      return 'general'
    }

    // Generate UI components from SQL results
    router.post('/api/ui-generator/from-sql', async (req, res) => {
      try {
        const { sql, queryResults, context } = req.body

        // Extract the actual data array from queryResults
        const dataArray = Array.isArray(queryResults)
          ? queryResults
          : queryResults?.data || queryResults

        // Analyze the query results to determine the best visualization
        const analysis = await Effect.runPromise(
          Effect.gen(function* () {
            const service = yield* ResultAnalysisServiceTag
            return yield* service.analyzeResults(dataArray)
          }).pipe(Effect.provide(ServiceLayers))
        )

        // Generate chart configuration based on the analysis
        // Deep copy the analysis to convert readonly types to mutable
        const chartConfig = await Effect.runPromise(
          Effect.gen(function* () {
            const service = yield* ChartConfigGeneratorServiceTag
            return yield* service.generateConfig(
              {
                ...analysis,
                columns: analysis.columns.map((col) => ({
                  ...col,
                  sampleValues: [...col.sampleValues],
                  semanticType: col.semanticType || ''
                })),
                detectedPatterns: [...analysis.detectedPatterns]
              },
              dataArray
            )
          }).pipe(Effect.provide(ServiceLayers))
        )

        // Return the component specification
        res.json({
          component: {
            component:
              chartConfig.type === 'table'
                ? 'DynamicDataTable'
                : chartConfig.type === 'line'
                  ? 'DynamicLineChart'
                  : chartConfig.type === 'bar'
                    ? 'DynamicBarChart'
                    : 'DynamicDataTable',
            props: {
              data: dataArray,
              config: chartConfig,
              title: `Analysis of ${Array.isArray(dataArray) ? dataArray.length : 0} records`,
              description: `Generated from SQL query: ${sql?.substring(0, 100)}...`
            }
          },
          analysis,
          metadata: {
            generatedAt: new Date().toISOString(),
            sourceQuery: sql,
            context: context
          }
        })
      } catch (error) {
        console.error('❌ Error generating UI from SQL:', error)
        res.status(500).json({
          error: 'UI generation failed',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Generate query from path analysis
    router.post('/api/ui-generator/generate-query', async (req, res) => {
      try {
        const {
          path,
          timeWindowMinutes = 60,
          analysisGoal,
          model,
          isClickHouseAI,
          useEvaluatorOptimizer = true // Enable evaluator by default for better query validation
        } = req.body

        // Validate that path exists
        if (!path || !path.services || path.services.length === 0) {
          res.status(400).json({
            error: 'Invalid request',
            message: 'Path with services array is required'
          })
          return
        }

        console.log(
          `🔧 [EVALUATOR] Server received useEvaluatorOptimizer: ${useEvaluatorOptimizer}`
        )
        console.log(`🔧 [EVALUATOR] Request body keys:`, Object.keys(req.body))
        console.log(
          `🔧 [EVALUATOR] About to call UIGeneratorAPIClient.generateQuery with evaluator flag: ${useEvaluatorOptimizer}`
        )

        // Use the UI Generator API Client via Effect-TS
        const result = await Effect.runPromise(
          Effect.gen(function* () {
            return yield* uiGenerator.generateQuery({
              path: {
                id: path.id || `path-${Date.now()}`,
                name: path.name || 'Critical Path',
                services: path.services || [],
                startService: path.startService || path.services?.[0],
                endService: path.endService || path.services?.[path.services.length - 1]
              },
              analysisGoal: analysisGoal || determineAnalysisGoal(path?.metrics),
              model: model, // Model will be determined by Portkey config defaults
              isClickHouseAI: isClickHouseAI, // Pass ClickHouse AI flag
              useEvaluatorOptimizer: useEvaluatorOptimizer // Pass evaluator flag
            })
          })
        )

        // Add timeWindow context to the SQL if specified
        let sql = result.sql
        if (timeWindowMinutes && timeWindowMinutes !== 60) {
          // Replace default time window in the generated SQL
          sql = sql.replace(/INTERVAL \d+ MINUTE/g, `INTERVAL ${timeWindowMinutes} MINUTE`)
        }

        return res.json({
          sql,
          model: result.model,
          description: result.description,
          generationTimeMs: result.generationTimeMs,
          analysisType: determineAnalysisType(result.description),
          // Include optimization status if evaluator was used
          optimizationStatus: result.evaluations
            ? {
                wasOptimized: result.evaluations.length > 0,
                evaluationCount: result.evaluations.length
              }
            : undefined,
          evaluations: result.evaluations,
          timeWindowMinutes: timeWindowMinutes
        })
      } catch (error) {
        console.error('❌ Error generating query:', error)
        res.status(500).json({
          error: 'Query generation failed',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
        return
      }
    })

    // Get available models for UI generator
    router.get('/api/ui-generator/models', async (_req, res) => {
      try {
        // Get actually loaded models from the LLM Manager using Effect-TS
        const loadedModels = await Effect.runPromise(llmManager.getLoadedModels())

        // Map to UI-friendly format
        const models = loadedModels.map((model) => ({
          name: model.id,
          provider: model.provider,
          description: `${model.provider.charAt(0).toUpperCase() + model.provider.slice(1)} - ${
            model.capabilities?.includes('sql')
              ? 'SQL optimized'
              : model.capabilities?.includes('general')
                ? 'General purpose'
                : 'Specialized model'
          }`,
          available: model.status === 'available',
          availabilityReason:
            model.status === 'available'
              ? 'Model loaded and healthy'
              : `Model status: ${model.status}`,
          capabilities: {
            json: model.capabilities?.includes('general') || false,
            sql: model.capabilities?.includes('sql') || false,
            reasoning: ['anthropic', 'openai'].includes(model.provider),
            functions: model.provider === 'openai',
            streaming: true // Most modern models support streaming
          },
          contextLength: model.metadata?.contextLength || 0,
          maxTokens: model.metadata?.maxTokens || 0,
          temperature: model.config?.temperature || 0.7,
          metrics: model.metrics
        }))

        // Add rule-based option at the start (always available)
        models.unshift({
          name: 'rule-based',
          provider: 'local',
          description: 'Rule-based query generation - fast and reliable',
          available: true,
          availabilityReason: 'Built-in rule engine',
          capabilities: {
            sql: true,
            reasoning: false,
            json: false,
            functions: false,
            streaming: false
          },
          contextLength: 0,
          maxTokens: 0,
          temperature: 0,
          metrics: undefined
        })

        res.json({
          models,
          totalModels: models.length,
          availableCount: models.filter((m) => m.available).length,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        console.error('❌ Error getting UI generator models:', error)
        res.status(500).json({
          error: 'Failed to get models',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    return UIGeneratorRouterTag.of({ router })
  })
)
