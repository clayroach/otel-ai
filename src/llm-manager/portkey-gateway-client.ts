/**
 * Portkey Gateway Client - Final Working Implementation
 *
 * This uses direct fetch calls to the Portkey gateway, bypassing SDK issues.
 * Proven to work with the self-hosted Portkey gateway.
 */

import * as Schema from '@effect/schema/Schema'
import { Effect, Layer, Stream } from 'effect'
import { interactionLogger } from './interaction-logger.js'
import { LLMManagerServiceTag } from './llm-manager-service.js'
import type { LLMError, LLMRequest, LLMResponse } from './types.js'
import type { ModelInfo, PortkeyConfig } from './model-types.js'

// OpenAI-compatible response schema
const ChatCompletionSchema = Schema.Struct({
  id: Schema.String,
  object: Schema.String,
  created: Schema.Number,
  model: Schema.String,
  choices: Schema.Array(
    Schema.Struct({
      index: Schema.Number,
      message: Schema.Struct({
        role: Schema.String,
        content: Schema.String
      }),
      finish_reason: Schema.optional(Schema.String)
    })
  ),
  usage: Schema.Struct({
    prompt_tokens: Schema.Number,
    completion_tokens: Schema.Number,
    total_tokens: Schema.Number
  })
})

// Cache for config with content hash
let configCache: {
  config: PortkeyConfig | null
  contentHash: string | null
  lastLoaded?: Date
} = {
  config: null,
  contentHash: null
}

/**
 * Calculate SHA-256 hash of content
 */
const calculateHash = async (content: string): Promise<string> => {
  const crypto = await import('crypto')
  return crypto.createHash('sha256').update(content).digest('hex')
}

/**
 * Load and cache the Portkey configuration
 * Refreshes cache if file content has changed
 */
const loadPortkeyConfig = (): Effect.Effect<PortkeyConfig, LLMError, never> =>
  Effect.gen(function* () {
    const configPath = './config/portkey/config.json'

    const result = yield* Effect.tryPromise({
      try: async () => {
        const fs = await import('fs')
        const rawConfig = fs.readFileSync(configPath, 'utf8')

        // Calculate hash of the raw content
        const currentHash = await calculateHash(rawConfig)

        // Check if config has changed
        if (configCache.config && configCache.contentHash === currentHash) {
          // Config unchanged, using cached version
          return configCache.config
        }

        // Log cache refresh
        if (configCache.contentHash !== null) {
          console.log('[Portkey Config] Configuration file changed, refreshing cache', {
            previousHash: configCache.contentHash?.substring(0, 8),
            newHash: currentHash.substring(0, 8),
            lastLoaded: configCache.lastLoaded,
            configPath
          })
        } else {
          console.log('[Portkey Config] Loading configuration for the first time', {
            hash: currentHash.substring(0, 8),
            configPath
          })
        }

        // Replace environment variables and __PLACEHOLDER__ patterns in the config
        let processedConfig = rawConfig.replace(/\$\{([^}]+)\}/g, (match, envVar) => {
          // Support default values with :- syntax like ${VAR:-default}
          const [varName, defaultValue] = envVar.split(':-')
          const value = process.env[varName.trim()] || defaultValue?.trim() || match

          // Log environment variable substitutions for debugging
          if (value !== match && process.env.DEBUG_PORTKEY_CONFIG) {
            console.log(`[Portkey Config] Substituted ${varName.trim()} = ${value}`)
          }

          return value
        })

        // Also handle __PLACEHOLDER__ style placeholders (used in unprocessed configs)
        processedConfig = processedConfig.replace(/__([A-Z_]+)__/g, (match, varName) => {
          let value = process.env[varName]

          // Handle special cases with defaults for local development
          if (!value) {
            if (varName === 'LM_STUDIO_ENDPOINT') {
              value = 'http://localhost:1234/v1' // Use localhost when running tests on host
            } else if (varName === 'OLLAMA_ENDPOINT') {
              value = 'http://localhost:11434'
            }
          }

          return value || match
        })

        const parsed = JSON.parse(processedConfig) as PortkeyConfig

        // Update cache with new config and hash
        configCache = {
          config: parsed,
          contentHash: currentHash,
          lastLoaded: new Date()
        }

        // Log loaded configuration summary
        console.log('[Portkey Config] Configuration loaded successfully', {
          version: parsed.version,
          providersCount: parsed.providers.length,
          routesCount: parsed.routes.length,
          defaultGeneral: parsed.defaults?.general,
          defaultSQL: parsed.defaults?.sql,
          totalModels: parsed.routes.reduce((acc, route) => acc + route.models.length, 0)
        })

        return parsed
      },
      catch: (error): LLMError => ({
        _tag: 'ConfigurationError' as const,
        message: `Failed to load Portkey config: ${error}`
      })
    })

    return result
  })

