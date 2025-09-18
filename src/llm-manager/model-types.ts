/**
 * Model Information Types for Portkey Gateway
 *
 * These types define the structure for model discovery and capabilities
 */

export interface ModelInfo {
  id: string
  name: string
  provider: 'openai' | 'anthropic' | 'lm-studio' | 'ollama' | 'custom' | 'local'
  capabilities: ('general' | 'sql' | 'code' | 'embedding')[]
  metadata: {
    contextLength: number
    maxTokens: number
    temperature: number
    responseFormat?: 'json' | 'markdown' | 'text'
    requiresWrapping?: boolean
  }
  status?: 'available' | 'loading' | 'unavailable' | 'error'
  lastChecked?: Date
}

export interface PortkeyConfig {
  version: string
  defaults?: {
    general?: string
    sql?: string
    code?: string
    embedding?: string
  }
  override_params?: {
    model?: string
    temperature?: number
    max_tokens?: number
    [key: string]: string | number | boolean | undefined
  }
  strategy?: {
    mode: 'fallback' | 'loadbalance' | 'single'
    on_status_codes?: number[]
    targets?: Array<{
      provider: string
      override_params?: {
        model?: string
        [key: string]: string | number | boolean | undefined
      }
    }>
  }
  providers: Array<{
    id: string
    name: string
    apiKey: string
    baseURL: string
  }>
  routes: Array<{
    name: string
    models: string[]
    provider: string
    strategy: string
    capabilities?: string[]
    metadata?: {
      contextLength?: number
      maxTokens?: number
      temperature?: number
      responseFormat?: string
      requiresWrapping?: boolean
    }
  }>
  defaultRoute?: string
  cache?: {
    enabled: boolean
    ttl: number
    maxSize: number
  }
  retry?: {
    attempts: number
    delay: number
    backoff: string
  }
  observability?: {
    metrics: boolean
    tracing: boolean
    logging: string
  }
}
