# Feature 007b: UI Generator Effect-TS Layer Refactoring

**Date**: 2025-01-19
**Status**: In Design
**Priority**: Critical
**Branch**: `feat/feature-007-model-selection`
**Related Features**: [Feature 005 - Diagnostics UI Fine Tuning], [Feature 007 - Model Selection]

## Executive Summary

Complete refactoring of the UI Generator API Client to properly implement Effect-TS patterns with compile-time dependency guarantees. This addresses the current runtime `ConfigService` dependency error and ensures proper layer composition throughout the application.

## Problem Statement

### Current Runtime Error
```
{
  "error": "Failed to generate query",
  "message": "Service not found: ConfigService (defined at file:///app/dist/storage/services.js:12:67)"
}
```

### Root Causes

1. **Broken Compile-Time Guarantees**: Effect-TS should catch missing dependencies at compile time, but our implementation bypasses these safety checks.

2. **Incorrect Layer Architecture**: The `UIGeneratorAPIClientLayer` declares no dependencies (`Effect<Service, never, never>`) but returns methods that have dependencies (`Effect<Response, Error, LLMManagerServiceTag | StorageServiceTag>`).

3. **Hidden Transitive Dependencies**: StorageServiceTag requires ConfigServiceTag, but this dependency chain is not visible at the layer level.

4. **Type Safety Bypassed**: Extensive use of type assertions (`as Effect<A, E, never>` and `as unknown as`) tells TypeScript to ignore dependency checking.

5. **Anti-Pattern Implementation**: Effect.runPromise inside service methods breaks composition and loses proper error handling.

## Detailed Analysis

### Current Implementation Issues

#### 1. UIGeneratorAPIClientLayer (api-client-layer.ts)
```typescript
// PROBLEM: Declares no dependencies
export const makeUIGeneratorAPIClientService: Effect.Effect<
  UIGeneratorAPIClientService,
  never,
  never  // ← No dependencies declared!
> = Effect.sync(() => {
  return {
    // But returns methods WITH dependencies
    generateQuery: (request) =>
      UIGeneratorAPIClient.generateQuery(request), // ← Has dependencies!
  }
})
```

#### 2. Dependency Chain
```
UIGeneratorAPIClient.generateQuery
  → requires LLMManagerServiceTag
  → requires StorageServiceTag
    → requires ConfigServiceTag  ← Not provided!
```

#### 3. Type Assertions Hiding Issues
```typescript
// In server.ts
const runWithServices = <A, E>(effect: Effect.Effect<A, E, AppServices>): Promise<A> => {
  return Effect.runPromise(
    Effect.provide(effect, ApplicationLayer) as Effect.Effect<A, E, never>
    //                                        ^^^^^^^^^^^^^^^^^^^^^^^^
    //                                        Bypasses type checking!
  )
}
```

#### 4. Test Workarounds
```typescript
// In integration tests
const runTest = <A, E>(effect: Effect.Effect<A, E, unknown>): Promise<A> => {
  return Effect.runPromise(
    Effect.provide(effect, testLayer) as unknown as Effect.Effect<A, E, never>
    //                                 ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    //                                 Double assertion to bypass checks!
  )
}
```

## Solution Architecture

### Design Principles

1. **Explicit Dependencies**: All dependencies must be declared at the layer level
2. **No Type Assertions**: Remove all `as any`, `as unknown`, and unsafe casts
3. **Compile-Time Safety**: TypeScript must catch missing dependencies
4. **Proper Layer Composition**: Dependencies resolved through proper Effect-TS patterns

### Proposed Implementation

#### 1. Refactor UIGeneratorAPIClientLayer

