/**
 * ModelSelectorDropdown - Dropdown component with provider grouping
 */

import React, { useState, useRef, useEffect } from 'react'
import type { ModelDropdownItem, ModelProviderGroup } from './types'

interface ModelSelectorDropdownProps {
  models: ModelDropdownItem[]
  providerGroups: ModelProviderGroup[]
  selectedModelId: string | null
  onSelect: (modelId: string) => void
  disabled?: boolean
  isLoading?: boolean
  placeholder?: string
}

const ModelSelectorDropdown: React.FC<ModelSelectorDropdownProps> = ({
  models,
  providerGroups,
  selectedModelId,
  onSelect,
  disabled = false,
  isLoading = false,
  placeholder = 'Select a model'
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedModel = models.find((m) => m.id === selectedModelId)
  const displayValue = selectedModel?.name || placeholder

  const handleToggle = () => {
    if (!disabled && !isLoading) {
      setIsOpen(!isOpen)
    }
  }

  const handleSelect = (modelId: string) => {
    onSelect(modelId)
    setIsOpen(false)
  }

  return (
    <div className="model-selector-dropdown" ref={dropdownRef}>
      <button
        className={`dropdown-trigger ${isOpen ? 'open' : ''} ${disabled ? 'disabled' : ''}`}
        onClick={handleToggle}
        disabled={disabled || isLoading}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="dropdown-value">{displayValue}</span>
        <span className="dropdown-arrow">▼</span>
      </button>

      {isOpen && !isLoading && (
        <div className="dropdown-menu" role="listbox">
          {providerGroups.length === 0 ? (
            <div className="dropdown-empty">No models available</div>
          ) : (
            providerGroups.map((group) => (
              <div key={group.provider} className="provider-group">
                <div className="provider-header">
                  <span className="provider-name">{group.displayName}</span>
                  {group.allUnavailable && (
                    <span className="provider-status unavailable">Offline</span>
                  )}
                </div>

                {group.models.map((model) => (
                  <button
                    key={model.id}
                    className={`model-option ${
                      model.id === selectedModelId ? 'selected' : ''
                    } ${model.status === 'unavailable' ? 'unavailable' : ''}`}
                    onClick={() => handleSelect(model.id)}
                    disabled={model.status === 'unavailable'}
                    role="option"
                    aria-selected={model.id === selectedModelId}
                  >
                    <span className="model-name">{model.name}</span>
                    {model.isDefault && <span className="model-badge default">Default</span>}
                    {model.status === 'unavailable' && (
                      <span className="model-badge unavailable">Unavailable</span>
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default ModelSelectorDropdown
