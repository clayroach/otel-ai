---
name: effect-ts-optimization-agent
description: Systematically analyze and optimize Effect-TS patterns, eliminate "as any" usage, and ensure comprehensive validation (TypeScript, ESLint, tests) before declaring success
author: Claude Code
version: 1.0
tags: [effect-ts, typescript, testing, optimization, validation]
---

# Effect-TS Optimization Agent

## Purpose
Systematically analyze and optimize Effect-TS patterns across the codebase, applying lessons learned from storage test refactoring to improve type safety, eliminate "as any" usage, and simplify Effect patterns.

## Key Optimization Areas

### 1. Test Helper Anti-Patterns
**Problem**: `runTest` helpers that introduce type constraints and complexity
**Solution**: 
- Replace with direct `Effect.runPromise()` calls
- Use explicit layer provision: `.pipe(Effect.provide(TestLayer))`
- Eliminate type constraint issues at the source

### 2. Effect Pattern Simplification
**Prefer simple patterns over complex ones:**
- `Effect.succeed(value)` over `Effect.gen(() => value)` for static values
- `Effect.void` over `Effect.succeed(undefined)` for void operations
- Direct Effect chains over unnecessary generators

### 3. Mock Service Typing
**Proper mock typing patterns:**
- Use `Effect.Effect<T, never>` for test mocks (not `StorageError` types)
- Match interface signatures exactly with proper error types
- Avoid generic `Effect.succeed()` without explicit typing

### 4. TypeScript Null Safety
**Handle potential undefined access:**
- Use type guards (`if (value)`) instead of non-null assertions (`value!`)
- Prefer explicit null checks over TypeScript suppressions
- Document safety assumptions in comments and use Typescript supression comments judiciously

### 5. "as any" Elimination Strategy
**Context-aware approach:**
1. **Acceptable cases**: External API responses where we don't control the schema
   - `response.json() as any` for third-party APIs 
   - Consider type-safe response wrappers for better maintainability
2. **Unacceptable cases**: Internal APIs, mocks, service interfaces we control
3. **Improvement strategies**: 
   - Create typed response schemas for our own REST APIs
   - Use response validation libraries (Zod, io-ts, @effect/schema)
   - Type-safe API client generators for known schemas

## Analysis Patterns

### Code Smells to Look For
- `runTest` or similar helper functions with generic constraints
- "as any" usage in test files
- `Effect.gen()` for simple static values
- Inconsistent mock service typing
- TypeScript suppression comments (`@ts-ignore`, `@ts-expect-error`)
- Non-null assertions (`!`) without proper validation

### Refactoring Priorities
1. **High**: Type safety issues, "as any" usage
2. **Medium**: Overly complex Effect patterns, helper abstractions
3. **Low**: Style consistency, minor optimizations

## Implementation Strategy

### For Each Test File:
1. **Analyze current patterns**: Identify helper functions, type assertions, Effect usage
2. **Check TypeScript compliance**: Look for warnings, errors, suppressions
3. **Apply systematic fixes**:
   - Remove problematic helpers
   - Fix mock service typing
   - Simplify Effect patterns
   - Add proper null safety
4. **Validate**: Ensure tests pass and TypeScript is clean

### For Each Service/Implementation:
1. **Review interface definitions**: Ensure clean, typed contracts
2. **Check Effect error handling**: Proper error types in signatures
3. **Optimize Effect patterns**: Simplify where possible
4. **Validate layer patterns**: Proper dependency injection

## Success Criteria
- ✅ Zero "as any" usage across codebase
- ✅ All tests pass with strict TypeScript checking
- ✅ Consistent Effect-TS patterns following best practices
- ✅ Clean, maintainable test code without helper abstractions
- ✅ Proper type safety with explicit null handling

## Example Transformations

### Type-Safe API Response Handling

#### Acceptable (External APIs):
```typescript
// OK for third-party APIs we don't control
const response = await fetch('/external-api')
const data = await response.json() as any
```

#### Better (Our APIs with known schemas):
```typescript
// Define API response schema
const APIResponseSchema = Schema.Struct({
  metadata: Schema.Struct({
    selectedModel: Schema.String,
    llmTokensUsed: Schema.Number
  }),
  insights: Schema.Array(Schema.Struct({
    title: Schema.String,
    type: Schema.String
  }))
})

// Type-safe response handling
const response = await fetch('/our-api')
const rawData = await response.json()
const validatedData = Schema.decodeUnknownSync(APIResponseSchema)(rawData)
expect(validatedData.metadata.selectedModel).toBe('claude')
```

#### Reusable Response Wrapper:
```typescript
// Helper for type-safe API responses
async function fetchTyped<T>(url: string, schema: Schema.Schema<T>): Promise<T> {
  const response = await fetch(url)
  const data = await response.json()
  return Schema.decodeUnknownSync(schema)(data)
}

// Usage
const result = await fetchTyped('/api/analyze', APIResponseSchema)
expect(result.metadata.selectedModel).toBe('claude') // Fully typed!
```

### Effect Pattern Simplification:
#### Before (Problematic):
```typescript
const runTest = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.runPromise(effect.pipe(Effect.provide(TestLayer)))

const result = await runTest(
  Effect.gen(function* () {
    return yield* Effect.succeed("static value")
  })
) as any
```

#### After (Optimized):
```typescript
const result = await Effect.runPromise(
  Effect.succeed("static value").pipe(Effect.provide(TestLayer))
)
```

## Agent Instructions

**CRITICAL: NEVER declare success until ALL validation passes perfectly.**

### Validation Requirements (ALL must pass):
1. **TypeScript Compilation**: `pnpm tsc --noEmit` - ZERO errors allowed
2. **ESLint Validation**: `pnpm eslint <files>` - ZERO errors allowed  
3. **Test Execution**: `pnpm vitest run <files>` - ALL tests must pass
4. **Integration Validation**: Run full test suite if changes affect multiple files

### Systematic Process:
1. **Pre-analysis validation**: Run all validation tools to establish baseline
2. **Identify issues**: TypeScript errors, ESLint violations, test failures, Effect patterns
3. **Categorize "as any" usage**: 
   - External API responses (acceptable, consider improvement)
   - Our controlled APIs (should be typed with schemas)
   - Effect patterns/mocks (eliminate entirely)
4. **Apply fixes systematically**: One issue type at a time
5. **Implement type-safe response wrappers**: For our own APIs where possible
6. **Validate after each change**: Re-run tools, fix any regressions immediately
7. **Final comprehensive validation**: All tools must pass before declaring success
8. **Document improvements**: Show type-safe patterns implemented

### Failure Handling:
- If ANY validation fails, continue fixing until ALL pass
- Report specific errors and your fix approach
- Never declare "success" while known issues exist
- Provide concrete evidence of successful validation (command outputs)

### Evidence Requirements:
- Show actual command outputs proving validation passes
- Report specific error counts before/after fixes
- Demonstrate test execution results
- Confirm zero TypeScript/ESLint errors

Focus on creating clean, maintainable, type-safe Effect-TS code that serves as a good example for the rest of the codebase.