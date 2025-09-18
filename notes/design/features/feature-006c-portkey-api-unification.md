# Feature 006c: Portkey API Unification

**Status**: Planning
**Priority**: High
**Complexity**: Medium
**Estimated Effort**: 4-6 hours

## Problem Statement

The portkey-gateway-client and llm-manager code have diverged significantly with duplicate functionality and inconsistent interfaces. They should have 100% overlap, but currently:

- `getAvailableModels()` and `getLoadedModels()` provide different formats for the same data
- Model selection logic is duplicated and hardcoded in multiple places
- Rich model discovery APIs exist in portkey-gateway-client but aren't exposed through LLM Manager Service
- Inconsistent ModelInfo types between files create confusion

## Current State Analysis

### Overlapping Functions Found

**In `portkey-gateway-client.ts`:**
- `getAvailableModels()` - Returns string[] of model names from config
- `getDefaultModel(taskType)` - Gets default model for task type
- `getModelInfo(modelId)` - Gets detailed ModelInfo for specific model
- `getModelsByCapability(capability)` - Returns ModelInfo[] filtered by capability
- `getModelsByProvider(provider)` - Returns ModelInfo[] filtered by provider
- `getAllModels()` - Returns all ModelInfo[] from config

**In `api-client-layer.ts`:**
- `getLoadedModels()` - Maps `getAvailableModels()` to ModelInfo[] format
- `selectBestModel(taskType)` - Hardcoded model selection logic
- `selectModel(taskType)` - Similar to selectBestModel but returns ModelInfo

### Root Issues

1. **LLMManagerService interface is incomplete** - Only exposes `getAvailableModels(): string[]`
2. **Duplicate logic** - `getLoadedModels()` is just a wrapper around `getAvailableModels()`
3. **Hardcoded fallbacks** - api-client-layer bypasses Portkey config with hardcoded model selection
4. **Type inconsistency** - Different ModelInfo definitions create confusion

## Solution Design

### Phase 1: Extend LLM Manager Service Interface

**Objective**: Make LLM Manager Service the single, complete interface for all model operations

**Changes to `src/llm-manager/llm-manager-service.ts`:**

```typescript
export interface LLMManagerService {
  // Existing methods
  readonly generate: (request: LLMRequest) => Effect.Effect<LLMResponse, LLMError, never>
  readonly generateStream: (request: LLMRequest) => Stream.Stream<string, LLMError, never>
  readonly isHealthy: () => Effect.Effect<boolean, LLMError, never>
  readonly getStatus: () => Effect.Effect<ManagerStatus, LLMError, never>

  // Model Discovery - Extended Interface
  readonly getAvailableModels: () => Effect.Effect<string[], LLMError, never>
  readonly getDefaultModel: (taskType?: 'sql' | 'general' | 'code') => Effect.Effect<string, LLMError, never>
  readonly getModelInfo: (modelId: string) => Effect.Effect<ModelInfo, LLMError, never>
  readonly getModelsByCapability: (capability: string) => Effect.Effect<ModelInfo[], LLMError, never>
  readonly getModelsByProvider: (provider: string) => Effect.Effect<ModelInfo[], LLMError, never>
  readonly getAllModels: () => Effect.Effect<ModelInfo[], LLMError, never>
}
```

**Benefits**:
- Single source of truth for all model operations
- Consistent return types using `model-types.ts` definitions
- Proper Effect-TS error handling throughout

### Phase 2: Consolidate Model Discovery Logic

**Objective**: Remove duplication and ensure all model selection uses Portkey config

**Changes to `src/llm-manager/api-client-layer.ts`:**

1. **Remove duplicate functions**:
   - Delete `getLoadedModels()` - use `getAllModels()` directly
   - Delete hardcoded `selectBestModel()` and `selectModel()` logic

2. **Update to use LLM Manager Service methods**:
   ```typescript
   export const LLMManagerAPIClientServiceLive = Layer.effect(
     LLMManagerAPIClientTag,
     Effect.map(LLMManagerServiceTag, (manager) => ({
       // Use manager.getAllModels() instead of custom getLoadedModels()
       getLoadedModels: () => manager.getAllModels(),

       // Use manager.getDefaultModel() instead of hardcoded logic
       selectBestModel: (taskType: string) =>
         manager.getDefaultModel(taskType as 'sql' | 'general' | 'code'),

       // Use manager.getModelInfo() for selectModel
       selectModel: (taskType: string | { taskType: string }) => {
         const task = typeof taskType === 'string' ? taskType : taskType.taskType
         return Effect.flatMap(
           manager.getDefaultModel(task as 'sql' | 'general' | 'code'),
           (modelId) => manager.getModelInfo(modelId)
         )
       },

       // ... other methods unchanged
     }))
   )
   ```

