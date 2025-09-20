/**
 * React hook for model selection - uses shared context
 */

import { useMemo } from 'react'
import { useModelSelectionContext } from '../contexts/ModelSelectionContext'
import type {
  ModelDropdownItem,
  ModelProviderGroup,
  UseModelSelectionOptions,
  UseModelSelectionResult
} from '../components/ModelSelector/types'

// Helper to group models by provider
const groupModelsByProvider = (models: ModelDropdownItem[]): ModelProviderGroup[] => {
  const groups = new Map<string, ModelDropdownItem[]>()

  models.forEach((model) => {
    const provider = model.provider
    if (!groups.has(provider)) {
      groups.set(provider, [])
    }
    groups.get(provider)?.push(model)
  })

  const providerNames: Record<string, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    ollama: 'Ollama (Local)',
    'lm-studio': 'LM Studio (Local)'
  }

  return Array.from(groups.entries()).map(([provider, models]) => ({
    provider,
    displayName: providerNames[provider] || provider,
    models,
    allUnavailable: models.every((m) => m.status === 'unavailable')
  }))
}

export const useModelSelection = (options: UseModelSelectionOptions): UseModelSelectionResult => {
  const {
    models,
    isLoading,
    error,
    modelHealth,
    selectedModels,
    selectModel: contextSelectModel,
    refreshModels
  } = useModelSelectionContext()

  // Filter models based on task type
  const filteredModels = useMemo(() => {
    if (options.taskType === 'sql') {
      // For SQL selector, show ONLY models with 'sql' or 'code' capability but NOT 'general'
      return models.filter(
        (m) =>
          (m.capabilities?.includes('sql') || m.capabilities?.includes('code')) &&
          !m.capabilities?.includes('general')
      )
    } else {
      // For General selector, show ONLY models with 'general' capability
      return models.filter((m) => m.capabilities?.includes('general'))
    }
  }, [models, options.taskType])

  // Get selected model for this task type
  const selectedModelId = selectedModels[options.taskType]

  // Wrap selectModel to include callbacks
  const selectModel = (modelId: string) => {
    contextSelectModel(options.taskType, modelId)
    options.onModelChange?.(modelId)
  }

  // Group models by provider
  const providerGroups = useMemo(() => groupModelsByProvider(filteredModels), [filteredModels])

  return {
    models: filteredModels,
    selectedModelId,
    isLoading,
    error,
    selectModel,
    refreshModels,
    modelHealth,
    providerGroups
  }
}
