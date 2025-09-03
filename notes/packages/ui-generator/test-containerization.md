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

Create reusable Ollama container utilities using testcontainers-node:

```typescript
// src/ui-generator/test/unit/test-containers/ollama-container.ts
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers'

export class OllamaTestContainer {
  private container?: StartedTestContainer
  private readonly modelName = 'sqlcoder:7b'  // Fast SQL model
  
  async start(): Promise<{ endpoint: string; model: string }> {
    // Container lifecycle management
    this.container = await new GenericContainer('ollama/ollama:latest')
      .withExposedPorts(11434)
      .withCommand(['serve'])
      .withWaitStrategy(Wait.forLogMessage('Ollama is running'))
      .withStartupTimeout(120000)
      .start()
    
    // Pull model inside container
    await this.container.exec(['ollama', 'pull', this.modelName])
    
    return {
      endpoint: `http://${host}:${port}/v1`,
      model: this.modelName
    }
  }
}
```

### Phase 2: Test Migration

Update existing tests to use containerized Ollama:

```typescript
describe('LLM Query Generator', () => {
  let ollamaContainer: OllamaTestContainer
  let llmConfig: { endpoint: string; model: string }
  
  beforeAll(async () => {
    ollamaContainer = new OllamaTestContainer()
    llmConfig = await ollamaContainer.start()
  }, 300000) // 5 minute timeout for initial setup
  
  afterAll(async () => {
    await ollamaContainer?.stop()
  })
  
  // Tests use llmConfig.endpoint
})
```

### Phase 3: Model Optimization

Select fast, lightweight models for testing:

| Model | Size | Use Case | Speed |
|-------|------|----------|-------|
| `sqlcoder:7b` | 4GB | SQL generation | Fast |
| `codellama:7b-instruct` | 4GB | Code generation | Fast |
| `tinyllama:1.1b` | 637MB | Basic tests | Ultra-fast |

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

For environments where containers aren't available:

```typescript
if (process.env.CI && process.env.SKIP_CONTAINER_TESTS) {
  describe.skip('LLM Query Generator', () => {
    // Tests skipped in limited environments
  })
}
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
