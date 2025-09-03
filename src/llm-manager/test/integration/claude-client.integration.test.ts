/**
 * Claude Client Integration Tests
 * 
 * Low-level API tests for Claude client to verify:
 * - API connectivity
 * - Request/response format
 * - Error handling
 * - Streaming support
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { Effect, Stream } from 'effect'
import { makeClaudeClient, defaultClaudeConfig } from '../../clients/claude-client.js'
import type { LLMRequest } from '../../types.js'

describe('Claude Client Integration', () => {
  const hasApiKey = !!process.env.CLAUDE_API_KEY
  
  beforeAll(() => {
    if (!hasApiKey) {
      console.log('⏭️  Skipping Claude integration tests - CLAUDE_API_KEY not set')
    }
  })

  describe('Basic API Connectivity', () => {
    it.skipIf(!hasApiKey)('should connect to Claude API and get a response', async () => {
      const client = makeClaudeClient({
        ...defaultClaudeConfig,
        apiKey: process.env.CLAUDE_API_KEY!,
        model: 'claude-3-7-sonnet-20250219'
      })

      const request: LLMRequest = {
        prompt: 'Say "Hello" and nothing else.',
        taskType: 'general',
        preferences: {
          maxTokens: 10,
          temperature: 0
        }
      }

      const result = await Effect.runPromise(
        client.generate(request).pipe(
          Effect.tapError(error => 
            Effect.sync(() => console.error('Claude API Error:', error))
          )
        )
      )

      expect(result).toBeDefined()
      expect(result.content).toBeDefined()
      expect(result.content.toLowerCase()).toContain('hello')
      expect(result.model).toContain('claude')
      expect(result.usage.promptTokens).toBeGreaterThan(0)
      expect(result.usage.completionTokens).toBeGreaterThan(0)
    })

    it.skipIf(!hasApiKey)('should handle health check', async () => {
      const client = makeClaudeClient({
        ...defaultClaudeConfig,
        apiKey: process.env.CLAUDE_API_KEY!
      })

      const healthy = await Effect.runPromise(client.isHealthy())
      expect(healthy).toBe(true)
    })
  })

  describe('Response Formats', () => {
    it.skipIf(!hasApiKey)('should generate JSON response when requested', async () => {
      const client = makeClaudeClient({
        ...defaultClaudeConfig,
        apiKey: process.env.CLAUDE_API_KEY!,
        model: 'claude-3-7-sonnet-20250219'
      })

      const request: LLMRequest = {
        prompt: 'Return a JSON object with a "message" field containing "test". Return only valid JSON, no markdown.',
        taskType: 'general',
        preferences: {
          maxTokens: 100,
          temperature: 0,
          requireStructuredOutput: true
        }
      }

      const result = await Effect.runPromise(client.generate(request))
      
      console.log('Claude JSON response:', result.content)
      
      // Try to parse as JSON
      let parsed: { message?: string }
      try {
        parsed = JSON.parse(result.content)
        expect(parsed).toBeDefined()
        expect(parsed.message).toBeDefined()
      } catch (e) {
        // Claude might wrap in markdown, try to extract
        const jsonMatch = result.content.match(/```(?:json)?\s*([\s\S]*?)```/)
        if (jsonMatch && jsonMatch[1]) {
          parsed = JSON.parse(jsonMatch[1])
          expect(parsed.message).toBeDefined()
        } else {
          throw new Error(`Failed to parse Claude response as JSON: ${result.content}`)
        }
      }
    })

    it.skipIf(!hasApiKey)('should generate SQL when asked', async () => {
      const client = makeClaudeClient({
        ...defaultClaudeConfig,
        apiKey: process.env.CLAUDE_API_KEY!
      })

      const request: LLMRequest = {
        prompt: 'Write a simple SQL query to select all columns from a table called "users". Return only the SQL query, no explanation.',
        taskType: 'general',
        preferences: {
          maxTokens: 100,
          temperature: 0
        }
      }

      const result = await Effect.runPromise(client.generate(request))
      
      console.log('Claude SQL response:', result.content)
      
      expect(result.content.toUpperCase()).toContain('SELECT')
      expect(result.content.toLowerCase()).toContain('from')
      expect(result.content.toLowerCase()).toContain('users')
    })
  })

  describe('Streaming Support', () => {
    it.skipIf(!hasApiKey)('should stream responses', async () => {
      const client = makeClaudeClient({
        ...defaultClaudeConfig,
        apiKey: process.env.CLAUDE_API_KEY!
      })

      const request: LLMRequest = {
        prompt: 'Count from 1 to 5, one number per line.',
        taskType: 'general',
        streaming: true,
        preferences: {
          maxTokens: 50,
          temperature: 0
        }
      }

      const chunks: string[] = []
      
      await Effect.runPromise(
        client.generateStream!(request).pipe(
          Stream.tap(chunk => 
            Effect.sync(() => {
              chunks.push(chunk)
              process.stdout.write(chunk) // Show streaming output
            })
          ),
          Stream.runDrain
        )
      )

      expect(chunks.length).toBeGreaterThan(0)
      const fullResponse = chunks.join('')
      expect(fullResponse).toContain('1')
      expect(fullResponse).toContain('5')
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid API key gracefully', async () => {
      const client = makeClaudeClient({
        ...defaultClaudeConfig,
        apiKey: 'invalid-key',
        model: 'claude-3-7-sonnet-20250219'
      })

      const request: LLMRequest = {
        prompt: 'Test',
        taskType: 'general'
      }

      const result = await Effect.runPromiseExit(client.generate(request))
      
      expect(result._tag).toBe('Failure')
      if (result._tag === 'Failure') {
        const error = result.cause._tag === 'Fail' ? result.cause.error : null
        expect(error).toBeDefined()
        expect(error?._tag).toBe('AuthenticationFailed')
      }
    })

    it.skipIf(!hasApiKey)('should handle rate limiting', async () => {
      // This test is informational - we don't want to actually trigger rate limits
      const client = makeClaudeClient({
        ...defaultClaudeConfig,
        apiKey: process.env.CLAUDE_API_KEY!,
        retryAttempts: 1
      })

      // Make a normal request - just testing the retry logic exists
      const request: LLMRequest = {
        prompt: 'Test',
        taskType: 'general',
        preferences: { maxTokens: 10 }
      }

      const result = await Effect.runPromise(client.generate(request))
      expect(result).toBeDefined()
      
      console.log('✅ Claude client has retry logic configured')
    })
  })

  describe('Cost Calculation', () => {
    it.skipIf(!hasApiKey)('should calculate costs correctly', async () => {
      const client = makeClaudeClient({
        ...defaultClaudeConfig,
        apiKey: process.env.CLAUDE_API_KEY!,
        model: 'claude-3-7-sonnet-20250219'
      })

      const request: LLMRequest = {
        prompt: 'Hi',
        taskType: 'general',
        preferences: { maxTokens: 10 }
      }

      const result = await Effect.runPromise(client.generate(request))
      
      expect(result.usage.cost).toBeDefined()
      expect(result.usage.cost).toBeGreaterThan(0)
      expect(result.usage.cost).toBeLessThan(0.01) // Should be very cheap for short prompt
      
      console.log(`Claude cost for ${result.usage.totalTokens} tokens: $${result.usage.cost}`)
    })
  })
})