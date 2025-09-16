/**
 * Comprehensive integration test for Portkey routing validation
 * Tests that all model types route correctly through Portkey gateway
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { Effect } from 'effect'
import { makePortkeyGatewayManager } from '../../portkey-gateway-client.js'
import type { LLMRequest } from '../../types.js'

// Check if we're in CI environment
const isCI = Boolean(process.env.CI || process.env.GITHUB_ACTIONS)

describe('Portkey Routing Validation', () => {
  const portkeyUrl = process.env.PORTKEY_GATEWAY_URL || 'http://localhost:8787'
  const manager = makePortkeyGatewayManager(portkeyUrl)

  beforeAll(async () => {
    console.log('🔧 Validating Portkey routing configuration')
    console.log(`   Portkey URL: ${portkeyUrl}`)
    console.log(`   LM Studio expected at: http://localhost:1234`)

    // Check if Portkey gateway is healthy
    const healthResult = await Effect.runPromiseExit(
      Effect.flatMap(manager, m => m.isHealthy())
    )

    if (healthResult._tag === 'Failure') {
      console.warn('⚠️ Portkey gateway health check failed:', healthResult.cause)
    } else {
      console.log('✅ Portkey gateway is healthy')
    }
  })

  describe.skipIf(isCI)('Local Model Routing (via Portkey customHost → LM Studio)', () => {
    it('should route codellama-7b-instruct through Portkey to LM Studio', async () => {
      const request: LLMRequest = {
        prompt: 'Generate a simple SQL SELECT statement to get all users',
        taskType: 'general' as const,
        preferences: {
          model: 'codellama-7b-instruct',
          maxTokens: 150,
          temperature: 0.1
        }
      }

      console.log('📤 Sending request to codellama-7b-instruct via Portkey...')
      const startTime = Date.now()

      const result = await Effect.runPromiseExit(
        Effect.flatMap(manager, m => m.generate(request))
      )

      const duration = Date.now() - startTime
      console.log(`⏱️ Request completed in ${duration}ms`)

      if (result._tag === 'Success') {
        console.log('✅ CodeLlama response received')
        console.log(`📝 Content preview: "${result.value.content.substring(0, 100)}..."`)
        console.log(`🔧 Model used: ${result.value.model}`)
        console.log(`📊 Tokens: ${result.value.usage.totalTokens} total`)

        expect(result.value.model).toBe('codellama-7b-instruct')
        expect(result.value.content).toBeTruthy()
        expect(result.value.content.toLowerCase()).toMatch(/select|sql/)
        expect(result.value.usage.totalTokens).toBeGreaterThan(0)
      } else {
        console.error('❌ CodeLlama routing failed')
        console.error('🔍 Error details:', JSON.stringify(result.cause, null, 2))

        // Check what type of error this is
        if (result.cause && typeof result.cause === 'object' && 'failure' in result.cause) {
          const causeWithFailure = result.cause as { failure?: { _tag?: string; message?: string } }
          const failure = causeWithFailure.failure
          if (failure && failure._tag === 'ModelUnavailable') {
            throw new Error(`Local model codellama-7b-instruct is unavailable. Ensure LM Studio is running at http://localhost:1234 and the model is loaded. Error: ${failure.message}`)
          }
        }

        throw new Error(`Unexpected error routing to codellama-7b-instruct: ${JSON.stringify(result.cause)}`)
      }
    })

    it('should route sqlcoder-7b-2 through Portkey to LM Studio', async () => {
      const request: LLMRequest = {
        prompt: 'Write a SQL query to count records by status',
        taskType: 'general' as const,
        preferences: {
          model: 'sqlcoder-7b-2',
          maxTokens: 150,
          temperature: 0.1
        }
      }

      console.log('📤 Sending request to sqlcoder-7b-2 via Portkey...')
      const startTime = Date.now()

      const result = await Effect.runPromiseExit(
        Effect.flatMap(manager, m => m.generate(request))
      )

      const duration = Date.now() - startTime
      console.log(`⏱️ Request completed in ${duration}ms`)

      if (result._tag === 'Success') {
        console.log('✅ SQLCoder response received')
        console.log(`📝 Content preview: "${result.value.content.substring(0, 100)}..."`)
        console.log(`🔧 Model used: ${result.value.model}`)
        console.log(`📊 Tokens: ${result.value.usage.totalTokens} total`)

        expect(result.value.model).toBe('sqlcoder-7b-2')
        expect(result.value.content).toBeTruthy()
        expect(result.value.content.toLowerCase()).toMatch(/select|count|sql/)
        expect(result.value.usage.totalTokens).toBeGreaterThan(0)
      } else {
        console.error('❌ SQLCoder routing failed')
        console.error('🔍 Error details:', JSON.stringify(result.cause, null, 2))

        if (result.cause && typeof result.cause === 'object' && 'failure' in result.cause) {
          const causeWithFailure = result.cause as { failure?: { _tag?: string; message?: string } }
          const failure = causeWithFailure.failure
          if (failure && failure._tag === 'ModelUnavailable') {
            throw new Error(`Local model sqlcoder-7b-2 is unavailable. Ensure LM Studio is running at http://localhost:1234 and the model is loaded. Error: ${failure.message}`)
          }
        }

        throw new Error(`Unexpected error routing to sqlcoder-7b-2: ${JSON.stringify(result.cause)}`)
      }
    })
  })

  describe('Cloud Model Routing (via Portkey)', () => {
    it('should route gpt-3.5-turbo through Portkey to OpenAI', async () => {
      // Check for API key and provide informative message
      const hasApiKey = !!process.env.OPENAI_API_KEY
      console.log(`🔑 OpenAI API key available: ${hasApiKey}`)

      if (!hasApiKey) {
        console.log('⏭️ Skipping OpenAI test - no API key provided')
        console.log('💡 To test cloud models, set OPENAI_API_KEY in environment')
        return
      }

      const request: LLMRequest = {
        prompt: 'Say "Hello from GPT via Portkey" in exactly 5 words',
        taskType: 'general' as const,
        preferences: {
          model: 'gpt-3.5-turbo',
          maxTokens: 50,
          temperature: 0.1
        }
      }

      console.log('📤 Sending request to gpt-3.5-turbo via Portkey...')
      const startTime = Date.now()

      const result = await Effect.runPromiseExit(
        Effect.flatMap(manager, m => m.generate(request))
      )

      const duration = Date.now() - startTime
      console.log(`⏱️ Request completed in ${duration}ms`)

      if (result._tag === 'Success') {
        console.log('✅ GPT-3.5-turbo response received')
        console.log(`📝 Content: "${result.value.content}"`)
        console.log(`🔧 Model used: ${result.value.model}`)
        console.log(`📊 Tokens: ${result.value.usage.totalTokens} total`)

        expect(result.value.model).toMatch(/gpt-3.5-turbo/)
        expect(result.value.content).toBeTruthy()
        expect(result.value.usage.totalTokens).toBeGreaterThan(0)
      } else {
        console.error('❌ GPT-3.5-turbo routing failed')
        console.error('🔍 Error details:', JSON.stringify(result.cause, null, 2))
        throw new Error(`Failed to route gpt-3.5-turbo through Portkey: ${JSON.stringify(result.cause)}`)
      }
    })

    it('should route claude-3-haiku through Portkey to Anthropic', async () => {
      // Check for API key and provide informative message
      const hasApiKey = !!(process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY)
      console.log(`🔑 Claude API key available: ${hasApiKey}`)

      if (!hasApiKey) {
        console.log('⏭️ Skipping Claude test - no API key provided')
        console.log('💡 To test cloud models, set CLAUDE_API_KEY or ANTHROPIC_API_KEY in environment')
        return
      }

      const request: LLMRequest = {
        prompt: 'Say "Hello from Claude via Portkey" in exactly 6 words',
        taskType: 'general' as const,
        preferences: {
          model: 'claude-3-haiku-20240307',
          maxTokens: 50,
          temperature: 0.1
        }
      }

      console.log('📤 Sending request to claude-3-haiku via Portkey...')
      const startTime = Date.now()

      const result = await Effect.runPromiseExit(
        Effect.flatMap(manager, m => m.generate(request))
      )

      const duration = Date.now() - startTime
      console.log(`⏱️ Request completed in ${duration}ms`)

      if (result._tag === 'Success') {
        console.log('✅ Claude-3-haiku response received')
        console.log(`📝 Content: "${result.value.content}"`)
        console.log(`🔧 Model used: ${result.value.model}`)
        console.log(`📊 Tokens: ${result.value.usage.totalTokens} total`)

        expect(result.value.model).toMatch(/claude-3-haiku/)
        expect(result.value.content).toBeTruthy()
        expect(result.value.usage.totalTokens).toBeGreaterThan(0)
      } else {
        console.error('❌ Claude-3-haiku routing failed')
        console.error('🔍 Error details:', JSON.stringify(result.cause, null, 2))
        throw new Error(`Failed to route claude-3-haiku through Portkey: ${JSON.stringify(result.cause)}`)
      }
    })
  })

  describe('Routing Configuration Validation', () => {
    it('should correctly identify and route local vs cloud models', async () => {
      const status = await Effect.runPromise(
        Effect.flatMap(manager, m => m.getStatus())
      )

      console.log('📊 Available models:', status.availableModels)
      console.log('🔧 Gateway config:', status.config)

      // Verify all expected models are available
      expect(status.availableModels).toContain('codellama-7b-instruct')
      expect(status.availableModels).toContain('sqlcoder-7b-2')
      expect(status.availableModels).toContain('gpt-3.5-turbo')
      expect(status.availableModels).toContain('claude-3-haiku-20240307')

      // Verify config points to correct gateway
      expect(status.config.baseURL).toBe(portkeyUrl)
    })

    it('should report model health status correctly', async () => {
      const status = await Effect.runPromise(
        Effect.flatMap(manager, m => m.getStatus())
      )

      console.log('🏥 Model health status:', status.healthStatus)

      // All models should be reported as healthy (this is optimistic)
      expect(status.healthStatus['codellama-7b-instruct']).toBe('healthy')
      expect(status.healthStatus['sqlcoder-7b-2']).toBe('healthy')
      expect(status.healthStatus['gpt-3.5-turbo']).toBe('healthy')
    })
  })

  describe('Error Handling and Observability', () => {
    it('should handle invalid model requests gracefully', async () => {
      const request: LLMRequest = {
        prompt: 'Test invalid model',
        taskType: 'general' as const,
        preferences: {
          model: 'nonexistent-model-12345',
          maxTokens: 50,
          temperature: 0.1
        }
      }

      console.log('📤 Testing invalid model routing...')

      const result = await Effect.runPromiseExit(
        Effect.flatMap(manager, m => m.generate(request))
      )

      // Should fail gracefully
      expect(result._tag).toBe('Failure')

      if (result._tag === 'Failure') {
        console.log('✅ Invalid model handled correctly')
        console.log('🔍 Error type:', result.cause)

        // Should be an error (Fail tag from Effect)
        // The actual error details are in the cause
        if (result.cause && typeof result.cause === 'object' && '_tag' in result.cause) {
          // Accept both 'Fail' (Effect error) and 'ModelUnavailable' (domain error)
          expect(['Fail', 'ModelUnavailable']).toContain(result.cause._tag)
        }
      }
    })

    it('should provide consistent response metadata', async () => {
      // Test with a simple local model request
      const request: LLMRequest = {
        prompt: 'Say "test"',
        taskType: 'general' as const,
        preferences: {
          model: 'codellama-7b-instruct',
          maxTokens: 20,
          temperature: 0.1
        }
      }

      const result = await Effect.runPromiseExit(
        Effect.flatMap(manager, m => m.generate(request))
      )

      if (result._tag === 'Success') {
        console.log('✅ Checking response metadata...')

        // Verify metadata structure
        expect(result.value.metadata).toBeDefined()
        expect(result.value.metadata.latencyMs).toBeGreaterThan(0)
        expect(result.value.metadata.retryCount).toBeDefined()
        expect(result.value.metadata.cached).toBeDefined()

        console.log(`📊 Latency: ${result.value.metadata.latencyMs}ms`)
        console.log(`🔄 Retries: ${result.value.metadata.retryCount}`)
        console.log(`💾 Cached: ${result.value.metadata.cached}`)
      }
    })
  })
})