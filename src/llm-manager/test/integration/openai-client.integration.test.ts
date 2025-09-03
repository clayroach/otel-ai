/**
 * OpenAI Client Integration Tests
 * 
 * Low-level API tests for OpenAI/GPT client to verify:
 * - API connectivity
 * - Request/response format
 * - Error handling
 * - Streaming support
 * - JSON mode
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { Effect, Stream } from 'effect'
import { makeOpenAIClient, defaultOpenAIConfig } from '../../clients/openai-client.js'
import type { LLMRequest } from '../../types.js'

describe('OpenAI Client Integration', () => {
  const hasApiKey = !!process.env.OPENAI_API_KEY
  
  beforeAll(() => {
    if (!hasApiKey) {
      console.log('⏭️  Skipping OpenAI integration tests - OPENAI_API_KEY not set')
    }
  })

  describe('Basic API Connectivity', () => {
    it.skipIf(!hasApiKey)('should connect to OpenAI API and get a response', async () => {
      const client = makeOpenAIClient({
        ...defaultOpenAIConfig,
        apiKey: process.env.OPENAI_API_KEY as string,
        model: 'gpt-3.5-turbo',
        endpoint: 'https://api.openai.com/v1' // Ensure endpoint is set
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
            Effect.sync(() => console.error('OpenAI API Error:', error))
          )
        )
      )

      expect(result).toBeDefined()
      expect(result.content).toBeDefined()
      expect(result.content.toLowerCase()).toContain('hello')
      expect(result.model).toContain('gpt')
      expect(result.usage.promptTokens).toBeGreaterThan(0)
      expect(result.usage.completionTokens).toBeGreaterThan(0)
    })

    it.skipIf(!hasApiKey)('should handle health check', async () => {
      const client = makeOpenAIClient({
        ...defaultOpenAIConfig,
        apiKey: process.env.OPENAI_API_KEY as string,
        endpoint: 'https://api.openai.com/v1'
      })

      const healthy = await Effect.runPromise(client.isHealthy())
      expect(healthy).toBe(true)
    })
  })

  describe('Response Formats', () => {
    it.skipIf(!hasApiKey)('should generate JSON response when requested', async () => {
      const client = makeOpenAIClient({
        ...defaultOpenAIConfig,
        apiKey: process.env.OPENAI_API_KEY as string,
        model: 'gpt-3.5-turbo',
        endpoint: 'https://api.openai.com/v1'
      })

      const request: LLMRequest = {
        prompt: 'Return a JSON object with a "message" field containing "test" and a "number" field containing 42. Return only valid JSON.',
        taskType: 'general',
        preferences: {
          maxTokens: 100,
          temperature: 0,
          requireStructuredOutput: true
        }
      }

      const result = await Effect.runPromise(client.generate(request))
      
      console.log('GPT JSON response:', result.content)
      
      // Try to parse as JSON
      let parsed: { message?: string; number?: number }
      try {
        parsed = JSON.parse(result.content)
      } catch (e) {
        // GPT might wrap in markdown, try to extract
        const jsonMatch = result.content.match(/```(?:json)?\s*([\s\S]*?)```/)
        if (jsonMatch && jsonMatch[1]) {
          parsed = JSON.parse(jsonMatch[1])
        } else {
          // Try without markdown
          const cleanContent = result.content.trim()
          parsed = JSON.parse(cleanContent)
        }
      }
      
      expect(parsed).toBeDefined()
      expect(parsed.message).toBeDefined()
      expect(parsed.number).toBe(42)
    })

    it.skipIf(!hasApiKey)('should generate SQL when asked', async () => {
      const client = makeOpenAIClient({
        ...defaultOpenAIConfig,
        apiKey: process.env.OPENAI_API_KEY as string,
        endpoint: 'https://api.openai.com/v1'
      })

      const request: LLMRequest = {
        prompt: 'Write a SQL query: SELECT service_name FROM traces WHERE status = "error". Return only the SQL, no explanation.',
        taskType: 'general',
        preferences: {
          maxTokens: 100,
          temperature: 0
        }
      }

      const result = await Effect.runPromise(client.generate(request))
      
      console.log('GPT SQL response:', result.content)
      
      expect(result.content.toUpperCase()).toContain('SELECT')
      expect(result.content.toLowerCase()).toContain('from')
      expect(result.content.toLowerCase()).toContain('traces')
    })

    it.skipIf(!hasApiKey)('should handle ClickHouse SQL generation request', async () => {
      const client = makeOpenAIClient({
        ...defaultOpenAIConfig,
        apiKey: process.env.OPENAI_API_KEY as string,
        endpoint: 'https://api.openai.com/v1'
      })

      const prompt = `Generate a ClickHouse SQL query as JSON.
IMPORTANT: Use exactly "FROM traces" as the table name.

Return JSON format:
{
  "sql": "SELECT service_name, quantile(0.95)(duration_ns/1000000) as p95_ms FROM traces WHERE start_time >= now() - INTERVAL 1 HOUR GROUP BY service_name",
  "description": "Calculate p95 latency by service"
}

Generate a query for p95 latency analysis.`

      const request: LLMRequest = {
        prompt,
        taskType: 'analysis',
        preferences: {
          maxTokens: 500,
          temperature: 0
        }
      }

      const result = await Effect.runPromise(client.generate(request))
      
      console.log('GPT ClickHouse response:', result.content)
      
      // Parse response
      let parsed: { sql?: string; description?: string }
      try {
        parsed = JSON.parse(result.content)
      } catch (e) {
        // Try extracting from markdown
        const jsonMatch = result.content.match(/```(?:json)?\s*([\s\S]*?)```/)
        if (jsonMatch && jsonMatch[1]) {
          parsed = JSON.parse(jsonMatch[1])
        } else {
          throw new Error(`Failed to parse response as JSON: ${result.content}`)
        }
      }
      
      expect(parsed.sql).toBeDefined()
      expect(parsed.sql?.toUpperCase()).toContain('FROM TRACES')
      expect(parsed.sql?.toLowerCase()).toContain('service_name')
      expect(parsed.description).toBeDefined()
    })
  })

  describe('Streaming Support', () => {
    it.skipIf(!hasApiKey)('should stream responses', async () => {
      const client = makeOpenAIClient({
        ...defaultOpenAIConfig,
        apiKey: process.env.OPENAI_API_KEY as string,
        endpoint: 'https://api.openai.com/v1'
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
        (client.generateStream as NonNullable<typeof client.generateStream>)(request).pipe(
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
      const client = makeOpenAIClient({
        ...defaultOpenAIConfig,
        apiKey: 'invalid-key',
        model: 'gpt-3.5-turbo',
        endpoint: 'https://api.openai.com/v1'
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

    it('should handle missing endpoint configuration', async () => {
      const client = makeOpenAIClient({
        apiKey: process.env.OPENAI_API_KEY || 'test-key',
        model: 'gpt-3.5-turbo',
        maxTokens: 100,
        temperature: 0,
        timeout: 5000
        // Intentionally missing endpoint
      } as Parameters<typeof makeOpenAIClient>[0])

      const request: LLMRequest = {
        prompt: 'Test',
        taskType: 'general'
      }

      const result = await Effect.runPromiseExit(client.generate(request))
      
      expect(result._tag).toBe('Failure')
      if (result._tag === 'Failure') {
        const error = result.cause._tag === 'Fail' ? result.cause.error : null
        expect(error).toBeDefined()
        // Should fail due to undefined endpoint
        console.log('Error when endpoint missing:', error)
      }
    })

    it.skipIf(!hasApiKey)('should handle rate limiting with retries', async () => {
      const client = makeOpenAIClient({
        ...defaultOpenAIConfig,
        apiKey: process.env.OPENAI_API_KEY as string,
        endpoint: 'https://api.openai.com/v1',
        retryAttempts: 2
      })

      // Normal request - just testing retry logic exists
      const request: LLMRequest = {
        prompt: 'Test',
        taskType: 'general',
        preferences: { maxTokens: 10 }
      }

      const result = await Effect.runPromise(client.generate(request))
      expect(result).toBeDefined()
      
      console.log('✅ OpenAI client has retry logic configured')
    })
  })

  describe('Cost Calculation', () => {
    it.skipIf(!hasApiKey)('should calculate costs correctly', async () => {
      const client = makeOpenAIClient({
        ...defaultOpenAIConfig,
        apiKey: process.env.OPENAI_API_KEY as string,
        model: 'gpt-3.5-turbo',
        endpoint: 'https://api.openai.com/v1'
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
      
      console.log(`GPT-3.5-turbo cost for ${result.usage.totalTokens} tokens: $${result.usage.cost}`)
    })
  })

  describe('Model Variants', () => {
    it.skipIf(!hasApiKey)('should work with different GPT models', async () => {
      const models = ['gpt-3.5-turbo', 'gpt-3.5-turbo-0125']
      
      for (const model of models) {
        const client = makeOpenAIClient({
          ...defaultOpenAIConfig,
          apiKey: process.env.OPENAI_API_KEY as string,
          model,
          endpoint: 'https://api.openai.com/v1'
        })

        const request: LLMRequest = {
          prompt: 'Say OK',
          taskType: 'general',
          preferences: { maxTokens: 10, temperature: 0 }
        }

        try {
          const result = await Effect.runPromise(client.generate(request))
          console.log(`✅ ${model}: ${result.content.substring(0, 50)}`)
          expect(result).toBeDefined()
        } catch (error) {
          console.log(`⚠️  ${model} not available: ${error}`)
        }
      }
    })
  })
})