```typescript
// Properly declare all dependencies
export const makeUIGeneratorAPIClientService: Effect.Effect<
  UIGeneratorAPIClientService,
  never,
  LLMManagerServiceTag | StorageServiceTag | ConfigServiceTag  // ← All dependencies explicit!
> = Effect.gen(function* () {
  const llmManager = yield* LLMManagerServiceTag
  const storage = yield* StorageServiceTag

  return {
    generateQuery: (request) =>
      // Use the services directly, dependencies already resolved
      generateQueryWithServices(request, llmManager, storage),

    generateMultipleQueries: (request) =>
      generateMultipleWithServices(request, llmManager, storage),

    validateQuery: (sql) =>
      validateWithStorage(sql, storage)
  }
})

// Layer properly tracks dependencies
export const UIGeneratorAPIClientLayer = Layer.effect(
  UIGeneratorAPIClientTag,
  makeUIGeneratorAPIClientService
)
```

#### 2. Fix Server Layer Composition

```typescript
// Proper layer composition without duplicates or conflicts
const ApplicationLayer = Layer.merge(
  ConfigServiceLive,  // Base configuration
  StorageServiceLive  // Depends on ConfigService
).pipe(
  Layer.merge(StorageAPIClientLayer),  // Depends on StorageService
  Layer.merge(LLMManagerLive),         // Independent service
  Layer.merge(LLMManagerAPIClientLayer), // Depends on LLMManager
  Layer.merge(UIGeneratorAPIClientLayer), // Depends on Storage + LLM
  Layer.merge(AIAnalyzerMockLayer())
)

// No type assertions needed!
const runWithServices = <A, E>(
  effect: Effect.Effect<A, E, AppServices>
): Promise<A> => {
  return Effect.runPromise(
    Effect.provide(effect, ApplicationLayer)
    // TypeScript knows all dependencies are satisfied
  )
}
```

#### 3. Update Tests with Proper Layers

```typescript
// Integration test setup
const testLayer = Layer.merge(
  ConfigServiceLive,
  StorageServiceLive
).pipe(
  Layer.merge(LLMManagerLive),
  Layer.merge(UIGeneratorAPIClientLayer)
)

// No assertions needed - TypeScript verifies dependencies
const runTest = <A, E>(
  effect: Effect.Effect<A, E, UIGeneratorAPIClientTag>
): Promise<A> => {
  return Effect.runPromise(Effect.provide(effect, testLayer))
}
```

## Implementation Plan

### Phase 1: Refactor Core Layer (api-client-layer.ts)
1. Update `makeUIGeneratorAPIClientService` to use `Effect.gen`
2. Explicitly declare all dependencies
3. Update service methods to use resolved dependencies
4. Remove all internal `Effect.runPromise` calls

### Phase 2: Refactor API Client (api-client.ts)
1. Split logic into pure functions that accept services
2. Remove static methods that hide dependencies
3. Ensure all Effects properly declare their requirements

### Phase 3: Fix Server Composition (server.ts)
1. Remove duplicate layer provisions
2. Fix layer composition order
3. Remove all type assertions
4. Verify compile-time dependency checking

### Phase 4: Update Tests
1. Remove all `as any` and `as unknown` assertions
2. Provide complete layer stacks in tests
3. Fix mock service implementations
4. Verify tests fail at compile time if dependencies missing

### Phase 5: Verification
1. Test that missing dependencies cause TypeScript errors
2. Verify no runtime "Service not found" errors
3. Document the dependency graph
4. Add compile-time tests for dependency safety

## Success Criteria

1. **Zero Runtime Dependency Errors**: No "Service not found" errors at runtime
2. **Compile-Time Safety**: Missing dependencies caught by TypeScript
3. **No Type Assertions**: Complete removal of unsafe type casts
4. **All Tests Pass**: 100% test success without workarounds
5. **Clean Architecture**: Clear, understandable layer composition

## Technical Benefits

1. **Type Safety**: Full compile-time verification of dependency graph
2. **Maintainability**: Clear understanding of service dependencies
3. **Debugging**: Errors caught at compile time, not runtime
4. **Documentation**: Types serve as documentation of requirements
5. **Refactoring Safety**: Changes verified by compiler

## Files to Modify

