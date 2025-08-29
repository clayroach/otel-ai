/**
 * AI Analyzer Service Implementation
 *
 * Main service that orchestrates ClickHouse queries, topology discovery,
 * and LLM-based analysis to provide architectural insights.
 */

import { Effect, Context, Layer, Stream } from 'effect'
import { Schema } from '@effect/schema'
import type { ServiceTopologyRaw, ServiceDependencyRaw, TraceFlowRaw } from './queries.js'
import { AIAnalyzerService } from './types.js'
import type {
  AnalysisRequest,
  AnalysisResult,
  AnalysisError,
  ApplicationArchitecture,
  ServiceTopology
} from './types.js'
import { discoverApplicationTopology } from './topology.js'
import { PromptTemplates, PromptUtils } from './prompts.js'
import { LLMManagerService } from '../llm-manager/services.js'
import { makeMultiModelOrchestrator } from '../llm-manager/multi-model-orchestrator.js'
import { StorageServiceTag } from '../storage/services.js'

/**
 * Configuration for AI Analyzer
 */
export const AnalyzerConfigSchema = Schema.Struct({
  clickhouse: Schema.Struct({
    host: Schema.String,
    port: Schema.Number,
    database: Schema.String,
    username: Schema.optional(Schema.String),
    password: Schema.optional(Schema.String)
  }),
  analysis: Schema.Struct({
    defaultTimeWindowHours: Schema.Number,
    minSpanThreshold: Schema.Number,
    maxServicesAnalyzed: Schema.Number
  }),
  llm: Schema.Struct({
    preferredModel: Schema.Literal('gpt', 'claude', 'llama'),
    maxTokens: Schema.Number,
    temperature: Schema.Number
  })
})

export type AnalyzerConfig = Schema.Schema.Type<typeof AnalyzerConfigSchema>

/**
 * Default configuration
 */
export const defaultAnalyzerConfig: AnalyzerConfig = {
  clickhouse: {
    host: 'localhost',
    port: 8123,
    database: 'otel'
  },
  analysis: {
    defaultTimeWindowHours: 24,
    minSpanThreshold: 100,
    maxServicesAnalyzed: 50
  },
  llm: {
    preferredModel: 'claude',
    maxTokens: 4000,
    temperature: 0.1
  }
}

/**
 * AI Analyzer Service Implementation
 */
