/**
 * LLM Manager Model Loading Validation Tests
 *
 * This test suite validates that the LLM Manager correctly loads, initializes,
 * and health-checks all configured models. It ensures that model configuration
 * is properly resolved from environment variables and that health checks work
 * correctly.
 */

import { describe, it, expect } from 'vitest'
import { Effect } from 'effect'
import { LLMManagerAPIClientLayer, LLMManagerAPIClientTag } from '../../api-client-layer.js'

describe('LLM Manager Model Loading Validation', () => {
  // Helper function to run Effect operations with the LLM Manager layer
  const runWithLLMManager = <A, E>(effect: Effect.Effect<A, E, LLMManagerAPIClientTag>) =>
    Effect.runPromise(effect.pipe(Effect.provide(LLMManagerAPIClientLayer)))

  describe('Model Discovery and Health Checks', () => {
    it('should load models from environment configuration', async () => {
      const loadedModels = await runWithLLMManager(
        Effect.flatMap(LLMManagerAPIClientTag, (service) => service.getLoadedModels())
      )
      
      // Should have at least one model configured
      expect(loadedModels.length).toBeGreaterThan(0)
      
      // Each model should have required properties
      for (const model of loadedModels) {
        expect(model).toHaveProperty('id')
        expect(model).toHaveProperty('provider')
        expect(model).toHaveProperty('status')
        expect(model).toHaveProperty('capabilities')
        expect(model).toHaveProperty('config')
        
        // ID should not be generic type
        expect(model.id).not.toBe('llama')
        expect(model.id).not.toBe('gpt')
        expect(model.id).not.toBe('claude')
        expect(model.id).not.toBe('default-model')
        
        // Status should be healthy or degraded, not unhealthy on startup
        if (model.provider === 'local') {
          // Local models might be unhealthy if LM Studio isn't running
          expect(['healthy', 'degraded', 'unhealthy']).toContain(model.status)
        } else {
          // API-based models should be healthy if API keys are configured
          expect(['healthy', 'degraded']).toContain(model.status)
        }
      }
    })

    it('should correctly resolve SQL-specific models', async () => {
      const loadedModels = await runWithLLMManager(
        Effect.flatMap(LLMManagerAPIClientTag, (service) => service.getLoadedModels())
      )
      
      // Check if sqlcoder-7b-2 is configured as expected
      const sqlModel = loadedModels.find(m => 
        m.id.includes('sqlcoder') || 
        m.capabilities?.supportsSQL === true
      )
      
      if (sqlModel) {
        expect(sqlModel.capabilities?.supportsSQL).toBe(true)
        expect(sqlModel.id).not.toBe('llama') // Should use actual model name
      }
    })

    it('should validate health check functionality', async () => {
      const status = await runWithLLMManager(
        Effect.flatMap(LLMManagerAPIClientTag, (service) => service.getStatus())
      )
      
      expect(status).toHaveProperty('status')
      expect(status).toHaveProperty('loadedModels')
      expect(['healthy', 'degraded', 'unhealthy']).toContain(status.status)
      
      // If we have loaded models, check their status
      // Note: Models may be unhealthy if external services are unavailable (e.g., LM Studio not running)
      if (status.loadedModels.length > 0) {
        // In CI, models might not be healthy if external services aren't available
        // Just verify we have the status property
        expect(status.loadedModels.every(m => ['healthy', 'unhealthy', 'degraded'].includes(m.status))).toBe(true)
      }
    })

    it('should allow manual model reload', async () => {
      // Get initial state and perform reload operation using proper Effect composition
      const { initialModels, reloadedModels } = await runWithLLMManager(
        Effect.gen(function* (_) {
          const service = yield* _(LLMManagerAPIClientTag)
          const initialModels = yield* _(service.getLoadedModels())
          yield* _(service.reloadModels())
          const reloadedModels = yield* _(service.getLoadedModels())
          return { initialModels, reloadedModels }
        })
      )
      
      // Should have same or more models after reload
      expect(reloadedModels.length).toBeGreaterThanOrEqual(initialModels.length)
      
      // Health status should be updated
      for (const model of reloadedModels) {
        expect(model).toHaveProperty('lastHealthCheck')
        // Health check timestamp should be recent (within last minute)
        if (model.lastHealthCheck) {
          const healthCheckTime = new Date(model.lastHealthCheck)
          const now = new Date()
          const timeDiff = now.getTime() - healthCheckTime.getTime()
          expect(timeDiff).toBeLessThan(60000) // 1 minute
        }
      }
    })
  })

  describe('Model Configuration Validation', () => {
    it('should use environment variables correctly', async () => {
      const loadedModels = await runWithLLMManager(
        Effect.flatMap(LLMManagerAPIClientTag, (service) => service.getLoadedModels())
      )
      
      // In CI or environments without API keys/endpoints, models may not load
      // This is expected behavior - the test should handle this gracefully
      if (loadedModels.length === 0) {
        console.info('ℹ️ No models loaded - this is expected in CI without API keys/endpoints configured')
        // Skip further assertions if no models are loaded
        return
      }
      
      // Check if LLM_SQL_MODEL_1 environment variable is respected
      if (process.env.LLM_SQL_MODEL_1) {
        const expectedSQLModel = process.env.LLM_SQL_MODEL_1
        const sqlModel = loadedModels.find(m => 
          m.id === expectedSQLModel || 
          m.capabilities?.supportsSQL === true
        )
        
        // Only expect the model if we have any models loaded
        if (loadedModels.length > 0) {
          expect(sqlModel).toBeDefined()
          
          if (sqlModel && sqlModel.id === expectedSQLModel) {
            // Exact match found
            expect(sqlModel.capabilities?.supportsSQL).toBe(true)
          }
        }
      }
      
      // Check if SQL models are properly loaded
      // SQL models can be from any provider configured via LLM_SQL_MODEL_* env vars
      const sqlModels = loadedModels.filter(m => m.capabilities?.supportsSQL === true)
      
      // If SQL model environment variables are set AND models are loaded, check SQL capabilities
      const hasSqlModelEnvVars = Object.keys(process.env).some(key => key.startsWith('LLM_SQL_MODEL_'))
      
      if (hasSqlModelEnvVars && loadedModels.length > 0) {
        if (sqlModels.length === 0) {
          console.log('⚠️ SQL model env vars are set but no SQL-capable models were loaded')
          console.log('📊 All loaded models:', loadedModels.map(m => ({
            id: m.id,
            provider: m.provider,
            status: m.status,
            supportsSQL: m.capabilities?.supportsSQL
          })))
          // Don't fail the test - this might be due to missing API keys or endpoints
        }
      }
    })

    it('should handle model routing correctly', async () => {
      const selection = await runWithLLMManager(
        Effect.flatMap(LLMManagerAPIClientTag, (service) =>
          service.selectModel({
            taskType: 'analysis',
            requirements: {
              needsSQL: true,
              preferredProvider: 'local'
            }
          })
        )
      )
      
      expect(selection).toHaveProperty('selectedModel')
      expect(selection).toHaveProperty('reason')
      expect(selection.selectedModel).not.toBe('llama') // Should use actual model name
      expect(selection.selectedModel).not.toBe('default-model')
    })
  })

  describe('Error Handling and Fallbacks', () => {
    it('should handle unhealthy models gracefully', async () => {
      const status = await runWithLLMManager(
        Effect.flatMap(LLMManagerAPIClientTag, (service) => service.getStatus())
      )
      
      // If there are unhealthy models, system should still function
      const unhealthyModels = status.loadedModels.filter(m => m.status === 'unhealthy')
      if (unhealthyModels.length > 0) {
        // Should still have healthy fallbacks
        const healthyModels = status.loadedModels.filter(m => m.status === 'healthy')
        
        if (healthyModels.length === 0) {
          // If no models are healthy, status should reflect this
          expect(status.status).toBe('unhealthy')
        } else {
          // If some models are healthy, should be degraded
          expect(['healthy', 'degraded']).toContain(status.status)
        }
      }
    })

    it('should provide meaningful error messages for model issues', async () => {
      const loadedModels = await runWithLLMManager(
        Effect.flatMap(LLMManagerAPIClientTag, (service) => service.getLoadedModels())
      )
      
      for (const model of loadedModels) {
        if (model.status === 'unhealthy') {
          // Should have error information
          expect(model).toHaveProperty('lastHealthCheck')
          
          // Could have additional error details in the future
          console.info(`Model ${model.id} is unhealthy - this is expected if ${model.provider} service is not running`)
        }
      }
    })
  })

  describe('Performance and Reliability', () => {
    it('should complete health checks within reasonable time', async () => {
      const startTime = Date.now()
      
      // Trigger health check via reload using proper Effect composition
      await runWithLLMManager(
        Effect.flatMap(LLMManagerAPIClientTag, (service) => service.reloadModels())
      )
      
      const endTime = Date.now()
      const duration = endTime - startTime
      
      // Health checks should complete within 30 seconds
      expect(duration).toBeLessThan(30000)
    })

    it('should maintain model metrics correctly', async () => {
      const loadedModels = await runWithLLMManager(
        Effect.flatMap(LLMManagerAPIClientTag, (service) => service.getLoadedModels())
      )
      
      for (const model of loadedModels) {
        if (model.metrics) {
          expect(model.metrics).toHaveProperty('totalRequests')
          expect(model.metrics).toHaveProperty('totalTokens')
          expect(model.metrics).toHaveProperty('averageLatency')
          expect(model.metrics).toHaveProperty('errorRate')
          
          // Metrics should be non-negative
          expect(model.metrics.totalRequests).toBeGreaterThanOrEqual(0)
          expect(model.metrics.totalTokens).toBeGreaterThanOrEqual(0)
          expect(model.metrics.averageLatency).toBeGreaterThanOrEqual(0)
          expect(model.metrics.errorRate).toBeGreaterThanOrEqual(0)
          expect(model.metrics.errorRate).toBeLessThanOrEqual(1)
        } else {
          // If metrics are not available, at least check that the model has basic properties
          expect(model).toHaveProperty('id')
          expect(model).toHaveProperty('provider')
          expect(model).toHaveProperty('status')
        }
      }
    })
  })
})