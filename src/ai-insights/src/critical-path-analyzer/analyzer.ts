/**
 * Critical Path Analyzer Service
 *
 * LLM-powered critical path discovery from service topology.
 * Identifies 5-10 business-critical request paths with fallback to statistical analysis.
 */

import { Effect, Context, Layer, Array as EffectArray } from 'effect'
import { Schema } from '@effect/schema'
import { LLMManagerServiceTag } from '../../../llm-manager/index.js'
import { CriticalPath, CriticalPathDiscoveryError, ServiceMetrics } from '../types.js'
import { CRITICAL_PATH_IDENTIFICATION_PROMPT } from './prompts.js'
import { statisticalPathDiscovery, calculatePathMetrics } from './path-discovery.js'
import { classifySeverity } from './severity-classifier.js'

/**
 * Service interface for Critical Path Discovery
 */
export interface CriticalPathAnalyzer {
  readonly discoverCriticalPaths: (params: {
    topology: ReadonlyArray<ServiceMetrics>
    timeRange: { startTime: Date; endTime: Date }
  }) => Effect.Effect<ReadonlyArray<CriticalPath>, CriticalPathDiscoveryError, never>

  readonly analyzePath: (
    services: ReadonlyArray<string>
  ) => Effect.Effect<CriticalPath, CriticalPathDiscoveryError, never>
}

export const CriticalPathAnalyzerTag =
  Context.GenericTag<CriticalPathAnalyzer>('CriticalPathAnalyzer')

/**
 * LLM response schema for critical path discovery
 */
const LLMCriticalPathResponseSchema = Schema.Struct({
  paths: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      description: Schema.String,
      services: Schema.Array(Schema.String),
      priority: Schema.Literal('critical', 'high', 'medium', 'low'),
      severity: Schema.Number.pipe(Schema.between(0, 1))
    })
  )
})

/**
 * Live implementation of Critical Path Analyzer
 */
export const CriticalPathAnalyzerLive = Layer.effect(
  CriticalPathAnalyzerTag,
  Effect.gen(function* () {
    const llmManager = yield* LLMManagerServiceTag

    console.log('🔍 Critical Path Analyzer initialized')

    const discoverCriticalPaths = (params: {
      topology: ReadonlyArray<ServiceMetrics>
      timeRange: { startTime: Date; endTime: Date }
    }) =>
      Effect.gen(function* () {
        const { topology, timeRange } = params

        console.log(`🔍 Discovering critical paths with LLM analysis (${topology.length} services)`)

        // Build the prompt with topology data
        const prompt = CRITICAL_PATH_IDENTIFICATION_PROMPT(topology)

        // Use LLM to analyze and identify critical paths
        const llmResult = yield* llmManager
          .generate({
            prompt,
            taskType: 'general',
            preferences: {
              maxTokens: 2000,
              temperature: 0.1 // Low temperature for consistent path identification
            }
          })
          .pipe(
            Effect.flatMap((response) => {
              // Extract JSON from response content
              const jsonMatch = response.content.match(/```json\s*([\s\S]*?)\s*```/)
              const jsonStr = jsonMatch?.[1] ?? response.content

              try {
                const json = JSON.parse(jsonStr)
                return Schema.decodeUnknown(LLMCriticalPathResponseSchema)(json)
              } catch {
                // Return statistical fallback on parse error
                return Effect.succeed({
                  paths: statisticalPathDiscovery(topology)
                })
              }
            }),
            Effect.catchAll((error) => {
              console.warn('⚠️ LLM critical path discovery failed, using statistical fallback')
              console.error('Error details:', error)
              // Return statistical fallback result
              return Effect.succeed({
                paths: statisticalPathDiscovery(topology)
              })
            })
          )

        // Enrich paths with real metrics and proper structure
        const enrichedPaths: ReadonlyArray<CriticalPath> = EffectArray.map(
          llmResult.paths as ReadonlyArray<{
            name: string
            description: string
            services: string[]
            priority: 'critical' | 'high' | 'medium' | 'low'
            severity: number
          }>,
          (
            path: {
              name: string
              description: string
              services: string[]
              priority: 'critical' | 'high' | 'medium' | 'low'
              severity: number
            },
            index
          ): CriticalPath => {
            // Build edges from services array
            const edges = EffectArray.zipWith(
              path.services.slice(0, -1),
              path.services.slice(1),
              (source, target) => ({ source, target })
            )

            // Calculate metrics from topology
            const metrics = calculatePathMetrics(path.services, topology)

            return {
              id: `path-${index + 1}`,
              name: path.name,
              description: path.description,
              services: path.services,
              startService: path.services[0] || 'unknown',
              endService: path.services[path.services.length - 1] || 'unknown',
              edges,
              metrics,
              priority: path.priority,
              severity: classifySeverity(metrics, path.priority),
              lastUpdated: new Date(),
              metadata: {
                discoveredBy: 'llm',
                timeRange: {
                  startTime: timeRange.startTime.toISOString(),
                  endTime: timeRange.endTime.toISOString()
                }
              }
            }
          }
        )

        console.log(`✅ Discovered ${enrichedPaths.length} critical paths`)

        return enrichedPaths
      })

    const analyzePath = (services: ReadonlyArray<string>) => {
      // For custom path analysis, we need topology data
      // This is a simplified implementation
      const edges = EffectArray.zipWith(
        services.slice(0, -1),
        services.slice(1),
        (source, target) => ({ source, target })
      )

      return Effect.succeed({
        id: 'custom',
        name: 'Custom Path',
        description: 'User-defined critical path',
        services,
        startService: services[0] || 'unknown',
        endService: services[services.length - 1] || 'unknown',
        edges,
        metrics: {
          requestCount: 0,
          avgLatency: 0,
          errorRate: 0,
          p99Latency: 0
        },
        priority: 'medium' as const,
        severity: 0.5,
        lastUpdated: new Date()
      })
    }

    return CriticalPathAnalyzerTag.of({
      discoverCriticalPaths,
      analyzePath
    })
  })
)