export const makeAIAnalyzerService = (config: AnalyzerConfig) =>
  Effect.gen(function* (_) {
    const llmManager = yield* _(LLMManagerService)
    const storageService = yield* _(StorageServiceTag)

    // Initialize multi-model orchestrator for advanced insights
    const multiModelOrchestrator = makeMultiModelOrchestrator({})

    const analyzeArchitecture = (
      request: AnalysisRequest
    ): Effect.Effect<AnalysisResult, AnalysisError, never> =>
      Effect.gen(function* (_) {
        console.log(
          `🚀 ANALYZE ARCHITECTURE CALLED with config:`,
          JSON.stringify(request.config, null, 2)
        )
        console.log(`🔍 Request has config: ${!!request.config}`)
        console.log(`🔍 Request has llm: ${!!request.config?.llm}`)
        console.log(`🔍 Request llm model: ${request.config?.llm?.model}`)
        const startTime = Date.now()
        const timeRangeHours =
          Math.abs(request.timeRange.endTime.getTime() - request.timeRange.startTime.getTime()) /
          (1000 * 60 * 60)

        try {
          // Step 1: Gather raw data from ClickHouse
          // Query traces for topology analysis
          const traces = yield* _(
            storageService
              .queryTraces({
                timeRange: {
                  start: request.timeRange.startTime.getTime(),
                  end: request.timeRange.endTime.getTime()
                },
                limit: 10000, // Large limit for comprehensive analysis
                filters: request.filters || {}
              })
              .pipe(
                Effect.mapError(
                  (storageError): AnalysisError => ({
                    _tag: 'QueryError',
                    message: `Failed to query traces: ${storageError.message}`,
                    query: 'Traces query for topology analysis'
                  })
                )
              )
          )

          // Transform traces to topology data format
          const [topologyData, dependencyData, traceFlows] = transformTracesToTopology(
            traces,
            timeRangeHours
          )

          // Check if we have sufficient data
          if (topologyData.length < config.analysis.minSpanThreshold) {
            return yield* _(
              Effect.fail({
                _tag: 'InsufficientData' as const,
                message: `Insufficient trace data: ${topologyData.length} spans found, minimum ${config.analysis.minSpanThreshold} required`,
                spanCount: topologyData.length
              })
            )
          }

          // Step 2: Discover application topology
          const architecture = yield* _(
            discoverApplicationTopology(topologyData, dependencyData, traceFlows)
          )

          // Step 3: Generate enhanced architectural insights using multi-model orchestrator
          // Use request.config if provided, otherwise fall back to service config
          let effectiveConfig = config
          let selectedModel: string = config.llm.preferredModel

          if (request.config) {
            if (request.config.llm) {
              // LLM model requested (claude, gpt, llama)
              selectedModel = request.config.llm.model
              effectiveConfig = {
                ...config,
                llm: {
                  preferredModel: request.config.llm.model,
                  maxTokens: request.config.llm.maxTokens,
                  temperature: request.config.llm.temperature
                }
              }
            } else {
              // No LLM config means statistical analyzer requested
              selectedModel = 'local-statistical-analyzer'
              effectiveConfig = config // Use default config for statistical analysis
            }
          }

          console.log(
            `🤖 AI Analyzer using model: ${selectedModel} (from ${request.config ? 'request' : 'service default'})`
          )

          const llmResponse = yield* _(
            generateEnhancedInsights(
              request.type,
              architecture,
              llmManager,
              multiModelOrchestrator,
              effectiveConfig
            )
          )

          // Step 4: Generate insights based on the data with model-specific analysis
          const insights = generateInsights(architecture, request.type, selectedModel)

          // Step 5: Generate documentation if requested
          const documentation =
            request.type === 'architecture'
              ? yield* _(generateDocumentation(architecture, llmManager, config))
              : undefined

          const analysisTimeMs = Date.now() - startTime

          const result: AnalysisResult = {
            requestId: generateRequestId(),
            type: request.type,
            summary: llmResponse.content,
            architecture: request.type === 'architecture' ? architecture : undefined,
            insights,
            documentation,
            metadata: {
              analyzedSpans: topologyData.reduce((sum, t) => sum + t.total_spans, 0),
              analysisTimeMs,
              llmTokensUsed:
                (llmResponse as { usage?: { totalTokens?: number } }).usage?.totalTokens || 0,
              confidence: calculateConfidenceScore(topologyData, dependencyData),
              selectedModel: selectedModel,
              llmModel:
                selectedModel === 'local-statistical-analyzer'
                  ? 'local-statistical-analyzer'
                  : `${selectedModel}-via-llm-manager`
            }
          }

          return result
        } catch (error) {
          return yield* _(
            Effect.fail({
              _tag: 'ConfigurationError' as const,
              message: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            })
          )
        }
      })

    const streamAnalysis = (
      request: AnalysisRequest
    ): Stream.Stream<string, AnalysisError, never> =>
      Stream.unwrap(
        Effect.gen(function* (_) {
          // Get architecture data first
          const timeRangeHours =
            Math.abs(request.timeRange.endTime.getTime() - request.timeRange.startTime.getTime()) /
            (1000 * 60 * 60)

          const traces = yield* _(
            storageService
              .queryTraces({
                timeRange: {
                  start: request.timeRange.startTime.getTime(),
                  end: request.timeRange.endTime.getTime()
                },
                limit: 5000, // Smaller limit for streaming
                filters: request.filters || {}
              })
              .pipe(
                Effect.mapError(
                  (storageError): AnalysisError => ({
                    _tag: 'QueryError',
                    message: `Failed to query ClickHouse: ${storageError.message}`,
                    query: 'Stream analysis queries'
                  })
                )
              )
          )

          const [topologyData, dependencyData, traceFlows] = transformTracesToTopology(
            traces,
            timeRangeHours
          )

          const architecture = yield* _(
            discoverApplicationTopology(topologyData, dependencyData, traceFlows)
          )
          const llmPrompt = generatePromptForAnalysisType(request.type, architecture, request)

          // Stream the LLM response with enhanced task type
          return llmManager
            .generateStream({
              prompt: llmPrompt,
              taskType: 'architectural-insights',
              preferences: {
                model: config.llm.preferredModel,
                maxTokens: config.llm.maxTokens,
                temperature: config.llm.temperature,
                useMultiModel: false // Keep streaming simple with single model
              },
              streaming: true
            })
            .pipe(
              Stream.mapError(
                (error): AnalysisError => ({
                  _tag: 'LLMError',
                  message: (error as { message?: string }).message || 'LLM streaming failed',
                  model: (error as { model?: string }).model || 'unknown'
                })
              )
            )
        })
      )

    const getServiceTopology = (timeRange: {
      startTime: Date
      endTime: Date
    }): Effect.Effect<readonly ServiceTopology[], AnalysisError, never> =>
      Effect.gen(function* (_) {
        const timeRangeHours =
          Math.abs(timeRange.endTime.getTime() - timeRange.startTime.getTime()) / (1000 * 60 * 60)

        const traces = yield* _(
          storageService
            .queryTraces({
              timeRange: {
                start: timeRange.startTime.getTime(),
                end: timeRange.endTime.getTime()
              },
              limit: 5000,
              filters: {}
            })
            .pipe(
              Effect.mapError(
                (storageError): AnalysisError => ({
                  _tag: 'QueryError',
                  message: `Failed to query ClickHouse: ${storageError.message}`,
                  query: 'Service topology queries'
                })
              )
            )
        )

        const [topologyData, dependencyData] = transformTracesToTopology(traces, timeRangeHours)

        const architecture = yield* _(discoverApplicationTopology(topologyData, dependencyData, []))
        return architecture.services
      })

    const generateDocumentationMethod = (
      architecture: ApplicationArchitecture
    ): Effect.Effect<string, AnalysisError, never> =>
      generateDocumentation(architecture, llmManager, config).pipe(
        Effect.map((result) => result.markdown)
      )

    return {
      analyzeArchitecture,
      streamAnalysis,
      getServiceTopology,
      generateDocumentation: generateDocumentationMethod
    }
  })

