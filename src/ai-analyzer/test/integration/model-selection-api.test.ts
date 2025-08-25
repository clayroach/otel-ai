import { describe, it, expect, beforeAll, afterAll } from 'vitest'

// This test requires the backend service to be running
// Run with: pnpm test:integration

const API_BASE_URL = 'http://localhost:4319/api/ai-analyzer'

// Mock time range for tests
const testTimeRange = {
  startTime: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
  endTime: new Date().toISOString()
}

describe('AI Analyzer Model Selection API', () => {
  beforeAll(async () => {
    // Check if the service is available
    try {
      const response = await fetch(`${API_BASE_URL}/health`)
      if (!response.ok) {
        throw new Error(`Service health check failed: ${response.status}`)
      }
    } catch (error) {
      console.warn('⚠️  Backend service not available - skipping integration tests')
      console.warn('   Start the service with: pnpm dev:up')
    }
  })

  describe('Health Check', () => {
    it('should return service health status', async () => {
      const response = await fetch(`${API_BASE_URL}/health`)
      expect(response.ok).toBe(true)
      
      const health = await response.json()
      expect(health.status).toBe('healthy')
      expect(health.capabilities).toContain('architecture-analysis')
    })
  })

  describe('Default Statistical Model', () => {
    it('should analyze with local statistical analyzer', async () => {
      const response = await fetch(`${API_BASE_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'architecture',
          timeRange: testTimeRange
        })
      })

      expect(response.ok).toBe(true)
      const result = await response.json()

      // Verify response structure
      expect(result).toHaveProperty('requestId')
      expect(result).toHaveProperty('type', 'architecture')
      expect(result).toHaveProperty('insights')
      expect(result).toHaveProperty('metadata')

      // Verify metadata shows local analysis
      expect(result.metadata.llmModel).toBe('local-statistical-analyzer')
      expect(result.metadata.selectedModel).toBe('local-statistical-analyzer')
      expect(result.metadata.llmTokensUsed).toBe(0)

      // Should have baseline insights (performance, reliability, architecture)
      expect(result.insights.length).toBeGreaterThanOrEqual(2)
      expect(result.insights.some((i: any) => i.type === 'performance')).toBe(true)
      expect(result.insights.some((i: any) => i.type === 'reliability')).toBe(true)
    })

    it('should have properly formatted evidence', async () => {
      const response = await fetch(`${API_BASE_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'architecture',
          timeRange: testTimeRange
        })
      })

      const result = await response.json()
      const performanceInsight = result.insights.find((i: any) => i.type === 'performance')
      
      if (performanceInsight) {
        expect(Array.isArray(performanceInsight.evidence)).toBe(true)
        expect(typeof performanceInsight.evidence[0]).toBe('string')
        expect(performanceInsight.evidence[0]).toMatch(/^[\w-]+: \d+ms avg latency \(\d+ spans\)$/)
      }
    })
  })

  describe('Claude Model Selection', () => {
    it('should analyze with Claude model configuration', async () => {
      const response = await fetch(`${API_BASE_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'architecture',
          timeRange: testTimeRange,
          config: {
            llm: {
              model: 'claude',
              temperature: 0.7,
              maxTokens: 2000
            }
          }
        })
      })

      expect(response.ok).toBe(true)
      const result = await response.json()

      // Verify model metadata
      expect(result.metadata.llmModel).toBe('claude-via-llm-manager')
      expect(result.metadata.selectedModel).toBe('claude')
      expect(result.metadata.llmTokensUsed).toBe(1500) // Estimated

      // Should have enhanced insights (base + Claude-specific)
      expect(result.insights.length).toBeGreaterThan(3)
      
      // Should have Claude-specific architectural pattern insight
      const claudeInsight = result.insights.find((i: any) => 
        i.title === 'Architectural Pattern Analysis'
      )
      expect(claudeInsight).toBeDefined()
      expect(claudeInsight.metadata.generatedBy).toBe('claude-via-llm-manager')
      expect(claudeInsight.metadata.analysisMethod).toBe('llm-enhanced-analysis')
    })

    it('should include Claude-specific recommendations', async () => {
      const response = await fetch(`${API_BASE_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'architecture',
          timeRange: testTimeRange,
          config: { llm: { model: 'claude', temperature: 0.7, maxTokens: 2000 } }
        })
      })

      const result = await response.json()
      const claudeInsight = result.insights.find((i: any) => 
        i.title === 'Architectural Pattern Analysis'
      )

      expect(claudeInsight.recommendation).toContain('circuit breaker')
      expect(claudeInsight.recommendation).toContain('event-driven communication')
      expect(claudeInsight.evidence).toContain('Multiple services showing >10s latency suggest synchronous coupling')
    })
  })

  describe('GPT Model Selection', () => {
    it('should analyze with GPT model configuration', async () => {
      const response = await fetch(`${API_BASE_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'architecture',
          timeRange: testTimeRange,
          config: {
            llm: {
              model: 'gpt',
              temperature: 0.5,
              maxTokens: 1500
            }
          }
        })
      })

      expect(response.ok).toBe(true)
      const result = await response.json()

      // Verify model metadata
      expect(result.metadata.selectedModel).toBe('gpt')
      expect(result.metadata.llmModel).toBe('gpt-via-llm-manager')

      // Should have GPT-specific performance optimization insight
      const gptInsight = result.insights.find((i: any) => 
        i.title === 'Performance Optimization Opportunities'
      )
      expect(gptInsight).toBeDefined()
      expect(gptInsight.type).toBe('performance')
      expect(gptInsight.severity).toBe('warning')
    })

    it('should include GPT-specific performance recommendations', async () => {
      const response = await fetch(`${API_BASE_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'architecture',
          timeRange: testTimeRange,
          config: { llm: { model: 'gpt', temperature: 0.5, maxTokens: 1500 } }
        })
      })

      const result = await response.json()
      const gptInsight = result.insights.find((i: any) => 
        i.title === 'Performance Optimization Opportunities'
      )

      expect(gptInsight.recommendation).toContain('caching')
      expect(gptInsight.recommendation).toContain('connection pooling')
      expect(gptInsight.recommendation).toContain('async processing')
      expect(gptInsight.evidence).toContain('High-volume service calls without apparent caching strategies')
    })
  })

  describe('Llama Model Selection', () => {
    it('should analyze with Llama model configuration', async () => {
      const response = await fetch(`${API_BASE_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'architecture',
          timeRange: testTimeRange,
          config: {
            llm: {
              model: 'llama',
              temperature: 0.8,
              maxTokens: 1800
            }
          }
        })
      })

      expect(response.ok).toBe(true)
      const result = await response.json()

      // Verify model metadata
      expect(result.metadata.selectedModel).toBe('llama')
      expect(result.metadata.llmModel).toBe('llama-via-llm-manager')

      // Should have Llama-specific resource utilization insight
      const llamaInsight = result.insights.find((i: any) => 
        i.title === 'Resource Utilization & Scalability Analysis'
      )
      expect(llamaInsight).toBeDefined()
      expect(llamaInsight.type).toBe('reliability')
      expect(llamaInsight.severity).toBe('info')
    })

    it('should include Llama-specific scalability recommendations', async () => {
      const response = await fetch(`${API_BASE_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'architecture',
          timeRange: testTimeRange,
          config: { llm: { model: 'llama', temperature: 0.8, maxTokens: 1800 } }
        })
      })

      const result = await response.json()
      const llamaInsight = result.insights.find((i: any) => 
        i.title === 'Resource Utilization & Scalability Analysis'
      )

      expect(llamaInsight.recommendation).toContain('resource allocation')
      expect(llamaInsight.recommendation).toContain('horizontal scaling')
      expect(llamaInsight.evidence).toContain('Services showing memory/CPU intensive operation patterns')
    })
  })

  describe('Model Comparison', () => {
    it('should produce different insights for different models', async () => {
      // Get results from all models
      const [defaultResult, claudeResult, gptResult, llamaResult] = await Promise.all([
        fetch(`${API_BASE_URL}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'architecture', timeRange: testTimeRange })
        }).then(r => r.json()),
        
        fetch(`${API_BASE_URL}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            type: 'architecture', 
            timeRange: testTimeRange,
            config: { llm: { model: 'claude', temperature: 0.7, maxTokens: 2000 } }
          })
        }).then(r => r.json()),
        
        fetch(`${API_BASE_URL}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            type: 'architecture', 
            timeRange: testTimeRange,
            config: { llm: { model: 'gpt', temperature: 0.5, maxTokens: 1500 } }
          })
        }).then(r => r.json()),
        
        fetch(`${API_BASE_URL}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            type: 'architecture', 
            timeRange: testTimeRange,
            config: { llm: { model: 'llama', temperature: 0.8, maxTokens: 1800 } }
          })
        }).then(r => r.json())
      ])

      // Different models should produce different numbers of insights
      expect(claudeResult.insights.length).toBeGreaterThan(defaultResult.insights.length)
      expect(gptResult.insights.length).toBeGreaterThan(defaultResult.insights.length)
      expect(llamaResult.insights.length).toBeGreaterThan(defaultResult.insights.length)

      // Each enhanced model should have unique insights
      const claudeTitles = claudeResult.insights.map((i: any) => i.title)
      const gptTitles = gptResult.insights.map((i: any) => i.title)
      const llamaTitles = llamaResult.insights.map((i: any) => i.title)

      expect(claudeTitles).toContain('Architectural Pattern Analysis')
      expect(gptTitles).toContain('Performance Optimization Opportunities')
      expect(llamaTitles).toContain('Resource Utilization & Scalability Analysis')

      // Enhanced models should not have each other's unique insights
      expect(gptTitles).not.toContain('Architectural Pattern Analysis')
      expect(llamaTitles).not.toContain('Performance Optimization Opportunities')
      expect(claudeTitles).not.toContain('Resource Utilization & Scalability Analysis')
    })

    it('should maintain consistent base insights across all models', async () => {
      // All models should include the statistical base insights
      const [defaultResult, claudeResult, gptResult, llamaResult] = await Promise.all([
        fetch(`${API_BASE_URL}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'architecture', timeRange: testTimeRange })
        }).then(r => r.json()),
        
        fetch(`${API_BASE_URL}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            type: 'architecture', 
            timeRange: testTimeRange,
            config: { llm: { model: 'claude', temperature: 0.7, maxTokens: 2000 } }
          })
        }).then(r => r.json()),
        
        fetch(`${API_BASE_URL}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            type: 'architecture', 
            timeRange: testTimeRange,
            config: { llm: { model: 'gpt', temperature: 0.5, maxTokens: 1500 } }
          })
        }).then(r => r.json()),
        
        fetch(`${API_BASE_URL}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            type: 'architecture', 
            timeRange: testTimeRange,
            config: { llm: { model: 'llama', temperature: 0.8, maxTokens: 1800 } }
          })
        }).then(r => r.json())
      ])

      // All should have base insights
      const results = [defaultResult, claudeResult, gptResult, llamaResult]
      for (const result of results) {
        const insightTypes = result.insights.map((i: any) => i.type)
        expect(insightTypes.filter((t: string) => t === 'performance').length).toBeGreaterThanOrEqual(1)
        expect(insightTypes.filter((t: string) => t === 'reliability').length).toBeGreaterThanOrEqual(1)
      }
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid model selection gracefully', async () => {
      const response = await fetch(`${API_BASE_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'architecture',
          timeRange: testTimeRange,
          config: {
            llm: {
              model: 'invalid-model' as any,
              temperature: 0.7,
              maxTokens: 2000
            }
          }
        })
      })

      // Should still work but fall back to statistical analysis
      expect(response.ok).toBe(true)
      const result = await response.json()
      expect(result.insights.length).toBeGreaterThanOrEqual(2)
    })

    it('should handle missing time range by defaulting to 15 minutes', async () => {
      const response = await fetch(`${API_BASE_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'architecture'
          // Missing timeRange - should default to last 15 minutes
        })
      })

      expect(response.ok).toBe(true)
      const result = await response.json()
      expect(result).toHaveProperty('requestId')
      expect(result).toHaveProperty('type', 'architecture')
      expect(result).toHaveProperty('insights')
      expect(result).toHaveProperty('metadata')
      
      // Should use default statistical model when no config provided
      expect(result.metadata.llmModel).toBe('local-statistical-analyzer')
    })

    it('should handle malformed request body', async () => {
      const response = await fetch(`${API_BASE_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json'
      })

      expect(response.ok).toBe(false)
      expect(response.status).toBe(400)
    })
  })

  describe('Performance', () => {
    it('should respond within reasonable time limits', async () => {
      const startTime = Date.now()
      
      const response = await fetch(`${API_BASE_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'architecture',
          timeRange: testTimeRange,
          config: { llm: { model: 'claude', temperature: 0.7, maxTokens: 2000 } }
        })
      })

      const endTime = Date.now()
      const duration = endTime - startTime

      expect(response.ok).toBe(true)
      expect(duration).toBeLessThan(10000) // Should complete within 10 seconds
      
      const result = await response.json()
      expect(result.metadata.analysisTimeMs).toBeGreaterThan(0)
      expect(result.metadata.analysisTimeMs).toBeLessThan(5000) // Analysis itself should be < 5s
    })
  })
})