/**
 * Get model information from config
 */
const getModelInfoFromConfig = (modelId: string, config: PortkeyConfig): ModelInfo | null => {
  // Find the route that contains this model
  for (const route of config.routes) {
    if (route.models.includes(modelId)) {
      const info: ModelInfo = {
        id: modelId,
        name: modelId,
        provider: route.provider as ModelInfo['provider'],
        capabilities: (route.capabilities || ['general']) as ModelInfo['capabilities'],
        metadata: {
          contextLength: route.metadata?.contextLength || 4096,
          maxTokens: route.metadata?.maxTokens || 2048,
          temperature: route.metadata?.temperature || 0.7
        }
      }

      // Add optional fields only if they exist and are not undefined
      if (
        route.metadata?.responseFormat &&
        (route.metadata.responseFormat === 'json' ||
          route.metadata.responseFormat === 'markdown' ||
          route.metadata.responseFormat === 'text')
      ) {
        info.metadata.responseFormat = route.metadata.responseFormat
      }
      if (route.metadata?.requiresWrapping !== undefined) {
        info.metadata.requiresWrapping = route.metadata.requiresWrapping
      }

      return info
    }
  }
  return null
}

/**
 * Portkey Gateway Client using direct HTTP calls
 * This is the working implementation that properly routes through the gateway
 */