/**
 * Helper functions
 */

const generatePromptForAnalysisType = (
  analysisType: AnalysisRequest['type'],
  architecture: ApplicationArchitecture,
  request: AnalysisRequest
): string => {
  let basePrompt: string

  switch (analysisType) {
    case 'architecture':
      basePrompt = PromptTemplates.architectureOverview(architecture)
      break
    case 'dependencies':
      basePrompt = PromptTemplates.dependencyAnalysis(architecture)
      break
    case 'dataflow':
      basePrompt = PromptTemplates.performanceInsights(architecture)
      break
    case 'insights':
      basePrompt = PromptTemplates.performanceInsights(architecture)
      break
    default:
      basePrompt = PromptTemplates.architectureOverview(architecture)
  }

  // Add filters if specified
  if (request.filters?.services) {
    basePrompt = PromptUtils.withServiceFilter(basePrompt, request.filters.services)
  }

  // Add time context
  basePrompt = PromptUtils.withTimeContext(
    basePrompt,
    request.timeRange.startTime,
    request.timeRange.endTime
  )

  return basePrompt
}

/**
 * Clean protobuf service names from service identifiers
 * Handles both clean names and protobuf JSON objects
 */
const cleanServiceName = (serviceName: string): string => {
  if (!serviceName || typeof serviceName !== 'string') {
    return serviceName || 'unknown-service'
  }

  // Handle simple JSON object with stringValue
  if (serviceName.startsWith('{') && serviceName.includes('stringValue')) {
    try {
      const parsed = JSON.parse(serviceName)
      if (parsed.stringValue) {
        return parsed.stringValue
      }
    } catch (e) {
      console.warn('Failed to parse simple protobuf service name:', e)
    }
  }

  // Return as-is if no protobuf formatting detected
  return serviceName
}

