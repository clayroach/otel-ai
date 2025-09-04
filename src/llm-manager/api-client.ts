/**
 * LLM Manager API Client
 *
 * Provides HTTP API interface to the LLM Manager service for:
 * - Querying loaded models and their health status
 * - Getting model metrics (tokens, latency, etc.)
 * - Model selection and routing information
 * - System resource usage
 */

import { Effect } from 'effect'
import type { LLMRequest, LLMResponse, LLMError, LLMConfig } from './types.js'
import { createSimpleLLMManager } from './simple-manager.js'

export interface LoadedModel {
  id: string
  provider: string
  status: 'healthy' | 'unhealthy' | 'loading' | 'error'
  lastHealthCheck?: Date
  metrics?: {
    totalRequests: number
    totalTokens: number
    averageLatency: number
    errorRate: number
    lastUsed?: Date
  }
  capabilities?: {
    maxTokens: number
    contextLength: number
    supportsStreaming: boolean
    supportsJSON: boolean
    supportsSQL: boolean
  }
  config?: {
    endpoint?: string
    temperature?: number
    apiKeyConfigured?: boolean
  }
}

export interface LLMManagerStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  loadedModels: LoadedModel[]
  defaultModel?: string
  systemMetrics?: {
    totalRequests: number
    totalTokens: number
    cacheHitRate: number
    averageLatency: number
    uptime: number
  }
  errors?: string[]
}

export interface ModelSelectionRequest {
  taskType: 'analysis' | 'ui-generation' | 'documentation' | 'code-generation'
  requirements?: {
    needsSQL?: boolean
    needsJSON?: boolean
    needsReasoning?: boolean
    maxLatency?: number
    preferredProvider?: string
  }
}

export interface ModelSelectionResponse {
  selectedModel: string
  reason: string
  alternatives?: string[]
  estimatedLatency?: number
  estimatedCost?: number
}

/**
 * API Client for LLM Manager Service
 */
export class LLMManagerAPIClient {
  private manager: ReturnType<typeof createSimpleLLMManager> | null = null
  private loadedModels: Map<string, LoadedModel> = new Map()
  private metrics = {
    totalRequests: 0,
    totalTokens: 0,
    cacheHits: 0,
    cacheMisses: 0,
    startTime: Date.now()
  }

  /**
   * Initialize the LLM Manager with configuration
   */
  async initialize(config?: {
    models?: LLMConfig['models']
    defaultModel?: string
  }): Promise<void> {
    // Initialize manager with base config
    const modelConfig = config?.models || {
      llama: {
        endpoint: process.env.LLM_ENDPOINT || 'http://localhost:1234/v1',
        modelPath: 'local-model',
        contextLength: 32768,
        threads: 4
      }
    }

    this.manager = createSimpleLLMManager({ models: modelConfig })

    // Load models from environment variables
    await this.loadModelsFromEnvironment()
  }