### Core Files
- `src/ui-generator/api-client-layer.ts` - Main refactor target
- `src/ui-generator/api-client.ts` - Split into service-aware functions
- `src/server.ts` - Fix layer composition

### Test Files
- `src/ui-generator/test/integration/api-client-layer.integration.test.ts`
- `src/ui-generator/test/unit/api-client-layer.test.ts`
- `src/ui-generator/test/unit/api-client.test.ts`

### Supporting Files
- `src/storage/services.ts` - Verify export structure
- `src/llm-manager/llm-manager-service.ts` - Verify interface

## Risk Mitigation

1. **Backward Compatibility**: Maintain existing API surface where possible
2. **Incremental Changes**: Test each phase independently
3. **Regression Testing**: Full test suite at each step
4. **Documentation**: Update inline docs and README

## Component Architecture

```
ui-generator/
├── index.ts                    # Public API exports
├── service.ts                  # Effect-TS service interface
├── service-live.ts             # Live implementation with proper dependencies
├── service-mock.ts             # Mock for testing
├── types.ts                    # Type definitions
├── schemas.ts                  # Schema validation
├── errors.ts                   # Error types
├── api-client.ts               # HTTP client implementation (refactored)
├── api-client-layer.ts         # Layer composition (refactored)
└── test/
    ├── unit/
    └── integration/
```

## Schema Definitions

### Input/Output Validation
```typescript
// schemas.ts - Runtime validation with Effect Schema
import { Schema } from '@effect/schema'

export const QueryGenerationAPIRequestSchema = Schema.Struct({
  path: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    services: Schema.Array(Schema.String),
    startService: Schema.String,
    endService: Schema.String
  }),
  analysisGoal: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
  isClickHouseAI: Schema.optional(Schema.Boolean),
  useEvaluatorOptimizer: Schema.optional(Schema.Boolean)
})

export const QueryGenerationAPIResponseSchema = Schema.Struct({
  sql: Schema.String,
  model: Schema.String,
  actualModel: Schema.optional(Schema.String),
  description: Schema.String,
  expectedColumns: Schema.Array(Schema.Struct({
    name: Schema.String,
    type: Schema.String,
    description: Schema.String
  })),
  generationTimeMs: Schema.Number
})
```

## Error Types

### Tagged Error Definitions
```typescript
// errors.ts - Discriminated error types
import { Schema } from '@effect/schema'

export class InvalidRequestError extends Schema.TaggedError<InvalidRequestError>()(
  "InvalidRequestError",
  {
    message: Schema.String,
    validation: Schema.Array(Schema.String)
  }
) {}

export class QueryGenerationError extends Schema.TaggedError<QueryGenerationError>()(
  "QueryGenerationError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown)
  }
) {}

export class ValidationError extends Schema.TaggedError<ValidationError>()(
  "ValidationError",
  {
    message: Schema.String,
    errors: Schema.Array(Schema.String)
  }
) {}

export type UIGeneratorError =
  | InvalidRequestError
  | QueryGenerationError
  | ValidationError
```

## Service Interface Design

### Clean Service Contract
```typescript
// service.ts - Effect-TS service interface
import { Context, Effect } from 'effect'

export interface UIGeneratorService {
  readonly generateQuery: (
    request: QueryGenerationAPIRequest
  ) => Effect.Effect<QueryGenerationAPIResponse, UIGeneratorError, never>

  readonly generateMultipleQueries: (
    request: QueryGenerationAPIRequest & { patterns?: string[] }
  ) => Effect.Effect<QueryGenerationAPIResponse[], UIGeneratorError, never>

  readonly validateQuery: (
    sql: string
  ) => Effect.Effect<ValidationResult, UIGeneratorError, never>
}

export class UIGeneratorServiceTag extends Context.Tag('UIGeneratorService')<
  UIGeneratorServiceTag,
  UIGeneratorService
>() {}
```

## Testing Strategy

