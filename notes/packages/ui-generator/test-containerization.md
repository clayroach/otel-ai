# UI Generator Test Containerization Plan

## Overview

Convert the llm-query-generator unit tests to use an Ollama test container, ensuring tests remain true unit tests with only internal dependencies (no external LM Studio requirement).

## Motivation

Currently, the UI generator tests rely on an external LM Studio instance running locally. This creates several issues:

1. **External Dependency**: Tests fail if LM Studio isn't running
2. **Inconsistent Environment**: Different developers may have different models loaded
3. **CI/CD Challenges**: Requires special setup in continuous integration
4. **Not True Unit Tests**: Dependency on external service violates unit test principles

## Implementation Strategy

### Phase 1: Container Infrastructure

Create reusable Ollama container utilities using testcontainers-node with Effect-TS:

```typescript
// src/ui-generator/test/unit/test-containers/ollama-container.ts
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Context from 'effect/Context'
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers'

// Service definition
export interface OllamaTestContainer {
  readonly endpoint: string
  readonly model: string
}

export const OllamaTestContainer = Context.GenericTag<OllamaTestContainer>('OllamaTestContainer')

// Error types
export class OllamaContainerError extends Error {
  readonly _tag = 'OllamaContainerError'
  constructor(readonly message: string, readonly cause?: unknown) {
    super(message)
  }
}

// Container management layer
export const OllamaTestContainerLive = Layer.scoped(
  OllamaTestContainer,
  Effect.gen(function* () {
    const modelName = 'sqlcoder:7b' // Fast SQL model
    
    // Start container - tryPromise only needed for testcontainers integration
    const container = yield* Effect.tryPromise({
      try: async () => {
        const container = await new GenericContainer('ollama/ollama:latest')
          .withExposedPorts(11434)
          .withCommand(['serve'])
          .withWaitStrategy(Wait.forLogMessage('Ollama is running'))
          .withStartupTimeout(120000)
          .start()
        
        // Pull model inside container
        await container.exec(['ollama', 'pull', modelName])
        
        return container
      },
      catch: (error) => new OllamaContainerError('Failed to start container', error)
    })
    
    const host = container.getHost()
    const port = container.getMappedPort(11434)
    
    // Register cleanup with minimal tryPromise
    yield* Effect.addFinalizer(() =>
      Effect.promise(() => container.stop()).pipe(Effect.orDie)
    )
    
    return {
      endpoint: `http://${host}:${port}/v1`,
      model: modelName
    }
  })
)
```

### Phase 2: Test Migration

Update existing tests to use containerized Ollama with Effect-TS:

```typescript
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as TestEnvironment from 'effect/TestEnvironment'
import { describe, it, expect } from 'vitest'
import { OllamaTestContainer, OllamaTestContainerLive } from './test-containers/ollama-container'

describe('LLM Query Generator', () => {
  // Create test layer with container
  const testLayer = Layer.mergeAll(
    OllamaTestContainerLive,
    // Add other test dependencies here
  )
  
  it('should generate SQL query from natural language', async () => {
    const program = Effect.gen(function* () {
      const ollama = yield* OllamaTestContainer
      
      // Use ollama.endpoint and ollama.model for testing
      const queryGenerator = yield* createQueryGenerator({
        endpoint: ollama.endpoint,
        model: ollama.model
      })
      
      const result = yield* queryGenerator.generateQuery(
        'Show me all traces from the last hour'
      )
      
      return result
    })
    
    // Run the effect with test layer
    const result = await Effect.runPromise(
      program.pipe(
        Effect.provide(testLayer),
        Effect.scoped
      )
    )
    
    expect(result).toMatchObject({
      query: expect.stringContaining('SELECT'),
      confidence: expect.any(Number)
    })
  }, 300000) // 5 minute timeout for initial setup
})
```

### Phase 3: Model Optimization

Select fast, lightweight models for testing with Effect-TS configuration:

| Model | Size | Use Case | Speed |
|-------|------|----------|-------|
| `sqlcoder:7b` | 4GB | SQL generation | Fast |
| `codellama:7b-instruct` | 4GB | Code generation | Fast |
| `tinyllama:1.1b` | 637MB | Basic tests | Ultra-fast |

```typescript
// Model configuration with Effect
import * as Config from 'effect/Config'

export const ModelConfig = Config.all({
  sqlModel: Config.string('OLLAMA_SQL_MODEL').pipe(
    Config.withDefault('sqlcoder:7b')
  ),
  codeModel: Config.string('OLLAMA_CODE_MODEL').pipe(
    Config.withDefault('codellama:7b-instruct')
  ),
  testModel: Config.string('OLLAMA_TEST_MODEL').pipe(
    Config.withDefault('tinyllama:1.1b')
  )
})

// Create container with specific model
export const createOllamaContainer = (model: string) =>
  Layer.scoped(
    OllamaTestContainer,
    Effect.gen(function* () {
      // Container setup with specified model
      // ...
    })
  )
```

### Phase 4: CI/CD Integration

Configure for various environments:

```yaml
# GitHub Actions example
- name: Run Unit Tests
  env:
    OLLAMA_MODEL: sqlcoder:7b
    SKIP_CONTAINER_TESTS: ${{ runner.os == 'Windows' }}
  run: pnpm test:unit
```

## Benefits

1. **True Unit Tests**: Complete isolation from external dependencies
2. **Reproducibility**: Consistent model versions across all environments
3. **CI/CD Ready**: Works anywhere Docker is available
4. **Developer Experience**: No manual LM Studio setup required
5. **Test Speed**: Using same fast models we've validated (sqlcoder-7b-2)

## Implementation Checklist

- [ ] Install testcontainers dependency
- [ ] Create OllamaTestContainer utility class
- [ ] Migrate llm-query-generator tests
- [ ] Add model caching for CI environments
- [ ] Update test documentation
- [ ] Validate in CI pipeline

## Resource Requirements

- **Docker**: Must be installed and running
- **Memory**: 8GB minimum (4GB for model, 4GB for system)
- **Disk**: 10GB for Ollama image and models
- **Network**: Initial model download requires internet

## Fallback Strategy

For environments where containers aren't available, use Effect-TS layers:

```typescript
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

// Mock layer for environments without Docker
export const OllamaTestContainerMock = Layer.succeed(
  OllamaTestContainer,
  {
    endpoint: 'http://localhost:11434/v1',
    model: 'mock-model'
  }
)

// Choose layer based on environment
const getTestLayer = () => {
  if (process.env.CI && process.env.SKIP_CONTAINER_TESTS) {
    return OllamaTestContainerMock
  }
  return OllamaTestContainerLive
}

describe('LLM Query Generator', () => {
  const testLayer = getTestLayer()
  
  // Tests run with appropriate layer
})
```

## Related Documentation

- [UI Generator Package](./package.md)
- [LLM Manager](../llm-manager/package.md)
- [Testing Strategy](../../design/adr/adr-008-testing-strategy.md)

## Timeline

- **Day 19**: Research and planning (complete)
- **Day 20**: Implementation of container utilities
- **Day 21**: Test migration and validation
- **Day 22**: CI/CD integration