  /**
   * Load models based on environment variables
   */
  private async loadModelsFromEnvironment(): Promise<void> {
    // Import internal model registry functions
    const { getModelMetadataForEnvironment } = await import('./model-registry.js')

    // Clear existing models
    this.loadedModels.clear()

    // Define environment variable patterns
    const modelEnvPatterns = [
      // General models
      'LLM_GENERAL_MODEL_',
      // SQL-specific models
      'LLM_SQL_MODEL_',
      // Code generation models
      'LLM_CODE_MODEL_',
      // Documentation models
      'LLM_DOC_MODEL_'
    ]

    // Collect all model IDs from environment
    const configuredModelIds: string[] = []

    // Scan environment for model configurations
    for (const [key, value] of Object.entries(process.env)) {
      // Check if this is a model configuration variable
      const isModelConfig = modelEnvPatterns.some((pattern) => key.startsWith(pattern))

      if (isModelConfig && value) {
        configuredModelIds.push(value)
      }
    }

    // Get metadata for all configured models at once
    const modelMetadataMap = getModelMetadataForEnvironment(configuredModelIds)

    // Process each configured model
    for (const [key, value] of Object.entries(process.env)) {
      const isModelConfig = modelEnvPatterns.some((pattern) => key.startsWith(pattern))

      if (isModelConfig && value) {
        const modelId = value
        const modelMetadata = modelMetadataMap.get(modelId)

        if (modelMetadata) {
          // Determine model status based on provider and API keys
          let status: LoadedModel['status'] = 'loading'
          let apiKeyConfigured = false

          if (modelMetadata.provider === 'anthropic') {
            apiKeyConfigured = !!process.env.CLAUDE_API_KEY
            status = apiKeyConfigured ? 'healthy' : 'error'
          } else if (modelMetadata.provider === 'openai') {
            apiKeyConfigured = !!process.env.OPENAI_API_KEY
            status = apiKeyConfigured ? 'healthy' : 'error'
          } else if (
            modelMetadata.provider === 'local' ||
            modelMetadata.provider === 'meta' ||
            modelMetadata.provider === 'defog' ||
            modelMetadata.provider === 'bigcode' ||
            modelMetadata.provider === 'alibaba' ||
            modelMetadata.provider === 'deepseek'
          ) {
            // Local and open-source models
            status = 'healthy'
            apiKeyConfigured = false
          }

          // Determine capabilities based on model type
          const capabilities: LoadedModel['capabilities'] = {
            maxTokens: modelMetadata.maxTokens || 2048,
            contextLength: modelMetadata.contextLength || 8192,
            supportsStreaming: modelMetadata.capabilities?.streaming || false,
            supportsJSON: modelMetadata.capabilities?.json || false,
            supportsSQL: modelMetadata.capabilities?.sql || false
          }

          // Add to loaded models
          this.loadedModels.set(modelId, {
            id: modelId,
            provider: modelMetadata.provider,
            status,
            lastHealthCheck: new Date(),
            capabilities,
            config: {
              ...(modelMetadata.provider === 'local' && {
                endpoint: process.env.LLM_ENDPOINT || 'http://localhost:1234/v1'
              }),
              ...(modelMetadata.defaultTemperature !== undefined && {
                temperature: modelMetadata.defaultTemperature
              }),
              apiKeyConfigured
            },
            metrics: {
              totalRequests: 0,
              totalTokens: 0,
              averageLatency: 0,
              errorRate: 0
            }
          })

          console.log(`✅ Loaded model from ${key}: ${modelId} (${modelMetadata.provider})`)
        } else {
          console.warn(`⚠️ Model ${modelId} from ${key} not found in registry`)
        }
      }
    }

    // If no models were loaded from environment, add a default fallback
    if (this.loadedModels.size === 0) {
      console.log('⚠️ No models configured in environment, adding fallback model')
      this.loadedModels.set('fallback-local', {
        id: 'fallback-local',
        provider: 'local',
        status: 'healthy',
        lastHealthCheck: new Date(),
        capabilities: {
          maxTokens: 2048,
          contextLength: 8192,
          supportsStreaming: true,
          supportsJSON: false,
          supportsSQL: false
        },
        config: {
          endpoint: process.env.LLM_ENDPOINT || 'http://localhost:1234/v1',
          apiKeyConfigured: false
        },
        metrics: {
          totalRequests: 0,
          totalTokens: 0,
          averageLatency: 0,
          errorRate: 0
        }
      })
    }

    console.log(`📊 Loaded ${this.loadedModels.size} models from environment`)
  }

