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
 * Helper function to create local model configuration
 */
function createLocalModelConfig(modelName: string, isSQL: boolean = false) {
  return {
    modelPath: modelName,
    contextLength: 4096,
    threads: 4,
    gpuLayers: 0,
    endpoint:
      process.env.LM_STUDIO_ENDPOINT || process.env.LLM_ENDPOINT || 'http://localhost:1234/v1',
    maxTokens: isSQL ? 2048 : 4096,
    temperature: isSQL ? 0 : 0.7 // SQL models should be deterministic
  }
}

/**
 * Helper function to load models from environment variable pattern
 */
function loadModelsFromPattern(pattern: string, isSQL: boolean = false) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dynamic model configuration construction
  const models: any = {}
  const modelKeys = Object.keys(process.env).filter((key) => key.startsWith(pattern))

  for (const key of modelKeys) {
    const modelName = process.env[key]
    if (modelName) {
      if (pattern === 'LLM_GENERAL_MODEL_') {
        // Determine if this is a Claude, GPT, or local model based on name
        if (modelName.includes('claude') && process.env.CLAUDE_API_KEY) {
          models.claude = {
            apiKey: process.env.CLAUDE_API_KEY,
            model: modelName,
            maxTokens: parseInt(process.env.CLAUDE_MAX_TOKENS || '4096'),
            temperature: parseFloat(process.env.CLAUDE_TEMPERATURE || '0.7')
          }
        } else if (modelName.includes('gpt') && process.env.OPENAI_API_KEY) {
          models.gpt = {
            apiKey: process.env.OPENAI_API_KEY,
            model: modelName,
            maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '4096'),
            temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.7')
          }
        } else {
          // Assume it's a local model
          models[modelName] = createLocalModelConfig(modelName, isSQL)
        }
      } else {
        // SQL models are always local models
        models[modelName] = createLocalModelConfig(modelName, isSQL)
      }
    }
  }

  return models
}

/**
 * Load LLM configuration from environment variables
 * Loads all LLM_SQL_MODEL_* and LLM_GENERAL_MODEL_* variables dynamically
 */
function loadConfigFromEnvironment(): Partial<LLMConfig> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dynamic model configuration construction
  const models: any = {}

  // NOTE: Legacy llama model configuration removed - use LLM_SQL_MODEL_* instead
  // This ensures consistent configuration through the structured model system

  // Load SQL-specific models from LLM_SQL_MODEL_* environment variables
  Object.assign(models, loadModelsFromPattern('LLM_SQL_MODEL_', true))

  // Load general models from LLM_GENERAL_MODEL_* environment variables
  Object.assign(models, loadModelsFromPattern('LLM_GENERAL_MODEL_', false))

  // Fallback configurations if no models were loaded
  if (Object.keys(models).length === 0) {
    // Add default local model
    const defaultModelName = process.env.LLM_SQL_MODEL_1 || 'sqlcoder-7b-2'
    models[defaultModelName] = createLocalModelConfig(defaultModelName, true)
  }

  return { models }
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
        manager.isHealthy().pipe(
          Effect.tap((healthy) =>
            Effect.sync(() => {
              console.log('[LLM Manager] Checking health status...')
              console.log(`[LLM Manager] Health status: ${healthy ? 'healthy' : 'unhealthy'}`)
            })
          )
        ),

      getStatus: () =>
        manager
          .getStatus()
          .pipe(
            Effect.tap((status) =>
              Effect.sync(() =>
                console.log('[LLM Manager] Status:', JSON.stringify(status, null, 2))
              )
            )
          ),

      getAvailableModels: () =>
        manager
          .getAvailableModels()
          .pipe(
            Effect.tap((models) =>
              Effect.sync(() => console.log('[LLM Manager] Available models:', models))
            )
          )
    }
  })
)