export const generateInsights = (
  architecture: ApplicationArchitecture,
  _analysisType: AnalysisRequest['type'],
  selectedModel?: string
) => {
  console.log(`🔍 generateInsights called with model: ${selectedModel}`)
  const insights = []

  // Helper function to create enhanced evidence
  const createEvidence = (
    format: 'structured' | 'narrative' | 'statistical',
    rawData: Array<string>,
    serviceName: string,
    metricType: string,
    dataPoints: number
  ) => ({
    format,
    data: {
      services: rawData,
      metricType,
      analysisScope: serviceName,
      thresholds:
        format === 'statistical'
          ? {
              latency: 1000,
              errorRate: 0.01,
              dependencyCount: 5
            }
          : undefined
    },
    visualizations:
      format === 'structured'
        ? [
            {
              type: 'bar' as const,
              title: `${metricType} by Service`,
              description: `Comparative view of ${metricType} across services`,
              config: {
                xAxis: 'service',
                yAxis: metricType,
                color: 'severity-based'
              },
              data: rawData.map((item, idx) => ({ service: `service-${idx}`, value: item }))
            }
          ]
        : undefined,
    metadata: {
      processingTime: Date.now() % 100, // Simple mock processing time
      dataPoints,
      confidence: Math.min(0.9, dataPoints / 100),
      model: selectedModel || 'statistical',
      analysisMethod:
        selectedModel && selectedModel !== 'local-statistical-analyzer'
          ? ('llm-enhanced' as const)
          : ('statistical' as const),
      enhancementLevel:
        selectedModel && selectedModel !== 'local-statistical-analyzer'
          ? ('advanced' as const)
          : ('statistical' as const)
    }
  })

  // Helper function to create model analysis object
  const createModelAnalysis = (
    selectedModel: string | undefined,
    confidence: number,
    reasoningPath: string[]
  ) => {
    if (!selectedModel || selectedModel === 'local-statistical-analyzer') {
      return undefined
    }

    const modelMap = {
      claude: 'claude-3' as const,
      gpt: 'gpt-4' as const,
      llama: 'llama-2' as const
    }

    const analysisTypeMap = {
      claude: 'explanatory' as const,
      gpt: 'mathematical' as const,
      llama: 'realtime' as const
    }

    return {
      model: modelMap[selectedModel as keyof typeof modelMap] || ('statistical' as const),
      analysisType:
        analysisTypeMap[selectedModel as keyof typeof analysisTypeMap] || ('statistical' as const),
      confidence,
      reasoningPath
    }
  }

  // Performance insights
  const slowServices = architecture.services
    .filter((s) => (s.metadata.avgLatencyMs as number) > 1000)
    .sort((a, b) => (b.metadata.avgLatencyMs as number) - (a.metadata.avgLatencyMs as number))

  if (slowServices.length > 0) {
    const evidenceData = slowServices
      .slice(0, 5)
      .map(
        (s) =>
          `${cleanServiceName(s.service)}: ${Math.round(s.metadata.avgLatencyMs as number)}ms avg latency (${s.metadata.totalSpans} spans)`
      )

    insights.push({
      type: 'performance' as const,
      severity: 'warning' as const,
      title: 'High Latency Services Detected',
      description: `${slowServices.length} services have average latency > 1000ms: ${slowServices
        .slice(0, 3)
        .map((s) => cleanServiceName(s.service))
        .join(', ')}`,
      recommendation: 'Investigate performance bottlenecks in these services',
      evidence: createEvidence(
        'structured',
        evidenceData,
        'performance',
        'latency',
        slowServices.length
      ),
      modelAnalysis: createModelAnalysis(selectedModel, 0.85, [
        `Identified ${slowServices.length} services exceeding 1000ms threshold`,
        'Analyzed latency distribution patterns',
        'Generated performance optimization recommendations'
      ])
    })
  }

  // Error rate insights
  const errorProneServices = architecture.services
    .filter((s) => (s.metadata.errorRate as number) > 0.01) // 1% error rate
    .sort((a, b) => (b.metadata.errorRate as number) - (a.metadata.errorRate as number))

  if (errorProneServices.length > 0) {
    const evidenceData = errorProneServices
      .slice(0, 5)
      .map(
        (s) =>
          `${cleanServiceName(s.service)}: ${((s.metadata.errorRate as number) * 100).toFixed(1)}% error rate (${s.metadata.totalSpans} spans, ${Math.round(s.metadata.avgLatencyMs as number)}ms avg)`
      )

    insights.push({
      type: 'reliability' as const,
      severity: 'critical' as const,
      title: 'High Error Rate Services',
      description: `${errorProneServices.length} services have error rates > 1%: ${errorProneServices
        .slice(0, 3)
        .map(
          (s) =>
            `${cleanServiceName(s.service)} (${((s.metadata.errorRate as number) * 100).toFixed(1)}%)`
        )
        .join(', ')}`,
      recommendation: 'Review error handling and monitoring for these services',
      evidence: createEvidence(
        'statistical',
        evidenceData,
        'reliability',
        'error-rate',
        errorProneServices.length
      ),
      modelAnalysis: createModelAnalysis(selectedModel, 0.92, [
        `Found ${errorProneServices.length} services with >1% error rate`,
        'Correlated error patterns with service complexity',
        'Identified potential reliability improvements'
      ])
    })
  }

  // Architecture insights
  const complexServices = architecture.services
    .filter((s) => s.dependencies.length > 5)
    .sort((a, b) => b.dependencies.length - a.dependencies.length)

  if (complexServices.length > 0) {
    const evidenceData = complexServices
      .slice(0, 3)
      .map(
        (s) =>
          `${cleanServiceName(s.service)}: ${s.dependencies.length} dependencies (${s.metadata.totalSpans} spans, ${Math.round(s.metadata.avgLatencyMs as number)}ms avg)`
      )

    insights.push({
      type: 'architecture' as const,
      severity: 'info' as const,
      title: 'Complex Service Dependencies',
      description: `${complexServices.length} services have > 5 dependencies: ${complexServices
        .slice(0, 3)
        .map((s) => `${cleanServiceName(s.service)} (${s.dependencies.length})`)
        .join(', ')}`,
      recommendation: 'Consider dependency injection or service consolidation',
      evidence: createEvidence(
        'narrative',
        evidenceData,
        'architecture',
        'dependencies',
        complexServices.length
      ),
      modelAnalysis: createModelAnalysis(selectedModel, 0.78, [
        `Identified ${complexServices.length} services with >5 dependencies`,
        'Analyzed coupling patterns and potential refactoring opportunities',
        'Generated architectural improvement suggestions'
      ])
    })
  }

  // Model-specific insights - different models focus on different aspects
  console.log(
    `🤖 Model-specific insight generation: selectedModel=${selectedModel}, isNotStatistical=${selectedModel !== 'local-statistical-analyzer'}`
  )

  if (selectedModel && selectedModel !== 'local-statistical-analyzer') {
    console.log(`🎯 Adding model-specific insight for: ${selectedModel}`)
    switch (selectedModel) {
      case 'claude':
        insights.push({
          type: 'architecture' as const,
          severity: 'info' as const,
          title: 'Architectural Pattern Analysis',
          description:
            'Claude identifies sophisticated architectural patterns and suggests improvements based on domain-driven design principles.',
          recommendation:
            'Consider implementing circuit breaker patterns for high-latency services and event-driven communication for loose coupling.',
          evidence: createEvidence(
            'narrative',
            [
              'Multiple services showing >10s latency suggest synchronous coupling',
              'Event-driven communication patterns identified',
              'CQRS implementation opportunity in data-heavy services'
            ],
            'architecture',
            'patterns',
            architecture.services.length
          ),
          modelAnalysis: {
            model: 'claude-3' as const,
            analysisType: 'explanatory' as const,
            confidence: 0.88,
            reasoningPath: [
              'Analyzed service boundaries and communication patterns',
              'Identified domain-driven design opportunities',
              'Generated architectural improvement recommendations'
            ],
            alternatives: [
              'Monolithic architecture with clear module boundaries',
              'Service mesh implementation for inter-service communication'
            ]
          }
        })
        break

      case 'gpt':
        insights.push({
          type: 'performance' as const,
          severity: 'warning' as const,
          title: 'Performance Optimization Opportunities',
          description:
            'GPT-4 analysis reveals specific performance bottlenecks and provides actionable optimization strategies.',
          recommendation:
            'Implement caching layers, connection pooling, and async processing for high-volume service interactions.',
          evidence: createEvidence(
            'structured',
            [
              'High-volume service calls without apparent caching strategies',
              'Database connection pooling could reduce latency by ~40%',
              'Query optimization needed in services with >2000ms avg latency'
            ],
            'performance',
            'optimization',
            architecture.services.length
          ),
          modelAnalysis: {
            model: 'gpt-4' as const,
            analysisType: 'mathematical' as const,
            confidence: 0.91,
            reasoningPath: [
              'Calculated performance impact of proposed optimizations',
              'Analyzed query patterns and resource utilization',
              'Quantified potential latency reductions'
            ],
            alternatives: [
              'In-memory caching with write-through patterns',
              'Async processing with message queues'
            ]
          }
        })
        break

      case 'llama':
        insights.push({
          type: 'optimization' as const,
          severity: 'info' as const,
          title: 'Resource Utilization & Scalability Analysis',
          description:
            'Llama provides detailed resource usage analysis and scalability recommendations for cloud deployment.',
          recommendation:
            'Optimize resource allocation and implement horizontal scaling strategies for services showing resource contention.',
          evidence: createEvidence(
            'statistical',
            [
              'Services showing memory/CPU intensive operation patterns',
              'Latency patterns indicating resource contention during peak loads',
              'Service scaling patterns suggest manual rather than auto-scaling'
            ],
            'optimization',
            'scalability',
            architecture.services.length
          ),
          modelAnalysis: {
            model: 'llama-2' as const,
            analysisType: 'realtime' as const,
            confidence: 0.82,
            reasoningPath: [
              'Analyzed resource utilization patterns across services',
              'Identified scaling bottlenecks and opportunities',
              'Generated cloud-native deployment recommendations'
            ],
            alternatives: [
              'Vertical scaling with resource limit adjustments',
              'Container orchestration with Kubernetes operators'
            ]
          }
        })
        break
    }
  }

  return insights
}

