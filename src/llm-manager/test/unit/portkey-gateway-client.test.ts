/**
 * Unit tests for Portkey Gateway Client
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { Effect, Cause, Stream, Chunk } from 'effect'
import { makePortkeyGatewayManager } from '../../portkey-gateway-client.js'
import type { LLMRequest } from '../../types.js'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('PortkeyGatewayClient', () => {
  const baseURL = 'http://localhost:8787'
  const manager = makePortkeyGatewayManager(baseURL)

  beforeAll(() => {
    // Set up environment variables for tests
    process.env.OPENAI_API_KEY = 'test-openai-key'
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key'
  })

  afterAll(() => {
    delete process.env.OPENAI_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('generate', () => {
    it('should generate response for OpenAI model', async () => {
      const request: LLMRequest = {
        prompt: 'Test prompt',
        taskType: 'general' as const,
        preferences: {
          model: 'gpt-3.5-turbo',
          maxTokens: 100,
          temperature: 0.7
        }
      }

      const mockResponse = {
        id: 'test-id',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-3.5-turbo',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'Test response'
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30
        }
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      const result = await Effect.runPromise(
        Effect.flatMap(manager, m => m.generate(request))
      )

      expect(result.content).toBe('Test response')
      expect(result.model).toBe('gpt-3.5-turbo')
      expect(result.usage?.totalTokens).toBe(30)
      expect(mockFetch).toHaveBeenCalledWith(
        `${baseURL}/v1/chat/completions`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-portkey-provider': 'openai',
            'Authorization': 'Bearer test-openai-key'
          })
        })
      )
    })

    it('should generate response for Anthropic model', async () => {
      const request: LLMRequest = {
        prompt: 'Test prompt',
        taskType: 'analysis' as const,
        preferences: {
          model: 'claude-3-haiku-20240307',
          maxTokens: 100
        }
      }

      const mockResponse = {
        id: 'test-id',
        object: 'chat.completion',
        created: Date.now(),
        model: 'claude-3-haiku-20240307',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'Claude response'
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 15,
          completion_tokens: 25,
          total_tokens: 40
        }
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      const result = await Effect.runPromise(
        Effect.flatMap(manager, m => m.generate(request))
      )

      expect(result.content).toBe('Claude response')
      expect(result.model).toBe('claude-3-haiku-20240307')
      expect(mockFetch).toHaveBeenCalledWith(
        `${baseURL}/v1/chat/completions`,
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-portkey-provider': 'anthropic',
            'Authorization': 'Bearer test-anthropic-key'
          })
        })
      )
    })

    it('should use default model when not specified', async () => {
      const request: LLMRequest = {
        prompt: 'Test prompt',
        taskType: 'general' as const
      }

      const mockResponse = {
        id: 'test-id',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-3.5-turbo',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'Default model response'
          }
        }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30
        }
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      const result = await Effect.runPromise(
        Effect.flatMap(manager, m => m.generate(request))
      )

      expect(result.model).toBe('gpt-3.5-turbo')
    })

    it('should fail when API key is missing', async () => {
      const originalKey = process.env.OPENAI_API_KEY
      delete process.env.OPENAI_API_KEY

      const request: LLMRequest = {
        prompt: 'Test prompt',
        taskType: 'general' as const,
        preferences: { model: 'gpt-3.5-turbo' }
      }

      // Mock fetch to simulate API key rejection
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized: Invalid API key'
      })

      const result = await Effect.runPromiseExit(
        Effect.flatMap(manager, m => m.generate(request))
      )

      expect(result._tag).toBe('Failure')
      if (result._tag === 'Failure') {
        const failures = Cause.failures(result.cause)
        const error = Chunk.unsafeGet(failures, 0)
        expect(error).toMatchObject({
          _tag: 'ModelUnavailable',
          model: 'gpt-3.5-turbo',
          message: expect.stringContaining('401')
        })
      }

      process.env.OPENAI_API_KEY = originalKey
    })

    it('should handle HTTP errors', async () => {
      const request: LLMRequest = {
        prompt: 'Test prompt',
        taskType: 'general' as const,
        preferences: { model: 'gpt-3.5-turbo' }
      }

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error'
      })

      const result = await Effect.runPromiseExit(
        Effect.flatMap(manager, m => m.generate(request))
      )

      expect(result._tag).toBe('Failure')
      if (result._tag === 'Failure') {
        const failures = Cause.failures(result.cause)
        const error = Chunk.unsafeGet(failures, 0)
        expect(error).toMatchObject({
          _tag: 'ModelUnavailable',
          message: expect.stringContaining('Gateway error (500)')
        })
      }
    })

    it('should handle network errors', async () => {
      const request: LLMRequest = {
        prompt: 'Test prompt',
        taskType: 'general' as const,
        preferences: { model: 'gpt-3.5-turbo' }
      }

      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await Effect.runPromiseExit(
        Effect.flatMap(manager, m => m.generate(request))
      )

      expect(result._tag).toBe('Failure')
      if (result._tag === 'Failure') {
        const failures = Cause.failures(result.cause)
        const error = Chunk.unsafeGet(failures, 0)
        expect(error).toMatchObject({
          _tag: 'ModelUnavailable',
          message: expect.stringContaining('Network error')
        })
      }
    })

    it('should handle invalid response format', async () => {
      const request: LLMRequest = {
        prompt: 'Test prompt',
        taskType: 'general' as const,
        preferences: { model: 'gpt-3.5-turbo' }
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invalid: 'response' })
      })

      const result = await Effect.runPromiseExit(
        Effect.flatMap(manager, m => m.generate(request))
      )

      expect(result._tag).toBe('Failure')
      if (result._tag === 'Failure') {
        const failures = Cause.failures(result.cause)
        const error = Chunk.unsafeGet(failures, 0)
        expect(error).toMatchObject({
          _tag: 'InvalidRequest',
          message: expect.stringContaining('Invalid response format')
        })
      }
    })

    it('should include metadata in response', async () => {
      const request: LLMRequest = {
        prompt: 'Test prompt',
        taskType: 'general' as const,
        preferences: { model: 'gpt-3.5-turbo' }
      }

      const mockResponse = {
        id: 'test-id',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-3.5-turbo',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'Test response'
          }
        }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30
        }
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      const result = await Effect.runPromise(
        Effect.flatMap(manager, m => m.generate(request))
      )

      expect(result.metadata).toBeDefined()
      expect(result.metadata?.latencyMs).toBeGreaterThanOrEqual(0)
      expect(result.metadata?.retryCount).toBe(0)
      expect(result.metadata?.cached).toBe(false)
    })
  })

  describe('generateStream', () => {
    it('should return not implemented error', async () => {
      const request: LLMRequest = {
        prompt: 'Test prompt',
        taskType: 'general' as const
      }

      const result = await Effect.runPromiseExit(
        Effect.flatMap(manager, m => Stream.runCollect(m.generateStream(request)))
      )

      expect(result._tag).toBe('Failure')
      if (result._tag === 'Failure') {
        const failures = Cause.failures(result.cause)
        const error = Chunk.unsafeGet(failures, 0)
        expect(error).toMatchObject({
          _tag: 'ModelUnavailable',
          message: expect.stringContaining('Streaming not implemented')
        })
      }
    })
  })

  describe('isHealthy', () => {
    it('should return true when gateway is healthy', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => 'Portkey Gateway v1.0.0'
      })

      const result = await Effect.runPromise(
        Effect.flatMap(manager, m => m.isHealthy())
      )

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(baseURL)
    })

    it('should return false when gateway is unhealthy', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: async () => 'Error'
      })

      const result = await Effect.runPromise(
        Effect.flatMap(manager, m => m.isHealthy())
      )

      expect(result).toBe(false)
    })

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'))

      const result = await Effect.runPromiseExit(
        Effect.flatMap(manager, m => m.isHealthy())
      )

      expect(result._tag).toBe('Failure')
      if (result._tag === 'Failure') {
        const failures = Cause.failures(result.cause)
        const error = Chunk.unsafeGet(failures, 0)
        expect(error).toMatchObject({
          _tag: 'ModelUnavailable',
          message: 'Gateway health check failed'
        })
      }
    })
  })

  describe('getStatus', () => {
    it('should return status with available models', async () => {
      const result = await Effect.runPromise(
        Effect.flatMap(manager, m => m.getStatus())
      )

      expect(result.availableModels).toContain('gpt-3.5-turbo')
      expect(result.availableModels).toContain('gpt-4')
      expect(result.availableModels).toContain('claude-3-haiku-20240307')
      const healthStatus = result.healthStatus as Record<string, string>
      if (healthStatus['gpt-3.5-turbo']) {
        expect(healthStatus['gpt-3.5-turbo']).toBe('healthy')
      } else {
        expect(healthStatus.portkey).toBe('healthy')
      }
      expect(result.config.baseURL).toBe(baseURL)
    })
  })

  describe('getAvailableModels', () => {
    it('should return list of available models', async () => {
      const result = await Effect.runPromise(
        Effect.flatMap(manager, m => m.getAvailableModels())
      )

      expect(Array.isArray(result)).toBe(true)
      expect(result).toContain('gpt-3.5-turbo')
      expect(result).toContain('gpt-4')
      expect(result).toContain('claude-3-haiku-20240307')
      expect(result).toContain('claude-3-sonnet-20240229')
      expect(result).toContain('codellama-7b-instruct')
    })
  })
})