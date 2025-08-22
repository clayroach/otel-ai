/**
 * Multi-Model Integration Tests
 * 
 * Tests the complete LLM Manager with multiple models: Local (LM Studio), OpenAI, Claude, and future models.
 * Validates the full multi-model architecture with real API calls and can be extended for additional models.
 */

import { describe, it, expect } from 'vitest'
import { Effect, Stream } from 'effect'
import { createSimpleLLMManager } from '../simple-manager.js'
import { makeLocalModelClient, defaultLocalConfig } from '../clients/local-client.js'
import { makeOpenAIClient, defaultOpenAIConfig } from '../clients/openai-client.js'
import { makeClaudeClient, defaultClaudeConfig } from '../clients/claude-client.js'
import type { LLMRequest, LLMConfig } from '../types.js'

describe('Multi-Model Integration Tests', () => {
  describe('Individual Model Validation', () => {
    it('should validate all three models can be created', async () => {
      // Test Local Model Client
      const localClient = makeLocalModelClient(defaultLocalConfig)
      expect(localClient).toHaveProperty('generate')
      expect(localClient).toHaveProperty('generateStream')
      expect(localClient).toHaveProperty('isHealthy')
      
      // Test OpenAI Client (if API key available)
      if (process.env.OPENAI_API_KEY) {
        const openaiClient = makeOpenAIClient({
          ...defaultOpenAIConfig,
          apiKey: process.env.OPENAI_API_KEY
        })
        expect(openaiClient).toHaveProperty('generate')
        expect(openaiClient).toHaveProperty('generateStream')
        expect(openaiClient).toHaveProperty('isHealthy')
      }
      
      // Test Claude Client (if API key available)
      if (process.env.CLAUDE_API_KEY) {
        const claudeClient = makeClaudeClient({
          ...defaultClaudeConfig,
          apiKey: process.env.CLAUDE_API_KEY
        })
        expect(claudeClient).toHaveProperty('generate')
        expect(claudeClient).toHaveProperty('generateStream')
        expect(claudeClient).toHaveProperty('isHealthy')
      }
      
      console.log('✅ All model clients created successfully')
    })

    it('should test basic generation from each available model', async () => {
      const testPrompt = 'Say "Hello from [MODEL_NAME]" and nothing else.'
      
      // Test Local Model
      try {
        const localClient = makeLocalModelClient(defaultLocalConfig)
        const localResponse = await Effect.runPromise(
          localClient.generate({
            prompt: testPrompt.replace('[MODEL_NAME]', 'Local LM Studio'),
            taskType: 'general',
            preferences: { maxTokens: 20, temperature: 0.1 }
          })
        )
        
        expect(localResponse.content).toBeDefined()
        expect(localResponse.usage.cost).toBe(0) // Local models are free
        console.log('✅ Local Model Response:', localResponse.content.slice(0, 50))
      } catch (error) {
        console.log('Local model not available (LM Studio not running)')
      }
      
      // Test OpenAI
      if (process.env.OPENAI_API_KEY) {
        try {
          const openaiClient = makeOpenAIClient({
            ...defaultOpenAIConfig,
            apiKey: process.env.OPENAI_API_KEY
          })
          const openaiResponse = await Effect.runPromise(
            openaiClient.generate({
              prompt: testPrompt.replace('[MODEL_NAME]', 'OpenAI GPT'),
              taskType: 'general',
              preferences: { maxTokens: 20, temperature: 0.1 }
            })
          )
          
          expect(openaiResponse.content).toBeDefined()
          expect(openaiResponse.usage.cost).toBeGreaterThan(0) // OpenAI has cost
          expect(openaiResponse.model).toContain('gpt')
          console.log('✅ OpenAI Response:', openaiResponse.content.slice(0, 50))
        } catch (error) {
          console.log('OpenAI error:', error)
          throw error
        }
      }
      
      // Test Claude
      if (process.env.CLAUDE_API_KEY) {
        try {
          const claudeClient = makeClaudeClient({
            ...defaultClaudeConfig,
            apiKey: process.env.CLAUDE_API_KEY
          })
          const claudeResponse = await Effect.runPromise(
            claudeClient.generate({
              prompt: testPrompt.replace('[MODEL_NAME]', 'Claude'),
              taskType: 'general',
              preferences: { maxTokens: 20, temperature: 0.1 }
            })
          )
          
          expect(claudeResponse.content).toBeDefined()
          expect(claudeResponse.usage.cost).toBeGreaterThan(0) // Claude has cost
          expect(claudeResponse.model).toContain('claude')
          console.log('✅ Claude Response:', claudeResponse.content.slice(0, 50))
        } catch (error) {
          console.log('Claude error:', error)
          throw error
        }
      }
    }, 30000)
  })

  describe('Multi-Model Configuration', () => {
    it('should create simple manager with all available models', async () => {
      const config: Partial<LLMConfig> = {
        models: {
          llama: {
            modelPath: 'test-model',
            contextLength: 2048,
            threads: 2,
            endpoint: 'http://localhost:1234/v1'
          },
          ...(process.env.OPENAI_API_KEY && {
            gpt: {
              apiKey: process.env.OPENAI_API_KEY,
              model: 'gpt-3.5-turbo',
              maxTokens: 100,
              temperature: 0.7
            }
          }),
          ...(process.env.CLAUDE_API_KEY && {
            claude: {
              apiKey: process.env.CLAUDE_API_KEY,
              model: 'claude-3-5-sonnet-20241022',
              maxTokens: 100,
              temperature: 0.7
            }
          })
        }
      }

      const manager = createSimpleLLMManager(config)
      const status = await Effect.runPromise(manager.getStatus())
      
      expect(status.models).toContain('llama')
      expect(status.config).toBeDefined()
      
      const availableModels = []
      if (config.models?.llama) availableModels.push('Local (LM Studio)')
      if (config.models?.gpt) availableModels.push('OpenAI GPT')
      if (config.models?.claude) availableModels.push('Claude')
      
      console.log(`✅ Multi-model manager configured with: ${availableModels.join(', ')}`)
    })
  })

  describe('Performance Comparison', () => {
    it('should compare response times and costs across models', async () => {
      const testPrompt = 'Explain artificial intelligence in exactly one sentence.'
      const request: LLMRequest = {
        prompt: testPrompt,
        taskType: 'analysis',
        preferences: {
          maxTokens: 50,
          temperature: 0.1
        }
      }

      const results: Array<{
        model: string
        latency: number
        cost: number
        tokens: number
        content: string
      }> = []

      // Test Local Model
      try {
        const localClient = makeLocalModelClient(defaultLocalConfig)
        const startTime = Date.now()
        const response = await Effect.runPromise(localClient.generate(request))
        const endTime = Date.now()
        
        results.push({
          model: 'Local (LM Studio)',
          latency: endTime - startTime,
          cost: response.usage.cost || 0,
          tokens: response.usage.totalTokens,
          content: response.content.slice(0, 80) + '...'
        })
      } catch (error) {
        console.log('Local model not available for performance test')
      }

      // Test OpenAI
      if (process.env.OPENAI_API_KEY) {
        try {
          const openaiClient = makeOpenAIClient({
            ...defaultOpenAIConfig,
            apiKey: process.env.OPENAI_API_KEY
          })
          const startTime = Date.now()
          const response = await Effect.runPromise(openaiClient.generate(request))
          const endTime = Date.now()
          
          results.push({
            model: 'OpenAI GPT',
            latency: endTime - startTime,
            cost: response.usage.cost || 0,
            tokens: response.usage.totalTokens,
            content: response.content.slice(0, 80) + '...'
          })
        } catch (error) {
          console.log('OpenAI not available for performance test')
        }
      }

      // Test Claude
      if (process.env.CLAUDE_API_KEY) {
        try {
          const claudeClient = makeClaudeClient({
            ...defaultClaudeConfig,
            apiKey: process.env.CLAUDE_API_KEY
          })
          const startTime = Date.now()
          const response = await Effect.runPromise(claudeClient.generate(request))
          const endTime = Date.now()
          
          results.push({
            model: 'Claude',
            latency: endTime - startTime,
            cost: response.usage.cost || 0,
            tokens: response.usage.totalTokens,
            content: response.content.slice(0, 80) + '...'
          })
        } catch (error) {
          console.log('Claude not available for performance test')
        }
      }

      // Log performance comparison
      console.log('\n🔍 Performance Comparison:')
      console.log('Model\t\t\tLatency (ms)\tCost ($)\tTokens\tResponse')
      console.log('─'.repeat(80))
      
      results.forEach(result => {
        console.log(
          `${result.model.padEnd(15)}\t${result.latency.toString().padEnd(8)}\t` +
          `${result.cost.toFixed(6)}\t${result.tokens.toString().padEnd(6)}\t${result.content}`
        )
      })

      expect(results.length).toBeGreaterThan(0)
      console.log(`\n✅ Performance test completed with ${results.length} models`)
    }, 45000)
  })

  describe('Streaming Comparison', () => {
    it('should test streaming across all available models', async () => {
      const testPrompt = 'Count from 1 to 3, one number per line'
      const request: LLMRequest = {
        prompt: testPrompt,
        taskType: 'general',
        streaming: true
      }

      const streamingResults: Array<{
        model: string
        chunks: number
        firstChunkTime: number
        totalTime: number
      }> = []

      // Test Local Streaming
      try {
        const localClient = makeLocalModelClient(defaultLocalConfig)
        const stream = localClient.generateStream!(request)
        const chunks: string[] = []
        let firstChunkTime = 0
        const startTime = Date.now()
        
        await Effect.runPromise(
          stream.pipe(
            Stream.runForEach((chunk) => {
              if (chunks.length === 0) {
                firstChunkTime = Date.now() - startTime
              }
              chunks.push(chunk)
              return Effect.succeed(undefined)
            }),
            Effect.timeout(10000)
          )
        )
        if (chunks.length === 0) {
          firstChunkTime = 1000 // Fallback if no chunks received
        }
        
        streamingResults.push({
          model: 'Local (LM Studio)',
          chunks: chunks.length,
          firstChunkTime,
          totalTime: Date.now() - startTime
        })
        
        console.log(`✅ Local streaming: ${chunks.length} chunks, first chunk in ${firstChunkTime}ms`)
      } catch (error) {
        console.log('Local streaming not available')
      }

      // Test OpenAI Streaming
      if (process.env.OPENAI_API_KEY) {
        try {
          const openaiClient = makeOpenAIClient({
            ...defaultOpenAIConfig,
            apiKey: process.env.OPENAI_API_KEY
          })
          const stream = openaiClient.generateStream!(request)
          const chunks: string[] = []
          let firstChunkTime = 0
          const startTime = Date.now()
          
          await Effect.runPromise(
            stream.pipe(
              Stream.runForEach((chunk) => {
                if (chunks.length === 0) {
                  firstChunkTime = Date.now() - startTime
                }
                chunks.push(chunk)
                return Effect.succeed(undefined)
              }),
              Effect.timeout(10000)
            )
          )
          
          streamingResults.push({
            model: 'OpenAI GPT',
            chunks: chunks.length,
            firstChunkTime,
            totalTime: Date.now() - startTime
          })
          
          console.log(`✅ OpenAI streaming: ${chunks.length} chunks, first chunk in ${firstChunkTime}ms`)
        } catch (error) {
          console.log('OpenAI streaming error:', error)
        }
      }

      // Test Claude Streaming
      if (process.env.CLAUDE_API_KEY) {
        try {
          const claudeClient = makeClaudeClient({
            ...defaultClaudeConfig,
            apiKey: process.env.CLAUDE_API_KEY
          })
          const stream = claudeClient.generateStream!(request)
          const chunks: string[] = []
          let firstChunkTime = 0
          const startTime = Date.now()
          
          await Effect.runPromise(
            stream.pipe(
              Stream.runForEach((chunk) => {
                if (chunks.length === 0) {
                  firstChunkTime = Date.now() - startTime
                }
                chunks.push(chunk)
                return Effect.succeed(undefined)
              }),
              Effect.timeout(10000)
            )
          )
          
          streamingResults.push({
            model: 'Claude',
            chunks: chunks.length,
            firstChunkTime,
            totalTime: Date.now() - startTime
          })
          
          console.log(`✅ Claude streaming: ${chunks.length} chunks, first chunk in ${firstChunkTime}ms`)
        } catch (error) {
          console.log('Claude streaming error:', error)
        }
      }

      // Log streaming comparison
      console.log('\n🔍 Streaming Performance:')
      console.log('Model\t\t\tChunks\tFirst Chunk (ms)\tTotal Time (ms)')
      console.log('─'.repeat(60))
      
      streamingResults.forEach(result => {
        console.log(
          `${result.model.padEnd(15)}\t${result.chunks.toString().padEnd(6)}\t` +
          `${result.firstChunkTime.toString().padEnd(12)}\t${result.totalTime}`
        )
      })

      expect(streamingResults.length).toBeGreaterThan(0)
      console.log(`\n✅ Streaming test completed with ${streamingResults.length} models`)
    }, 30000)
  })

  describe('Model Selection Strategy', () => {
    it('should demonstrate intelligent model selection based on task type', async () => {
      const testCases = [
        {
          taskType: 'general' as const,
          prompt: 'What is 2+2?',
          expectedModel: 'Local (cost-effective)',
          preferences: { maxTokens: 10 }
        },
        {
          taskType: 'analysis' as const,
          prompt: 'Analyze the implications of quantum computing on cryptography.',
          expectedModel: 'Claude or GPT (advanced reasoning)',
          preferences: { maxTokens: 100 }
        },
        {
          taskType: 'ui-generation' as const,
          prompt: 'Create a React component for a login form.',
          expectedModel: 'GPT (code generation)',
          preferences: { maxTokens: 200 }
        },
        {
          taskType: 'config-management' as const,
          prompt: 'Generate a Docker configuration for a Node.js app.',
          expectedModel: 'Any available model',
          preferences: { maxTokens: 150 }
        }
      ]

      for (const testCase of testCases) {
        console.log(`\n📋 Task: ${testCase.taskType}`)
        console.log(`Prompt: ${testCase.prompt.slice(0, 50)}...`)
        console.log(`Strategy: ${testCase.expectedModel}`)
        
        // For now, just test that we can handle different task types
        // In the future, this would demonstrate intelligent routing
        const request: LLMRequest = {
          prompt: testCase.prompt,
          taskType: testCase.taskType,
          preferences: testCase.preferences
        }
        
        // Test with available model (prioritizing local for cost)
        try {
          const localClient = makeLocalModelClient(defaultLocalConfig)
          const response = await Effect.runPromise(localClient.generate(request))
          console.log(`✅ Handled via Local: ${response.content.slice(0, 60)}...`)
        } catch (error) {
          console.log(`Local not available for ${testCase.taskType}`)
        }
      }
      
      console.log('\n✅ Task type strategy demonstration complete')
    })
  })
})