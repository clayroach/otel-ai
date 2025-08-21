/**
 * Metrics Service Implementation
 * 
 * Simple metrics collection for LLM operations.
 */

import { Effect, Layer } from 'effect'
import { LLMRequest, LLMResponse, LLMError, ModelType } from './types.js'
import { LLMMetricsService } from './services.js'

interface RequestMetric {
  timestamp: number
  model: ModelType
  taskType: string
  tokens: number
}

interface ResponseMetric {
  timestamp: number
  model: ModelType
  latency: number
  tokens: number
  cost: number
  cached: boolean
}

interface ErrorMetric {
  timestamp: number
  model: ModelType
  errorType: string
  message: string
}

/**
 * In-Memory Metrics Implementation
 */
export const makeMetricsService = () =>
  Effect.gen(function* (_) {
    const requests: RequestMetric[] = []
    const responses: ResponseMetric[] = []
    const errors: ErrorMetric[] = []

    return {
      recordRequest: (model: ModelType, request: LLMRequest) =>
        Effect.gen(function* (_) {
          requests.push({
            timestamp: Date.now(),
            model,
            taskType: request.taskType,
            tokens: request.preferences?.maxTokens || 0
          })
        }),

      recordResponse: (model: ModelType, response: LLMResponse) =>
        Effect.gen(function* (_) {
          responses.push({
            timestamp: Date.now(),
            model,
            latency: response.metadata.latencyMs,
            tokens: response.usage.totalTokens,
            cost: response.usage.cost || 0,
            cached: response.metadata.cached
          })
        }),

      recordError: (model: ModelType, error: LLMError) =>
        Effect.gen(function* (_) {
          errors.push({
            timestamp: Date.now(),
            model,
            errorType: error._tag,
            message: 'message' in error ? error.message : `${error._tag} error`
          })
        }),

      getMetrics: () =>
        Effect.succeed({
          totalRequests: requests.length,
          totalErrors: errors.length,
          averageLatency: responses.length > 0 
            ? responses.reduce((sum, r) => sum + r.latency, 0) / responses.length 
            : 0,
          totalCost: responses.reduce((sum, r) => sum + r.cost, 0),
          requestsByModel: requests.reduce((acc, r) => {
            acc[r.model] = (acc[r.model] || 0) + 1
            return acc
          }, {} as Record<ModelType, number>)
        })
    }
  })

/**
 * Metrics Service Layer
 */
export const MetricsLayer = Layer.effect(
  LLMMetricsService,
  makeMetricsService()
)