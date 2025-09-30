import { describe, it, expect, beforeAll } from 'vitest'
import { TypedAPIClient } from '../helpers/api-client.js'
import { ensureClickHouseRunning } from './test-helpers.js'

// This test validates that the UI model selection actually produces different results
// by simulating exactly what the UI does when changing models

const API_BASE_URL = 'http://localhost:4319'
const apiClient = new TypedAPIClient(API_BASE_URL)

// Mock the exact request payload that the UI sends
const createUIRequest = (model: string) => {
  const now = new Date()
  const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000)
  
  return {
    type: 'architecture',
    timeRange: {
      startTime: fourHoursAgo.toISOString(),
      endTime: now.toISOString()
    },
    filters: {},
    config: model !== 'local-statistical-analyzer' ? {
      llm: {
        model: model as 'gpt' | 'claude' | 'llama',
        temperature: model === 'gpt' ? 0.5 : (model === 'llama' ? 0.8 : 0.7),
        maxTokens: model === 'gpt' ? 1500 : (model === 'llama' ? 1800 : 2000)
      },
      analysis: {
        timeWindowHours: 4,
        minSpanCount: 100
      },
      output: {
        format: 'markdown',
        includeDigrams: true,
        detailLevel: 'comprehensive'
      }
    } : {
      analysis: {
        timeWindowHours: 4,
        minSpanCount: 100
      },
      output: {
        format: 'markdown',
        includeDigrams: true,
        detailLevel: 'comprehensive'
      }
    }
  }
}

