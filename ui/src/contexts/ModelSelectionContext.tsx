/**
 * ModelSelectionContext - Shared context for model selection to avoid duplicate API calls
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import type {
  ApiModelsResponse,
  ApiStatusResponse,
  ModelDropdownItem,
  ModelHealthStatus
} from '../components/ModelSelector/types'

interface ModelSelectionContextValue {
  models: ModelDropdownItem[]
  isLoading: boolean
  error: Error | null
  modelHealth: Map<string, ModelHealthStatus>
  selectedModels: {
    general: string | null
    sql: string | null
  }
  useClickHouseAI: boolean
  selectModel: (taskType: 'general' | 'sql', modelId: string) => void
  toggleClickHouseAI: (enabled: boolean) => void
  refreshModels: () => void
}

const ModelSelectionContext = createContext<ModelSelectionContextValue | null>(null)

// Helper to get persisted selection from localStorage
const getPersistedSelection = (taskType: 'general' | 'sql'): string | null => {
  try {
    return localStorage.getItem(`model-selection-${taskType}`)
  } catch {
    return null
  }
}

// Helper to persist selection to localStorage
const persistSelection = (taskType: 'general' | 'sql', modelId: string): void => {
  try {
    localStorage.setItem(`model-selection-${taskType}`, modelId)
    localStorage.setItem('model-selection-timestamp', String(Date.now()))
  } catch (error) {
    console.error('Failed to persist model selection:', error)
  }
}

export const ModelSelectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [models, setModels] = useState<ModelDropdownItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [modelHealth, setModelHealth] = useState<Map<string, ModelHealthStatus>>(new Map())
  const [selectedModels, setSelectedModels] = useState({
    general: null as string | null,
    sql: null as string | null
  })
  const [useClickHouseAI, setUseClickHouseAI] = useState(() => {
    try {
      return localStorage.getItem('use-clickhouse-ai') === 'true'
    } catch {
      return false
    }
  })

  const healthCheckInterval = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const loadingRef = useRef(false) // Prevent duplicate loads

  // Load models from API (only once for all components)
  const loadModels = useCallback(async () => {
    // Prevent duplicate loads
    if (loadingRef.current) {
      console.log('[ModelSelectionContext] Already loading, skipping...')
      return
    }

    loadingRef.current = true
    console.log('[ModelSelectionContext] Loading models (shared)...')
    setIsLoading(true)
    setError(null)

    try {
      // Fetch models from API
      const modelsResponse = await fetch('/api/llm-manager/models')
      if (!modelsResponse.ok) {
        throw new Error(`Failed to fetch models: ${modelsResponse.statusText}`)
      }
      const modelsData: ApiModelsResponse = await modelsResponse.json()

      // Fetch status to check availability
      const statusResponse = await fetch('/api/llm-manager/status')
      if (!statusResponse.ok) {
        throw new Error(`Failed to fetch status: ${statusResponse.statusText}`)
      }
      const statusData: ApiStatusResponse = await statusResponse.json()

      console.log('[ModelSelectionContext] Loaded', modelsData.models.length, 'models')

      // Transform to ModelDropdownItem format
      const dropdownItems: ModelDropdownItem[] = modelsData.models.map((model) => ({
        id: model.id,
        name: model.name || model.id,
        provider: (model.provider || 'openai') as ModelDropdownItem['provider'],
        status: statusData.availableModels.includes(model.id) ? 'available' : 'unavailable',
        capabilities: model.capabilities || [],
        metadata: model.metadata,
        isDefault: false
      }))

      // Mark default models
      const generalDefault = statusData.config?.defaults?.general
      const sqlDefault = statusData.config?.defaults?.sql

      const itemsWithDefaults = dropdownItems.map((m) => ({
        ...m,
        isDefault: m.id === generalDefault || m.id === sqlDefault
      }))

      // Get persisted selections or use defaults
      const persistedGeneral = getPersistedSelection('general')
      const persistedSql = getPersistedSelection('sql')

      // Find appropriate defaults based on capabilities
      const generalModels = itemsWithDefaults.filter((m) => m.capabilities?.includes('general'))
      const sqlModels = itemsWithDefaults.filter(
        (m) =>
          (m.capabilities?.includes('sql') || m.capabilities?.includes('code')) &&
          !m.capabilities?.includes('general')
      )

      setModels(itemsWithDefaults)
      setSelectedModels({
        general: persistedGeneral || generalDefault || generalModels[0]?.id || null,
        sql: persistedSql || sqlDefault || sqlModels[0]?.id || null
      })
      setIsLoading(false)
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      console.error('[ModelSelectionContext] Error loading models:', error)
      console.error('[ModelSelectionContext] Full error details:', err)
      setError(error)
      setIsLoading(false)
    } finally {
      loadingRef.current = false
    }
  }, [])

  // Select model and persist
  const selectModel = useCallback((taskType: 'general' | 'sql', modelId: string) => {
    persistSelection(taskType, modelId)
    setSelectedModels((prev) => ({
      ...prev,
      [taskType]: modelId
    }))

    // Optionally notify the backend about the selection
    fetch('/api/llm-manager/select-model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskType: taskType === 'sql' ? 'sql' : 'analysis',
        requirements: { preferredModel: modelId }
      })
    }).catch((err) => console.debug('Failed to notify backend about model selection:', err))
  }, [])

  // Toggle ClickHouse AI mode
  const toggleClickHouseAI = useCallback((enabled: boolean) => {
    setUseClickHouseAI(enabled)
    try {
      localStorage.setItem('use-clickhouse-ai', String(enabled))
    } catch (error) {
      console.error('Failed to persist ClickHouse AI setting:', error)
    }
  }, [])

  // Health check for models
  const checkModelHealth = useCallback(async () => {
    if (!models.length) return

    try {
      const response = await fetch('/api/llm-manager/status')
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.statusText}`)
      }
      const data: ApiStatusResponse = await response.json()

      const healthMap = new Map<string, ModelHealthStatus>()

      models.forEach((model) => {
        const isHealthy = data.availableModels.includes(model.id)
        healthMap.set(model.id, {
          modelId: model.id,
          status: isHealthy ? 'healthy' : 'unhealthy',
          lastChecked: Date.now()
        })
      })

      setModelHealth(healthMap)
    } catch (err) {
      console.error('[ModelSelectionContext] Health check failed:', err)
    }
  }, [models])

  // Initial load (only once)
  useEffect(() => {
    loadModels()
  }, [])

  // Set up health check interval
  useEffect(() => {
    if (models.length > 0) {
      // Initial health check
      checkModelHealth()

      // Set up interval (30 seconds)
      healthCheckInterval.current = setInterval(checkModelHealth, 30000)

      return () => {
        if (healthCheckInterval.current) {
          clearInterval(healthCheckInterval.current)
        }
      }
    }
  }, [models.length, checkModelHealth])

  const value: ModelSelectionContextValue = {
    models,
    isLoading,
    error,
    modelHealth,
    selectedModels,
    useClickHouseAI,
    selectModel,
    toggleClickHouseAI,
    refreshModels: loadModels
  }

  return <ModelSelectionContext.Provider value={value}>{children}</ModelSelectionContext.Provider>
}

export const useModelSelectionContext = () => {
  const context = useContext(ModelSelectionContext)
  if (!context) {
    throw new Error('useModelSelectionContext must be used within ModelSelectionProvider')
  }
  return context
}
