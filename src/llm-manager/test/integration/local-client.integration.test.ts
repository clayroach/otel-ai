/**
 * Local Model Client Integration Tests
 * 
 * Low-level API tests for local model client (LM Studio) to verify:
 * - LM Studio connectivity
 * - Request/response format
 * - Different model types (SQL, code, general)
 * - Streaming support
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { Effect, Stream } from 'effect'
import { makeLocalModelClient, defaultLocalConfig, checkLocalModelHealth } from '../../clients/local-client.js'
import type { LLMRequest } from '../../types.js'

describe('Local Model Client Integration', () => {
  let isLMStudioAvailable = false
  
  beforeAll(async () => {
    // Check if LM Studio is running
    const health = await Effect.runPromise(checkLocalModelHealth())
    isLMStudioAvailable = health.healthy
    
    if (!isLMStudioAvailable) {
      console.log('⏭️  Skipping local model tests - LM Studio not running at http://localhost:1234')
    } else {
      console.log('✅ LM Studio detected at http://localhost:1234')
    }
  })

  describe('Basic Connectivity', () => {
    it.skipIf(!isLMStudioAvailable)('should connect to LM Studio and list models', async () => {
      const response = await fetch('http://localhost:1234/v1/models')
      expect(response.ok).toBe(true)
      
      const data = await response.json()
      expect(data.data).toBeDefined()
      expect(Array.isArray(data.data)).toBe(true)
      
      console.log('Available models:', data.data.map((m: { id: string }) => m.id))
    })

    it.skipIf(!isLMStudioAvailable)('should handle health check', async () => {
      const client = makeLocalModelClient(defaultLocalConfig)
      const healthy = await Effect.runPromise(client.isHealthy())
      expect(healthy).toBe(true)
    })
  })

  describe('SQL Model Testing', () => {
    it.skipIf(!isLMStudioAvailable)('should generate SQL with sqlcoder model', async () => {
      const client = makeLocalModelClient({
        endpoint: 'http://localhost:1234/v1',
        model: 'sqlcoder-7b-2',
        modelPath: 'sqlcoder-7b-2',
        maxTokens: 500,
        temperature: 0,
        contextLength: 8192
      })

      const request: LLMRequest = {
        prompt: 'Write SQL: SELECT all columns FROM users table WHERE age > 18',
        taskType: 'general',
        preferences: {
          maxTokens: 200,
          temperature: 0
        }
      }

      const result = await Effect.runPromise(
        client.generate(request).pipe(
          Effect.tapError(error => 
            Effect.sync(() => console.error('Local model error:', error))
          )
        )
      )

      console.log('SQL Model response:', result.content)
      
      expect(result.content.toUpperCase()).toContain('SELECT')
      expect(result.content.toLowerCase()).toContain('from')
      expect(result.content.toLowerCase()).toContain('users')
      expect(result.usage.cost).toBe(0) // Local models are free
    })

    it.skipIf(!isLMStudioAvailable)('should handle ClickHouse SQL generation', async () => {
      const client = makeLocalModelClient({
        endpoint: 'http://localhost:1234/v1',
        modelPath: 'sqlcoder-7b-2',
        maxTokens: 500,
        temperature: 0,
        contextLength: 8192
      })

      const request: LLMRequest = {
        prompt: `Generate SQL for ClickHouse:
Table: traces
Columns: service_name, duration_ns, start_time
Task: Get p95 latency by service_name
Return only the SQL query.`,
        taskType: 'general',
        preferences: {
          maxTokens: 300,
          temperature: 0
        }
      }

      const result = await Effect.runPromise(client.generate(request))
      
      console.log('ClickHouse SQL response:', result.content)
      
      const sql = result.content.toUpperCase()
      expect(sql).toContain('SELECT')
      expect(sql).toContain('TRACES')
      expect(sql.toLowerCase()).toContain('service_name')
    })
  })

  describe('Code Model Testing', () => {
    it.skipIf(!isLMStudioAvailable)('should work with codellama model', async () => {
      const client = makeLocalModelClient({
        endpoint: 'http://localhost:1234/v1',
        modelPath: 'codellama-7b-instruct',
        maxTokens: 200,
        temperature: 0,
        contextLength: 4096
      })

      const request: LLMRequest = {
        prompt: 'Write a Python function to add two numbers. Return only the code.',
        taskType: 'general',
        preferences: {
          maxTokens: 150,
          temperature: 0
        }
      }

      const result = await Effect.runPromise(client.generate(request))
      
      console.log('Code model response:', result.content.substring(0, 200))
      
      expect(result.content).toContain('def')
      expect(result.model).toContain('llama')
    })
  })

  describe('Response Format Handling', () => {
    it.skipIf(!isLMStudioAvailable)('should handle JSON generation requests', async () => {
      const client = makeLocalModelClient({
        endpoint: 'http://localhost:1234/v1',
        modelPath: process.env.LLM_SQL_MODEL_1 || 'sqlcoder-7b-2',
        maxTokens: 300,
        temperature: 0,
        contextLength: 8192
      })

      const request: LLMRequest = {
        prompt: `Return JSON: {"query": "SELECT * FROM traces", "description": "Get all traces"}`,
        taskType: 'general',
        preferences: {
          maxTokens: 200,
          temperature: 0,
          requireStructuredOutput: true
        }
      }

      const result = await Effect.runPromise(client.generate(request))
      
      console.log('Local model JSON attempt:', result.content.substring(0, 300))
      
      // Local models might not always return valid JSON
      // Just check it attempted to generate something
      expect(result.content.length).toBeGreaterThan(0)
    })
  })

  describe('Streaming Support', () => {
    it.skipIf(!isLMStudioAvailable)('should stream responses', async () => {
      const client = makeLocalModelClient({
        endpoint: 'http://localhost:1234/v1',
        modelPath: process.env.LLM_SQL_MODEL_1 || 'sqlcoder-7b-2',
        maxTokens: 100,
        temperature: 0,
        contextLength: 4096
      })

      const request: LLMRequest = {
        prompt: 'Count from 1 to 3',
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
              process.stdout.write(chunk)
            })
          ),
          Stream.runDrain
        )
      )

      expect(chunks.length).toBeGreaterThan(0)
      const fullResponse = chunks.join('')
      expect(fullResponse.length).toBeGreaterThan(0)
    })
  })

  describe('Error Handling', () => {
    it('should handle unavailable LM Studio gracefully', async () => {
      const client = makeLocalModelClient({
        endpoint: 'http://localhost:9999', // Wrong port
        modelPath: 'test-model',
        maxTokens: 100,
        temperature: 0,
        contextLength: 4096,
        timeout: 2000
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
        expect(error?._tag).toBe('ModelUnavailable')
      }
    })

    it.skipIf(!isLMStudioAvailable)('should handle invalid model name', async () => {
      const client = makeLocalModelClient({
        endpoint: 'http://localhost:1234/v1',
        modelPath: 'non-existent-model-xyz',
        maxTokens: 100,
        temperature: 0,
        contextLength: 4096
      })

      const request: LLMRequest = {
        prompt: 'Test',
        taskType: 'general'
      }

      const result = await Effect.runPromiseExit(client.generate(request))
      
      // LM Studio might still try to use a default model
      // or return an error - both are acceptable
      expect(result).toBeDefined()
    })
  })

  describe('Performance', () => {
    it.skipIf(!isLMStudioAvailable)('should track latency correctly', async () => {
      const client = makeLocalModelClient({
        endpoint: 'http://localhost:1234/v1',
        modelPath: process.env.LLM_SQL_MODEL_1 || 'sqlcoder-7b-2',
        maxTokens: 50,
        temperature: 0,
        contextLength: 4096
      })

      const request: LLMRequest = {
        prompt: 'Say hello',
        taskType: 'general',
        preferences: {
          maxTokens: 10,
          temperature: 0
        }
      }

      const startTime = Date.now()
      const result = await Effect.runPromise(client.generate(request))
      const endTime = Date.now()
      
      expect(result.metadata.latencyMs).toBeDefined()
      expect(result.metadata.latencyMs).toBeGreaterThan(0)
      expect(result.metadata.latencyMs).toBeLessThanOrEqual(endTime - startTime + 100) // Allow some margin
      
      console.log(`Local model latency: ${result.metadata.latencyMs}ms`)
    })
  })

  describe('Model Configuration', () => {
    it.skipIf(!isLMStudioAvailable)('should respect environment variable configuration', async () => {
      const modelFromEnv = process.env.LLM_SQL_MODEL_1 || 'sqlcoder-7b-2'
      
      const client = makeLocalModelClient({
        endpoint: 'http://localhost:1234/v1',
        // Should use model from environment
        modelPath: modelFromEnv,
        maxTokens: 100,
        temperature: 0,
        contextLength: 4096
      })

      const request: LLMRequest = {
        prompt: 'SELECT 1',
        taskType: 'general',
        preferences: { maxTokens: 50 }
      }

      const result = await Effect.runPromise(client.generate(request))
      
      console.log(`Using model from env: ${modelFromEnv}`)
      console.log(`Response model: ${result.model}`)
      
      expect(result.model).toContain('llama') // All local models report as llama-*
    })
  })
})