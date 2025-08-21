/**
 * Simple LLM Manager Implementation
 * 
 * Simplified version for the foundation that bypasses complex service layers
 * and focuses on core functionality that we've tested and validated.
 */

import { Effect } from 'effect'
import { 
  LLMRequest, 
  LLMResponse, 
  LLMError, 
  LLMConfig,
  ModelClient 
} from './types.js'
import { makeLocalModelClient, defaultLocalConfig } from './clients/local-client.js'

/**
 * Simple LLM Manager Factory
 * 
 * Creates a working LLM manager with local model support.
 * Perfect for the foundation implementation.
 */
export const createSimpleLLMManager = (config?: Partial<LLMConfig>) => {
  const localConfig = {
    ...defaultLocalConfig,
    ...config?.models?.llama
  }
  
  // Ensure endpoint is defined with a fallback
  const finalConfig = {
    ...localConfig,
    endpoint: localConfig.endpoint || defaultLocalConfig.endpoint
  }
  
  const localClient = makeLocalModelClient(finalConfig)

  return {
    /**
     * Generate text using the local model
     */
    generate: (request: LLMRequest): Effect.Effect<LLMResponse, LLMError, never> =>
      localClient.generate(request),

    /**
     * Generate streaming text using the local model
     */
    generateStream: (request: LLMRequest) =>
      localClient.generateStream?.(request) || Effect.fail({
        _tag: 'ConfigurationError' as const,
        message: 'Streaming not supported'
      }),

    /**
     * Check health of the local model
     */
    isHealthy: (): Effect.Effect<boolean, LLMError, never> =>
      localClient.isHealthy(),

    /**
     * Get configuration status
     */
    getStatus: () => Effect.succeed({
      models: ['llama'],
      healthy: true,
      config: config || {}
    })
  }
}

/**
 * Create Default LLM Manager
 * 
 * Quick factory for development and testing.
 */
export const createDefaultLLMManager = () =>
  createSimpleLLMManager()