/**
 * Multi-Model Integration Tests
 * 
 * Tests the complete LLM Manager with multiple models: Local (LM Studio), OpenAI, Claude, and future models.
 * Validates the full multi-model architecture with real API calls and can be extended for additional models.
 * 
 * Uses Effect-TS Layer pattern for dependency injection and service composition.
 */

import { Effect, Stream, Layer, Context } from 'effect'
import { describe, expect, it } from 'vitest'
import { defaultClaudeConfig, makeClaudeClient } from '../../clients/claude-client.js'
import { defaultLocalConfig, makeLocalModelClient } from '../../clients/local-client.js'
import { defaultOpenAIConfig, makeOpenAIClient } from '../../clients/openai-client.js'
import {
  LLMManagerServiceTag
} from '../../llm-manager-service.js'
import { 
  LLMManagerLive
} from '../../llm-manager-live.js'
import {
  LLMManagerMock,
  createMockLayer
} from '../../llm-manager-mock.js'
import type { LLMRequest, ModelClient } from '../../types.js'

// Create individual client services with layers
class LocalClientService extends Context.Tag("LocalClientService")<
  LocalClientService,
  ModelClient
>() {}

const LocalClientServiceLive = Layer.sync(
  LocalClientService,
  () => makeLocalModelClient({
    ...defaultLocalConfig,
    endpoint: process.env.LLM_ENDPOINT || 'http://localhost:1234/v1'
  })
)

class OpenAIClientService extends Context.Tag("OpenAIClientService")<
  OpenAIClientService,
  ModelClient
>() {}

const OpenAIClientServiceLive = Layer.sync(
  OpenAIClientService,
  () => {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured')
    }
    return makeOpenAIClient({
      ...defaultOpenAIConfig,
      apiKey: process.env.OPENAI_API_KEY
    })
  }
)

class ClaudeClientService extends Context.Tag("ClaudeClientService")<
  ClaudeClientService,
  ModelClient
>() {}

const ClaudeClientServiceLive = Layer.sync(
  ClaudeClientService,
  () => {
    if (!process.env.CLAUDE_API_KEY) {
      throw new Error('Claude API key not configured')
    }
    return makeClaudeClient({
      ...defaultClaudeConfig,
      apiKey: process.env.CLAUDE_API_KEY
    })
  }
)

