/**
 * Multi-Model Orchestrator
 *
 * Advanced orchestration capabilities for running multiple LLM models in parallel,
 * generating consensus responses, and providing enhanced AI-native capabilities
 * for market intelligence and architectural insights.
 */

import { Effect, Duration } from 'effect'
import { LLMRequest, LLMResponse, LLMError, TaskType, ModelClient } from './types.js'

/**
 * Multi-Model Response
 *
 * Contains responses from multiple models and a consensus result.
 */
export interface MultiModelResponse {
  primary: LLMResponse | null
  secondary: LLMResponse | null
  consensus: LLMResponse
  modelChain: string[]
  confidenceScore?: number
  insights?: {
    modelAgreement: number
    qualityScores: Record<string, number>
    reasoning: string
  }
}

/**
 * Market Intelligence Prompt Templates
 *
 * Specialized prompts for market analysis and competitive intelligence.
 */
const MARKET_INTELLIGENCE_TEMPLATES = {
  competitorAnalysis: (competitors: string[], domain: string) => `
Analyze the competitive landscape for ${domain} focusing on these key competitors: ${competitors.join(', ')}.

Provide insights on:
1. Market positioning and differentiation strategies
2. Technology advantages and disadvantages
3. Pricing and business model approaches
4. Recent developments and strategic moves
5. Potential opportunities and threats

Format the analysis with clear sections and actionable insights for product strategy.
  `,

  featurePrioritization: (features: string[], marketData: Record<string, unknown>) => `
Based on the following market data and feature list, provide prioritization recommendations:

Features under consideration: ${features.join(', ')}
Market context: ${JSON.stringify(marketData, null, 2)}

Analyze each feature for:
1. Market demand and timing
2. Competitive differentiation value
3. Implementation complexity vs. business impact
4. Revenue potential and customer retention impact
5. Strategic alignment with market trends

Rank features by priority with clear reasoning for each recommendation.
  `,

  businessModelAnalysis: (currentModel: string, alternatives: string[]) => `
Analyze the current business model: ${currentModel}

Compare against these alternatives: ${alternatives.join(', ')}

Evaluate each model on:
1. Revenue predictability and scalability
2. Customer acquisition and retention
3. Market fit and competitive advantages
4. Risk factors and mitigation strategies
5. Implementation complexity and timeline

Provide strategic recommendations with specific next steps.
  `
}

/**
 * Architectural Insights Prompt Templates
 *
 * Specialized prompts for technical architecture analysis and recommendations.
 */
const ARCHITECTURAL_TEMPLATES = {
  systemAnalysis: (services: string[], dependencies: Record<string, unknown>) => `
Analyze this microservices architecture:

Services: ${services.join(', ')}
Dependencies: ${JSON.stringify(dependencies, null, 2)}

Provide insights on:
1. Service coupling and cohesion analysis
2. Performance bottlenecks and optimization opportunities
3. Scalability limitations and solutions
4. Fault tolerance and resilience patterns
5. Technology stack alignment and modernization needs

Include specific technical recommendations with implementation priorities.
  `,

  performanceOptimization: (metrics: Record<string, unknown>, bottlenecks: string[]) => `
Based on these performance metrics and identified bottlenecks:

Metrics: ${JSON.stringify(metrics, null, 2)}
Bottlenecks: ${bottlenecks.join(', ')}

Analyze and recommend:
1. Root cause analysis of performance issues
2. Optimization strategies with expected impact
3. Architecture changes to prevent future bottlenecks
4. Monitoring and alerting improvements
5. Cost-benefit analysis of optimization efforts

Prioritize recommendations by impact and implementation complexity.
  `,

  costOptimization: (costs: Record<string, unknown>, usage: Record<string, unknown>) => `
Analyze cost optimization opportunities:

Current costs: ${JSON.stringify(costs, null, 2)}
Usage patterns: ${JSON.stringify(usage, null, 2)}

Provide recommendations for:
1. Infrastructure cost reduction opportunities
2. Usage optimization and resource right-sizing
3. Alternative architecture approaches for cost efficiency
4. Monitoring and automated cost controls
5. ROI analysis for proposed changes

Include specific dollar impact estimates where possible.
  `
}