  /**
   * Get current status of the LLM Manager
   */
  async getStatus(): Promise<LLMManagerStatus> {
    const loadedModelsList = Array.from(this.loadedModels.values())

    // Perform health checks on loaded models
    for (const model of loadedModelsList) {
      await this.checkModelHealth(model.id)
    }

    const healthyCount = loadedModelsList.filter((m) => m.status === 'healthy').length
    const totalCount = loadedModelsList.length

    return {
      status: healthyCount === totalCount ? 'healthy' : healthyCount > 0 ? 'degraded' : 'unhealthy',
      loadedModels: loadedModelsList,
      defaultModel: 'local-llama',
      systemMetrics: {
        totalRequests: this.metrics.totalRequests,
        totalTokens: this.metrics.totalTokens,
        cacheHitRate:
          this.metrics.totalRequests > 0 ? this.metrics.cacheHits / this.metrics.totalRequests : 0,
        averageLatency: 150, // Mock value
        uptime: Date.now() - this.metrics.startTime
      }
    }
  }

  /**
   * Get list of actually loaded and available models
   */
  async getLoadedModels(): Promise<LoadedModel[]> {
    // Return only models that are actually loaded and healthy
    const models = Array.from(this.loadedModels.values())

    // Filter to only return healthy models unless specifically requested
    return models.filter((m) => m.status === 'healthy')
  }

  /**
   * Check health of a specific model
   */
  async checkModelHealth(modelId: string): Promise<boolean> {
    const model = this.loadedModels.get(modelId)
    if (!model) return false

    try {
      if (model.provider === 'local') {
        // Check if local endpoint is reachable
        const response = await fetch(
          model.config?.endpoint || 'http://localhost:1234/v1/models'
        ).catch(() => null)

        model.status = response?.ok ? 'healthy' : 'unhealthy'
      } else {
        // For cloud models, check if API key is configured
        model.status = model.config?.apiKeyConfigured ? 'healthy' : 'unhealthy'
      }

      model.lastHealthCheck = new Date()
      return model.status === 'healthy'
    } catch (error) {
      model.status = 'error'
      return false
    }
  }

  /**
   * Select best model for a given task
   */
  async selectModel(request: ModelSelectionRequest): Promise<ModelSelectionResponse> {
    const healthyModels = await this.getLoadedModels()
    const categories = this.getModelCategories()

    // Initialize selection
    let selectedModel = healthyModels[0]?.id || 'fallback-local'
    let reason = 'Default model'

    // Task-based selection
    if (request.taskType === 'ui-generation' || request.requirements?.needsSQL) {
      // For UI generation and SQL, prefer SQL-specific models
      const sqlModels = healthyModels.filter(
        (m) => categories.sql?.includes(m.id) || m.capabilities?.supportsSQL
      )

      if (sqlModels.length > 0) {
        // Prefer models explicitly configured as SQL models
        const configuredSqlModel = sqlModels.find((m) => categories.sql?.includes(m.id))
        if (configuredSqlModel) {
          selectedModel = configuredSqlModel.id
          reason = 'Configured SQL-specific model for query generation'
        } else {
          selectedModel = sqlModels[0]!.id
          reason = 'SQL-capable model for query generation'
        }
      }
    } else if (request.taskType === 'code-generation') {
      // For code generation, prefer code models
      const codeModels = healthyModels.filter(
        (m) => categories.code?.includes(m.id) || m.provider === 'bigcode'
      )

      if (codeModels.length > 0) {
        selectedModel = codeModels[0]!.id
        reason = 'Code generation optimized model'
      }
    } else if (request.taskType === 'documentation') {
      // For documentation, prefer doc models or general models
      const docModels = healthyModels.filter(
        (m) => categories.doc?.includes(m.id) || categories.general?.includes(m.id)
      )

      if (docModels.length > 0) {
        selectedModel = docModels[0]!.id
        reason = 'Documentation-capable model'
      }
    } else if (request.taskType === 'analysis') {
      // For analysis, prefer general models with reasoning
      const generalModels = healthyModels.filter(
        (m) =>
          categories.general?.includes(m.id) ||
          m.provider === 'anthropic' ||
          m.provider === 'openai'
      )

      if (generalModels.length > 0) {
        selectedModel = generalModels[0]!.id
        reason = 'General analysis model with reasoning capability'
      }
    }

    // Apply additional requirements
    if (request.requirements?.preferredProvider) {
      const preferredModel = healthyModels.find(
        (m) => m.provider === request.requirements?.preferredProvider
      )
      if (preferredModel) {
        selectedModel = preferredModel.id
        reason = `Preferred provider: ${request.requirements.preferredProvider}`
      }
    }

    // Check latency requirements
    if (request.requirements?.maxLatency) {
      // Prefer local models for low latency
      if (request.requirements.maxLatency < 500) {
        const localModel = healthyModels.find((m) => m.provider === 'local')
        if (localModel) {
          selectedModel = localModel.id
          reason = 'Local model for low latency requirement'
        }
      }
    }

    return {
      selectedModel,
      reason,
      alternatives: healthyModels.map((m) => m.id).filter((id) => id !== selectedModel),
      estimatedLatency: selectedModel.includes('local') ? 100 : 500,
      estimatedCost: selectedModel.includes('gpt')
        ? 0.002
        : selectedModel.includes('claude')
          ? 0.003
          : 0.0001
    }
  }

