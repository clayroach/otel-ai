/**
 * Type definitions for Model Selection UI components
 */

export interface ModelSelectorProps {
  taskType: 'general' | 'sql'
  label?: string
  className?: string
  disabled?: boolean
  onModelChange?: (modelId: string) => void
  refreshInterval?: number // milliseconds, default 30000
}

export interface ModelDropdownItem {
  id: string
  name: string
  provider: 'openai' | 'anthropic' | 'ollama' | 'lm-studio'
  status: 'available' | 'unavailable' | 'error' | 'loading'
  isDefault?: boolean
  capabilities?: string[]
  metadata?: {
    contextLength?: number
    maxTokens?: number
    temperature?: number
    responseFormat?: 'json' | 'markdown' | 'text'
    cost?: number // cost per 1k tokens
  }
}

export interface ModelProviderGroup {
  provider: string
  displayName: string
  models: ModelDropdownItem[]
  allUnavailable: boolean
  icon?: string // optional icon for provider
}

export interface ModelHealthStatus {
  modelId: string
  status: 'healthy' | 'unhealthy' | 'checking' | 'unknown'
  lastChecked?: number
  latency?: number
  errorMessage?: string
}

export interface ModelSelectionState {
  generalModelId: string | null
  sqlModelId: string | null
  useClickHouseAI: boolean
  timestamp: number
  sessionId: string
}

export interface UseModelSelectionOptions {
  taskType: 'general' | 'sql'
  refreshInterval?: number
  onError?: (error: Error) => void
  onModelChange?: (modelId: string) => void
}

export interface UseModelSelectionResult {
  models: ModelDropdownItem[]
  selectedModelId: string | null
  isLoading: boolean
  error: Error | null
  selectModel: (modelId: string) => void
  refreshModels: () => void
  modelHealth: Map<string, ModelHealthStatus>
  providerGroups: ModelProviderGroup[]
}

// API Response types
export interface ApiModelInfo {
  id: string
  name: string
  provider: string
  capabilities?: string[]
  status?: string
  metadata?: Record<string, unknown>
}

export interface ApiModelsResponse {
  models: ApiModelInfo[]
  count: number
  timestamp: string
}

export interface ApiStatusResponse {
  availableModels: string[]
  healthStatus: Record<string, string>
  config: {
    baseURL: string
    defaults?: {
      general?: string
      sql?: string
      code?: string
    }
    providers: number
    routes: number
  }
  timestamp: string
}

export interface ApiModelSelectionRequest {
  taskType: 'general' | 'sql' | 'code' | 'embedding'
  requirements?: {
    minContextLength?: number
    maxCost?: number
    preferredProvider?: string
  }
}

export interface ApiModelSelectionResponse {
  selectedModel: string
  reason: string
  alternatives?: string[]
  timestamp: string
}
