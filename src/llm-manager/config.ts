/**
 * LLM Configuration Service
 *
 * Manages LLM configuration with validation, defaults, and environment variable support.
 * Provides type-safe configuration for all LLM models and routing strategies.
 */

import { Schema } from '@effect/schema'
import { Effect, Layer } from 'effect'
import { LLMConfigService } from './services.js'
import { LLMConfig, LLMConfigSchema, LLMError, RoutingStrategy } from './types.js'

/**
 * Default LLM Configuration
 *
 * Provides sensible defaults for local-first development with LM Studio.
 */
export const defaultLLMConfig: LLMConfig = {
  models: {
    llama: {
      modelPath: 'openai/gpt-oss-20b',
      contextLength: 4096,
      threads: 4,
      gpuLayers: 0,
      endpoint: 'http://localhost:1234/v1' // LM Studio default
    }
    // GPT and Claude are optional - will be configured via environment variables
  },
  routing: {
    strategy: 'balanced',
    fallbackOrder: ['llama', 'gpt', 'claude'],
    maxRetries: 3,
    timeoutMs: 30000
  },
  cache: {
    enabled: true,
    ttlSeconds: 3600, // 1 hour
    maxSize: 1000 // Maximum cached responses
  }
}

/**
 * Load Configuration from Environment
 *
 * Loads and validates LLM configuration from environment variables and defaults.
 */
const loadConfigFromEnv = (): Effect.Effect<LLMConfig, LLMError, never> =>
  Effect.gen(function* (_) {
    // Create a mutable configuration object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mutable config construction
    const baseConfig: any = {
      ...defaultLLMConfig,
      models: { ...defaultLLMConfig.models },
      routing: { ...defaultLLMConfig.routing },
      cache: { ...defaultLLMConfig.cache }
    }

    // Load GPT configuration if API key is provided
    const gptApiKey = process.env.OPENAI_API_KEY
    if (gptApiKey) {
      baseConfig.models.gpt = {
        apiKey: gptApiKey,
        model: process.env.LLM_GENERAL_MODEL_2 || process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
        maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '4096'),
        temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.7'),
        endpoint: process.env.OPENAI_ENDPOINT
      }
    }

    // Load Claude configuration if API key is provided
    const claudeApiKey = process.env.CLAUDE_API_KEY
    if (claudeApiKey) {
      baseConfig.models.claude = {
        apiKey: claudeApiKey,
        model:
          process.env.LLM_GENERAL_MODEL_1 ||
          process.env.CLAUDE_MODEL ||
          'claude-3-7-sonnet-20250219',
        maxTokens: parseInt(process.env.CLAUDE_MAX_TOKENS || '4096'),
        temperature: parseFloat(process.env.CLAUDE_TEMPERATURE || '0.7'),
        endpoint: process.env.CLAUDE_ENDPOINT
      }
    }

    // Override local model configuration from environment
    if (process.env.LM_STUDIO_ENDPOINT) {
      if (baseConfig.models.llama) {
        baseConfig.models.llama = {
          ...baseConfig.models.llama,
          endpoint: process.env.LM_STUDIO_ENDPOINT
        }
      }
    }

    if (process.env.LM_STUDIO_MODEL) {
      if (baseConfig.models.llama) {
        baseConfig.models.llama = {
          ...baseConfig.models.llama,
          modelPath: process.env.LM_STUDIO_MODEL
        }
      }
    }

    // Override routing strategy from environment
    const routingStrategy = process.env.LLM_ROUTING_STRATEGY
    if (routingStrategy && ['cost', 'performance', 'balanced'].includes(routingStrategy)) {
      baseConfig.routing = {
        ...baseConfig.routing,
        strategy: routingStrategy as RoutingStrategy
      }
    }

    // Override cache settings from environment
    if (process.env.LLM_CACHE_ENABLED) {
      baseConfig.cache = {
        ...baseConfig.cache,
        enabled: process.env.LLM_CACHE_ENABLED === 'true'
      }
    }

    if (process.env.LLM_CACHE_TTL_SECONDS) {
      baseConfig.cache = {
        ...baseConfig.cache,
        ttlSeconds: parseInt(process.env.LLM_CACHE_TTL_SECONDS)
      }
    }

    // Validate the final configuration
    return yield* _(
      Schema.decodeUnknown(LLMConfigSchema)(baseConfig).pipe(
        Effect.mapError((error) => ({
          _tag: 'ConfigurationError' as const,
          message: `Configuration validation failed: ${error.message}`
        }))
      )
    )
  })

