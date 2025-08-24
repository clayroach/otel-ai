/**
 * AI Analyzer Service Implementation
 * 
 * Main service that orchestrates ClickHouse queries, topology discovery,
 * and LLM-based analysis to provide architectural insights.
 */

import { Effect, Context, Layer, Stream } from 'effect'
import { Schema } from '@effect/schema'
import type { 
  AIAnalyzerService, 
  AnalysisRequest, 
  AnalysisResult, 
  AnalysisError,
  ApplicationArchitecture,
  ServiceTopology
} from './types.js'
import { ArchitectureQueries, executeAnalysisQuery } from './queries.js'
import { discoverApplicationTopology } from './topology.js'
import { PromptTemplates, PromptUtils } from './prompts.js'
import { LLMManagerService } from '../llm-manager/services.js'
import { ClickHouseStorageTag, type ClickHouseStorage } from '../storage/clickhouse.js'

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
    const clickhouseStorage = yield* _(ClickHouseStorageTag)

    const analyzeArchitecture = (request: AnalysisRequest): Effect.Effect<AnalysisResult, AnalysisError, never> =>
      Effect.gen(function* (_) {
        const startTime = Date.now()
        const timeRangeHours = Math.abs(request.timeRange.endTime.getTime() - request.timeRange.startTime.getTime()) / (1000 * 60 * 60)
        
        try {
          // Step 1: Gather raw data from ClickHouse
          const [topologyData, dependencyData, traceFlows] = yield* _(
            Effect.all([
              clickhouseStorage.queryRaw(ArchitectureQueries.getServiceTopology(timeRangeHours)),
              clickhouseStorage.queryRaw(ArchitectureQueries.getServiceDependencies(timeRangeHours)),  
              clickhouseStorage.queryRaw(ArchitectureQueries.getTraceFlows(100, timeRangeHours))
            ]).pipe(
              Effect.mapError((storageError): AnalysisError => ({
                _tag: 'QueryError',
                message: `Failed to query ClickHouse: ${storageError.message}`,
                query: 'Multiple queries'
              }))
            )
          )
          
          // Check if we have sufficient data
          if (topologyData.length < config.analysis.minSpanThreshold) {
            return yield* _(Effect.fail({
              _tag: 'InsufficientData' as const,
              message: `Insufficient trace data: ${topologyData.length} spans found, minimum ${config.analysis.minSpanThreshold} required`,
              spanCount: topologyData.length
            }))
          }
          
          // Step 2: Discover application topology
          const architecture = yield* _(discoverApplicationTopology(topologyData, dependencyData, traceFlows))
          
          // Step 3: Generate LLM analysis based on request type
          const llmPrompt = generatePromptForAnalysisType(request.type, architecture, request)
          
          const llmResponse = yield* _(
            llmManager.generate({
              prompt: llmPrompt,
              taskType: 'analysis',
              preferences: {
                model: config.llm.preferredModel,
                maxTokens: config.llm.maxTokens,
                temperature: config.llm.temperature
              }
            })
          )
          
          // Step 4: Generate insights based on the data
          const insights = generateInsights(architecture, request.type)
          
          // Step 5: Generate documentation if requested
          const documentation = request.type === 'architecture' ? 
            yield* _(generateDocumentation(architecture, llmManager, config)) : 
            undefined
          
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
              llmTokensUsed: llmResponse.usage.totalTokens,
              confidence: calculateConfidenceScore(topologyData, dependencyData)
            }
          }
          
          return result
          
        } catch (error) {
          return yield* _(Effect.fail({
            _tag: 'ConfigurationError' as const,
            message: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          }))
        }
      })

    const streamAnalysis = (request: AnalysisRequest): Stream.Stream<string, AnalysisError, never> =>
      Stream.unwrap(
        Effect.gen(function* (_) {
          // Get architecture data first
          const timeRangeHours = Math.abs(request.timeRange.endTime.getTime() - request.timeRange.startTime.getTime()) / (1000 * 60 * 60)
          
          const [topologyData, dependencyData, traceFlows] = yield* _(
            Effect.all([
              clickhouseStorage.queryRaw(ArchitectureQueries.getServiceTopology(timeRangeHours)),
              clickhouseStorage.queryRaw(ArchitectureQueries.getServiceDependencies(timeRangeHours)),
              clickhouseStorage.queryRaw(ArchitectureQueries.getTraceFlows(50, timeRangeHours))
            ]).pipe(
              Effect.mapError((storageError): AnalysisError => ({
                _tag: 'QueryError',
                message: `Failed to query ClickHouse: ${storageError.message}`,
                query: 'Stream analysis queries'
              }))
            )
          )
          
          const architecture = yield* _(discoverApplicationTopology(topologyData, dependencyData, traceFlows))
          const llmPrompt = generatePromptForAnalysisType(request.type, architecture, request)
          
          // Stream the LLM response
          return llmManager.generateStream({
            prompt: llmPrompt,
            taskType: 'analysis',
            preferences: {
              model: config.llm.preferredModel,
              maxTokens: config.llm.maxTokens,
              temperature: config.llm.temperature
            },
            streaming: true
          })
        })
      )

    const getServiceTopology = (timeRange: { startTime: Date; endTime: Date }): Effect.Effect<ServiceTopology[], AnalysisError, never> =>
      Effect.gen(function* (_) {
        const timeRangeHours = Math.abs(timeRange.endTime.getTime() - timeRange.startTime.getTime()) / (1000 * 60 * 60)
        
        const [topologyData, dependencyData] = yield* _(
          Effect.all([
            clickhouseStorage.queryRaw(ArchitectureQueries.getServiceTopology(timeRangeHours)),
            clickhouseStorage.queryRaw(ArchitectureQueries.getServiceDependencies(timeRangeHours))
          ]).pipe(
            Effect.mapError((storageError): AnalysisError => ({
              _tag: 'QueryError',
              message: `Failed to query ClickHouse: ${storageError.message}`,
              query: 'Service topology queries'
            }))
          )
        )
        
        const architecture = yield* _(discoverApplicationTopology(topologyData, dependencyData, []))
        return architecture.services
      })

    const generateDocumentationMethod = (architecture: ApplicationArchitecture): Effect.Effect<string, AnalysisError, never> =>
      generateDocumentation(architecture, llmManager, config)

    return {
      analyzeArchitecture,
      streamAnalysis,
      getServiceTopology,
      generateDocumentation: generateDocumentationMethod
    } satisfies AIAnalyzerService
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
  basePrompt = PromptUtils.withTimeContext(basePrompt, request.timeRange.startTime, request.timeRange.endTime)
  
  return basePrompt
}

