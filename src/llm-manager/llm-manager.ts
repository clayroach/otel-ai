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
 * Task-based routing preferences
 */
const TASK_ROUTING: Record<string, string[]> = {
  'sql-generation': ['claude', 'openai', 'local'],
  'analysis': ['claude', 'openai', 'local'],
  'ui-generation': ['openai', 'claude', 'local'],
  'code-generation': ['openai', 'claude', 'local'],
  'config-management': ['openai', 'claude', 'local'],
  'anomaly-detection': ['claude', 'openai', 'local'],
  'architectural-insights': ['claude', 'openai', 'local'],
  'market-intelligence': ['openai', 'claude', 'local'],
  'general': ['local', 'claude', 'openai']
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
 * Create model router that selects the best client for a request
 */
function createModelRouter(clients: Record<string, ModelClient>) {
  return {
    selectClient: (request: LLMRequest): ModelClient | null => {
      // Priority 1: Explicit model preference in request
      if (request.preferences?.model) {
        const preferredModel = request.preferences.model.toLowerCase()
        
        // Map model names to client keys
        if (preferredModel.includes('claude') && clients.claude) {
          return clients.claude
        }
        if (preferredModel.includes('gpt') && clients.openai) {
          return clients.openai
        }
        if ((preferredModel.includes('llama') || preferredModel.includes('local')) && clients.local) {
          return clients.local
        }
      }
      
      // Priority 2: Task-based routing
      const taskType = request.taskType || 'general'
      const preferredOrder = TASK_ROUTING[taskType] || TASK_ROUTING.general || ['local']
      
      for (const modelName of preferredOrder) {
        if (clients[modelName]) {
          return clients[modelName]
        }
      }
      
      // Fallback to any available client
      return clients.local || Object.values(clients)[0] || null
    }
  }
}

/**
 * Check health status of all clients
 */
async function getClientsHealth(clients: Record<string, ModelClient>): Promise<Record<string, 'healthy' | 'unhealthy' | 'unknown'>> {
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
  const router = createModelRouter(clients)
  
  return {
    /**
     * Generate text using the best available model
     */
    generate: (request: LLMRequest): Effect.Effect<LLMResponse, LLMError, never> => {
      const client = router.selectClient(request)
      
      if (!client) {
        return Effect.fail({
          _tag: 'ConfigurationError' as const,
          message: 'No LLM clients available. Please configure at least one model.'
        })
      }
      
      return client.generate(request)
    },

    /**
     * Generate streaming text using the best available model
     */
    generateStream: (request: LLMRequest): Stream.Stream<string, LLMError, never> => {
      const client = router.selectClient(request)
      
      if (!client) {
        return Stream.fail({
          _tag: 'ConfigurationError' as const,
          message: 'No LLM clients available. Please configure at least one model.'
        })
      }
      
      if (!client.generateStream) {
        return Stream.fail({
          _tag: 'ConfigurationError' as const,
          message: 'Selected model does not support streaming'
        })
      }
      
      return client.generateStream(request)
    },

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
      const request: LLMRequest = {
        prompt: '',
        taskType: taskType as LLMRequest['taskType']
      }
      const client = router.selectClient(request)
      
      // Find which client was selected
      for (const [name, c] of Object.entries(clients)) {
        if (c === client) return name
      }
      
      return null
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