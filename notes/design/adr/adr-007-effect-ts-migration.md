# ADR-007: Migration from Promises to Effect-TS

## Status
Proposed

## Context
The current codebase uses a mix of Promises (async/await) and Effect-TS patterns. While our codebase is relatively small and self-contained with minimal external dependencies, this hybrid approach still creates challenges:
- Inconsistent error handling between Promise-based and Effect-based code
- Loss of type safety when bridging between the two paradigms
- Difficulty in composing operations that mix Promises and Effects
- Resource management complexity without unified lifecycle control
- Testing challenges due to mixed concurrency models

Since we wrote most of the code ourselves without heavy reliance on external libraries, the migration is straightforward - we control all the async boundaries and can convert them directly. Effect-TS provides a comprehensive solution for asynchronous programming with typed errors, resource management, and composable operations.

## Decision
We will migrate the entire codebase from Promise-based async/await patterns to Effect-TS, establishing Effects as the sole mechanism for handling asynchronous operations, error management, and resource lifecycle.

### Core Principles

#### 1. No async/await in Domain Code
- **Replace** `async function` with plain functions returning `Effect.Effect<R, E, A>`
- **Rationale**: TypeScript fixes async function returns to `Promise`, losing error type information

#### 2. Convert Foreign Promises at the Boundary
- **Wrap** Promise-based APIs (fetch, fs/promises, SDKs) once using Effect interop helpers
- **Keep** everything as Effect after initial conversion
- **Rationale**: Maintain Effect's type safety and composability throughout the application

#### 3. Run Effects Only at the Top
- **Execute** Effects only at application boundaries (main.ts, HTTP handlers)
- **Maintain** 99% of codebase as Promise-free Effect compositions
- **Rationale**: Preserve composability and testability

#### 4. Use Effect Combinators Instead of Promise Operations
- `Effect.map` / `Effect.flatMap` instead of `.then`
- `Effect.all` instead of `Promise.all`
- `Effect.gen` (do-notation) instead of `async/await`
- `Effect.catchAll` / `Effect.tapError` instead of `try/catch`
- **Rationale**: Leverage Effect's superior error handling and composition

#### 5. Typed Errors, Resources, and Environment
- **Prefer** `Effect.Effect<R, E, A>` over exceptions or Promise rejections
- **Use** Layer/Scope for resource management
- **Rationale**: Compile-time error tracking and automatic resource cleanup

### Implementation Patterns

#### Pattern 1: Wrap a Promise Once
```typescript
import { Effect } from "effect";

const fetchJson = (url: string) =>
  Effect.tryPromise({
    try: () => fetch(url).then(r => r.json() as Promise<unknown>),
    catch: (e) => new Error(`Failed to fetch: ${String(e)}`)
  });

// Usage stays in Effect-world
const program = fetchJson("https://api.example.com/items").pipe(
  Effect.flatMap(items => Effect.log(`Got ${JSON.stringify(items)}`))
);
```

#### Pattern 2: Replace async/await with Effect.gen
```typescript
import { Effect } from "effect";

const readUser = (id: string): Effect.Effect<never, UserError, User> => ...
const readOrders = (userId: string): Effect.Effect<never, OrderError, Order[]> => ...

const workflow = Effect.gen(function* (_) {
  const user = yield* _(readUser("u-123"));
  const orders = yield* _(readOrders(user.id));
  return { user, orders };
});
```

#### Pattern 3: Replace Promise.all
```typescript
import { Effect, Array as A } from "effect";

const fetchOne = (id: number): Effect.Effect<never, Error, Item> => ...

const fetchMany = (ids: number[]) =>
  A.forEach(ids, fetchOne); // parallel by default
// or: Effect.all(ids.map(fetchOne), { concurrency: "unbounded" })
```

#### Pattern 4: HTTP Handler with Effect Core
```typescript
import { Effect } from "effect";
import express from "express";

const app = express();

const handlerEffect = (req: express.Request): 
  Effect.Effect<Env, DomainError, { status: number; body: unknown }> => ...

app.get("/items", (req, res) => {
  Effect.runPromise(handlerEffect(req))
    .then(({ status, body }) => res.status(status).json(body))
    .catch((err) => res.status(500).json({ error: String(err) }));
});
```