### Unit Testing with Mocks
```typescript
// Mock all dependencies
const mockConfig = Layer.succeed(ConfigServiceTag, { /* mock config */ })
const mockStorage = Layer.succeed(StorageServiceTag, { /* mock storage */ })
const mockLLM = Layer.succeed(LLMManagerServiceTag, { /* mock llm */ })

const testLayer = Layer.mergeAll(
  mockConfig,
  mockStorage,
  mockLLM,
  UIGeneratorServiceLive
)

// Test service in isolation
it('should generate query', async () => {
  const result = await Effect.runPromise(
    Effect.provide(
      Effect.gen(function* (_) {
        const service = yield* _(UIGeneratorServiceTag)
        return yield* _(service.generateQuery(testRequest))
      }),
      testLayer
    )
  )
  expect(result.sql).toContain('SELECT')
})
```

### Integration Testing
```typescript
// Use real dependencies
const integrationLayer = Layer.mergeAll(
  ConfigServiceLive,
  StorageServiceLive,
  LLMManagerLive,
  UIGeneratorServiceLive
)

// Test full stack
it('should generate and execute query', async () => {
  const result = await Effect.runPromise(
    Effect.provide(
      Effect.gen(function* (_) {
        const service = yield* _(UIGeneratorServiceTag)
        const query = yield* _(service.generateQuery(request))
        const storage = yield* _(StorageServiceTag)
        return yield* _(storage.queryRaw(query.sql))
      }),
      integrationLayer
    )
  )
  expect(result).toBeDefined()
})
```

## Migration Strategy

### Phased Approach
1. **Parallel Implementation**: Create new service alongside existing code
2. **Gradual Migration**: Update endpoints one by one
3. **Cleanup**: Remove old implementation and type assertions

## Key Architectural Decisions

1. **Explicit Dependencies**: Every layer declares its dependencies at type level
2. **No Hidden Effects**: Remove all Effect.runPromise from service internals
3. **Tagged Errors**: Use discriminated unions for error handling
4. **Schema Validation**: Validate at service boundaries
5. **Runtime Pattern**: Use Runtime for promise interop at edges only

## Common Pitfalls to Avoid

1. ❌ Don't use `as unknown as` type assertions
2. ❌ Don't hide dependencies in implementation
3. ❌ Don't use Effect.runPromise inside services
4. ❌ Don't catch and rethrow - use Effect.mapError
5. ❌ Don't mix promise and effect code

## Effect-TS Best Practices Applied

1. ✅ Use Effect.gen for sequential operations
2. ✅ Use Layer.effect for service construction
3. ✅ Use Schema for runtime validation
4. ✅ Use Context.Tag for dependency injection
5. ✅ Use tagged errors for discrimination

## Session Recovery Checkpoint

```yaml
current_session:
  timestamp: "2025-01-19T16:00:00Z"
  current_phase: "Design Complete"
  current_task: "Feature 007b documentation updated"
  completed_tasks:
    - "Updated feature-007b with comprehensive refactor plan"
    - "Added architectural designs and patterns"
    - "Included code examples and testing strategies"
  pending_tasks:
    - "Phase 1: Interface Definition"
    - "Phase 2: Core Implementation"
    - "Phase 3: Layer Refactoring"
    - "Phase 4: Testing Migration"
    - "Phase 5: Verification"
  blockers: []
  notes: "Comprehensive refactor plan documented and ready for implementation"
```

## Timeline

- **Phase 1**: 2 hours - Core layer refactor
- **Phase 2**: 1 hour - API client refactor
- **Phase 3**: 1 hour - Server composition
- **Phase 4**: 2 hours - Test updates
- **Phase 5**: 1 hour - Verification and documentation

**Total Estimate**: 7 hours

## Conclusion

This refactor will restore Effect-TS's compile-time guarantees, eliminate runtime dependency errors, and provide a clean, type-safe architecture for the UI Generator. The investment in proper Effect-TS patterns will pay dividends in maintainability and developer experience.