const generateInsights = (architecture: ApplicationArchitecture, analysisType: AnalysisRequest['type']) => {
  const insights = []
  
  // Performance insights
  const slowServices = architecture.services
    .filter(s => (s.metadata.avgLatencyMs as number) > 1000)
    .sort((a, b) => (b.metadata.avgLatencyMs as number) - (a.metadata.avgLatencyMs as number))
  
  if (slowServices.length > 0) {
    insights.push({
      type: 'performance' as const,
      severity: 'warning' as const,
      title: 'High Latency Services Detected',
      description: `${slowServices.length} services have average latency > 1000ms: ${slowServices.slice(0, 3).map(s => s.service).join(', ')}`,
      recommendation: 'Investigate performance bottlenecks in these services',
      evidence: slowServices.slice(0, 5)
    })
  }
  
  // Error rate insights
  const errorProneServices = architecture.services
    .filter(s => (s.metadata.errorRate as number) > 0.01) // 1% error rate
    .sort((a, b) => (b.metadata.errorRate as number) - (a.metadata.errorRate as number))
  
  if (errorProneServices.length > 0) {
    insights.push({
      type: 'reliability' as const,
      severity: 'critical' as const,
      title: 'High Error Rate Services',
      description: `${errorProneServices.length} services have error rates > 1%: ${errorProneServices.slice(0, 3).map(s => `${s.service} (${((s.metadata.errorRate as number) * 100).toFixed(1)}%)`).join(', ')}`,
      recommendation: 'Review error handling and monitoring for these services',
      evidence: errorProneServices.slice(0, 5)
    })
  }
  
  // Architecture insights
  const complexServices = architecture.services
    .filter(s => s.dependencies.length > 5)
    .sort((a, b) => b.dependencies.length - a.dependencies.length)
  
  if (complexServices.length > 0) {
    insights.push({
      type: 'architecture' as const,
      severity: 'info' as const,
      title: 'Complex Service Dependencies',
      description: `${complexServices.length} services have > 5 dependencies: ${complexServices.slice(0, 3).map(s => `${s.service} (${s.dependencies.length})`).join(', ')}`,
      recommendation: 'Consider dependency injection or service consolidation',
      evidence: complexServices.slice(0, 3)
    })
  }
  
  return insights
}

const generateDocumentation = (
  architecture: ApplicationArchitecture,
  llmManager: any, // TODO: Proper type
  config: AnalyzerConfig
): Effect.Effect<{ markdown: string }, AnalysisError, never> =>
  Effect.gen(function* (_) {
    const prompt = PromptTemplates.generateDocumentation(architecture)
    
    const response = yield* _(
      llmManager.generate({
        prompt,
        taskType: 'analysis',
        preferences: {
          model: config.llm.preferredModel,
          maxTokens: 8000, // Longer for documentation
          temperature: 0.1
        }
      })
    )
    
    return {
      markdown: response.content
    }
  })

const generateRequestId = (): string => 
  `ai-analysis-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

const calculateConfidenceScore = (topologyData: any[], dependencyData: any[]): number => {
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
  Layer.effect(
    AIAnalyzerService,
    makeAIAnalyzerService(config)
  )

/**
 * Configuration tag for dependency injection
 */
export interface AIAnalyzerConfig extends Context.Tag<'AIAnalyzerConfig', AnalyzerConfig> {}
export const AIAnalyzerConfig = Context.GenericTag<AnalyzerConfig>('AIAnalyzerConfig')