#### Pattern 5: Node Callback API to Effect
```typescript
import { Effect } from "effect";
import { readFile } from "fs";

const readFileEff = (path: string, enc: BufferEncoding) =>
  Effect.async<string, Error>((resume) => {
    readFile(path, enc, (err, data) => {
      err ? resume(Effect.fail(err)) : resume(Effect.succeed(data));
    });
  });
```

### Migration Strategy

Since our codebase is self-contained with minimal external dependencies, we can execute a rapid migration:

#### Phase 1: Setup & Core Services (Hour 1)
1. Define application-wide error types and Effect type aliases
2. Convert storage package to use Effects throughout
3. Migrate AI analyzer and LLM manager to Effect patterns

#### Phase 2: Infrastructure & UI (Hour 2)  
1. Convert UI generator and config manager to Effects
2. Update HTTP server handlers to run Effects at boundaries
3. Migrate database query operations to Effect-based patterns

#### Phase 3: Testing & Validation (Hour 3)
1. Update all test suites to use Effect test utilities
2. Convert test fixtures and helpers to Effect patterns
3. Validate error handling and resource cleanup

#### Phase 4: Cleanup & Optimization (Hour 4)
1. Remove all remaining async/await patterns
2. Eliminate any Promise-based utility functions
3. Performance validation and final cleanup

### Migration Checklist

- [ ] **API Surface**: Change exported functions to return `Effect.Effect<R, E, A>`
- [ ] **Kill async/await**: Replace with `Effect.gen`
- [ ] **Centralize Interop**: Create modules that wrap Promise/callback libraries once
- [ ] **Error Model**: Replace throw/reject with typed errors
- [ ] **Resource Safety**: Use Scope/acquireRelease and Layer for connections
- [ ] **Concurrency**: Use Effect.fork, Effect.timeout, Effect.race instead of ad-hoc Promise patterns

## Consequences

### Positive
- **Type-safe error handling**: All errors tracked at compile time
- **Composable operations**: Effects compose naturally without pyramid of doom
- **Resource safety**: Automatic cleanup with Scope/Layer
- **Better testing**: Deterministic test environments with Effect's test utilities
- **Unified concurrency**: Single model for all async operations
- **Performance**: Effect's fiber-based concurrency can be more efficient than Promises

### Negative
- **Learning curve**: Team needs to understand Effect patterns
- **Library compatibility**: Some libraries may require more complex interop
- **Initial migration effort**: Significant refactoring required
- **Debugging complexity**: Stack traces can be harder to read initially

### Risks to Mitigate
- **Gradual migration challenges**: Mixed Promise/Effect code during transition
- **Third-party integration**: Some libraries may not have Effect equivalents
- **Performance regression**: Monitor for unexpected overhead during migration

## Implementation Timeline

### Hour 1: Foundation
- Set up Effect runtime configuration
- Create interop modules for external APIs
- Establish error type hierarchy
- Update effect-ts-optimization-agent with migration patterns

### Hour 2: Core Services
- Migrate storage package to Effects
- Convert AI analyzer to Effect patterns
- Update LLM manager to use Effects

### Hour 3: Infrastructure
- Convert database operations
- Migrate HTTP server handlers
- Update configuration management

### Hour 4: Completion
- Migrate remaining Promise-based code
- Update all tests to Effect patterns
- Performance validation and optimization

## Agent Integration

### Effect-TS Optimization Agent Enhancement
The `effect-ts-optimization-agent` should be updated with these migration patterns to:
- **Detect Promise usage**: Identify async/await patterns and Promise-based code
- **Suggest Effect replacements**: Provide specific migration patterns for detected Promise usage
- **Validate migrations**: Ensure converted code follows Effect best practices
- **Eliminate "as any"**: Replace with proper Effect type signatures
- **Enforce patterns**: Check that all five core principles are followed

The agent should use this ADR as its reference for migration patterns and validation rules.

## Validation Criteria
- All async/await removed from domain code
- 100% of business logic returns Effects
- All tests pass with Effect-based assertions
- No runtime Promise rejections in production
- Performance metrics remain within acceptable bounds

## References
- [Effect-TS Documentation](https://effect.website)
- [Effect Pattern Library](https://effect.website/docs/guides/essentials/pipeline)
- [Migration Case Studies](https://effect.website/docs/guides/migration)