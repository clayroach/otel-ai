/**
 * Model Router Implementation
 *
 * Intelligent routing of LLM requests based on task type, performance,
 * cost optimization, and availability with fallback strategies.
 */

import { Effect, Layer } from 'effect'
import { ModelRouterService, ModelClientService, LLMConfigService } from './services.js'
import { LLMRequest, ModelType, TaskType, LLMConfig, ModelClient } from './types.js'

/**
 * Map generic model types to actual model names
 * This is a bridge function to support the transition from hardcoded types to dynamic model loading
 */
const mapGenericToActualModel = (
  genericType: string,
  clients: { gpt?: ModelClient; claude?: ModelClient; llama?: ModelClient }
): string => {
  // For now, return actual model names based on what's available
  if (genericType === 'claude' && clients.claude) {
    return (
      process.env.LLM_GENERAL_MODEL_1 || process.env.CLAUDE_MODEL || 'claude-3-7-sonnet-20250219'
    )
  }
  if (genericType === 'gpt' && clients.gpt) {
    return process.env.LLM_GENERAL_MODEL_2 || process.env.OPENAI_MODEL || 'gpt-3.5-turbo'
  }
  if (genericType === 'llama' && clients.llama) {
    return process.env.LLM_SQL_MODEL_1 || 'sqlcoder-7b-2'
  }
  return genericType // fallback to original if no mapping found
}

/**
 * Enhanced Task-Based Routing Strategy
 *
 * Defines preferred models for different task types based on their strengths,
 * including new AI-native tasks like market intelligence and architectural insights.
 */
const TASK_ROUTING: Record<
  TaskType,
  { preferred: string; fallback: string[]; multiModel?: boolean; reasoning?: string }
> = {
  analysis: {
    preferred: 'claude', // Best for analytical tasks
    fallback: ['gpt', 'llama'],
    reasoning: 'Claude excels at structured analysis and reasoning'
  },
  'ui-generation': {
    preferred: 'gpt', // Best for code generation
    fallback: ['claude', 'llama'],
    reasoning: 'GPT has superior code generation capabilities'
  },
  'config-management': {
    preferred: 'llama', // Cost-effective for structured tasks
    fallback: ['gpt', 'claude'],
    reasoning: 'Local model is cost-effective for structured configuration tasks'
  },
  'market-intelligence': {
    preferred: 'gpt', // Best for business analysis and market insights
    fallback: ['claude', 'llama'],
    multiModel: true, // Can benefit from multiple perspectives
    reasoning: 'GPT excels at business strategy and market analysis'
  },
  'architectural-insights': {
    preferred: 'claude', // Best for technical architecture analysis
    fallback: ['gpt', 'llama'],
    multiModel: true, // Multiple technical perspectives valuable
    reasoning: 'Claude provides superior architectural reasoning and system design insights'
  },
  'anomaly-detection': {
    preferred: 'claude', // Best for pattern recognition and analysis
    fallback: ['gpt', 'llama'],
    reasoning: 'Claude excels at pattern recognition and anomaly explanation'
  },
  general: {
    preferred: 'llama', // Start with local model for cost efficiency
    fallback: ['gpt', 'claude'],
    reasoning: 'Local model provides cost-effective general purpose responses'
  }
}

/**
 * Model Performance Tracker
 *
 * Tracks model performance metrics for intelligent routing decisions.
 */
interface ModelPerformance {
  averageLatency: number
  successRate: number
  requestCount: number
  lastUpdated: number
}

/**
 * Create Model Router
 *
 * Creates an intelligent model router that selects optimal models based on
 * configuration, performance, and availability.
 */
