/**
 * Configuration Loader for LLM Manager
 *
 * Loads YAML configuration for client-side retry logic and observability settings.
 * This replaces JSON config for better documentation and maintainability.
 */

import { Effect } from 'effect'
import * as yaml from 'js-yaml'
import * as fs from 'fs'
import * as path from 'path'

export interface ClientRetryConfig {
  readonly enabled: boolean
  readonly maxAttempts: number
  readonly maxDelayMs: number
  readonly initialDelayMs: number
  readonly backoffMultiplier: number
  readonly jitterFactor: number
  readonly strategy?: 'prefer-retry-after' | 'exponential-backoff' | 'adaptive'
}

export interface LLMManagerConfig {
  readonly portkey: {
    readonly configPath: string
    readonly useGatewayRetry: boolean
  }
  readonly clientRetry: ClientRetryConfig
  readonly observability: {
    readonly logRetries: boolean
    readonly includeRetryMetadata: boolean
  }
}

// Cache for config to avoid repeated file reads
let configCache: {
  config: LLMManagerConfig | null
  lastLoaded?: Date
} = {
  config: null
}

/**
 * Load LLM Manager configuration from YAML file
 * Caches the configuration to avoid repeated file reads
 */
export const loadLLMManagerConfig = (): Effect.Effect<
  LLMManagerConfig,
  { _tag: 'ConfigurationError'; message: string },
  never
> =>
  Effect.tryPromise({
    try: async () => {
      // Return cached config if available and fresh (< 60 seconds old)
      if (configCache.config && configCache.lastLoaded) {
        const age = Date.now() - configCache.lastLoaded.getTime()
        if (age < 60000) {
          return configCache.config
        }
      }

      const configPath = path.resolve('./config/llm-manager.yaml')
      const content = fs.readFileSync(configPath, 'utf8')
      const config = yaml.load(content) as LLMManagerConfig

      // Validate required fields
      if (!config.clientRetry) {
        throw new Error('Missing clientRetry configuration')
      }
      if (!config.portkey) {
        throw new Error('Missing portkey configuration')
      }

      // Update cache
      configCache = {
        config,
        lastLoaded: new Date()
      }

      // Log config load if debugging
      if (process.env.DEBUG_PORTKEY_TIMING) {
        console.log('[LLM Config] Loaded configuration:', {
          retryEnabled: config.clientRetry.enabled,
          maxAttempts: config.clientRetry.maxAttempts,
          maxDelay: config.clientRetry.maxDelayMs,
          observability: config.observability
        })
      }

      return config
    },
    catch: (error) => ({
      _tag: 'ConfigurationError' as const,
      message: `Failed to load LLM Manager config: ${error}`
    })
  })

/**
 * Clear the config cache (useful for testing)
 */
export const clearConfigCache = (): void => {
  configCache = { config: null }
}
