# Feature 007 - Multi-Model Selection UI

**Date**: 2025-01-18
**Status**: In Design
**Priority**: High
**Related Features**: [Feature 006b - Portkey DRYness](feature-006b-portkey-dryness.md)

## Problem Statement

The application currently lacks a user interface for selecting between different LLM models despite having robust backend infrastructure via Portkey Gateway. Users cannot choose which model to use for general queries or SQL generation, limiting flexibility and preventing optimal model selection for specific tasks.

### Current Issues

1. **Model Selection Visibility**:
   - No UI components for model selection
   - Users unaware of available models
   - Cannot leverage multi-provider capabilities

2. **Task-Specific Optimization**:
   - Cannot select SQL-optimized models for database queries
   - No way to choose cost-effective models for simple tasks
   - Unable to use specialized models when needed

3. **Provider Management**:
   - No visibility into provider health/availability
   - Cannot switch providers when one is down
   - No indication of model capabilities

## Proposed Solution

### High-Level Architecture

Implement two independent model selector components in the UI header that leverage the existing Portkey Gateway infrastructure. The selectors will provide real-time model availability, grouped provider display, and persistent user preferences.

### Technical Design

#### Component Architecture

```
ui/src/components/ModelSelector/
├── index.tsx                    # Public API exports
├── ModelSelector.tsx            # Main component implementation
├── ModelSelector.css            # Component styles
├── ModelSelectorDropdown.tsx    # Reusable dropdown component
├── ModelProviderGroup.tsx       # Provider grouping component
├── ModelStatusIndicator.tsx     # Health/status indicator
├── types.ts                     # Type definitions
└── test/
    ├── ModelSelector.test.tsx
    └── fixtures.ts
```

#### Service Interface Design

```typescript
// ui/src/services/model-selection-service.ts
import * as Effect from 'effect/Effect'
import * as Context from 'effect/Context'
import * as Schema from '@effect/schema/Schema'

// Model schemas
export const ModelInfoSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  provider: Schema.Literal('openai', 'anthropic', 'ollama', 'lm-studio'),
  capabilities: Schema.Array(Schema.String),
  status: Schema.Literal('available', 'unavailable', 'error', 'loading'),
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Unknown))
})

export const ModelSelectionSchema = Schema.Struct({
  generalModelId: Schema.String,
  sqlModelId: Schema.String,
  timestamp: Schema.Number,
  sessionId: Schema.String
})

// Service interface
export interface ModelSelectionService {
  readonly getAllModels: () => Effect.Effect<
    ReadonlyArray<typeof ModelInfoSchema.Type>,
    ApiError,
    never
  >

  readonly getModelsByCapability: (capability: string) => Effect.Effect<
    ReadonlyArray<typeof ModelInfoSchema.Type>,
    ApiError,
    never
  >

  readonly selectModel: (
    taskType: 'general' | 'sql',
    modelId: string
  ) => Effect.Effect<void, ApiError | ValidationError, never>

  readonly getSelectedModels: () => Effect.Effect<
    typeof ModelSelectionSchema.Type,
    StorageError,
    never
  >

  readonly healthCheck: (modelId: string) => Effect.Effect<
    boolean,
    ApiError,
    never
  >
}

export const ModelSelectionServiceTag = Context.Tag<ModelSelectionService>(
  '@app/ModelSelectionService'
)
```

#### Component Props Interface

```typescript
// ui/src/components/ModelSelector/types.ts
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
  provider: string
  status: 'available' | 'unavailable' | 'error' | 'loading'
  isDefault?: boolean
  capabilities?: string[]
}

export interface ModelProviderGroup {
  provider: string
  models: ModelDropdownItem[]
  allUnavailable: boolean
}
```

#### Hook Implementation