export const makeModelRouter = (
  config: LLMConfig,
  clients: {
    gpt?: ModelClient
    claude?: ModelClient
    llama?: ModelClient
  }
) =>
  Effect.succeed({
    performanceTracker: new Map<ModelType, ModelPerformance>()
  }).pipe(
    Effect.map(({ performanceTracker }) => ({
      selectModel: (request: LLMRequest) =>
        Effect.gen(function* (_) {
          // If user has model preference, use it if available
          if (request.preferences?.model) {
            const preferredModel = request.preferences.model
            const isAvailable = yield* _(isModelAvailable(preferredModel, clients))

            if (isAvailable) {
              return preferredModel
            }

            // Log preference override
            yield* _(
              Effect.log(
                `Preferred model ${preferredModel} unavailable, falling back to routing strategy`
              )
            )
          }

          // Use task-based routing
          const taskRouting = TASK_ROUTING[request.taskType]
          const preferredModel = taskRouting.preferred

          // Map generic model type to actual model name and check availability
          const actualPreferredModel = mapGenericToActualModel(preferredModel, clients)
          const isPreferredAvailable = yield* _(isModelAvailable(preferredModel, clients))
          if (isPreferredAvailable) {
            return actualPreferredModel // Return actual model name, not generic type
          }

          // Try fallback models in order
          for (const fallbackModel of taskRouting.fallback) {
            const actualFallbackModel = mapGenericToActualModel(fallbackModel, clients)
            const isAvailable = yield* _(isModelAvailable(fallbackModel, clients))
            if (isAvailable) {
              yield* _(
                Effect.log(
                  `Using fallback model ${actualFallbackModel} (${fallbackModel}) for task ${request.taskType}`
                )
              )
              return actualFallbackModel // Return actual model name, not generic type
            }
          }

          // If no models are available, fail
          return yield* _(
            Effect.fail({
              _tag: 'ModelUnavailable' as const,
              model: 'all',
              message: 'No available models for request'
            })
          )
        }),

      routeRequest: (request: LLMRequest) =>
        Effect.gen(function* (_) {
          // Use internal selectModel function directly
          const selectedModel = yield* _(
            Effect.gen(function* (_) {
              // If user has model preference, use it if available
              if (request.preferences?.model) {
                const preferredModel = request.preferences.model
                const isAvailable = yield* _(isModelAvailable(preferredModel, clients))

                if (isAvailable) {
                  return preferredModel
                }

                // Log preference override
                yield* _(
                  Effect.log(
                    `Preferred model ${preferredModel} unavailable, falling back to routing strategy`
                  )
                )
              }

              // Use task-based routing
              const taskRouting = TASK_ROUTING[request.taskType]
              const preferredModel = taskRouting.preferred

              // Map generic model type to actual model name and check availability
              const actualPreferredModel = mapGenericToActualModel(preferredModel, clients)
              const isPreferredAvailable = yield* _(isModelAvailable(preferredModel, clients))
              if (isPreferredAvailable) {
                return actualPreferredModel // Return actual model name, not generic type
              }

              // Try fallback models in order
              for (const fallbackModel of taskRouting.fallback) {
                const actualFallbackModel = mapGenericToActualModel(fallbackModel, clients)
                const isAvailable = yield* _(isModelAvailable(fallbackModel, clients))
                if (isAvailable) {
                  yield* _(
                    Effect.log(
                      `Using fallback model ${actualFallbackModel} (${fallbackModel}) for task ${request.taskType}`
                    )
                  )
                  return actualFallbackModel // Return actual model name, not generic type
                }
              }

              // If no models are available, fail
              return yield* _(
                Effect.fail({
                  _tag: 'ModelUnavailable' as const,
                  model: 'all',
                  message: 'No available models for request'
                })
              )
            })
          )

          // Get the appropriate client based on actual model name
          let modelClient: ModelClient | undefined

          if (selectedModel.includes('claude')) {
            modelClient = clients.claude
          } else if (selectedModel.includes('gpt')) {
            modelClient = clients.gpt
          } else {
            // Local model (sqlcoder, codellama, etc.)
            modelClient = clients.llama
          }

          if (!modelClient) {
            return yield* _(
              Effect.fail({
                _tag: 'ConfigurationError' as const,
                message: `Model ${selectedModel} client not configured`
              })
            )
          }

          // Execute request with performance tracking
          const startTime = Date.now()

          const response = yield* _(
            modelClient.generate(request).pipe(
              Effect.tapBoth({
                onFailure: (error) =>
                  Effect.gen(function* (_) {
                    const latency = Date.now() - startTime
                    yield* _(
                      updateModelPerformance(selectedModel, latency, false, performanceTracker)
                    )
                    yield* _(Effect.log(`Model ${selectedModel} failed: ${JSON.stringify(error)}`))
                  }),
                onSuccess: (_response) =>
                  Effect.gen(function* (_) {
                    const latency = Date.now() - startTime
                    yield* _(
                      updateModelPerformance(selectedModel, latency, true, performanceTracker)
                    )
                    yield* _(Effect.log(`Model ${selectedModel} responded in ${latency}ms`))
                  })
              })
            )
          )

          return response
        }),

      getFallbackChain: (failedModel: ModelType) =>
        Effect.succeed(
          (() => {
            // Find task routing that includes the failed model
            const taskRoutings = Object.entries(TASK_ROUTING)

            for (const [, routing] of taskRoutings) {
              if (routing.preferred === failedModel || routing.fallback.includes(failedModel)) {
                // Return remaining models in fallback chain
                const remainingModels = routing.fallback.filter((model) => model !== failedModel)
                if (routing.preferred !== failedModel) {
                  remainingModels.unshift(routing.preferred)
                }
                return remainingModels
              }
            }

            // Default fallback chain excluding failed model
            const allModels: ModelType[] = ['llama', 'gpt', 'claude']
            return allModels.filter((model) => model !== failedModel)
          })()
        ),

      updateModelPerformance: (model: ModelType, latencyMs: number, success: boolean) =>
        updateModelPerformance(model, latencyMs, success, performanceTracker)
    }))
  )