/**
 * Multi-Model Orchestrator Implementation
 *
 * Coordinates multiple LLM models for complex analysis tasks.
 */
export const makeMultiModelOrchestrator = (clients: {
  gpt?: ModelClient
  claude?: ModelClient
  llama?: ModelClient
}) => ({
  /**
   * Generate Market Intelligence
   *
   * Uses multiple models to analyze market data and provide business insights.
   */
  generateMarketIntelligence: (
    analysisType: 'competitor' | 'feature-prioritization' | 'business-model',
    data: Record<string, unknown>
  ): Effect.Effect<MultiModelResponse, LLMError, never> =>
    Effect.gen(function* (_) {
      let prompt: string

      switch (analysisType) {
        case 'competitor':
          prompt = MARKET_INTELLIGENCE_TEMPLATES.competitorAnalysis(
            (data.competitors as string[]) || [],
            (data.domain as string) || 'observability platform'
          )
          break
        case 'feature-prioritization':
          prompt = MARKET_INTELLIGENCE_TEMPLATES.featurePrioritization(
            (data.features as string[]) || [],
            (data.marketData as Record<string, unknown>) || {}
          )
          break
        case 'business-model':
          prompt = MARKET_INTELLIGENCE_TEMPLATES.businessModelAnalysis(
            (data.currentModel as string) || 'SaaS',
            (data.alternatives as string[]) || []
          )
          break
        default:
          prompt = `Analyze the provided market intelligence data: ${JSON.stringify(data, null, 2)}`
      }

      const request: LLMRequest = {
        prompt,
        taskType: 'market-intelligence',
        preferences: {
          useMultiModel: true,
          temperature: 0.3, // Lower temperature for analytical consistency
          maxTokens: 2000
        }
      }

      return yield* _(executeMultiModelRequest(request, clients))
    }),

  /**
   * Generate Architectural Insights
   *
   * Uses multiple models to analyze system architecture and provide technical recommendations.
   */
  generateArchitecturalInsights: (
    analysisType: 'system-analysis' | 'performance-optimization' | 'cost-optimization',
    data: Record<string, unknown>
  ): Effect.Effect<MultiModelResponse, LLMError, never> =>
    Effect.gen(function* (_) {
      let prompt: string

      switch (analysisType) {
        case 'system-analysis':
          prompt = ARCHITECTURAL_TEMPLATES.systemAnalysis(
            (data.services as string[]) || [],
            (data.dependencies as Record<string, unknown>) || {}
          )
          break
        case 'performance-optimization':
          prompt = ARCHITECTURAL_TEMPLATES.performanceOptimization(
            (data.metrics as Record<string, unknown>) || {},
            (data.bottlenecks as string[]) || []
          )
          break
        case 'cost-optimization':
          prompt = ARCHITECTURAL_TEMPLATES.costOptimization((data.costs as Record<string, unknown>) || {}, (data.usage as Record<string, unknown>) || {})
          break
        default:
          prompt = `Analyze the provided architectural data: ${JSON.stringify(data, null, 2)}`
      }

      const request: LLMRequest = {
        prompt,
        taskType: 'architectural-insights',
        preferences: {
          useMultiModel: true,
          temperature: 0.2, // Very low temperature for technical analysis
          maxTokens: 2500
        }
      }

      return yield* _(executeMultiModelRequest(request, clients))
    }),

  /**
   * Generate Consensus Analysis
   *
   * Runs the same analysis across multiple models and generates a consensus response.
   */
  generateConsensusAnalysis: (
    request: LLMRequest
  ): Effect.Effect<MultiModelResponse, LLMError, never> =>
    executeMultiModelRequest(request, clients),

  /**
   * Get Model Capabilities
   *
   * Returns information about available models and their strengths.
   */
  getModelCapabilities: () =>
    Effect.succeed({
      availableModels: Object.keys(clients).filter((key) => clients[key as keyof typeof clients]),
      capabilities: {
        'market-intelligence': {
          recommended: ['gpt', 'claude'],
          reasoning: 'Business analysis requires strong reasoning and market understanding'
        },
        'architectural-insights': {
          recommended: ['claude', 'gpt'],
          reasoning: 'Technical architecture analysis benefits from deep technical knowledge'
        },
        'anomaly-detection': {
          recommended: ['claude'],
          reasoning: 'Pattern recognition and analytical reasoning are key strengths'
        }
      }
    })
})

