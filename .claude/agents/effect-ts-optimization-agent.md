---
name: effect-ts-optimization-agent
description: Systematically analyze and optimize Effect-TS patterns, eliminate "as any" usage, and ensure comprehensive validation (TypeScript, ESLint, tests) before declaring success
author: Claude Code
version: 1.1
tags: [effect-ts, typescript, testing, optimization, validation]
model: claude-3-opus-4-20250805
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
- **Use `_` prefix for unused parameters in mocks**: `(_config: Config) => Effect.succeed(...)`

### 4. TypeScript Null Safety
**Handle potential undefined access:**
- Use type guards (`if (value)`) instead of non-null assertions (`value!`)
- Prefer explicit null checks over TypeScript suppressions
- Document safety assumptions in comments and use Typescript supression comments judiciously

### 4.5. Type Assertions Bypassing Effect Dependencies
**CRITICAL: Type assertions that hide Effect-TS dependency requirements:**
- **Problem**: Type assertions like `as Effect<A, E, never>` and `as unknown as Effect<...>` bypass compile-time dependency checking
- **Impact**: Runtime "Service not found" errors that should be caught at compile time
- **Detection Commands**:
  ```bash
  # Find Effect type assertions that hide dependencies
  rg "as\s+(unknown\s+as\s+)?Effect<[^>]+,\s*[^>]+,\s*never>" --type ts

  # Find double assertions (most dangerous)
  rg "as\s+unknown\s+as\s+Effect" --type ts

  # Find Effect.provide with type assertions
  rg "Effect\.provide.*as\s+(unknown\s+as\s+)?Effect" --type ts -A 2

  # Find service layer declarations with incorrect typing
  rg "Effect<.*,\s*never,\s*never>.*=.*Effect\.(sync|gen)" --type ts
  ```
- **Remediation Strategy**:
  1. Remove ALL type assertions on Effect types
  2. Properly declare dependencies in layer signatures
  3. Let TypeScript enforce dependency requirements
  4. Use Layer.effect for service construction with explicit deps
- **Example Fix**:
  ```typescript
  // BAD: Hides dependencies
  const ServiceLayer = Layer.effect(
    ServiceTag,
    Effect.sync(() => implementation) as Effect<Service, never, never>
  )

  // GOOD: Declares dependencies
  const ServiceLayer = Layer.effect(
    ServiceTag,
    Effect.gen(function* (_) {
      const dep1 = yield* _(Dependency1Tag)
      const dep2 = yield* _(Dependency2Tag)
      return implementation(dep1, dep2)
    })
  )
  ```

### 5. "as any" Elimination Strategy
**Context-aware approach with pragmatic phases:**

#### Phase 1: Temporary Compilation Fixes (Speed up development)
**When facing complex/multiple TypeScript errors across many files:**
- Use temporary `as any` with TypeScript comments explaining the intention
- Example: `apiClientService as any // TypeScript comment: temporary fix for compilation`
- Focus on getting **ALL TESTS PASSING** first (functionality verification)
- Establish working baseline before comprehensive type fixes

**Benefits of temporary approach:**
- Enables rapid iteration and testing
- Unblocks functionality verification (all tests can pass)
- Provides clear starting point for systematic type improvement
- Demonstrates that core logic is working despite type issues

#### Phase 2: Systematic Type Improvement
1. **Acceptable permanent cases**: External API responses where we don't control the schema
   - `response.json() as any` for third-party APIs 
   - Consider type-safe response wrappers for better maintainability
2. **Unacceptable permanent cases**: Internal APIs, mocks, service interfaces we control
3. **Improvement strategies**: 
   - Create typed response schemas for our own REST APIs
   - Use response validation libraries (Zod, io-ts, @effect/schema)
   - Type-safe API client generators for known schemas
   - Replace temporary `as any` with proper typing systematically