```typescript
// ui/src/hooks/useModelSelection.ts
import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'
import { useEffect, useState, useCallback } from 'react'

export interface UseModelSelectionOptions {
  taskType: 'general' | 'sql'
  refreshInterval?: number
  onError?: (error: Error) => void
}

export interface UseModelSelectionResult {
  models: ModelDropdownItem[]
  selectedModelId: string | null
  isLoading: boolean
  error: Error | null
  selectModel: (modelId: string) => void
  refreshModels: () => void
  modelHealth: Map<string, 'healthy' | 'unhealthy' | 'checking'>
}

export const useModelSelection = (
  options: UseModelSelectionOptions
): UseModelSelectionResult => {
  // State management
  const [models, setModels] = useState<ModelDropdownItem[]>([])
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [modelHealth, setModelHealth] = useState<Map<string, 'healthy' | 'unhealthy' | 'checking'>>(new Map())

  // Load models from API
  const loadModels = useCallback(() => {
    const program = Effect.gen(function* (_) {
      const service = yield* _(ModelSelectionServiceTag)
      const allModels = yield* _(service.getAllModels())

      // Filter by capability if SQL task type
      const filteredModels = options.taskType === 'sql'
        ? allModels.filter(m => m.capabilities?.includes('sql'))
        : allModels

      return filteredModels
    })

    // Execute effect
    Effect.runPromise(program).then(
      models => setModels(models),
      error => options.onError?.(error)
    )
  }, [options.taskType])

  // Health check stream
  useEffect(() => {
    if (!options.refreshInterval) return

    const healthCheckStream = Stream.repeat(
      Stream.fromEffect(checkAllModelHealth()),
      { schedule: Schedule.fixed(options.refreshInterval) }
    )

    const subscription = Stream.runForEach(
      healthCheckStream,
      health => setModelHealth(health)
    )

    return () => subscription.cancel()
  }, [options.refreshInterval])

  // Load persisted selection from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(`model-selection-${options.taskType}`)
    if (stored) {
      setSelectedModelId(stored)
    }
  }, [options.taskType])

  // Persist selection to localStorage
  const selectModel = useCallback((modelId: string) => {
    setSelectedModelId(modelId)
    localStorage.setItem(`model-selection-${options.taskType}`, modelId)
    options.onModelChange?.(modelId)
  }, [options.taskType, options.onModelChange])

  return {
    models,
    selectedModelId,
    isLoading,
    error,
    selectModel,
    refreshModels: loadModels,
    modelHealth
  }
}
```

#### Schema Definitions

```typescript
// Extended schemas for API responses
const ApiModelResponseSchema = Schema.Struct({
  models: Schema.Array(Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    provider: Schema.String,
    capabilities: Schema.optional(Schema.Array(Schema.String)),
    metadata: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
    health: Schema.optional(Schema.Struct({
      status: Schema.Literal('healthy', 'unhealthy', 'unknown'),
      lastChecked: Schema.Number,
      latency: Schema.optional(Schema.Number)
    }))
  }))
})

const ModelSelectionRequestSchema = Schema.Struct({
  taskType: Schema.Literal('general', 'sql', 'embedding', 'code'),
  modelId: Schema.String,
  preferences: Schema.optional(Schema.Record(Schema.String, Schema.Unknown))
})
```

#### Error Types

```typescript
// ui/src/components/ModelSelector/errors.ts
export class ModelSelectionError extends Schema.TaggedError<ModelSelectionError>()(
  "ModelSelectionError",
  {
    message: Schema.String,
    modelId: Schema.optional(Schema.String),
    taskType: Schema.optional(Schema.String)
  }
) {}

export class ModelHealthCheckError extends Schema.TaggedError<ModelHealthCheckError>()(
  "ModelHealthCheckError",
  {
    message: Schema.String,
    modelId: Schema.String,
    provider: Schema.String,
    cause: Schema.optional(Schema.Unknown)
  }
) {}

export class StorageError extends Schema.TaggedError<StorageError>()(
  "StorageError",
  {
    message: Schema.String,
    key: Schema.String,
    operation: Schema.Literal('read', 'write', 'delete')
  }
) {}
```

## Implementation Plan

### Phase 1: Type Definitions & Service Interface
- [ ] Define TypeScript interfaces for models and selection
- [ ] Create Schema definitions for API responses
- [ ] Define error types for model selection
- [ ] Create service interface with Effect-TS

### Phase 2: Hook Implementation
- [ ] Implement useModelSelection hook with Effect
- [ ] Add localStorage persistence logic
- [ ] Implement health check streaming
- [ ] Add error handling and retry logic

### Phase 3: Component Development
- [ ] Create ModelSelector main component
- [ ] Implement ModelSelectorDropdown with grouping
- [ ] Add ModelProviderGroup for provider sections
- [ ] Create ModelStatusIndicator for health display
- [ ] Style components with CSS modules

### Phase 4: Integration
- [ ] Integrate selectors into Layout component header
- [ ] Wire up model selection to API calls
- [ ] Add model preference passing to queries
- [ ] Implement auto-refresh mechanism
- [ ] Test with all provider types

### Phase 5: Testing & Polish
- [ ] Unit tests for all components
- [ ] Integration tests with mock service
- [ ] E2E tests for model selection flow
- [ ] Performance optimization for large model lists
- [ ] Accessibility improvements (ARIA labels, keyboard nav)

