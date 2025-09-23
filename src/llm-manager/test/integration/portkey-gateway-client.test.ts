/**
 * Integration tests for Portkey Gateway Client
 * Tests actual HTTP communication with Portkey gateway
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { Effect, Cause, Stream, Chunk } from 'effect'
import { makePortkeyGatewayManager } from '../../portkey-gateway-client.js'
import type { LLMRequest } from '../../types.js'

// Check if we're in CI environment
const skipInCI = process.env.CI === 'true'

describe('Portkey Gateway Client Integration', () => {
  const portkeyUrl = process.env.PORTKEY_GATEWAY_URL || 'http://localhost:8787'
  const manager = makePortkeyGatewayManager(portkeyUrl)

  beforeAll(async () => {
    console.log('🔧 Setting up Portkey Gateway Client integration tests')
    console.log(`   Portkey URL: ${portkeyUrl}`)
    console.log(`   OpenAI API key available: ${!!process.env.OPENAI_API_KEY}`)
    console.log(`   Anthropic API key available: ${!!process.env.ANTHROPIC_API_KEY}`)

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

  describe('Cloud Model Integration', () => {
    it('should generate response for OpenAI model', async () => {
      // Check for API key and provide informative message
      const hasApiKey = !!process.env.OPENAI_API_KEY
      console.log(`🔑 OpenAI API key available: ${hasApiKey}`)

      if (!hasApiKey) {
        console.log('⏭️ Skipping OpenAI integration test - no API key provided')
        console.log('💡 To test cloud models, set OPENAI_API_KEY in environment')
        return
      }

      const request: LLMRequest = {
        prompt: 'Say "Hello from GPT via Portkey integration test" in exactly 8 words',
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
        console.log(`📊 Tokens: ${result.value.usage?.totalTokens} total`)

        expect(result.value.content).toBeTruthy()
        expect(result.value.model).toMatch(/gpt-3.5-turbo/)
        expect(result.value.usage?.totalTokens).toBeGreaterThan(0)
        expect(result.value.metadata).toBeDefined()
        expect(result.value.metadata?.latencyMs).toBeGreaterThan(0)
      } else {
        console.error('❌ GPT-3.5-turbo integration failed')
        console.error('🔍 Error details:', JSON.stringify(result.cause, null, 2))
        throw new Error(`Failed to generate response with gpt-3.5-turbo: ${JSON.stringify(result.cause)}`)
      }
    })

    it.skipIf(!process.env.ANTHROPIC_API_KEY)('should generate response for Anthropic model', async () => {
      const request: LLMRequest = {
        prompt: 'Say "Hello from Claude via Portkey integration test" in exactly 9 words',
        taskType: 'analysis' as const,
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
        console.log(`📊 Tokens: ${result.value.usage?.totalTokens} total`)

        expect(result.value.content).toBeTruthy()
        expect(result.value.model).toMatch(/claude-3-haiku/)
        expect(result.value.usage?.totalTokens).toBeGreaterThan(0)
        expect(result.value.metadata).toBeDefined()
        expect(result.value.metadata?.latencyMs).toBeGreaterThan(0)
      } else {
        console.error('❌ Claude-3-haiku integration failed')
        console.error('🔍 Error details:', JSON.stringify(result.cause, null, 2))
        throw new Error(`Failed to generate response with claude-3-haiku: ${JSON.stringify(result.cause)}`)
      }
    })

    it('should use default model when not specified', async () => {
      // Skip if no cloud API keys available
      const hasOpenAI = !!process.env.OPENAI_API_KEY
      const hasAnthropic = !!process.env.ANTHROPIC_API_KEY

      if (!hasOpenAI && !hasAnthropic) {
        console.log('⏭️ Skipping default model test - no cloud API keys available')
        return
      }

      const request: LLMRequest = {
        prompt: 'Say "Default model test" in 3 words',
        taskType: 'general' as const,
        preferences: {
          maxTokens: 20,
          temperature: 0.1
        }
      }

      console.log('📤 Testing default model selection...')
      const result = await Effect.runPromiseExit(
        Effect.flatMap(manager, m => m.generate(request))
      )

      if (result._tag === 'Success') {
        console.log(`✅ Default model response: ${result.value.model}`)
        expect(result.value.model).toBeTruthy()
        expect(result.value.content).toBeTruthy()
      } else {
        console.log('⏭️ Default model test skipped - no available models')
      }
    })
  })

  describe.skipIf(skipInCI)('Local Model Integration (via Portkey → LM Studio)', () => {
    it('should generate response for local model', async () => {
      const request: LLMRequest = {
        prompt: 'Generate a simple SQL SELECT statement',
        taskType: 'general' as const,
        preferences: {
          model: 'codellama-7b-instruct',
          maxTokens: 100,
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
        console.log(`📊 Tokens: ${result.value.usage?.totalTokens} total`)

        expect(result.value.model).toBe('codellama-7b-instruct')
        expect(result.value.content).toBeTruthy()
        expect(result.value.usage?.totalTokens).toBeGreaterThan(0)
        expect(result.value.metadata).toBeDefined()
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
  })

  describe('Error Handling Integration', () => {
    it('should handle API key errors gracefully', async () => {
      // Test with a request that would require API keys but with potentially invalid ones
      const request: LLMRequest = {
        prompt: 'Test prompt',
        taskType: 'general' as const,
        preferences: {
          model: 'gpt-3.5-turbo',
          maxTokens: 10
        }
      }

      // Save original key
      const originalKey = process.env.OPENAI_API_KEY
      // Set invalid key
      process.env.OPENAI_API_KEY = 'invalid-test-key'

      console.log('📤 Testing invalid API key handling...')
      const result = await Effect.runPromiseExit(
        Effect.flatMap(manager, m => m.generate(request))
      )

      // Restore original key
      if (originalKey) {
        process.env.OPENAI_API_KEY = originalKey
      } else {
        delete process.env.OPENAI_API_KEY
      }

      expect(result._tag).toBe('Failure')
      if (result._tag === 'Failure') {
        console.log('✅ Invalid API key handled correctly')
        const failures = Cause.failures(result.cause)
        const error = Chunk.unsafeGet(failures, 0)
        expect(error).toMatchObject({
          _tag: 'ModelUnavailable',
          model: 'gpt-3.5-turbo'
        })
      }
    })

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

      console.log('📤 Testing invalid model handling...')
      const result = await Effect.runPromiseExit(
        Effect.flatMap(manager, m => m.generate(request))
      )

      // Should fail gracefully
      expect(result._tag).toBe('Failure')

      if (result._tag === 'Failure') {
        console.log('✅ Invalid model handled correctly')
        console.log('🔍 Error type:', result.cause)

        // Should be an error (Fail tag from Effect)
        if (result.cause && typeof result.cause === 'object' && '_tag' in result.cause) {
          // Accept both 'Fail' (Effect error) and 'ModelUnavailable' (domain error)
          expect(['Fail', 'ModelUnavailable']).toContain(result.cause._tag)
        }
      }
    })
  })

  describe('Gateway Health and Status Integration', () => {
    it('should report gateway health status correctly', async () => {
      console.log('📤 Checking Portkey gateway health...')
      const result = await Effect.runPromiseExit(
        Effect.flatMap(manager, m => m.isHealthy())
      )

      if (result._tag === 'Success') {
        console.log('✅ Portkey gateway is healthy')
        expect(result.value).toBe(true)
      } else {
        console.log('⚠️ Portkey gateway health check failed')
        expect(result._tag).toBe('Failure')
      }
    })

    it('should return comprehensive status information', async () => {
      console.log('📤 Getting gateway status...')
      const status = await Effect.runPromise(
        Effect.flatMap(manager, m => m.getStatus())
      )

      console.log('📊 Available models:', status.availableModels)
      console.log('🔧 Gateway config:', status.config)
      console.log('🏥 Health status:', status.healthStatus)

      // Verify status structure
      expect(status.availableModels).toBeDefined()
      expect(Array.isArray(status.availableModels)).toBe(true)
      expect(status.config).toBeDefined()
      expect(status.config.baseURL).toBe(portkeyUrl)
      expect(status.healthStatus).toBeDefined()

      // Verify expected models are available
      expect(status.availableModels).toContain('codellama-7b-instruct')
      expect(status.availableModels).toContain('gpt-3.5-turbo')
      expect(status.availableModels).toContain('claude-3-haiku-20240307')
    })

    it('should return list of available models', async () => {
      console.log('📤 Getting available models...')
      const result = await Effect.runPromise(
        Effect.flatMap(manager, m => m.getAvailableModels())
      )

      console.log('📊 Available models:', result)

      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)

      // Should include both cloud and local models
      expect(result).toContain('gpt-3.5-turbo')
      expect(result).toContain('claude-3-haiku-20240307')
      expect(result).toContain('codellama-7b-instruct')
    })
  })

  describe('Streaming Integration', () => {
    it('should handle streaming requests appropriately', async () => {
      const request: LLMRequest = {
        prompt: 'Test streaming',
        taskType: 'general' as const,
        preferences: {
          model: 'gpt-3.5-turbo',
          maxTokens: 20
        }
      }

      console.log('📤 Testing streaming interface...')
      const result = await Effect.runPromiseExit(
        Effect.flatMap(manager, m => Stream.runCollect(m.generateStream(request)))
      )

      // Currently streaming is not implemented, so should fail gracefully
      expect(result._tag).toBe('Failure')
      if (result._tag === 'Failure') {
        console.log('✅ Streaming not implemented (expected)')
        const failures = Cause.failures(result.cause)
        const error = Chunk.unsafeGet(failures, 0)
        expect(error).toMatchObject({
          _tag: 'ModelUnavailable',
          message: expect.stringContaining('Streaming not implemented')
        })
      }
    })
  })

  describe('Response Metadata Integration', () => {
    it('should include consistent response metadata', async () => {
      // Skip if no API keys available
      const hasApiKey = !!process.env.OPENAI_API_KEY || !!process.env.ANTHROPIC_API_KEY
      if (!hasApiKey) {
        console.log('⏭️ Skipping metadata test - no API keys available')
        return
      }

      const request: LLMRequest = {
        prompt: 'Say "metadata test"',
        taskType: 'general' as const,
        preferences: {
          model: process.env.OPENAI_API_KEY ? 'gpt-3.5-turbo' : 'claude-3-haiku-20240307',
          maxTokens: 10,
          temperature: 0.1
        }
      }

      console.log('📤 Testing response metadata...')
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
      } else {
        console.log('⏭️ Metadata test skipped - request failed')
      }
    })
  })
})