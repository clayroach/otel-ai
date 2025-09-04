/**
 * LLM Manager Live Implementation Layer
 *
 * Effect-TS layer that provides the live implementation of the LLM Manager Service
 * using the actual LLM manager with real model configurations.
 */

import { Layer, Effect } from 'effect'
import { LLMManagerServiceTag } from './llm-manager-service.js'
import { createLLMManager } from './llm-manager.js'
import type { LLMConfig } from './types.js'

/**
 * Load LLM configuration from environment variables
 */
function loadConfigFromEnvironment(): Partial<LLMConfig> {
  return {
    models: {
      llama: {
        modelPath: process.env.LLM_MODEL || 'default-model',
        contextLength: parseInt(process.env.LLM_CONTEXT_LENGTH || '2048'),
        threads: parseInt(process.env.LLM_THREADS || '4'),
        endpoint: process.env.LLM_ENDPOINT || 'http://localhost:1234/v1'
      },
      ...(process.env.OPENAI_API_KEY && {
        gpt: {
          apiKey: process.env.OPENAI_API_KEY,
          model: process.env.OPENAI_MODEL || 'gpt-4',
          maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '4096'),
          temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.7')
        }
      }),
      ...(process.env.CLAUDE_API_KEY && {
        claude: {
          apiKey: process.env.CLAUDE_API_KEY,
          model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
          maxTokens: parseInt(process.env.CLAUDE_MAX_TOKENS || '4096'),
          temperature: parseFloat(process.env.CLAUDE_TEMPERATURE || '0.7')
        }
      })
    }
  }
}

/**
 * Live implementation layer for the LLM Manager Service
 *
 * This layer creates and provides a real LLM manager instance
 * configured with environment variables and actual model clients.
 */
export const LLMManagerLive = Layer.effect(
  LLMManagerServiceTag,
  Effect.sync(() => {
    const config = loadConfigFromEnvironment()
    const manager = createLLMManager(config)
    
    return {
      generate: (request) => manager.generate(request),
      generateStream: (request) => manager.generateStream(request),
      isHealthy: () => manager.isHealthy(),
      getStatus: () => manager.getStatus(),
      getAvailableModels: () => manager.getAvailableModels()
    }
  })
)

/**
 * Live implementation with custom configuration
 *
 * Allows providing a custom configuration instead of loading from environment.
 */
export const createLLMManagerLive = (config: Partial<LLMConfig>) =>
  Layer.effect(
    LLMManagerServiceTag,
    Effect.sync(() => {
      const manager = createLLMManager(config)
      
      return {
        generate: (request) => manager.generate(request),
        generateStream: (request) => manager.generateStream(request),
        isHealthy: () => manager.isHealthy(),
        getStatus: () => manager.getStatus(),
        getAvailableModels: () => manager.getAvailableModels()
      }
    })
  )

/**
 * Development layer with enhanced logging
 *
 * Wraps the live implementation with detailed logging for debugging.
 */
export const LLMManagerDev = Layer.effect(
  LLMManagerServiceTag,
  Effect.gen(function* () {
    const config = loadConfigFromEnvironment()
    const manager = createLLMManager(config)
    
    console.log('[LLM Manager] Initialized with models:', yield* manager.getAvailableModels())
    
    return {
      generate: (request) =>
        Effect.gen(function* () {
          const startTime = Date.now()
          console.log(`[LLM Manager] Generating response for task: ${request.taskType}`)
          
          const selectedModel = manager.selectModel(request.taskType || 'general')
          console.log(`[LLM Manager] Selected model: ${selectedModel}`)
          
          const response = yield* manager.generate(request)
          const elapsed = Date.now() - startTime
          
          console.log(`[LLM Manager] Generated response in ${elapsed}ms using ${response.model}`)
          console.log(`[LLM Manager] Token usage: ${response.usage?.totalTokens || 0} tokens`)
          
          return response
        }),
        
      generateStream: (request) => {
        console.log(`[LLM Manager] Streaming response for task: ${request.taskType}`)
        const selectedModel = manager.selectModel(request.taskType || 'general')
        console.log(`[LLM Manager] Selected model for streaming: ${selectedModel}`)
        
        return manager.generateStream(request)
      },
      
      isHealthy: () =>
        Effect.gen(function* () {
          console.log('[LLM Manager] Checking health status...')
          const healthy = yield* manager.isHealthy()
          console.log(`[LLM Manager] Health status: ${healthy ? 'healthy' : 'unhealthy'}`)
          return healthy
        }),
        
      getStatus: () =>
        Effect.gen(function* () {
          const status = yield* manager.getStatus()
          console.log('[LLM Manager] Status:', JSON.stringify(status, null, 2))
          return status
        }),
        
      getAvailableModels: () =>
        Effect.gen(function* () {
          const models = yield* manager.getAvailableModels()
          console.log('[LLM Manager] Available models:', models)
          return models
        })
    }
  })
)