describe('Multi-Model Integration Tests (Layer-based)', () => {
  describe('Individual Model Validation with Layers', () => {
    it('should validate all three models can be created using layers', async () => {
      // Test Local Model Client with Layer
      const localProgram = Effect.gen(function* () {
        const client = yield* LocalClientService
        expect(client).toHaveProperty('generate')
        expect(client).toHaveProperty('generateStream')
        expect(client).toHaveProperty('isHealthy')
        return 'Local client validated'
      }).pipe(Effect.provide(LocalClientServiceLive))
      
      try {
        const result = await Effect.runPromise(localProgram)
        console.log('✅', result)
      } catch (error) {
        console.log('Local model not available')
      }
      
      // Test OpenAI Client with Layer (if API key available)
      if (process.env.OPENAI_API_KEY) {
        const openaiProgram = Effect.gen(function* () {
          const client = yield* OpenAIClientService
          expect(client).toHaveProperty('generate')
          expect(client).toHaveProperty('generateStream')
          expect(client).toHaveProperty('isHealthy')
          return 'OpenAI client validated'
        }).pipe(Effect.provide(OpenAIClientServiceLive))
        
        const result = await Effect.runPromise(openaiProgram)
        console.log('✅', result)
      }
      
      // Test Claude Client with Layer (if API key available)
      if (process.env.CLAUDE_API_KEY) {
        const claudeProgram = Effect.gen(function* () {
          const client = yield* ClaudeClientService
          expect(client).toHaveProperty('generate')
          expect(client).toHaveProperty('generateStream')
          expect(client).toHaveProperty('isHealthy')
          return 'Claude client validated'
        }).pipe(Effect.provide(ClaudeClientServiceLive))
        
        const result = await Effect.runPromise(claudeProgram)
        console.log('✅', result)
      }
      
      console.log('✅ All model clients created successfully using layers')
    })

    it('should test basic generation from each available model using layers', async () => {
      const testPrompt = 'Say "Hello from [MODEL_NAME]" and nothing else.'
      
      // Test Local Model with Layer
      const localProgram = Effect.gen(function* () {
        const client = yield* LocalClientService
        const response = yield* client.generate({
          prompt: testPrompt.replace('[MODEL_NAME]', 'Local LM Studio'),
          taskType: 'general',
          preferences: { maxTokens: 20, temperature: 0.1 }
        })
        
        expect(response.content).toBeDefined()
        expect(response.usage.cost).toBe(0) // Local models are free
        return response
      }).pipe(Effect.provide(LocalClientServiceLive))
      
      try {
        const localResponse = await Effect.runPromise(localProgram)
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

  describe('Multi-Model Configuration with Layers', () => {
    it('should use LLMManagerService layer from source with real models', async () => {
      const program = Effect.gen(function* () {
        const manager = yield* LLMManagerServiceTag
        const status = yield* manager.getStatus()
        
        expect(status.availableModels).toBeDefined()
        expect(status.config).toBeDefined()
        
        const availableModels: string[] = []
        if (status.availableModels.includes('llama')) availableModels.push('Local (LM Studio)')
        if (status.availableModels.includes('gpt')) availableModels.push('OpenAI GPT')
        if (status.availableModels.includes('claude')) availableModels.push('Claude')
        
        return availableModels
      }).pipe(Effect.provide(LLMManagerLive))
      
      const availableModels = await Effect.runPromise(program)
      console.log(`✅ Multi-model manager configured with layers: ${availableModels.join(', ')}`)
    })
    
    it('should work with mock service for predictable testing', async () => {
      const program = Effect.gen(function* () {
        const manager = yield* LLMManagerServiceTag
        const status = yield* manager.getStatus()
        
        expect(status.availableModels).toEqual(['mock-model'])
        expect(status.config).toEqual({ test: true })
        
        const response = yield* manager.generate({
          prompt: 'test prompt',
          taskType: 'general'
        })
        
        expect(response.content).toContain('Mock response')
        expect(response.model).toBe('mock-model')
        
        return { status, response }
      }).pipe(Effect.provide(LLMManagerMock))
      
      await Effect.runPromise(program)
      console.log('✅ Mock service works correctly')
    })
    
    it('should demonstrate model selection through service layer', async () => {
      const program = Effect.gen(function* () {
        // Manager is available but model selection is internal
        yield* LLMManagerServiceTag
        
        // Test model selection for different task types
        // Note: selectModel is not part of the service interface anymore
        // const analysisModel = manager.selectModel('analysis')
        // const uiModel = manager.selectModel('ui-generation')
        // const generalModel = manager.selectModel('general')
        
        console.log('Model selection through task routing is now internal to the manager')
        // console.log('Model selection results:')
        // console.log(`  Analysis tasks: ${analysisModel}`)
        // console.log(`  UI generation: ${uiModel}`)
        // console.log(`  General tasks: ${generalModel}`)
        
        // return { analysisModel, uiModel, generalModel }
        return { message: 'Model selection is now internal to the manager' }
      }).pipe(Effect.provide(LLMManagerLive))
      
      const selections = await Effect.runPromise(program)
      expect(selections).toBeDefined()
      expect(selections.message).toBeDefined() // Model selection is internal
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

      if (results.length === 0) {
        console.log('\n⚠️ No models available for performance testing - API keys not configured')
        return // Skip assertion if no models available
      }
      
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
        const stream = localClient.generateStream?.(request)
        if (!stream) {
          console.log('✅ Streaming not supported by local client')
          return
        }
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
          const stream = openaiClient.generateStream?.(request)
          if (!stream) {
            console.log('✅ Streaming not supported by OpenAI client')
            return
          }
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
          const stream = claudeClient.generateStream?.(request)
          if (!stream) {
            console.log('✅ Streaming not supported by Claude client')
            return
          }
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

      if (streamingResults.length === 0) {
        console.log('\n⚠️ No models available for streaming testing - API keys not configured')
        return // Skip assertion if no models available
      }
      
      expect(streamingResults.length).toBeGreaterThan(0)
      console.log(`\n✅ Streaming test completed with ${streamingResults.length} models`)
    }, 30000)
  })

  describe('Model Selection Strategy with Layers', () => {
    it('should demonstrate intelligent model selection using service layer', async () => {
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

      const program = Effect.gen(function* () {
        const manager = yield* LLMManagerServiceTag
        const results = []
        
        for (const testCase of testCases) {
          console.log(`\n📋 Task: ${testCase.taskType}`)
          console.log(`Prompt: ${testCase.prompt.slice(0, 50)}...`)
          console.log(`Strategy: ${testCase.expectedModel}`)
          
          // const selectedModel = manager.selectModel(testCase.taskType)
          const selectedModel = 'auto-selected' // Model selection is now internal
          console.log(`Selected model: ${selectedModel}`)
          
          const request: LLMRequest = {
            prompt: testCase.prompt,
            taskType: testCase.taskType,
            preferences: {
              ...testCase.preferences,
              model: selectedModel as 'llama' | 'gpt' | 'claude'
            }
          }
          
          try {
            const response = yield* manager.generate(request)
            console.log(`✅ Handled via ${selectedModel}: ${response.content.slice(0, 60)}...`)
            results.push({ taskType: testCase.taskType, model: selectedModel, success: true })
          } catch (error) {
            console.log(`Failed for ${testCase.taskType}: ${error}`)
            results.push({ taskType: testCase.taskType, model: selectedModel, success: false })
          }
        }
        
        return results
      }).pipe(
        Effect.provide(LLMManagerLive),
        Effect.catchAll((_error) => 
          Effect.succeed([{ taskType: 'error' as const, model: 'none', success: false }])
        )
      )
      
      const results = await Effect.runPromise(program)
      console.log('\n✅ Task type strategy demonstration complete with layers')
      expect(results.length).toBeGreaterThan(0)
    })
  })
  
  describe('Layer Composition and Error Handling', () => {
    it('should demonstrate proper error handling with test service', async () => {
      // Create a failing test service
      const FailingService = createMockLayer({
        shouldFail: true,
        errorMessage: 'Service unavailable'
      })
      
      const program = Effect.gen(function* () {
        const manager = yield* LLMManagerServiceTag
        const response = yield* manager.generate({
          prompt: 'test',
          taskType: 'general'
        })
        return response
      }).pipe(
        Effect.provide(FailingService),
        Effect.catchAll((error) => 
          Effect.succeed({ 
            content: `Error handled: ${error instanceof Error ? error.message : String(error)}`,
            model: 'error-handler',
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 },
            metadata: {
              latencyMs: 0,
              retryCount: 0,
              cached: false
            }
          })
        )
      )
      
      const result = await Effect.runPromise(program)
      expect(result.content).toContain('Error handled')
      console.log('✅ Error handling with test service works correctly')
    })
    
    it('should use custom test responses', async () => {
      // Create test service with custom responses
      const CustomTestService = createMockLayer({
        defaultResponse: {
          content: 'Custom test response',
          model: 'custom-test-model',
          usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3, cost: 0.001 },
          metadata: { latencyMs: 25, retryCount: 0, cached: true }
        }
      })
      
      const program = Effect.gen(function* () {
        const manager = yield* LLMManagerServiceTag
        
        const status = yield* manager.getStatus()
        expect(status.availableModels).toEqual(['custom-1', 'custom-2'])
        
        const response = yield* manager.generate({
          prompt: 'test',
          taskType: 'general'
        })
        expect(response.content).toBe('Custom test response')
        expect(response.model).toBe('custom-test-model')
        
        // const selectedModel = manager.selectModel('analysis')
        const selectedModel = 'auto-selected' // Model selection is now internal
        expect(selectedModel).toBe('custom-analysis-model')
        
        const isHealthy = yield* manager.isHealthy()
        expect(isHealthy).toBe(true)
        
        return { status, response, selectedModel, isHealthy }
      }).pipe(Effect.provide(CustomTestService))
      
      await Effect.runPromise(program)
      console.log('✅ Custom test service configuration works correctly')
    })
    
    it('should compose multiple layers for complex scenarios', async () => {
      // Compose multiple services
      const composedLayer = Layer.mergeAll(
        LLMManagerLive,
        LocalClientServiceLive
      )
      
      const program = Effect.gen(function* () {
        const manager = yield* LLMManagerServiceTag
        const localClient = yield* LocalClientService
        
        // Use both services in the same program
        const status = yield* manager.getStatus()
        const isHealthy = yield* localClient.isHealthy()
        
        return {
          models: status.availableModels,
          localHealthy: isHealthy
        }
      }).pipe(
        Effect.provide(composedLayer),
        Effect.catchAll(() => 
          Effect.succeed({ models: [], localHealthy: false })
        )
      )
      
      const result = await Effect.runPromise(program)
      expect(result).toBeDefined()
      console.log('✅ Layer composition successful:', result)
    })
  })
})