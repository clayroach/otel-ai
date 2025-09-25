# ADR-007: Service Abstraction Boundaries and Database Access Patterns

## Status
Accepted

## Context
The otel-ai platform uses a modular, service-oriented architecture built on Effect-TS patterns. As the system grows, maintaining clear boundaries between services becomes critical for maintainability, testing, and preventing coupling issues.

## Problem
Direct database client usage in non-storage packages creates several issues:
- **Tight coupling**: Services become directly dependent on database implementations
- **Testing complexity**: Difficult to mock database interactions consistently
- **Maintenance burden**: Database schema changes require updates across multiple packages
- **Security risks**: Direct SQL construction can lead to injection vulnerabilities
- **Architectural drift**: Bypassing service abstractions breaks the intended design

### Specific Issue Encountered
The annotations service was found using direct ClickHouse client imports and raw SQL construction instead of the established StorageService abstraction:

```typescript
// ❌ PROBLEMATIC: Direct database access
import { ClickHouseClient } from '@clickhouse/client'
const insertSQL = `INSERT INTO otel.annotations (...) VALUES (...)`
yield* storage.queryRaw(insertSQL)
```

## Decision

### 1. Service Abstraction Rules
**All database interactions MUST go through the StorageService abstraction:**

```typescript
// ✅ CORRECT: Use service abstraction
import { StorageServiceTag } from '../storage/services.js'

const storage = yield* StorageServiceTag
yield* storage.writeOTLP(data)
yield* storage.queryTraces(params)
```

### 2. Package Boundary Enforcement
**Direct database client imports are ONLY allowed in:**
- `/src/storage/` package (implementation layer)
- Test utilities that need direct database access for setup/teardown

**Prohibited everywhere else:**
- `@clickhouse/client` imports
- Direct `ClickhouseClient` usage
- Raw SQL string construction
- Bypassing StorageServiceTag dependency injection

### 3. Effect-TS Service Pattern
**All services MUST use Context.Tag interfaces and Layer patterns:**

```typescript
export interface ServiceName extends Context.Tag<"ServiceName", {
  readonly operation: (input: Input) => Effect.Effect<Output, Error, never>
}>{}

export const ServiceNameLive = Layer.effect(
  ServiceName,
  Effect.gen(function* () {
    const storage = yield* StorageServiceTag  // Use service abstraction
    return ServiceName.of({
      operation: (input) => /* implementation using storage */
    })
  })
)
```

### 4. Testing Patterns
**Tests MUST use the same dependency injection paths as production:**

```typescript
// ✅ CORRECT: Same path as production
const TestStorageLayer = Layer.succeed(
  StorageServiceTag,
  StorageService.of({
    writeOTLP: () => Effect.succeed(void 0),
    queryTraces: () => Effect.succeed([])
  })
)

const program = Effect.gen(function* () {
  const service = yield* ServiceName  // Same injection as production
  return yield* service.operation(input)
}).pipe(Effect.provide(Layer.merge(ServiceNameLive, TestStorageLayer)))
```

## Automated Enforcement

### 1. Enhanced Code Review Agent
The `code-review-agent` has been enhanced with architectural validation:
- Scans for prohibited imports (`@clickhouse/client` outside storage)
- Detects raw SQL construction in non-storage packages
- Flags missing StorageServiceTag usage
- Provides confidence-scored recommendations

### 2. GitHub Actions Integration
Automated architectural review on every PR:
- Non-blocking notifications (educational, not blocking)
- Slack integration for team visibility
- Confidence scoring (HIGH/MEDIUM/LOW)
- Specific fix recommendations with code examples

### 3. Detection Patterns
**HIGH confidence violations:**
- Direct ClickHouse imports outside `/src/storage/`
- Raw SQL template strings outside storage service
- `@clickhouse/client` usage in service implementations

**MEDIUM confidence violations:**
- Missing StorageServiceTag in database operations
- Complex SQL that might benefit from service methods

## Consequences

### Positive
- **Clear separation of concerns**: Database logic centralized in storage service
- **Easier testing**: Consistent mocking patterns across all services
- **Better maintainability**: Schema changes isolated to storage layer
- **Security improvement**: Parameterized queries in centralized service
- **Automated enforcement**: CI/CD pipeline catches violations early

### Negative
- **Initial refactoring effort**: Existing violations need to be fixed
- **Learning curve**: Developers need to understand Effect-TS service patterns
- **Indirection**: Simple database operations require service layer calls

## Implementation Plan

### Phase 1: Fix Existing Violations (Immediate)
1. Refactor annotations service to use StorageServiceTag
2. Remove direct ClickHouse client imports
3. Replace raw SQL with service method calls

### Phase 2: Documentation and Training
1. Update package CLAUDE.md files with service patterns
2. Create examples in architectural boundaries documentation
3. Add service pattern examples to README files

### Phase 3: Monitoring and Improvement
1. Monitor GitHub Actions for violation patterns
2. Refine detection rules based on false positives
3. Expand service abstractions as needed

## Related ADRs
- ADR-001: Documentation-driven development approach
- ADR-003: Effect-TS service layer patterns (referenced)

## References
- Effect-TS Context and Layer patterns: https://effect.website/docs/guides/context-management
- Service abstraction implementation: `/src/storage/services.ts`
- Code review agent configuration: `/.claude/agents/code-review-agent.md`