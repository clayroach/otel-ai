/**
 * Multi-Model Query Generation Integration Test
 * 
 * Tests query generation across multiple LLM models including:
 * - Local models (via LM Studio)
 * - Claude (via Anthropic API)
 * - GPT (via OpenAI API)
 */

import { describe, it, expect, beforeAll } from "vitest"
import { Effect } from "effect"
import { generateQueryWithLLM, ANALYSIS_GOALS, validateGeneratedSQL } from "../../query-generator/llm-query-generator"
import { CriticalPath } from "../../query-generator/types"
import { getModelMetadata } from "../../../llm-manager/model-registry"

// Test configuration for different model providers
interface ModelTestConfig {
  modelId: string
  endpoint?: string | undefined
  apiKey?: string | undefined
  enabled: boolean
  skipReason?: string
}

// Configuration for multi-model testing
// Use environment-configured models with priority
const getModelConfigs = (): ModelTestConfig[] => {
  const configs: ModelTestConfig[] = []
  
  // SQL-specific models from environment (for SQL generation)
  const sqlModels = [
    process.env.LLM_SQL_MODEL_1,
    process.env.LLM_SQL_MODEL_2,
    process.env.LLM_SQL_MODEL_3
  ].filter(Boolean)
  
  sqlModels.forEach(modelId => {
    if (modelId) {
      configs.push({
        modelId,
        endpoint: process.env.LLM_ENDPOINT || 'http://localhost:1234/v1',
        enabled: true
      })
    }
  })
  
  // General models from environment (for general queries)
  const generalModels = [
    process.env.LLM_GENERAL_MODEL_1,
    process.env.LLM_GENERAL_MODEL_2,
    process.env.LLM_GENERAL_MODEL_3
  ].filter(Boolean)
  
  generalModels.forEach(modelId => {
    if (modelId) {
      if (modelId.includes('claude')) {
        configs.push({
          modelId,
          endpoint: 'https://api.anthropic.com/v1',
          apiKey: process.env.CLAUDE_API_KEY,
          enabled: !!process.env.CLAUDE_API_KEY && process.env.SKIP_LLM_TESTS !== 'true',
          skipReason: !process.env.CLAUDE_API_KEY ? 'Claude API key not configured' : 'External API tests disabled'
        })
      } else if (modelId.includes('gpt')) {
        configs.push({
          modelId,
          endpoint: 'https://api.openai.com/v1',
          apiKey: process.env.OPENAI_API_KEY,
          enabled: !!process.env.OPENAI_API_KEY && process.env.SKIP_LLM_TESTS !== 'true',
          skipReason: !process.env.OPENAI_API_KEY ? 'OpenAI API key not configured' : 'External API tests disabled'
        })
      } else {
        // Local model
        configs.push({
          modelId,
          endpoint: process.env.LLM_ENDPOINT || 'http://localhost:1234/v1',
          enabled: true
        })
      }
    }
  })
  
  // If no models configured, use defaults
  if (configs.length === 0) {
    configs.push(
      {
        modelId: 'sqlcoder-7b-2',
        endpoint: process.env.LLM_ENDPOINT || 'http://localhost:1234/v1',
        enabled: true
      },
      {
        modelId: 'codellama-7b-instruct',
        endpoint: process.env.LLM_ENDPOINT || 'http://localhost:1234/v1',
        enabled: true
      }
    )
  }
  
  return configs
}

const MODEL_CONFIGS = getModelConfigs()

// Test data
const testPath: CriticalPath = {
  id: "multi-tier-app",
  name: "Multi-Tier Application Critical Path",
  services: ["api-gateway", "auth-service", "user-service", "database", "cache"],
  startService: "api-gateway",
  endService: "database",
  metadata: {
    criticality: "high",
    sla: "99.99%"
  }
}

// Model availability tracking
interface ModelAvailability {
  modelId: string
  available: boolean
  endpoint?: string | undefined
  error?: string | undefined
  metadata?: ReturnType<typeof getModelMetadata> | undefined
}