export const makePortkeyGatewayManager = (baseURL: string) => {
  return Effect.succeed({
    generate: (request: LLMRequest) => {
      const startTime = Date.now()

      return Effect.gen(function* () {
        // Load config to get model defaults
        const config = yield* loadPortkeyConfig()
        // Use model preference, then custom defaults, then Portkey override_params, then hardcoded fallback
        const model =
          request.preferences?.model ||
          config.defaults?.general ||
          config.override_params?.model ||
          'gpt-3.5-turbo'

        // Start logging the interaction
        const interactionId = interactionLogger.startInteraction(
          model,
          'portkey', // All requests go through Portkey
          request.prompt,
          'generation', // Default task type since it's not in LLMRequest.preferences
          request.preferences
        )

        // Build request body
        const requestBody = {
          model,
          messages: [
            {
              role: 'user',
              content: request.prompt
            }
          ],
          max_tokens: request.preferences?.maxTokens || 2000,
          temperature: request.preferences?.temperature || 0.7
        }

        return yield* Effect.tryPromise({
          try: async () => {
            const timings = {
              start: Date.now(),
              headerBuild: 0,
              fetchStart: 0,
              fetchEnd: 0,
              jsonParse: 0
            }

            // Find the route and provider for this model
            let provider = 'openai' // default provider
            let customHost: string | undefined

            const route = config.routes.find((r) => r.models.includes(model))
            if (route) {
              provider = route.provider

              // Get provider config
              const providerConfig = config.providers.find((p) => p.id === provider)
              if (
                (providerConfig && providerConfig.baseURL.includes('localhost')) ||
                providerConfig?.baseURL.includes('host.docker.internal')
              ) {
                // Local model - use custom host
                customHost = providerConfig.baseURL
              }
            }

            // Determine if this is a local model
            const isLocalModel =
              provider === 'lm-studio' ||
              provider === 'ollama' ||
              customHost?.includes('localhost') ||
              customHost?.includes('host.docker.internal')

            // Build headers for Portkey routing
            const headers: Record<string, string> = {
              'Content-Type': 'application/json',
              'x-portkey-provider': isLocalModel ? 'openai' : provider // Use 'openai' for local models (OpenAI-compatible)
            }

            // For local models, add customHost header to point to LM Studio
            if (isLocalModel && customHost) {
              // Use the custom host from config (already processed for Docker/host environment)
              headers['x-portkey-custom-host'] = customHost
              // Use a placeholder API key for local models (Portkey requirement)
              headers['Authorization'] = `Bearer sk-local-placeholder-key-for-portkey`
            } else {
              // For cloud models, use actual API key
              const apiKey =
                provider === 'anthropic'
                  ? process.env.ANTHROPIC_API_KEY
                  : process.env.OPENAI_API_KEY
              headers['Authorization'] = `Bearer ${apiKey || ''}`
            }

            timings.headerBuild = Date.now() - timings.start

            try {
              timings.fetchStart = Date.now()
              const response = await fetch(`${baseURL}/v1/chat/completions`, {
                method: 'POST',
                headers,
                body: JSON.stringify(requestBody)
              })
              timings.fetchEnd = Date.now()

              if (!response.ok) {
                const errorText = await response.text()
                throw new Error(`Gateway error (${response.status}): ${errorText}`)
              }

              const jsonStart = Date.now()
              const jsonData = await response.json()
              timings.jsonParse = Date.now() - jsonStart

              // Log timing info only if explicitly debugging
              const totalTime = Date.now() - timings.start
              if (process.env.DEBUG_PORTKEY_TIMING) {
                console.log(
                  `[Portkey Timing] Total: ${totalTime}ms, Fetch: ${timings.fetchEnd - timings.fetchStart}ms, JSON: ${timings.jsonParse}ms`
                )
              }

              return jsonData
            } catch (fetchError) {
              // Handle specific Portkey HTTP protocol issue where response data is actually available
              if (
                fetchError instanceof TypeError &&
                fetchError.message === 'fetch failed' &&
                fetchError.cause &&
                typeof fetchError.cause === 'object' &&
                'code' in fetchError.cause &&
                fetchError.cause.code === 'HPE_UNEXPECTED_CONTENT_LENGTH'
              ) {
                // Try to extract the JSON response from the error data
                try {
                  const cause = fetchError.cause as { code: string; data?: string }
                  const data = cause.data
                  if (typeof data === 'string') {
                    // Parse chunked response data - look for JSON after hex length
                    const lines = data.split('\r\n')
                    const jsonLine = lines.find(
                      (line) => line.startsWith('{') && line.includes('"id"')
                    )
                    if (jsonLine) {
                      return JSON.parse(jsonLine)
                    }
                  }
                } catch (parseError) {
                  // Fall through to re-throw original error
                }
              }
              // Re-throw the original error if we can't extract the response
              throw fetchError
            }
          },
          catch: (error): LLMError => {
            const errorObj = {
              _tag: 'ModelUnavailable' as const,
              model: model,
              message: String(error)
            }
            // Log the failed interaction
            interactionLogger.failInteraction(interactionId, errorObj, Date.now() - startTime)
            return errorObj
          }
        }).pipe(
          Effect.flatMap((rawResponse) =>
            Schema.decodeUnknown(ChatCompletionSchema)(rawResponse).pipe(
              Effect.mapError(
                (error): LLMError => ({
                  _tag: 'InvalidRequest',
                  message: `Invalid response format: ${error}`,
                  request
                })
              ),
              Effect.map((response): LLMResponse => {
                const llmResponse = {
                  content: response.choices[0]?.message?.content || '',
                  model: response.model,
                  usage: {
                    promptTokens: response.usage.prompt_tokens,
                    completionTokens: response.usage.completion_tokens,
                    totalTokens: response.usage.total_tokens
                  },
                  metadata: {
                    latencyMs: Date.now() - startTime,
                    retryCount: 0,
                    cached: false
                  }
                }

                // Log the successful interaction
                interactionLogger.completeInteraction(
                  interactionId,
                  {
                    content: llmResponse.content,
                    model: llmResponse.model,
                    usage: {
                      promptTokens: llmResponse.usage.promptTokens,
                      completionTokens: llmResponse.usage.completionTokens,
                      totalTokens: llmResponse.usage.totalTokens
                    },
                    metadata: llmResponse.metadata
                  },
                  Date.now() - startTime
                )

                return llmResponse
              })
            )
          )
        )
      })
    },

    generateStream: (_request: LLMRequest) =>
      Stream.fail({
        _tag: 'ModelUnavailable' as const,
        model: 'portkey',
        message: 'Streaming not implemented yet'
      }),

    isHealthy: () =>
      Effect.tryPromise({
        try: async () => {
          const response = await fetch(baseURL)
          return response.ok && (await response.text()).includes('Gateway')
        },
        catch: (): LLMError => ({
          _tag: 'ModelUnavailable' as const,
          model: 'portkey',
          message: 'Gateway health check failed'
        })
      }),

    getStatus: () =>
      Effect.gen(function* () {
        const config = yield* loadPortkeyConfig()
        const models = config.routes.flatMap((route) => route.models)

        return {
          availableModels: models,
          healthStatus: { portkey: 'healthy' as const },
          config: {
            baseURL,
            defaults: config.defaults,
            providers: config.providers.length,
            routes: config.routes.length
          }
        }
      }),

    getAvailableModels: () =>
      loadPortkeyConfig().pipe(
        Effect.map((config) => config.routes.flatMap((route) => route.models))
      ),

    getDefaultModel: (taskType?: 'sql' | 'general' | 'code') =>
      Effect.gen(function* () {
        const config = yield* loadPortkeyConfig()

        // Use configured defaults if available
        if (taskType && config.defaults) {
          const defaultModel = config.defaults[taskType]
          if (defaultModel && typeof defaultModel === 'string') return defaultModel
        }

        // Check native Portkey override_params for general tasks
        if (!taskType || taskType === 'general') {
          const overrideModel = config.override_params?.model
          if (overrideModel && typeof overrideModel === 'string') return overrideModel
        }

        // Fallback to first model with matching capability
        if (taskType) {
          for (const route of config.routes) {
            if (route.capabilities?.includes(taskType) && route.models.length > 0) {
              const firstModel = route.models[0]
              if (firstModel && typeof firstModel === 'string') return firstModel
            }
          }
        }

        // Check native Portkey override_params as another fallback
        const overrideModel = config.override_params?.model
        if (overrideModel && typeof overrideModel === 'string') return overrideModel

        // Final fallback to first available model
        const allModels = config.routes.flatMap((route) => route.models)
        const firstAvailableModel = allModels[0]
        if (firstAvailableModel && typeof firstAvailableModel === 'string')
          return firstAvailableModel

        // Ultimate fallback
        return 'gpt-3.5-turbo'
      }),

    // New model discovery APIs
    getModelInfo: (modelId: string) =>
      Effect.gen(function* () {
        const config = yield* loadPortkeyConfig()
        const info = getModelInfoFromConfig(modelId, config)

        if (!info) {
          return yield* Effect.fail<LLMError>({
            _tag: 'ModelUnavailable',
            model: modelId,
            message: `Model ${modelId} not found in configuration`
          })
        }

        return info
      }),

    getModelsByCapability: (capability: string) =>
      Effect.gen(function* () {
        const config = yield* loadPortkeyConfig()
        const models: ModelInfo[] = []

        for (const route of config.routes) {
          if (route.capabilities?.includes(capability)) {
            for (const modelId of route.models) {
              const info = getModelInfoFromConfig(modelId, config)
              if (info) models.push(info)
            }
          }
        }

        return models
      }),

    getModelsByProvider: (provider: string) =>
      Effect.gen(function* () {
        const config = yield* loadPortkeyConfig()
        const models: ModelInfo[] = []

        for (const route of config.routes) {
          if (route.provider === provider) {
            for (const modelId of route.models) {
              const info = getModelInfoFromConfig(modelId, config)
              if (info) models.push(info)
            }
          }
        }

        return models
      }),

    getAllModels: () =>
      Effect.gen(function* () {
        const config = yield* loadPortkeyConfig()
        const models: ModelInfo[] = []

        for (const route of config.routes) {
          for (const modelId of route.models) {
            const info = getModelInfoFromConfig(modelId, config)
            if (info) models.push(info)
          }
        }

        return models
      })
  })
}

/**
 * Portkey Gateway Manager Layer
 * This is the working implementation for the self-hosted Portkey gateway
 */
export const PortkeyGatewayLive = Layer.effect(
  LLMManagerServiceTag,
  makePortkeyGatewayManager(
    process.env.PORTKEY_GATEWAY_URL ||
      (process.env.NODE_ENV === 'production'
        ? 'http://portkey-gateway:8787'
        : 'http://localhost:8787')
  )
)