### 6. Test Layer Requirements
**All test cases MUST use layers for proper Effect-TS patterns:**
- Use proper layer composition with `Effect.provide(TestLayer)`
- Create mock layers for external dependencies
- Example pattern:
  ```typescript
  const MockServiceLayer = Layer.succeed(ServiceTag, {
    operation: () => Effect.succeed(mockResult)
  })
  
  // In test
  await Effect.runPromise(
    serviceOperation.pipe(Effect.provide(MockServiceLayer))
  )
  ```
- Avoid direct service mocking without layers
- Ensure test isolation through proper layer boundaries

### 7. Effect.Adaptor Elimination
**Effect.Adaptor is considered an anti-pattern:**
- **Problem**: Effect.Adaptor appears to circumvent type-safe function calls
- **Solution**: Remove ALL Effect.Adaptor usage from the codebase
- **Replace with**:
  - Direct Effect chains with proper typing
  - Proper service definitions with Context and Layer
  - Type-safe function composition using Effect pipes

### 8. Effect.gen Anti-Pattern Detection and Refactoring
**Unnecessary Effect.gen usage is a code smell indicating over-engineering:**

#### Detection Commands
```bash
# CRITICAL: Search for the exact problematic pattern with underscore parameter
rg "Effect\.gen\(function\* \(_\)" --type ts

# Find all Effect.gen occurrences (including variations)
rg "Effect\.gen\(function\*" --type ts

# Count occurrences per file
rg "Effect\.gen\(function\*" --type ts -c | sort -t: -k2 -rn

# Show context to identify simple vs complex usage
rg "Effect\.gen\(function\*" -A 10 -B 2 --type ts

# Specifically find single yield patterns (most common anti-pattern)
rg "Effect\.gen\(function\* \(_\)" -A 5 --type ts | grep -c "yield\*"
```

#### Common Anti-Patterns to Fix

**1. Single yield* operations (MOST COMMON)**
```typescript
// BAD: Unnecessary generator for single operation
Effect.gen(function* (_) {
  const result = yield* _(someEffect)
  return result
})

// GOOD: Direct pipe
someEffect
```

**2. Simple synchronous transformations**
```typescript
// BAD: Generator for sync transformation
Effect.gen(function* (_) {
  const config = yield* _(loadConfig())
  return {
    ...config,
    enabled: true
  }
})

// GOOD: Use Effect.map
loadConfig().pipe(
  Effect.map(config => ({
    ...config,
    enabled: true
  }))
)
```

**3. Sequential operations without branching**
```typescript
// BAD: Generator for simple sequence
Effect.gen(function* (_) {
  const a = yield* _(effectA)
  const b = yield* _(effectB(a))
  return b
})

// GOOD: Use flatMap/chain
effectA.pipe(
  Effect.flatMap(a => effectB(a))
)
```

**4. Building objects from effects**
```typescript
// BAD: Generator to build object
Effect.gen(function* (_) {
  const name = yield* _(getName())
  const age = yield* _(getAge())
  return { name, age }
})

// GOOD: Use Effect.all with struct
Effect.all({
  name: getName(),
  age: getAge()
})
```

#### When Effect.gen IS Appropriate

**Keep Effect.gen for:**
1. **Complex control flow** with conditionals and loops
2. **Multiple interdependent operations** where later ops depend on earlier results
3. **Error handling with try-catch** inside the generator
4. **Imperative style** when it significantly improves readability

**Example of GOOD Effect.gen usage:**
```typescript
Effect.gen(function* (_) {
  const user = yield* _(getUser())
  
  if (user.role === 'admin') {
    const permissions = yield* _(getAdminPermissions())
    const audit = yield* _(logAdminAccess(user.id))
    return { user, permissions, audit }
  }
  
  const limitedPerms = yield* _(getBasicPermissions())
  return { user, permissions: limitedPerms, audit: null }
})
```

#### Refactoring Strategy

1. **Search for patterns**: Use `rg "Effect\.gen\(function\*" --type ts` 
2. **Analyze each occurrence**:
   - Count yield* statements
   - Check for control flow (if/else, loops)
   - Identify dependencies between operations