## Testing Strategy

### Unit Testing Approach
- Mock ModelSelectionService with Layer.succeed
- Test component render with different model states
- Validate dropdown behavior and selection
- Test localStorage persistence
- Verify error handling displays

### Integration Testing Approach
- Test with live Portkey Gateway endpoints
- Validate model discovery across providers
- Test health check updates
- Verify selection persistence across sessions
- Test fallback behavior when providers unavailable

### Test Data Requirements
```typescript
// Test fixtures
export const mockModels = [
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'openai',
    capabilities: ['general', 'code', 'sql'],
    status: 'available'
  },
  {
    id: 'claude-3-opus',
    name: 'Claude 3 Opus',
    provider: 'anthropic',
    capabilities: ['general', 'code'],
    status: 'available'
  },
  {
    id: 'llama-3-70b',
    name: 'Llama 3 70B',
    provider: 'lm-studio',
    capabilities: ['general'],
    status: 'unavailable'
  }
]
```

## Existing Backend Infrastructure

### Available Portkey Gateway Client Methods
```typescript
// Already implemented in src/llm-manager/portkey-gateway-client.ts
getAllModels(): Effect<ModelInfo[], LLMError>
getModelsByCapability(capability: string): Effect<ModelInfo[], LLMError>
getModelsByProvider(provider: string): Effect<ModelInfo[], LLMError>
getDefaultModel(taskType?: 'sql' | 'general' | 'code'): Effect<string, LLMError>
getModelInfo(modelId: string): Effect<ModelInfo | null, LLMError>
getAvailableModels(): Effect<string[], LLMError>
getStatus(): Effect<Status, LLMError>
```

### Available Server Endpoints
```typescript
// Already implemented in src/server.ts
GET /api/llm-manager/models         // Get loaded models
GET /api/llm-manager/status         // Get status with available models
POST /api/llm-manager/select-model  // Select best model for task
GET /api/llm-manager/health         // Health check
POST /api/llm-manager/reload        // Reload models
```

### Current Portkey Configuration
```json
// config/portkey/config.json structure
{
  "defaults": {
    "general": "claude-3-haiku-20240307",
    "sql": "codellama-7b-instruct",
    "code": "deepseek-coder-v2-lite-instruct"
  },
  "providers": [
    { "id": "openai", "name": "OpenAI" },
    { "id": "anthropic", "name": "Anthropic" },
    { "id": "lm-studio", "name": "LM Studio (Local)" },
    { "id": "ollama", "name": "Ollama (Local)" }
  ],
  "routes": [
    // Model configurations for each provider
  ]
}
```

## Dependencies

### External Dependencies
- react: ^18.0.0
- effect: ^3.0.0
- @effect/schema: ^0.64.0
- clsx: ^2.0.0 (for className management)

### Internal Dependencies
- Existing Portkey Gateway Client (`/api/llm-manager/*` endpoints)
- Layout component for integration
- API client utilities for HTTP calls
- Theme/styling system

## Performance Considerations

- **Model List Caching**: Cache model list for 5 minutes to reduce API calls
- **Health Check Throttling**: Limit health checks to every 30 seconds
- **Lazy Loading**: Only load SQL models when SQL selector is opened
- **Debounced Selection**: Debounce model selection to avoid rapid API calls
- **Virtual Scrolling**: Use virtual scrolling if model list exceeds 50 items

## Security Considerations

- **API Key Protection**: Never expose API keys in frontend
- **Model ID Validation**: Validate model IDs before API calls
- **XSS Prevention**: Sanitize model names/descriptions from API
- **CORS Configuration**: Ensure proper CORS headers for API calls

## Monitoring & Observability

- Track model selection changes
- Log health check failures
- Monitor selection latency
- Track most used models per task type
- Alert on all providers being unavailable

## Documentation Requirements

- Component API documentation with examples
- Integration guide for adding to new pages
- Model capability matrix documentation
- Troubleshooting guide for common issues

## Success Criteria

- [ ] Two working model selectors in UI header
- [ ] Support for all four provider types
- [ ] Health status visible and auto-refreshing
- [ ] Selections persist across sessions
- [ ] No new backend services required
- [ ] All tests passing with >80% coverage
- [ ] Accessible with keyboard navigation
- [ ] Response time <100ms for selection

## Notes

- The implementation should be purely frontend-focused, leveraging the existing Portkey Gateway infrastructure
- Model grouping by provider improves UX when many models are available
- Health checks should be non-blocking - show stale status rather than blocking UI
- Consider adding model cost indicators in future iteration
- May want to add favorite/recent models section for power users