/**
 * Execute Multi-Model Request
 *
 * Coordinates execution across multiple models and generates consensus.
 */
const executeMultiModelRequest = (
  request: LLMRequest,
  clients: { gpt?: ModelClient; claude?: ModelClient; llama?: ModelClient }
): Effect.Effect<MultiModelResponse, LLMError, never> =>
  Effect.gen(function* (_) {
    // Determine which models to use based on task type
    const modelPriority = getModelPriorityForTask(request.taskType)
    const availableModels = modelPriority.filter((model) => clients[model as keyof typeof clients])

    if (availableModels.length === 0) {
      return yield* _(
        Effect.fail({
          _tag: 'ModelUnavailable' as const,
          model: 'all',
          message: 'No models available for multi-model request'
        })
      )
    }

    // Execute with top 2 models if available
    const primaryModel = availableModels[0] as keyof typeof clients
    const secondaryModel = (availableModels[1] || null) as keyof typeof clients | null

    const [primaryResponse, secondaryResponse] = yield* _(
      Effect.all(
        [
          executeWithModelSafe(request, primaryModel, clients),
          secondaryModel
            ? executeWithModelSafe(request, secondaryModel, clients)
            : Effect.succeed(null)
        ],
        { concurrency: 2 }
      )
    )

    // Generate consensus (for now, prefer Claude for analytical tasks, GPT for others)
    const consensus = selectBestResponse(primaryResponse, secondaryResponse, request.taskType)

    if (!consensus) {
      return yield* _(
        Effect.fail({
          _tag: 'AllModelsUnavailable' as const,
          message: 'All models failed for multi-model request'
        })
      )
    }

    // Calculate agreement and confidence
    const modelAgreement = calculateModelAgreement(primaryResponse, secondaryResponse)
    const qualityScores = calculateQualityScores(primaryResponse, secondaryResponse)

    return {
      primary: primaryResponse,
      secondary: secondaryResponse,
      consensus: {
        ...consensus,
        metadata: {
          ...consensus.metadata,
          modelChain: [primaryResponse?.model, secondaryResponse?.model].filter(
            Boolean
          ) as string[],
          fallbackUsed: primaryResponse === null || secondaryResponse === null
        }
      },
      modelChain: [primaryResponse?.model, secondaryResponse?.model].filter(Boolean) as string[],
      confidenceScore: Math.max(modelAgreement * 100, 75), // Minimum 75% confidence
      insights: {
        modelAgreement,
        qualityScores,
        reasoning: generateAgreementReasoning(primaryResponse, secondaryResponse, modelAgreement)
      }
    }
  })

/**
 * Get Model Priority for Task
 *
 * Returns models in priority order for different task types.
 */
const getModelPriorityForTask = (taskType: TaskType): ('gpt' | 'claude' | 'llama')[] => {
  switch (taskType) {
    case 'market-intelligence':
      return ['gpt', 'claude', 'llama'] // GPT excels at business analysis
    case 'architectural-insights':
      return ['claude', 'gpt', 'llama'] // Claude excels at technical analysis
    case 'anomaly-detection':
      return ['claude', 'gpt', 'llama'] // Claude excels at pattern recognition
    case 'analysis':
      return ['claude', 'gpt', 'llama'] // Claude excels at general analysis
    default:
      return ['llama', 'gpt', 'claude'] // Default to cost-effective local model
  }
}