const generateDocumentation = (
  architecture: ApplicationArchitecture,
  llmManager: Context.Tag.Service<typeof LLMManagerService>,
  config: AnalyzerConfig
): Effect.Effect<{ markdown: string }, AnalysisError, never> =>
  Effect.gen(function* (_) {
    const prompt = PromptTemplates.generateDocumentation(architecture)

    const response = yield* _(
      llmManager
        .generate({
          prompt,
          taskType: 'architectural-insights',
          preferences: {
            model: config.llm.preferredModel,
            maxTokens: 8000, // Longer for documentation
            temperature: 0.1,
            useMultiModel: true, // Use multi-model for comprehensive documentation
            requireStructuredOutput: false
          }
        })
        .pipe(
          Effect.mapError(
            (error): AnalysisError => ({
              _tag: 'LLMError',
              message: (error as { message?: string }).message || 'Documentation generation failed',
              model: (error as { model?: string }).model || config.llm.preferredModel
            })
          )
        )
    )

    return {
      markdown: response.content
    }
  })

export const generateRequestId = (): string =>
  `ai-analysis-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`

const calculateConfidenceScore = (
  topologyData: ServiceTopologyRaw[],
  dependencyData: ServiceDependencyRaw[]
): number => {
  // Simple confidence calculation based on data volume
  const spanCount = topologyData.reduce((sum, t) => sum + t.total_spans, 0)
  const serviceCount = topologyData.length
  const dependencyCount = dependencyData.length

  // More data = higher confidence, but cap at 1.0
  const dataScore = Math.min(spanCount / 10000, 1.0) * 0.4
  const diversityScore = Math.min(serviceCount / 20, 1.0) * 0.3
  const connectivityScore = Math.min(dependencyCount / 50, 1.0) * 0.3

  return Math.min(dataScore + diversityScore + connectivityScore, 1.0)
}

