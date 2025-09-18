# Feature 007: Multi-Model Selection UI

## Overview
Add UI components for selecting both general and SQL-specific models, supporting cloud providers (OpenAI, Anthropic) and local models (LM Studio, Ollama).

## Requirements

### 1. Model Support
**General Models:**
- OpenAI (GPT-4, GPT-3.5, etc.)
- Anthropic (Claude 3.5, Claude 3, etc.)
- Local via Ollama (e.g., gpt-oss:20b)
- Local via LM Studio (any loaded models)

**SQL Models:**
- All general models available
- ClickHouse AI (uses selected general model internally)
- Specialized SQL models if available

### 2. UI Components

#### General Model Selector
- Top-level menu/dropdown in UI
- Shows all available models (cloud + local)
- Persists selection across sessions
- Shows model status (available/unavailable)

#### SQL Model Selector
- Separate top-level menu/dropdown
- Independent from general model selection
- Includes ClickHouse AI as an option
- Can select any general model for SQL tasks

### 3. Implementation Details

#### Model Discovery
- Auto-detect Ollama models via API (`http://localhost:11434/api/tags`)
- Auto-detect LM Studio models via API (`http://localhost:1234/v1/models`)
- Combine with configured cloud models from Portkey

#### State Management
- Store selections in localStorage/preferences
- Separate state for general vs SQL model
- Default fallbacks if selected model unavailable

#### Portkey Integration
- Update Portkey config to include local endpoints
- Add virtual keys for Ollama/LM Studio
- Route requests based on UI selection

## Technical Approach

### 1. Backend Changes
```typescript
// Model discovery service
interface ModelDiscovery {
  getAvailableModels(): Promise<{
    general: Model[]
    sql: Model[]
  }>

  checkModelHealth(modelId: string): Promise<boolean>
}

// Model types
interface Model {
  id: string
  name: string
  provider: 'openai' | 'anthropic' | 'ollama' | 'lmstudio'
  type: 'general' | 'sql' | 'both'
  endpoint?: string
  available: boolean
}
```

### 2. Frontend Components
```typescript
// React components
<ModelSelector
  type="general"
  models={availableModels.general}
  selected={selectedGeneralModel}
  onChange={setSelectedGeneralModel}
/>

<ModelSelector
  type="sql"
  models={availableModels.sql}
  selected={selectedSqlModel}
  onChange={setSelectedSqlModel}
/>
```

### 3. Portkey Configuration Update
```json
{
  "virtualKeys": [
    {
      "name": "ollama-local",
      "provider": "openai",
      "baseURL": "http://localhost:11434/v1"
    },
    {
      "name": "lmstudio-local",
      "provider": "openai",
      "baseURL": "http://localhost:1234/v1"
    }
  ]
}
```

## Success Criteria
- ✅ Two independent model selectors in UI
- ✅ Support for OpenAI, Anthropic, Ollama, LM Studio
- ✅ Model discovery and health checks
- ✅ Persistent selection across sessions
- ✅ Seamless Portkey integration
- ✅ All tests passing

## Files to Modify/Create
1. `src/ui-generator/components/ModelSelector.tsx` - New UI component
2. `src/llm-manager/model-discovery.ts` - Model discovery service
3. `config/portkey/config.json` - Add local model endpoints
4. `src/ui-generator/hooks/useModelSelection.ts` - State management
5. `src/llm-manager/test/integration/local-models.test.ts` - Tests

## Implementation Priority
1. Backend model discovery service
2. UI component implementation
3. Portkey configuration updates
4. Integration testing with local models
5. Documentation updates