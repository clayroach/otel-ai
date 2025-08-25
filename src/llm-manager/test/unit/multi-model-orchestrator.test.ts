/**
 * Multi-Model Orchestrator Tests
 * 
 * Tests for the multi-model orchestration capabilities including market intelligence
 * and architectural insights generation.
 */

import { describe, it, expect, vi } from 'vitest'
import { Effect } from 'effect'
import { makeMultiModelOrchestrator } from '../../multi-model-orchestrator.js'
import type { ModelClient, LLMRequest, LLMResponse } from '../../types.js'

// Mock model client for testing
const createMockClient = (modelName: string): ModelClient => ({
  generate: (request: LLMRequest) =>
    Effect.succeed({
      content: `${modelName} analysis for ${request.taskType}: ${request.prompt.slice(0, 100)}...`,
      model: modelName,
      usage: {
        promptTokens: 100,
        completionTokens: 150,
        totalTokens: 250,
        cost: 0.01
      },
      metadata: {
        latencyMs: 500,
        retryCount: 0,
        cached: false,
        confidence: 0.9
      }
    } as LLMResponse),
  
  isHealthy: () => Effect.succeed(true)
})

describe('Multi-Model Orchestrator', () => {
  const mockGPT = createMockClient('gpt-4')
  const mockClaude = createMockClient('claude-3-opus')
  const mockLlama = createMockClient('llama-2-13b')

  const orchestrator = makeMultiModelOrchestrator({
    gpt: mockGPT,
    claude: mockClaude,
    llama: mockLlama
  })

  describe('Market Intelligence Generation', () => {
    it('should generate competitor analysis', async () => {
      const result = await Effect.runPromise(
        orchestrator.generateMarketIntelligence('competitor', {
          competitors: ['Datadog', 'New Relic', 'Grafana'],
          domain: 'observability platform'
        })
      )

      expect(result.consensus.content).toBeTruthy()
      expect(result.primary).toBeTruthy()
      expect(result.modelChain).toContain('gpt-4') // GPT preferred for market intelligence
      expect(result.confidenceScore).toBeGreaterThanOrEqual(75)
      expect(result.insights?.modelAgreement).toBeDefined()
    })

    it('should generate feature prioritization analysis', async () => {
      const result = await Effect.runPromise(
        orchestrator.generateMarketIntelligence('feature-prioritization', {
          features: ['AI anomaly detection', 'Custom dashboards', 'Alert management'],
          marketData: { segment: 'enterprise', budget: 'high' }
        })
      )

      expect(result.consensus.content).toContain('market-intelligence')
      expect(result.modelChain.length).toBeGreaterThan(0)
    })

    it('should generate business model analysis', async () => {
      const result = await Effect.runPromise(
        orchestrator.generateMarketIntelligence('business-model', {
          currentModel: 'SaaS subscription',
          alternatives: ['Usage-based pricing', 'Freemium', 'Enterprise licensing']
        })
      )

      expect(result.consensus.content).toContain('market-intelligence')
      expect(result.insights?.reasoning).toBeTruthy()
    })
  })

  describe('Architectural Insights Generation', () => {
    it('should generate system analysis', async () => {
      const result = await Effect.runPromise(
        orchestrator.generateArchitecturalInsights('system-analysis', {
          services: ['frontend', 'api', 'storage', 'collector'],
          dependencies: {
            frontend: ['api'],
            api: ['storage', 'collector'],
            collector: ['storage']
          }
        })
      )

      expect(result.consensus.content).toBeTruthy()
      expect(result.primary).toBeTruthy()
      expect(result.modelChain).toContain('claude-3-opus') // Claude preferred for architectural insights
    })

    it('should generate performance optimization recommendations', async () => {
      const result = await Effect.runPromise(
        orchestrator.generateArchitecturalInsights('performance-optimization', {
          metrics: { latency: { p95: 250 }, throughput: 1000 },
          bottlenecks: ['database queries', 'memory allocation']
        })
      )

      expect(result.consensus.content).toContain('architectural-insights')
      expect(result.confidenceScore).toBeGreaterThanOrEqual(75)
    })

    it('should generate cost optimization analysis', async () => {
      const result = await Effect.runPromise(
        orchestrator.generateArchitecturalInsights('cost-optimization', {
          costs: { compute: 500, storage: 200, network: 100 },
          usage: { peak: '2pm-4pm', idle: '10pm-6am' }
        })
      )

      expect(result.consensus.content).toContain('architectural-insights')
      expect(result.insights?.qualityScores).toBeDefined()
    })
  })

  describe('Consensus Analysis', () => {
    it('should generate consensus from multiple models', async () => {
      const request: LLMRequest = {
        prompt: 'Analyze the benefits of microservices architecture',
        taskType: 'architectural-insights',
        preferences: {
          useMultiModel: true,
          temperature: 0.2
        }
      }

      const result = await Effect.runPromise(
        orchestrator.generateConsensusAnalysis(request)
      )

      expect(result.primary).toBeTruthy()
      expect(result.secondary).toBeTruthy()
      expect(result.consensus).toBeTruthy()
      expect(result.modelChain.length).toBeGreaterThan(1)
      expect(result.insights?.modelAgreement).toBeGreaterThan(0)
    })
  })

  describe('Model Capabilities', () => {
    it('should return available models and capabilities', async () => {
      const capabilities = await Effect.runPromise(
        orchestrator.getModelCapabilities()
      )

      expect(capabilities.availableModels).toContain('gpt')
      expect(capabilities.availableModels).toContain('claude')
      expect(capabilities.availableModels).toContain('llama')
      
      expect(capabilities.capabilities['market-intelligence']).toEqual({
        recommended: ['gpt', 'claude'],
        reasoning: 'Business analysis requires strong reasoning and market understanding'
      })

      expect(capabilities.capabilities['architectural-insights']).toEqual({
        recommended: ['claude', 'gpt'],
        reasoning: 'Technical architecture analysis benefits from deep technical knowledge'
      })
    })
  })
})