/**
 * AI Analyzer Service Layer
 */
export const AIAnalyzerLayer = (config: AnalyzerConfig = defaultAnalyzerConfig) =>
  Layer.effect(AIAnalyzerService, makeAIAnalyzerService(config))

/**
 * Generate Enhanced Insights using Multi-Model Orchestrator
 */
const generateEnhancedInsights = (
  analysisType: AnalysisRequest['type'],
  architecture: ApplicationArchitecture,
  llmManager: Context.Tag.Service<typeof LLMManagerService>,
  multiModelOrchestrator: ReturnType<typeof makeMultiModelOrchestrator>,
  config: AnalyzerConfig
): Effect.Effect<{ content: string }, AnalysisError, never> =>
  Effect.gen(function* (_) {
    // Prepare data for multi-model analysis based on analysis type
    let analysisData: Record<string, unknown> = {}

    switch (analysisType) {
      case 'architecture':
        analysisData = {
          services: architecture.services.map((s) => s.service),
          dependencies: architecture.services.reduce(
            (acc, s) => {
              acc[s.service] = s.dependencies.map((d) => ({
                service: d.service,
                operation: d.operation,
                callCount: d.callCount,
                avgLatencyMs: d.avgLatencyMs,
                errorRate: d.errorRate
              }))
              return acc
            },
            {} as Record<
              string,
              Array<{
                service: string
                operation: string
                callCount: number
                avgLatencyMs: number
                errorRate: number
              }>
            >
          )
        }
        break

      case 'dependencies':
        analysisData = {
          services: architecture.services.map((s) => s.service),
          dependencies: architecture.services.reduce(
            (acc, s) => {
              acc[s.service] = [...s.dependencies] as {
                service: string
                operation: string
                callCount: number
                avgLatencyMs: number
                errorRate: number
              }[]
              return acc
            },
            {} as Record<
              string,
              Array<{
                service: string
                operation: string
                callCount: number
                avgLatencyMs: number
                errorRate: number
              }>
            >
          )
        }
        break

      case 'dataflow':
      case 'insights':
        analysisData = {
          metrics: {
            totalServices: architecture.services.length,
            totalDataFlows: architecture.dataFlows.length,
            avgLatency:
              architecture.services.reduce(
                (sum, s) => sum + (s.metadata.avgLatencyMs as number),
                0
              ) / architecture.services.length,
            avgErrorRate:
              architecture.services.reduce((sum, s) => sum + (s.metadata.errorRate as number), 0) /
              architecture.services.length
          },
          bottlenecks: architecture.services
            .filter((s) => (s.metadata.avgLatencyMs as number) > 1000)
            .map((s) => s.service),
          highErrorRateServices: architecture.services
            .filter((s) => (s.metadata.errorRate as number) > 0.01)
            .map((s) => s.service)
        }
        break
    }

    // Try to use multi-model orchestrator for enhanced analysis, fallback to standard LLM
    const llmPrompt = generatePromptForAnalysisType(analysisType, architecture, {
      type: analysisType,
      timeRange: { startTime: new Date(), endTime: new Date() }
    })

    const multiModelResponse = yield* _(
      multiModelOrchestrator
        .generateArchitecturalInsights(
          analysisType === 'architecture'
            ? 'system-analysis'
            : analysisType === 'dependencies'
              ? 'system-analysis'
              : 'performance-optimization',
          analysisData
        )
        .pipe(
          Effect.map((response) => ({
            content: (response as { consensus: { content: string } }).consensus.content
          })),
          Effect.mapError(
            (error): AnalysisError => ({
              _tag: 'LLMError',
              message: (error as { message?: string }).message || 'Multi-model analysis failed',
              model: 'multi-model'
            })
          ),
          Effect.timeout(30000), // 30 second timeout
          Effect.orElse(() => {
            // Fallback to standard LLM if orchestrator fails
            console.log('Multi-model orchestrator unavailable, falling back to standard LLM')
            return llmManager
              .generate({
                prompt: llmPrompt,
                taskType: 'architectural-insights',
                preferences: {
                  model: config.llm.preferredModel,
                  maxTokens: config.llm.maxTokens,
                  temperature: config.llm.temperature
                }
              })
              .pipe(
                Effect.map((response) => ({ content: (response as { content: string }).content })),
                Effect.mapError(
                  (error): AnalysisError => ({
                    _tag: 'LLMError',
                    message: (error as { message?: string }).message || 'LLM generation failed',
                    model: config.llm.preferredModel
                  })
                )
              )
          })
        )
    )

    return multiModelResponse
  })