/**
 * Check Model Availability
 *
 * Checks if a specific model is configured and healthy.
 */
const isModelAvailable = (
  model: ModelType,
  clients: {
    gpt?: ModelClient
    claude?: ModelClient
    llama?: ModelClient
  }
) =>
  Effect.gen(function* (_) {
    // Map actual model names to client types
    let client: ModelClient | undefined

    if (model.includes('claude')) {
      client = clients.claude
    } else if (model.includes('gpt')) {
      client = clients.gpt
    } else {
      // Local model (sqlcoder, codellama, etc.)
      client = clients.llama
    }

    if (!client) {
      return false
    }

    // Quick health check with short timeout
    const isHealthy = yield* _(
      client.isHealthy().pipe(
        Effect.timeout(5000), // 5 second timeout
        Effect.orElse(() => Effect.succeed(false))
      )
    )

    return isHealthy
  })

/**
 * Update Model Performance
 *
 * Updates performance tracking metrics for routing decisions.
 */
const updateModelPerformance = (
  model: ModelType,
  latencyMs: number,
  success: boolean,
  tracker: Map<ModelType, ModelPerformance>
) =>
  Effect.gen(function* (_) {
    const current = tracker.get(model) ?? {
      averageLatency: 0,
      successRate: 1.0,
      requestCount: 0,
      lastUpdated: Date.now()
    }

    // Update metrics using exponential moving average
    const alpha = 0.1 // Smoothing factor
    const newRequestCount = current.requestCount + 1

    const newPerformance: ModelPerformance = {
      averageLatency: current.averageLatency + alpha * (latencyMs - current.averageLatency),
      successRate: current.successRate + alpha * ((success ? 1 : 0) - current.successRate),
      requestCount: newRequestCount,
      lastUpdated: Date.now()
    }

    tracker.set(model, newPerformance)

    yield* _(
      Effect.log(
        `Updated ${model} performance: ${Math.round(newPerformance.averageLatency)}ms avg, ${Math.round(newPerformance.successRate * 100)}% success`
      )
    )
  })

/**
 * Get Performance Metrics
 *
 * Retrieves current performance metrics for all models.
 */
export const getPerformanceMetrics = (tracker: Map<ModelType, ModelPerformance>) =>
  Effect.succeed(Object.fromEntries(tracker.entries()))

/**
 * Model Router Layer
 *
 * Effect-TS Layer for dependency injection of the Model Router service.
 */
export const ModelRouterLayer = Layer.effect(
  ModelRouterService,
  Effect.gen(function* (_) {
    const configService = yield* _(LLMConfigService)
    const config = yield* _(configService.getConfig())
    const clientService = yield* _(ModelClientService)

    // Convert service to simple object for router
    const clients: {
      gpt?: ModelClient
      claude?: ModelClient
      llama?: ModelClient
    } = {}

    if (clientService.gpt) {
      clients.gpt = clientService.gpt
    }
    if (clientService.claude) {
      clients.claude = clientService.claude
    }
    if (clientService.llama) {
      clients.llama = clientService.llama
    }

    return yield* _(makeModelRouter(config, clients))
  })
)