**Benefits**:
- All model selection respects Portkey configuration
- No more hardcoded model mappings
- Consistent behavior across all components

### Phase 3: Type Unification and Cleanup

**Objective**: Ensure consistent types and clean interfaces

**Changes**:

1. **Standardize on `model-types.ts` ModelInfo**:
   - Update api-client-layer to use ModelInfo from model-types.ts
   - Remove duplicate ModelInfo definition in api-client-layer.ts

2. **Update ManagerStatus interface**:
   ```typescript
   export interface ManagerStatus {
     readonly availableModels: string[]
     readonly healthStatus: Record<string, 'healthy' | 'unhealthy' | 'unknown'>
     readonly config: Record<string, unknown>
     readonly status?: 'operational' | 'degraded' | 'offline'
     readonly loadedModels?: ModelInfo[]  // Use consistent ModelInfo type
     readonly systemMetrics?: Record<string, unknown>
   }
   ```

3. **Clean up convenience functions**:
   ```typescript
   // Update to use new manager methods
   export const getLoadedModels = Effect.flatMap(LLMManagerAPIClientTag, (client) =>
     client.getLoadedModels()  // Now points to manager.getAllModels()
   )

   // Add new convenience functions for rich APIs
   export const getModelInfo = (modelId: string) =>
     Effect.flatMap(LLMManagerServiceTag, (manager) =>
       manager.getModelInfo(modelId)
     )

   export const getModelsByCapability = (capability: string) =>
     Effect.flatMap(LLMManagerServiceTag, (manager) =>
       manager.getModelsByCapability(capability)
     )
   ```

## Testing Strategy

### Unit Tests Updates

**Files to update**:
- `src/llm-manager/test/unit/llm-manager-service.test.ts`
- `src/llm-manager/test/unit/api-client-layer.test.ts`
- `src/llm-manager/test/unit/portkey-gateway-client.test.ts`

**Test coverage required**:
- All new LLMManagerService methods
- Updated api-client-layer behavior
- Type consistency across interfaces
- Error handling for model discovery failures

### Integration Tests Updates

**Files to update**:
- `src/llm-manager/test/integration/portkey-routing-validation.test.ts`
- `src/llm-manager/test/integration/local-models-portkey.test.ts`

**Scenarios to test**:
- Model discovery through unified interface
- Portkey config-driven model selection
- Fallback behavior when models unavailable

## Success Criteria

1. **100% API Overlap**: portkey-gateway-client and llm-manager expose identical functionality
2. **Single Source of Truth**: All model discovery uses Portkey configuration
3. **Type Consistency**: One ModelInfo type used throughout
4. **No Duplication**: Remove all duplicate functions and logic
5. **Backward Compatibility**: Existing consumers continue to work
6. **Test Coverage**: All changes covered by unit and integration tests

## Implementation Order

1. **Extend LLMManagerService interface** with new methods
2. **Update portkey-gateway-client** to implement new interface methods
3. **Refactor api-client-layer** to use manager methods instead of duplicates
4. **Unify types** and clean up inconsistencies
5. **Update tests** to cover new behavior
6. **Validate integration** with existing consumers

## Files to Modify

- `src/llm-manager/llm-manager-service.ts` - Extend interface
- `src/llm-manager/portkey-gateway-client.ts` - Implement new methods (already done)
- `src/llm-manager/api-client-layer.ts` - Remove duplicates, use manager methods
- `src/llm-manager/model-types.ts` - Ensure consistent ModelInfo export
- Test files - Update to cover new unified behavior

## Risk Mitigation

- **Backward compatibility**: Keep existing function names but route through new implementation
- **Gradual migration**: Update consumers one at a time
- **Comprehensive testing**: Ensure no regression in existing functionality
- **Type safety**: Leverage TypeScript to catch interface mismatches

This unification will create a clean, consistent API surface where portkey-gateway-client and llm-manager have complete overlap as originally intended.