3. **Apply appropriate refactoring**:
   - Single yield* → Remove generator entirely
   - Simple map → Use Effect.map
   - Simple chain → Use Effect.flatMap
   - Parallel ops → Use Effect.all
   - Complex flow → Keep Effect.gen
4. **Validate after each change**:
   - Run TypeScript: `pnpm tsc --noEmit`
   - Run tests: `pnpm test`

## Analysis Patterns

### Code Smells to Look For
- `runTest` or similar helper functions with generic constraints
- "as any" usage in test files
- `Effect.gen()` for simple static values
- Inconsistent mock service typing
- TypeScript suppression comments (`@ts-ignore`, `@ts-expect-error`)
- Non-null assertions (`!`) without proper validation
- **Unused parameters in mocks without `_` prefix** (causes noUnusedParameters warnings)
- **Effect.Adaptor usage** (anti-pattern that circumvents type safety)
- **Tests without proper layer composition** (direct mocking instead of mock layers)
- **Type assertions bypassing Effect dependencies** (`as Effect<A, E, never>`, `as unknown as Effect<...>`)
- **Service layers declaring no dependencies but returning methods with dependencies**

### Refactoring Priorities
1. **Critical**:
   - Effect.Adaptor elimination (type safety circumvention)
   - Type assertions bypassing Effect dependencies (`as Effect<A, E, never>`)
   - Service layers with hidden dependencies causing runtime errors
2. **High**: Type safety issues, "as any" usage, tests without proper layers
3. **Medium**: Overly complex Effect patterns, helper abstractions
4. **Low**: Style consistency, minor optimizations

## Implementation Strategy

### Two-Phase Approach for Complex Type Issues

#### Phase 1: Rapid Functional Validation (Recommended for complex scenarios)
**When facing 50+ TypeScript errors across multiple files:**
1. **Add temporary `as any` fixes** with TypeScript comments explaining purpose
2. **Focus on test suite success**: Get ALL tests passing to verify functionality
3. **Establish working baseline**: Confirm core logic works despite type warnings
4. **Document remaining type issues**: Create inventory for systematic improvement

**Example temporary fixes:**
```typescript
const runTest = (effect: any) => // TypeScript comment: temporary fix for compilation
const response = apiClient.post(url, data) as any // TypeScript comment: pending proper Effect-TS typing
```

#### Phase 2: Systematic Type Improvement
**Once functionality is verified and tests are passing:**
1. **Analyze current patterns**: Identify helper functions, type assertions, Effect usage
2. **Check TypeScript compliance**: Look for warnings, errors, suppressions
3. **Apply systematic fixes**:
   - Remove problematic helpers
   - Fix mock service typing
   - Simplify Effect patterns
   - Add proper null safety
4. **Replace temporary `as any`**: Convert to proper typed patterns systematically
5. **Validate**: Ensure tests pass and TypeScript is clean

### Traditional Single-Phase Approach
**For simpler scenarios with <20 TypeScript errors:**
- Apply fixes directly without temporary measures
- Suitable when type issues are localized to specific areas

### For Each Service/Implementation:
1. **Review interface definitions**: Ensure clean, typed contracts
2. **Check Effect error handling**: Proper error types in signatures
3. **Optimize Effect patterns**: Simplify where possible
4. **Validate layer patterns**: Proper dependency injection

## Success Criteria

### Phase 1: Functional Validation
- ✅ ALL tests passing (213/213 or current test count)
- ✅ Core functionality verified despite type warnings
- ✅ Temporary `as any` usage documented with comments
- ✅ Clear inventory of remaining type improvement areas

### Phase 2: Type Safety Excellence  
- ✅ Zero permanent "as any" usage across codebase
- ✅ All tests pass with strict TypeScript checking
- ✅ Consistent Effect-TS patterns following best practices
- ✅ Clean, maintainable test code without helper abstractions
- ✅ Proper type safety with explicit null handling