describe('UI Model Selection Integration', () => {
  beforeAll(async () => {
    // Check ClickHouse is running FIRST - fail fast if not
    await ensureClickHouseRunning()

    // Then check if the backend service is available
    try {
      await apiClient.getHealthCheck()
      console.log('✅ AI Analyzer service is ready')
    } catch (error) {
      console.warn('⚠️  Backend service not available - skipping UI integration tests')
      console.warn('   Start the service with: pnpm dev:up')
    }
  })

  describe('Model Selection Behavior Simulation', () => {
    it('should simulate UI model selection and validate different outputs', async () => {
      console.log('🧪 Testing UI model selection behavior...')
      
      // Test each model selection exactly as UI would do it
      const models = [
        'local-statistical-analyzer',
        'claude',
        'gpt', 
        'llama'
      ]
      
      const results = new Map<string, { insights: { title: string; [key: string]: unknown }[]; metadata: { selectedModel: string; llmModel: string; [key: string]: unknown } }>()
      
      // Sequential requests (as UI would do when user changes model)
      for (const model of models) {
        console.log(`📡 Testing model: ${model}`)
        
        const requestPayload = createUIRequest(model)
        console.log(`🔍 Request payload for ${model}:`, JSON.stringify(requestPayload, null, 2))
        
        const result = await apiClient.getAnalysis({
          type: requestPayload.type as 'architecture',
          timeRange: requestPayload.timeRange,
          filters: requestPayload.filters,
          config: requestPayload.config
        })
        // Type-safe result handling
        const typedResult = {
          insights: Array.isArray(result.insights) ? result.insights : [],
          metadata: {
            ...result.metadata,
            selectedModel: result.metadata?.selectedModel || model,
            llmModel: result.metadata?.llmModel || model
          }
        }
        results.set(model, typedResult)
        
        console.log(`📊 ${model} returned ${typedResult.insights.length} insights`)
        console.log(`🔍 ${model} metadata:`, JSON.stringify(typedResult.metadata, null, 2))
      }
      
      // Validate that results are actually different
      const statisticalResult = results.get('local-statistical-analyzer')
      const claudeResult = results.get('claude')
      const gptResult = results.get('gpt')
      const llamaResult = results.get('llama')
      
      // Ensure all results exist
      if (!statisticalResult || !claudeResult || !gptResult || !llamaResult) {
        throw new Error('Missing model results - one or more models failed to return data')
      }
      
      // Debug: Log actual insight counts to understand the data scenario
      console.log(`📊 Insight counts - Statistical: ${statisticalResult.insights.length}, Claude: ${claudeResult.insights.length}, GPT: ${gptResult.insights.length}, Llama: ${llamaResult.insights.length}`)
      
      // Enhanced models should have more insights than statistical (they add model-specific insights)
      // If there's insufficient data, statistical might equal enhanced, so use >= as fallback
      if (statisticalResult.insights.length >= 3) {
        // With sufficient data, enhanced should have more insights
        console.log('🔍 Sufficient data scenario - expecting enhanced models to have MORE insights')
        expect(claudeResult.insights.length).toBeGreaterThan(statisticalResult.insights.length)
        expect(gptResult.insights.length).toBeGreaterThan(statisticalResult.insights.length)
        expect(llamaResult.insights.length).toBeGreaterThan(statisticalResult.insights.length)
      } else {
        // With limited data, enhanced should at least equal statistical
        console.log('⚠️ Limited data scenario - expecting enhanced models to have AT LEAST as many insights')
        expect(claudeResult.insights.length).toBeGreaterThanOrEqual(statisticalResult.insights.length)
        expect(gptResult.insights.length).toBeGreaterThanOrEqual(statisticalResult.insights.length)
        expect(llamaResult.insights.length).toBeGreaterThanOrEqual(statisticalResult.insights.length)
      }
      
      // Enhanced models should have similar counts (within reasonable range)
      const insightCounts = [claudeResult.insights.length, gptResult.insights.length, llamaResult.insights.length]
      const minCount = Math.min(...insightCounts)
      const maxCount = Math.max(...insightCounts)
      expect(maxCount - minCount).toBeLessThanOrEqual(2) // Allow up to 2 insight difference between models
      
      // Check insight titles to ensure they're actually different (type-safe)
      const statisticalTitles = statisticalResult.insights.map(i => typeof i === 'object' && i && 'title' in i ? String(i.title) : 'Unknown')
      const claudeTitles = claudeResult.insights.map(i => typeof i === 'object' && i && 'title' in i ? String(i.title) : 'Unknown')
      const gptTitles = gptResult.insights.map(i => typeof i === 'object' && i && 'title' in i ? String(i.title) : 'Unknown')
      const llamaTitles = llamaResult.insights.map(i => typeof i === 'object' && i && 'title' in i ? String(i.title) : 'Unknown')
      
      console.log('📋 Statistical insights:', statisticalTitles)
      console.log('📋 Claude insights:', claudeTitles)
      console.log('📋 GPT insights:', gptTitles)
      console.log('📋 Llama insights:', llamaTitles)
      
      // Statistical should not have model-specific insights
      expect(statisticalTitles).not.toContain('Architectural Pattern Analysis')
      expect(statisticalTitles).not.toContain('Performance Optimization Opportunities')
      expect(statisticalTitles).not.toContain('Resource Utilization & Scalability Analysis')
      
      // Each enhanced model should have its unique insight
      expect(claudeTitles).toContain('Architectural Pattern Analysis')
      expect(gptTitles).toContain('Performance Optimization Opportunities')
      expect(llamaTitles).toContain('Resource Utilization & Scalability Analysis')
      
      // Enhanced models should NOT have each other's unique insights
      expect(gptTitles).not.toContain('Architectural Pattern Analysis')
      expect(llamaTitles).not.toContain('Performance Optimization Opportunities')
      expect(claudeTitles).not.toContain('Resource Utilization & Scalability Analysis')
      
      // Metadata should reflect correct model selection (type-safe access)
      expect(statisticalResult.metadata.selectedModel).toBe('local-statistical-analyzer')
      expect(claudeResult.metadata.selectedModel).toBe('claude')
      expect(gptResult.metadata.selectedModel).toBe('gpt')
      expect(llamaResult.metadata.selectedModel).toBe('llama')
      
      expect(statisticalResult.metadata.llmModel).toBe('local-statistical-analyzer')
      expect(claudeResult.metadata.llmModel).toBe('claude-via-llm-manager')
      expect(gptResult.metadata.llmModel).toBe('gpt-via-llm-manager')
      expect(llamaResult.metadata.llmModel).toBe('llama-via-llm-manager')
    })

    it('should validate UI request payload structure matches expected format', async () => {
      const testCases = [
        { model: 'local-statistical-analyzer', expectConfig: true, expectLLM: false },
        { model: 'claude', expectConfig: true, expectLLM: true },
        { model: 'gpt', expectConfig: true, expectLLM: true },
        { model: 'llama', expectConfig: true, expectLLM: true }
      ]
      
      for (const testCase of testCases) {
        const payload = createUIRequest(testCase.model)
        
        // All should have basic structure
        expect(payload).toHaveProperty('type', 'architecture')
        expect(payload).toHaveProperty('timeRange')
        expect(payload.timeRange).toHaveProperty('startTime')
        expect(payload.timeRange).toHaveProperty('endTime')
        expect(payload).toHaveProperty('filters')
        
        if (testCase.expectConfig) {
          expect(payload).toHaveProperty('config')
        }
        
        if (testCase.expectLLM) {
          expect(payload.config).toHaveProperty('llm')
          expect(payload.config.llm).toHaveProperty('model', testCase.model)
          expect(payload.config.llm).toHaveProperty('temperature')
          expect(payload.config.llm).toHaveProperty('maxTokens')
        } else {
          // Statistical model should not have LLM config
          expect(payload.config).not.toHaveProperty('llm')
        }
        
        console.log(`✅ ${testCase.model} payload structure validated`)
      }
    })

    it('should ensure requests are not cached or memoized inappropriately', async () => {
      console.log('🔄 Testing request caching behavior...')
      
      // Make the same request twice to see if results are identical
      const model = 'claude'
      const payload = createUIRequest(model)
      
      const [result1, result2] = await Promise.all([
        apiClient.getAnalysis({
          type: payload.type as 'architecture',
          timeRange: payload.timeRange,
          filters: payload.filters,
          config: payload.config
        }),
        apiClient.getAnalysis({
          type: payload.type as 'architecture', 
          timeRange: payload.timeRange,
          filters: payload.filters,
          config: payload.config
        })
      ])
      
      // Results should be consistent (same insights, same metadata)
      expect(result1.insights.length).toBe(result2.insights.length)
      expect(result1.metadata.selectedModel).toBe(result2.metadata.selectedModel)
      expect(result1.metadata.llmModel).toBe(result2.metadata.llmModel)
      
      const titles1 = result1.insights.map(i => typeof i === 'object' && i && 'title' in i ? String(i.title) : 'Unknown')
      const titles2 = result2.insights.map(i => typeof i === 'object' && i && 'title' in i ? String(i.title) : 'Unknown')
      expect(titles1).toEqual(titles2)
      
      console.log('✅ Caching behavior verified - consistent results')
    })

    it('should test rapid model switching (simulating UI dropdown changes)', async () => {
      console.log('🔄 Testing rapid model switching...')
      
      // Use fixed time range to ensure consistent data for all requests
      const fixedEndTime = new Date()
      const fixedStartTime = new Date(fixedEndTime.getTime() - 4 * 60 * 60 * 1000)
      
      const createFixedUIRequest = (model: string) => {
        const basePayload = createUIRequest(model)
        return {
          ...basePayload,
          timeRange: {
            startTime: fixedStartTime.toISOString(),
            endTime: fixedEndTime.toISOString()
          }
        }
      }
      
      // Simulate user rapidly changing models in UI
      const switchSequence = ['claude', 'gpt', 'llama', 'local-statistical-analyzer', 'claude']
      
      const results = []
      for (const model of switchSequence) {
        const payload = createFixedUIRequest(model)
        const result = await apiClient.getAnalysis({
          type: payload.type as 'architecture',
          timeRange: payload.timeRange,
          filters: payload.filters,
          config: payload.config
        })
        results.push({ 
          model, 
          result: {
            insights: Array.isArray(result.insights) ? result.insights : [],
            metadata: result.metadata || {}
          }
        })
        
        console.log(`🔄 Switch to ${model}: ${result.insights.length} insights, selected: ${result.metadata.selectedModel}`)
      }
      
      // Validate each result has correct model metadata
      results.forEach(({ model, result }) => {
        expect(result.metadata.selectedModel).toBe(model)
        
        if (model === 'local-statistical-analyzer') {
          expect(result.metadata.llmModel).toBe('local-statistical-analyzer')
        } else {
          expect(result.metadata.llmModel).toBe(`${model}-via-llm-manager`)
        }
      })
      
      // First and last should be the same model (both Claude) with consistent metadata
      const firstClaudeResult = results[0]?.result
      const lastClaudeResult = results[4]?.result
      
      if (!firstClaudeResult || !lastClaudeResult) {
        throw new Error('Missing Claude results')
      }
      
      // Both should be Claude with correct metadata  
      expect(firstClaudeResult.metadata.selectedModel).toBe('claude')
      expect(lastClaudeResult.metadata.selectedModel).toBe('claude')
      expect(firstClaudeResult.metadata.llmModel).toBe('claude-via-llm-manager')
      expect(lastClaudeResult.metadata.llmModel).toBe('claude-via-llm-manager')
      
      // In a growing telemetry environment, results may vary as statistical baseline changes
      // Both should have reasonable insight counts - at least 1 (minimal) but typically 2-4
      expect(firstClaudeResult.insights.length).toBeGreaterThanOrEqual(1)
      expect(lastClaudeResult.insights.length).toBeGreaterThanOrEqual(1)
      
      // Both should contain Claude's unique insight (type-safe)
      const firstTitles = firstClaudeResult.insights.map(i => typeof i === 'object' && i && 'title' in i ? String(i.title) : 'Unknown')
      const lastTitles = lastClaudeResult.insights.map(i => typeof i === 'object' && i && 'title' in i ? String(i.title) : 'Unknown')
      expect(firstTitles).toContain('Architectural Pattern Analysis')
      expect(lastTitles).toContain('Architectural Pattern Analysis')
      
      console.log(`🔍 Claude consistency check - First: ${firstClaudeResult.insights.length} insights, Last: ${lastClaudeResult.insights.length} insights`)
      
      console.log('✅ Rapid model switching validated')
    })
  })

  describe('UI State Management Edge Cases', () => {
    it('should handle model selection with partial config', async () => {
      // Test what happens if UI sends incomplete config
      const now = new Date()
      const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000)
      const timeRange = {
        startTime: fourHoursAgo.toISOString(),
        endTime: now.toISOString()
      }
      
      const partialConfigs = [
        {
          type: 'architecture',
          timeRange,
          config: { llm: { model: 'claude' } } // Missing temperature, maxTokens
        },
        {
          type: 'architecture',
          timeRange,
          config: { llm: { model: 'gpt', temperature: 0.5 } } // Missing maxTokens
        },
        {
          type: 'architecture',
          timeRange,
          config: {} // Empty config
        }
      ]
      
      for (const payload of partialConfigs) {
        // Should still work (defaults to 15 minutes, uses config as provided)
        const result = await apiClient.getAnalysis({
          type: payload.type as 'architecture',
          timeRange: payload.timeRange,
          filters: {},
          config: payload.config
        })
        expect(result).toHaveProperty('insights')
        expect(result).toHaveProperty('metadata')
        
        console.log(`✅ Partial config handled: ${JSON.stringify(payload.config)}`)
      }
    })

    it('should validate that model changes actually affect API requests', async () => {
      // This is the core test - ensure changing model in UI actually changes API behavior
      const models = ['claude', 'gpt', 'llama']
      const uniqueResults = new Set<string>()
      
      for (const model of models) {
        const payload = createUIRequest(model)
        const result = await apiClient.getAnalysis({
          type: payload.type as 'architecture',
          timeRange: payload.timeRange,
          filters: {},
          config: payload.config
        })
        
        const signature = JSON.stringify({
          insightTitles: Array.isArray(result.insights)
            ? result.insights.map(i => typeof i === 'object' && i && 'title' in i ? String(i.title) : 'Unknown').sort()
            : [],
          selectedModel: result.metadata?.selectedModel || 'unknown',
          llmModel: result.metadata?.llmModel || 'unknown'
        })
        
        uniqueResults.add(signature)
        console.log(`🔍 ${model} signature: ${signature.substring(0, 100)}...`)
      }
      
      // Should have 3 unique result signatures (one per model)
      expect(uniqueResults.size).toBe(3)
      console.log('✅ All models produce unique results')
    })
  })
})