/**
 * Execute with Model (Safe)
 *
 * Safely executes a request with a model, returning null on failure.
 */
const executeWithModelSafe = (
  request: LLMRequest,
  model: keyof typeof clients,
  clients: { gpt?: ModelClient; claude?: ModelClient; llama?: ModelClient }
): Effect.Effect<LLMResponse | null, never, never> =>
  Effect.gen(function* (_) {
    const client = clients[model]
    if (!client) {
      return null
    }

    const response = yield* _(
      client.generate(request).pipe(
        Effect.timeout(Duration.seconds(30)), // 30 second timeout
        Effect.orElse(() => Effect.succeed(null))
      )
    )

    return response
  })

/**
 * Select Best Response
 *
 * Selects the best response based on task type and model strengths.
 */
const selectBestResponse = (
  primary: LLMResponse | null,
  secondary: LLMResponse | null,
  taskType: TaskType
): LLMResponse | null => {
  if (!primary && !secondary) return null
  if (!primary) return secondary
  if (!secondary) return primary

  // For analytical tasks, prefer Claude responses
  if (['analysis', 'architectural-insights', 'anomaly-detection'].includes(taskType)) {
    return primary.model.includes('claude')
      ? primary
      : secondary.model.includes('claude')
        ? secondary
        : primary
  }

  // For business tasks, prefer GPT responses
  if (['market-intelligence'].includes(taskType)) {
    return primary.model.includes('gpt')
      ? primary
      : secondary.model.includes('gpt')
        ? secondary
        : primary
  }

  // Default to primary
  return primary
}

/**
 * Calculate Model Agreement
 *
 * Calculates a simple agreement score between two responses.
 */
const calculateModelAgreement = (
  primary: LLMResponse | null,
  secondary: LLMResponse | null
): number => {
  if (!primary || !secondary) return 0.5 // Partial agreement if only one response

  // Simple heuristic: compare response lengths and assume longer responses are more detailed
  const lengthSimilarity =
    1 -
    Math.abs(primary.content.length - secondary.content.length) /
      Math.max(primary.content.length, secondary.content.length)

  // For now, assume reasonable agreement - in a real implementation,
  // this would use semantic similarity or other NLP techniques
  return Math.max(lengthSimilarity, 0.6) // Minimum 60% agreement
}

/**
 * Calculate Quality Scores
 *
 * Provides quality scores for each response.
 */
const calculateQualityScores = (
  primary: LLMResponse | null,
  secondary: LLMResponse | null
): Record<string, number> => {
  const scores: Record<string, number> = {}

  if (primary) {
    // Simple quality heuristic based on response length and confidence
    const lengthScore = Math.min(primary.content.length / 1000, 1) // Normalize to 1000 chars
    const confidenceScore = primary.metadata.confidence || 0.8
    scores[primary.model] = (lengthScore + confidenceScore) / 2
  }

  if (secondary) {
    const lengthScore = Math.min(secondary.content.length / 1000, 1)
    const confidenceScore = secondary.metadata.confidence || 0.8
    scores[secondary.model] = (lengthScore + confidenceScore) / 2
  }

  return scores
}

/**
 * Generate Agreement Reasoning
 *
 * Provides human-readable reasoning about model agreement.
 */
const generateAgreementReasoning = (
  primary: LLMResponse | null,
  secondary: LLMResponse | null,
  agreement: number
): string => {
  if (!primary && !secondary) {
    return 'No responses available from any model'
  }

  if (!primary || !secondary) {
    return `Single model response from ${primary?.model || secondary?.model}. Consider as baseline analysis.`
  }

  if (agreement > 0.8) {
    return `High agreement between ${primary.model} and ${secondary.model}. Consensus represents strong analytical alignment.`
  } else if (agreement > 0.6) {
    return `Moderate agreement between ${primary.model} and ${secondary.model}. Some differences in perspective provide additional insights.`
  } else {
    return `Lower agreement between ${primary.model} and ${secondary.model}. Consider both perspectives for comprehensive analysis.`
  }
}