describe("Multi-Model Query Generation", () => {
  const modelAvailability: ModelAvailability[] = []
  
  beforeAll(async () => {
    console.log("\n🔍 Checking model availability across providers...")
    console.log("   Using model preferences from environment:")
    console.log(`   SQL Models: ${[process.env.LLM_SQL_MODEL_1, process.env.LLM_SQL_MODEL_2, process.env.LLM_SQL_MODEL_3].filter(Boolean).join(', ') || 'defaults'}`)
    console.log(`   General Models: ${[process.env.LLM_GENERAL_MODEL_1, process.env.LLM_GENERAL_MODEL_2, process.env.LLM_GENERAL_MODEL_3].filter(Boolean).join(', ') || 'defaults'}`)
    
    // Check local models via LM Studio
    try {
      const localEndpoint = process.env.LLM_ENDPOINT || 'http://localhost:1234/v1'
      const response = await fetch(`${localEndpoint}/models`)
      
      if (response.ok) {
        const data = await response.json()
        const availableModels = (data.data || []).map((m: { id: string }) => m.id)
        console.log(`   ✅ Local models (LM Studio): ${availableModels.length} models available`)
        
        MODEL_CONFIGS.filter(c => c.endpoint?.includes('localhost')).forEach(config => {
          const isAvailable = availableModels.includes(config.modelId)
          modelAvailability.push({
            modelId: config.modelId,
            available: isAvailable && config.enabled,
            endpoint: config.endpoint,
            metadata: getModelMetadata(config.modelId),
            error: isAvailable ? undefined : 'Model not loaded in LM Studio'
          })
          
          if (isAvailable) {
            console.log(`      - ${config.modelId}: ✓ Available`)
          }
        })
      } else {
        console.log(`   ❌ Local models: LM Studio not responding`)
        MODEL_CONFIGS.filter(c => c.endpoint?.includes('localhost')).forEach(config => {
          modelAvailability.push({
            modelId: config.modelId,
            available: false,
            error: 'LM Studio not available'
          })
        })
      }
    } catch (error) {
      console.log(`   ❌ Local models: ${error}`)
      MODEL_CONFIGS.filter(c => c.endpoint?.includes('localhost')).forEach(config => {
        modelAvailability.push({
          modelId: config.modelId,
          available: false,
          error: 'LM Studio connection failed'
        })
      })
    }
    
    // Check Claude models
    const claudeConfigs = MODEL_CONFIGS.filter(c => c.modelId.includes('claude'))
    if (claudeConfigs.some(c => c.enabled)) {
      console.log(`   ✅ Claude models: API key configured`)
      claudeConfigs.forEach(config => {
        modelAvailability.push({
          modelId: config.modelId,
          available: config.enabled,
          endpoint: config.endpoint,
          metadata: getModelMetadata(config.modelId),
          error: config.enabled ? undefined : config.skipReason
        })
      })
    } else {
      console.log(`   ⏭️  Claude models: ${claudeConfigs[0]?.skipReason}`)
      claudeConfigs.forEach(config => {
        modelAvailability.push({
          modelId: config.modelId,
          available: false,
          error: config.skipReason
        })
      })
    }
    
    // Check GPT models
    const gptConfigs = MODEL_CONFIGS.filter(c => c.modelId.includes('gpt'))
    if (gptConfigs.some(c => c.enabled)) {
      console.log(`   ✅ GPT models: API key configured`)
      gptConfigs.forEach(config => {
        modelAvailability.push({
          modelId: config.modelId,
          available: config.enabled,
          endpoint: config.endpoint,
          metadata: getModelMetadata(config.modelId),
          error: config.enabled ? undefined : config.skipReason
        })
      })
    } else {
      console.log(`   ⏭️  GPT models: ${gptConfigs[0]?.skipReason}`)
      gptConfigs.forEach(config => {
        modelAvailability.push({
          modelId: config.modelId,
          available: false,
          error: config.skipReason
        })
      })
    }
    
    // Summary
    const availableCount = modelAvailability.filter(m => m.available).length
    const totalCount = modelAvailability.length
    console.log(`\n📊 Model availability summary: ${availableCount}/${totalCount} models available`)
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  })
  
  describe("Model Discovery", () => {
    it("should report available models and their capabilities", () => {
      console.log("\n📋 Detailed model report:")
      
      const byProvider: Record<string, ModelAvailability[]> = {}
      modelAvailability.forEach(model => {
        const provider = model.metadata?.provider || 'unknown'
        if (!byProvider[provider]) byProvider[provider] = []
        byProvider[provider].push(model)
      })
      
      Object.entries(byProvider).forEach(([provider, models]) => {
        console.log(`\n   ${provider.toUpperCase()}:`)
        models.forEach(model => {
          const status = model.available ? '✅' : '❌'
          const type = model.metadata?.type || 'unknown'
          const capabilities = model.metadata?.capabilities
          const caps = capabilities ? 
            `[${capabilities.sql ? 'SQL' : ''}${capabilities.json ? ' JSON' : ''}${capabilities.reasoning ? ' Reasoning' : ''}]`.replace(/\s+/g, ' ').trim() : 
            '[]'
          
          console.log(`     ${status} ${model.modelId} (${type}) ${caps}`)
          if (!model.available && model.error) {
            console.log(`        → ${model.error}`)
          }
        })
      })
      
      expect(modelAvailability.length).toBeGreaterThan(0)
      expect(modelAvailability.some(m => m.available)).toBe(true)
    })
  })
  
  describe("Comparative Query Generation", () => {
    const availableModels = () => modelAvailability.filter(m => m.available)
    
    it("should generate valid SQL across all available models", async () => {
      const models = availableModels()
      if (models.length === 0) {
        console.log("   ⏭️  Skipping: No models available")
        return
      }
      
      console.log(`\n🔄 Testing SQL generation across ${models.length} models...`)
      
      const results = await Promise.all(
        models.map(async model => {
          const startTime = Date.now()
          try {
            const config = MODEL_CONFIGS.find(c => c.modelId === model.modelId)
            const query = await Effect.runPromise(
              generateQueryWithLLM(testPath, ANALYSIS_GOALS.latency, 
                config?.endpoint ? {
                  endpoint: config.endpoint,
                  model: model.modelId
                } : {
                  model: model.modelId
                }
              )
            )
            const duration = Date.now() - startTime
            
            return {
              modelId: model.modelId,
              success: true,
              duration,
              query,
              valid: validateGeneratedSQL(query.sql)
            }
          } catch (error) {
            const duration = Date.now() - startTime
            return {
              modelId: model.modelId,
              success: false,
              duration,
              error: error instanceof Error ? error.message : String(error),
              valid: false
            }
          }
        })
      )
      
      // Report results
      console.log("\n📊 SQL Generation Results:")
      console.log("┌─────────────────────────────┬─────────┬──────────┬─────────┐")
      console.log("│ Model                       │ Status  │ Duration │ Valid   │")
      console.log("├─────────────────────────────┼─────────┼──────────┼─────────┤")
      
      results.forEach(result => {
        const modelName = result.modelId.padEnd(27).substring(0, 27)
        const status = result.success ? '✅ OK   ' : '❌ FAIL '
        const duration = `${result.duration}ms`.padEnd(8)
        const valid = result.valid ? '✅ Yes  ' : '❌ No   '
        
        console.log(`│ ${modelName} │ ${status} │ ${duration} │ ${valid} │`)
      })
      
      console.log("└─────────────────────────────┴─────────┴──────────┴─────────┘")
      
      // Show sample queries from different model types
      console.log("\n📝 Sample queries by model type:")
      
      const samplesByType: Record<string, typeof results[0]> = {}
      results.filter(r => r.success).forEach(result => {
        const metadata = getModelMetadata(result.modelId)
        const type = metadata?.type || 'unknown'
        if (!samplesByType[type]) {
          samplesByType[type] = result
        }
      })
      
      Object.entries(samplesByType).forEach(([type, result]) => {
        console.log(`\n   ${type.toUpperCase()} Model (${result.modelId}):`)
        if (result.query) {
          const sqlPreview = result.query.sql
            .split('\n')
            .slice(0, 3)
            .join('\n')
            .substring(0, 200)
          console.log(`   ${sqlPreview}...`)
        }
      })
      
      // Assertions
      const successfulQueries = results.filter(r => r.success && r.valid)
      expect(successfulQueries.length).toBeGreaterThan(0)
    })
    
    it("should handle different analysis goals consistently", async () => {
      const models = availableModels().slice(0, 2) // Test with top 2 models for speed
      if (models.length === 0) {
        console.log("   ⏭️  Skipping: No models available")
        return
      }
      
      console.log(`\n🎯 Testing different analysis goals with ${models.length} models...`)
      
      const goals = [
        ANALYSIS_GOALS.latency,
        ANALYSIS_GOALS.errors,
        ANALYSIS_GOALS.throughput
      ]
      
      interface GoalTestResult {
        modelId: string
        goal: string
        success: boolean
        hasExpectedKeywords: boolean
      }
      
      const results: GoalTestResult[] = []
      
      for (const model of models) {
        for (const goal of goals) {
          const config = MODEL_CONFIGS.find(c => c.modelId === model.modelId)
          try {
            const query = await Effect.runPromise(
              generateQueryWithLLM(testPath, goal, 
                config?.endpoint ? {
                  endpoint: config.endpoint,
                  model: model.modelId
                } : {
                  model: model.modelId
                }
              )
            )
            results.push({
              modelId: model.modelId,
              goal,
              success: true,
              hasExpectedKeywords: checkQueryKeywords(query.sql, goal)
            })
          } catch (error) {
            results.push({
              modelId: model.modelId,
              goal,
              success: false,
              hasExpectedKeywords: false
            })
          }
        }
      }
      
      // Report goal-specific results
      console.log("\n📊 Analysis Goal Results:")
      models.forEach(model => {
        console.log(`\n   ${model.modelId}:`)
        goals.forEach(goal => {
          const result = results.find(r => r.modelId === model.modelId && r.goal === goal)
          const status = result?.success ? '✅' : '❌'
          const keywords = result?.hasExpectedKeywords ? '✓' : '✗'
          console.log(`     ${goal.substring(0, 40).padEnd(40)} ${status} Keywords: ${keywords}`)
        })
      })
      
      expect(results.some(r => r.success)).toBe(true)
    })
    
    it("should measure performance characteristics", async () => {
      const models = availableModels()
      if (models.length === 0) {
        console.log("   ⏭️  Skipping: No models available")
        return
      }
      
      console.log(`\n⚡ Performance characteristics for ${models.length} models...`)
      
      // Run 3 queries per model for average timing
      const runs = 3
      const performanceData: Record<string, number[]> = {}
      
      for (const model of models.slice(0, 3)) { // Limit to 3 models for test speed
        performanceData[model.modelId] = []
        
        for (let i = 0; i < runs; i++) {
          const config = MODEL_CONFIGS.find(c => c.modelId === model.modelId)
          const startTime = Date.now()
          
          try {
            await Effect.runPromise(
              generateQueryWithLLM(testPath, ANALYSIS_GOALS.latency, 
                config?.endpoint ? {
                  endpoint: config.endpoint,
                  model: model.modelId
                } : {
                  model: model.modelId
                }
              )
            )
            const duration = Date.now() - startTime
            performanceData[model.modelId]?.push(duration)
          } catch (error) {
            performanceData[model.modelId]?.push(-1) // Error marker
          }
        }
      }
      
      // Calculate statistics
      console.log("\n📊 Performance Statistics (ms):")
      console.log("┌─────────────────────────────┬──────────┬──────────┬──────────┐")
      console.log("│ Model                       │ Min      │ Avg      │ Max      │")
      console.log("├─────────────────────────────┼──────────┼──────────┼──────────┤")
      
      Object.entries(performanceData).forEach(([modelId, times]) => {
        const validTimes = times.filter(t => t > 0)
        if (validTimes.length > 0) {
          const min = Math.min(...validTimes)
          const avg = validTimes.reduce((a, b) => a + b, 0) / validTimes.length
          const max = Math.max(...validTimes)
          
          const modelName = modelId.padEnd(27).substring(0, 27)
          console.log(`│ ${modelName} │ ${String(min).padEnd(8)} │ ${String(Math.round(avg)).padEnd(8)} │ ${String(max).padEnd(8)} │`)
        }
      })
      
      console.log("└─────────────────────────────┴──────────┴──────────┴──────────┘")
      
      expect(Object.keys(performanceData).length).toBeGreaterThan(0)
    })
  })
})

// Helper function to check if query contains expected keywords for the goal
function checkQueryKeywords(sql: string, goal: string): boolean {
  const sqlLower = sql.toLowerCase()
  
  switch (goal) {
    case ANALYSIS_GOALS.latency:
      return sqlLower.includes('duration') || 
             sqlLower.includes('percentile') || 
             sqlLower.includes('quantile') ||
             sqlLower.includes('avg')
    
    case ANALYSIS_GOALS.errors:
      return sqlLower.includes('error') || 
             sqlLower.includes('status') ||
             sqlLower.includes('fail') ||
             sqlLower.includes("!= 'ok'")
    
    case ANALYSIS_GOALS.throughput:
      return sqlLower.includes('count') || 
             sqlLower.includes('rate') ||
             sqlLower.includes('volume') ||
             sqlLower.includes('requests')
    
    default:
      return true
  }
}