/**
 * Tests for Portkey Gateway Client Integration
 */

import { describe, it, expect } from 'vitest'
import { Effect, Stream } from 'effect'
import { PortkeyLLMManagerLive, createPortkeyLLMManagerLive } from '../portkey-client.js'
import { LLMManagerServiceTag } from '../llm-manager-service.js'
import type { LLMRequest } from '../types.js'

describe('Portkey Client', () => {
  const isPortkeyAvailable = process.env.PORTKEY_GATEWAY_URL || false
  
  describe('Configuration', () => {
    it('should create Portkey layer with default configuration', () => {
      expect(PortkeyLLMManagerLive).toBeDefined()
    })
    
    it('should create custom Portkey layer with specific configuration', () => {
      const customLayer = createPortkeyLLMManagerLive({
        baseURL: 'http://custom-gateway:8787',
        configPath: '/custom/routing.yaml',
      })
      expect(customLayer).toBeDefined()
    })
  })
  
  describe.skipIf(!isPortkeyAvailable)('Integration Tests (requires Portkey gateway)', () => {
    it('should check health status', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* LLMManagerServiceTag
          return yield* service.isHealthy()
        }).pipe(Effect.provide(PortkeyLLMManagerLive))
      )
      
      expect(typeof result).toBe('boolean')
    })
    
    it('should get available models', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* LLMManagerServiceTag
          return yield* service.getAvailableModels()
        }).pipe(Effect.provide(PortkeyLLMManagerLive))
      )
      
      expect(Array.isArray(result)).toBe(true)
      expect(result).toContain('codellama-7b-instruct')
      expect(result).toContain('gpt-3.5-turbo')
    })
    
    it('should generate response through Portkey gateway', async () => {
      const request: LLMRequest = {
        prompt: 'Write a simple SQL query to count records',
        taskType: 'analysis',
        preferences: {
          maxTokens: 100,
          temperature: 0.7,
        },
      }
      
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const service = yield* LLMManagerServiceTag
          return yield* service.generate(request)
        }).pipe(Effect.provide(PortkeyLLMManagerLive))
      )
      
      expect(result.content).toBeDefined()
      expect(result.model).toBeDefined()
      expect(result.usage).toBeDefined()
      expect(result.metadata.latencyMs).toBeGreaterThan(0)
    })
  })
  
  describe('Error Handling', () => {
    it('should return error for streaming (not implemented)', async () => {
      const request: LLMRequest = {
        prompt: 'Test streaming',
        taskType: 'general',
        streaming: true,
      }
      
      // Since Portkey client doesn't support streaming yet,
      // generateStream should return a Stream that fails immediately
      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const service = yield* LLMManagerServiceTag
          const stream = service.generateStream(request)
          // Try to collect the stream, which should fail immediately
          return yield* Stream.runCollect(stream)
        }).pipe(Effect.provide(PortkeyLLMManagerLive))
      )
      
      // Should fail with ModelUnavailable error
      expect(result._tag).toBe('Failure')
      if (result._tag === 'Failure') {
        expect(result.cause).toBeDefined()
      }
    })
  })
})