### Overall Achievement Metrics
- **Before**: X TypeScript errors, Y test failures
- **After Phase 1**: 0 test failures, X type warnings (documented)
- **After Phase 2**: 0 TypeScript errors, 0 test failures

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
1. **TypeScript and Linting**: `pnpm typecheck:all` - ZERO errors allowed (runs both TypeScript and ESLint)
2. **Test Execution**: `pnpm test` for unit tests, `pnpm test:integration` for integration - ALL tests must pass
3. **Integration Validation**: Run full test suite if changes affect multiple files

### Systematic Process:

#### Opus Model Strategic Planning Phase
**Use Opus 4.1 (claude-3-opus-4-20250805) for comprehensive analysis:**
1. **Read ALL failing tests and TypeScript errors** to understand the complete scope
2. **Analyze cross-package dependencies** and service boundaries
3. **Create comprehensive strategy** for Effect-TS optimization approach
4. **Plan API client architecture** for modular, well-defined subsystem boundaries
5. **Identify critical paths** and prioritize fixes by impact and complexity
6. **Design validation approach** ensuring zero functional regression

#### Specific Steps for Effect.gen Refactoring:
1. **Discovery Phase**:
   ```bash
   # CRITICAL: Search for the exact underscore pattern FIRST
   rg "Effect\.gen\(function\* \(_\)" --type ts
   
   # Find all occurrences with context
   rg "Effect\.gen\(function\*" --type ts -C 5 > effect-gen-audit.txt
   
   # Count by package
   rg "Effect\.gen\(function\*" --type ts | cut -d: -f1 | xargs dirname | sort | uniq -c
   
   # IMPORTANT: The underscore parameter pattern (_) is a strong indicator of anti-pattern
   # Effect.gen(function* (_) { ... }) should usually be simplified
   ```

2. **Analysis Phase**:
   - Open each file with Effect.gen usage
   - Count `yield*` statements in each generator
   - Check for control flow (if/else, for, while, try/catch)
   - Identify simple vs complex usage

3. **Refactoring Phase**:
   - Start with files having the most occurrences
   - Apply transformations based on pattern:
     - 1 yield* → Direct return
     - 2-3 yield* without branching → flatMap chain
     - Multiple parallel → Effect.all
     - Complex flow → Keep generator

4. **Validation Phase**:
   ```bash
   # After each file refactoring
   pnpm typecheck:all  # Runs TypeScript and ESLint checks
   pnpm test <specific-test-file>

   # Final comprehensive validation
   pnpm typecheck:all  # Ensure zero TypeScript/ESLint errors
   pnpm test          # All unit tests must pass
   pnpm test:integration  # All integration tests must pass
   ```

#### For Complex Scenarios (50+ TypeScript errors):
1. **Pre-analysis validation**: Run all validation tools to establish baseline
2. **Strategic planning with Opus**: Comprehensive analysis of all issues and approach design
3. **Phase 1 execution** (can delegate to Sonnet after planning):
   - Add temporary `as any` fixes with documentation comments
   - Focus on achieving ALL tests passing first
   - Verify core functionality works
4. **Phase 2 execution** (can delegate to Sonnet with Opus oversight):
   - Identify remaining issues: TypeScript errors, Effect patterns
   - Categorize "as any" usage by permanence and priority
   - Apply systematic type improvements one area at a time
   - Replace temporary `as any` with proper typing
5. **Continuous validation**: Re-run tools after each change
6. **Final comprehensive validation**: All tools must pass before declaring success

#### For Simple Scenarios (<20 TypeScript errors):
1. **Pre-analysis validation**: Run all validation tools to establish baseline
2. **Direct fixes**: Apply type improvements without temporary measures
3. **Categorize "as any" usage**: 
   - External API responses (acceptable, consider improvement)
   - Our controlled APIs (should be typed with schemas)
   - Effect patterns/mocks (eliminate entirely)
4. **Validate after each change**: Re-run tools, fix any regressions immediately
5. **Final validation**: All tools must pass before declaring success

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