  /**
   * Generate completion using the manager
   */
  async generate(request: LLMRequest): Promise<LLMResponse> {
    if (!this.manager) {
      throw new Error('LLM Manager not initialized')
    }

    this.metrics.totalRequests++

    const result = await Effect.runPromise(
      this.manager.generate(request).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            // Update metrics
            const modelId = request.preferences?.model || 'local-llama'
            const model = this.loadedModels.get(modelId)
            if (model && model.metrics) {
              model.metrics.totalRequests++
              model.metrics.lastUsed = new Date()
            }
          })
        ),
        Effect.catchAll((error: LLMError) =>
          Effect.fail(
            new Error(
              `LLM generation failed: ${error._tag}${'message' in error ? ` - ${error.message}` : ''}`
            )
          )
        )
      )
    )

    // Update token metrics
    if (result.usage) {
      this.metrics.totalTokens += result.usage.totalTokens || 0
    }

    return result
  }

  /**
   * Get metrics for a specific model
   */
  async getModelMetrics(modelId: string): Promise<LoadedModel['metrics']> {
    const model = this.loadedModels.get(modelId)
    return (
      model?.metrics || {
        totalRequests: 0,
        totalTokens: 0,
        averageLatency: 0,
        errorRate: 0
      }
    )
  }

  /**
   * Reload model configuration from environment
   */
  async reloadModels(): Promise<void> {
    console.log('🔄 Reloading models from environment...')
    await this.loadModelsFromEnvironment()
    console.log(`✅ Reloaded ${this.loadedModels.size} models`)
  }

  /**
   * Get configured model categories from environment
   */
  getModelCategories(): { general: string[]; sql: string[]; code: string[]; doc: string[] } {
    const categories = {
      general: [] as string[],
      sql: [] as string[],
      code: [] as string[],
      doc: [] as string[]
    }

    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('LLM_GENERAL_MODEL_') && value) {
        categories.general.push(value)
      } else if (key.startsWith('LLM_SQL_MODEL_') && value) {
        categories.sql.push(value)
      } else if (key.startsWith('LLM_CODE_MODEL_') && value) {
        categories.code.push(value)
      } else if (key.startsWith('LLM_DOC_MODEL_') && value) {
        categories.doc.push(value)
      }
    }

    return categories
  }
}

// Singleton instance
let instance: LLMManagerAPIClient | null = null

/**
 * Get or create the LLM Manager API client instance
 */
export async function getLLMManagerClient(): Promise<LLMManagerAPIClient> {
  if (!instance) {
    instance = new LLMManagerAPIClient()
    await instance.initialize()
  }
  return instance
}

// Export convenience methods
export const getLoadedModels = async () => {
  const client = await getLLMManagerClient()
  return client.getLoadedModels()
}

export const getLLMManagerStatus = async () => {
  const client = await getLLMManagerClient()
  return client.getStatus()
}

export const selectBestModel = async (request: ModelSelectionRequest) => {
  const client = await getLLMManagerClient()
  return client.selectModel(request)
}
