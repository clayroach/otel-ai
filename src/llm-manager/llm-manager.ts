/**
 * LLM Manager Core Implementation
 *
 * Unified LLM manager that supports multiple models (local, Claude, OpenAI)
 * with intelligent routing based on task type and model availability.
 */

import { Effect, Stream } from 'effect'
import { LLMRequest, LLMResponse, LLMError, LLMConfig } from './types.js'
import { makeLocalModelClient, defaultLocalConfig } from './clients/local-client.js'
import { makeClaudeClient } from './clients/claude-client.js'
import { makeOpenAIClient } from './clients/openai-client.js'
import { makeModelRouter } from './router.js'
import type { ManagerStatus } from './llm-manager-service.js'

/**
 * Model client interface that all implementations must follow
 */
interface ModelClient {
  generate: (request: LLMRequest) => Effect.Effect<LLMResponse, LLMError, never>
  generateStream?: (request: LLMRequest) => Stream.Stream<string, LLMError, never>
  isHealthy: () => Effect.Effect<boolean, LLMError, never>
}

/**
 * Create and configure all available model clients
 */
function initializeClients(config?: Partial<LLMConfig>): Record<string, ModelClient> {
  const clients: Record<string, ModelClient> = {}

  // Always initialize local client
  const localConfig = {
    ...defaultLocalConfig,
    ...config?.models?.llama,
    endpoint: config?.models?.llama?.endpoint || defaultLocalConfig.endpoint
  }
  clients.local = makeLocalModelClient(localConfig)

  // Initialize Claude if API key present
  if (process.env.CLAUDE_API_KEY) {
    clients.claude = makeClaudeClient({
      ...config?.models?.claude,
      apiKey: process.env.CLAUDE_API_KEY,
      model: config?.models?.claude?.model || 'claude-3-5-sonnet-20241022',
      maxTokens: config?.models?.claude?.maxTokens || 4096,
      temperature: config?.models?.claude?.temperature || 0.7,
      timeout: 30000, // 30 seconds
      endpoint: config?.models?.claude?.endpoint || 'https://api.anthropic.com'
    })
  }

  // Initialize OpenAI if API key present
  if (process.env.OPENAI_API_KEY) {
    clients.openai = makeOpenAIClient({
      ...config?.models?.gpt,
      apiKey: process.env.OPENAI_API_KEY,
      model: config?.models?.gpt?.model || 'gpt-4',
      maxTokens: config?.models?.gpt?.maxTokens || 4096,
      temperature: config?.models?.gpt?.temperature || 0.7,
      timeout: 30000, // 30 seconds
      endpoint: config?.models?.gpt?.endpoint || 'https://api.openai.com/v1'
    })
  }

  return clients
}

/**
 * Check health status of all clients
 */
async function getClientsHealth(
  clients: Record<string, ModelClient>
): Promise<Record<string, 'healthy' | 'unhealthy' | 'unknown'>> {
  const healthStatus: Record<string, 'healthy' | 'unhealthy' | 'unknown'> = {}

  for (const [name, client] of Object.entries(clients)) {
    try {
      const isHealthy = await Effect.runPromise(client.isHealthy())
      healthStatus[name] = isHealthy ? 'healthy' : 'unhealthy'
    } catch {
      healthStatus[name] = 'unknown'
    }
  }

  return healthStatus
}

/**
 * Unified LLM Manager Factory
 *
 * Creates a multi-model LLM manager that intelligently routes requests
 * to the best available model based on task type and configuration.
 */
export const createLLMManager = (config?: Partial<LLMConfig>) => {
  const clients = initializeClients(config)

  // Use the proper router with fallback logic
  const routerEffect = makeModelRouter(config || {}, {
    gpt: clients.openai,
    claude: clients.claude,
    llama: clients.local
  })

  return {
    /**
     * Generate text using the best available model
     */
    generate: (request: LLMRequest): Effect.Effect<LLMResponse, LLMError, never> =>
      Effect.gen(function* () {
        const router = yield* routerEffect
        // Use routeRequest which has proper fallback logic
        return yield* router.routeRequest(request)
      }),

    /**
     * Generate streaming text using the best available model
     */
    generateStream: (request: LLMRequest): Stream.Stream<string, LLMError, never> =>
      Stream.fromEffect(
        Effect.gen(function* () {
          const router = yield* routerEffect
          // For now, we'll use a simple approach for streaming
          // TODO: Update router to support streaming selection
          const response = yield* router.routeRequest(request)
          return response.content
        })
      ),

    /**
     * Check health of all configured models
     */
    isHealthy: (): Effect.Effect<boolean, LLMError, never> =>
      Effect.gen(function* () {
        if (Object.keys(clients).length === 0) {
          return false
        }

        // Check if at least one client is healthy
        for (const client of Object.values(clients)) {
          try {
            const healthy = yield* client.isHealthy()
            if (healthy) return true
          } catch {
            // Continue checking other clients
          }
        }

        return false
      }),

    /**
     * Get status of all configured models
     */
    getStatus: (): Effect.Effect<ManagerStatus, LLMError, never> =>
      Effect.gen(function* () {
        const healthStatus = yield* Effect.promise(() => getClientsHealth(clients))

        return {
          availableModels: Object.keys(clients),
          healthStatus,
          config: config || {}
        }
      }),

    /**
     * Get list of available models
     */
    getAvailableModels: (): Effect.Effect<string[], LLMError, never> =>
      Effect.succeed(Object.keys(clients)),

    /**
     * Get the underlying clients for direct access if needed
     */
    getClients: () => clients,

    /**
     * Select the best model for a given task type
     */
    selectModel: (taskType: string): string | null => {
      // For now, return a simple selection based on task type
      // This is a synchronous method, so we can't use the async router
      const taskRouting = {
        analysis: 'claude',
        'ui-generation': 'gpt',
        'config-management': 'llama',
        general: 'llama'
      }
      const selected = taskRouting[taskType as keyof typeof taskRouting] || 'llama'

      // Check if the selected model client exists
      if (selected === 'claude' && clients.claude) return 'claude'
      if (selected === 'gpt' && clients.openai) return 'openai'
      if (selected === 'llama' && clients.local) return 'local'

      // Return first available
      return Object.keys(clients)[0] || null
    }
  }
}

/**
 * Create Default LLM Manager
 *
 * Quick factory for development and testing with default configuration.
 */
export const createDefaultLLMManager = () => createLLMManager()

/**
 * Export types for external use
 */
export type { ModelClient }
export type LLMManager = ReturnType<typeof createLLMManager>