/**
 * Create Configuration Service
 *
 * Creates the LLM configuration service with environment-based loading and validation.
 */
export const makeLLMConfigService = () =>
  Effect.gen(function* (_) {
    // Load initial configuration
    const config = yield* _(loadConfigFromEnv())

    return {
      getConfig: () => Effect.succeed(config),

      updateConfig: (newConfig: LLMConfig) =>
        Effect.gen(function* (_) {
          // Validate new configuration
          yield* _(
            Schema.decodeUnknown(LLMConfigSchema)(newConfig).pipe(
              Effect.mapError((error) => ({
                _tag: 'ConfigurationError' as const,
                message: `Configuration validation failed: ${error.message}`
              }))
            )
          )

          // In a real implementation, this would persist the config
          // For now, just log the update
          yield* _(Effect.log('LLM configuration updated'))
        }),

      validateConfig: (config: unknown) =>
        Schema.decodeUnknown(LLMConfigSchema)(config).pipe(
          Effect.mapError((error) => ({
            _tag: 'ConfigurationError' as const,
            message: `Configuration validation failed: ${error.message}`
          }))
        )
    }
  })

/**
 * LLM Configuration Layer
 *
 * Effect-TS Layer for dependency injection of the configuration service.
 */
export const LLMConfigLayer = Layer.effect(LLMConfigService, makeLLMConfigService())

/**
 * Environment Variables Documentation
 *
 * Documents all environment variables used for LLM configuration.
 */
export const ENV_DOCS = {
  // OpenAI GPT Configuration
  OPENAI_API_KEY: 'OpenAI API key for GPT models',
  OPENAI_MODEL: 'OpenAI model name (default: gpt-3.5-turbo)',
  OPENAI_MAX_TOKENS: 'Maximum tokens for GPT (default: 4096)',
  OPENAI_TEMPERATURE: 'Temperature for GPT (default: 0.7)',
  OPENAI_ENDPOINT: 'Custom OpenAI endpoint (optional)',

  // Claude Configuration
  CLAUDE_API_KEY: 'Anthropic API key for Claude models',
  CLAUDE_MODEL: 'Claude model name (default: claude-3-7-sonnet-20250219)',
  CLAUDE_MAX_TOKENS: 'Maximum tokens for Claude (default: 4096)',
  CLAUDE_TEMPERATURE: 'Temperature for Claude (default: 0.7)',
  CLAUDE_ENDPOINT: 'Custom Claude endpoint (optional)',

  // Local Model Configuration
  LM_STUDIO_ENDPOINT: 'LM Studio endpoint (default: http://localhost:1234/v1)',
  LM_STUDIO_MODEL: 'Local model name (default: openai/gpt-oss-20b)',

  // Routing Configuration
  LLM_ROUTING_STRATEGY: 'Routing strategy: cost, performance, or balanced',

  // Cache Configuration
  LLM_CACHE_ENABLED: 'Enable response caching (default: true)',
  LLM_CACHE_TTL_SECONDS: 'Cache TTL in seconds (default: 3600)'
} as const

/**
 * Print Configuration Status
 *
 * Utility function to print current configuration status for debugging.
 */
export const printConfigStatus = () =>
  Effect.gen(function* (_) {
    const config = yield* _(loadConfigFromEnv())

    yield* _(Effect.log('=== LLM Configuration Status ==='))

    // Available models
    const availableModels: string[] = []
    if (config.models.gpt) availableModels.push('GPT')
    if (config.models.claude) availableModels.push('Claude')
    if (config.models.llama) availableModels.push('Llama (Local)')

    yield* _(Effect.log(`Available models: ${availableModels.join(', ')}`))
    yield* _(Effect.log(`Routing strategy: ${config.routing.strategy}`))
    yield* _(Effect.log(`Cache enabled: ${config.cache.enabled}`))

    if (config.models.llama) {
      yield* _(Effect.log(`Local model endpoint: ${config.models.llama.endpoint}`))
      yield* _(Effect.log(`Local model path: ${config.models.llama.modelPath}`))
    }

    yield* _(Effect.log('================================'))
  })