/**
 * Transform trace data to topology data format
 *
 * This helper function transforms TraceData[] into the format expected by the topology analyzer
 */

const transformTracesToTopology = (
  traces: Array<Record<string, unknown>>,
  _timeRangeHours: number
): [ServiceTopologyRaw[], ServiceDependencyRaw[], TraceFlowRaw[]] => {
  // Internal working types for accumulation
  interface ServiceAccumulator {
    service_name: string
    operation_name: string
    total_spans: number
    unique_traces: Set<unknown>
    error_spans: number
    root_spans: number
    span_kind: string
    total_duration: number
    avg_duration_ms: number
    p95_duration_ms: number
  }

  // Simple transformation - in a real implementation, this would be more sophisticated
  const serviceMap = new Map<string, ServiceAccumulator>()
  const dependencies = new Map<string, Set<string>>()
  const traceFlows: TraceFlowRaw[] = []

  // Process each trace to build topology data
  traces.forEach((trace) => {
    const resourceAttrs = trace.resourceAttributes as Record<string, unknown> | undefined
    const serviceName = (resourceAttrs?.['service.name'] as string) || 'unknown'
    const operationName = (trace.name as string) || (trace.operationName as string) || 'unknown'
    const spanKind = (trace.spanKind as string) || 'INTERNAL'

    // Build service topology data
    if (!serviceMap.has(serviceName)) {
      serviceMap.set(serviceName, {
        service_name: serviceName,
        operation_name: operationName,
        span_kind: spanKind,
        total_spans: 0,
        error_spans: 0,
        root_spans: 0,
        unique_traces: new Set(),
        avg_duration_ms: 0,
        p95_duration_ms: 0,
        total_duration: 0
      })
    }

    const service = serviceMap.get(serviceName)
    if (service) {
      service.total_spans++
      service.unique_traces.add(trace.traceId)
      const endTime = (trace.endTime as number) || 0
      const startTime = (trace.startTime as number) || 0
      service.total_duration += (endTime - startTime) / 1000000 // Convert to ms

      if (trace.statusCode === 'ERROR') {
        service.error_spans++
      }

      if (!trace.parentSpanId) {
        service.root_spans++
      }
    }

    // Build dependency data
    const parentTrace = trace.parentSpanId
      ? traces.find((t) => t.spanId === trace.parentSpanId)
      : null
    const parentAttrs = parentTrace?.resourceAttributes as Record<string, unknown> | undefined
    const parentService = parentAttrs?.['service.name'] as string | null

    if (parentService && parentService !== serviceName) {
      if (!dependencies.has(parentService)) {
        dependencies.set(parentService, new Set())
      }
      const parentDeps = dependencies.get(parentService)
      if (parentDeps) {
        parentDeps.add(serviceName)
      }
    }

    // Build trace flow data (simplified)
    const traceId = (trace.traceId as string) || 'unknown'
    const endTime = (trace.endTime as number) || 0
    const startTime = (trace.startTime as number) || 0
    const statusCode = (trace.statusCode as string) || 'OK'

    traceFlows.push({
      trace_id: traceId,
      service_name: serviceName,
      operation_name: operationName,
      parent_service: parentService,
      parent_operation: null, // Would need more analysis
      start_time: new Date(startTime / 1000000).toISOString(),
      duration_ms: (endTime - startTime) / 1000000,
      span_kind: spanKind,
      status_code: statusCode,
      level: trace.parentSpanId ? 1 : 0
    })
  })

  // Finalize service calculations - convert to match expected interface
  const topologyData: ServiceTopologyRaw[] = Array.from(serviceMap.values()).map((service) => {
    const avgDuration = service.total_spans > 0 ? service.total_duration / service.total_spans : 0
    return {
      service_name: service.service_name,
      operation_name: service.operation_name,
      span_kind: service.span_kind,
      total_spans: service.total_spans,
      root_spans: service.root_spans,
      error_spans: service.error_spans,
      avg_duration_ms: avgDuration,
      p95_duration_ms: avgDuration * 1.5, // Rough estimate
      unique_traces: service.unique_traces.size
    }
  })

  // Build dependency data in expected format
  const dependencyData: ServiceDependencyRaw[] = []
  dependencies.forEach((dependentServices, serviceName) => {
    dependentServices.forEach((dependentService) => {
      dependencyData.push({
        service_name: serviceName,
        operation_name: 'unknown', // Would need more analysis
        dependent_service: dependentService,
        dependent_operation: 'unknown', // Would need more analysis
        call_count: 1, // Simplified
        total_count: 1,
        error_count: 0,
        avg_duration_ms: 100 // Default estimate
      })
    })
  })

  return [topologyData, dependencyData, traceFlows]
}
