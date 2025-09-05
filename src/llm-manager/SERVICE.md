# LLM Manager Service Layer

This module provides an Effect-TS service layer abstraction for the LLM Manager, enabling dependency injection, better testability, and cleaner architecture.

## Overview

The `LLMManagerService` provides a standardized interface for LLM operations using Effect-TS patterns. It includes:

- **Live Implementation** - Real LLM integration with OpenAI, Claude, and local models
- **Mock Implementation** - Predictable responses for testing
- **Test Factory** - Create custom test services with configurable behavior

## Service Interface

```typescript
interface LLMManagerServiceInterface {
  generate: (request: LLMRequest) => Effect.Effect<LLMResponse, Error>
  generateStream: (request: LLMRequest) => Stream.Stream<string, Error>
  getStatus: () => Effect.Effect<{ models: string[], config: any }, Error>
  selectModel: (taskType: LLMRequest['taskType']) => string
  isHealthy: () => Effect.Effect<boolean, Error>
}
```

## Usage

### Basic Usage with Live Service

```typescript
import { Effect } from 'effect'
import { LLMManagerService, LLMManagerServiceLive } from '@otel-ai/llm-manager'

const program = Effect.gen(function* () {
  const manager = yield* LLMManagerService
  
  const response = yield* manager.generate({
    prompt: 'What is observability?',
    taskType: 'analysis'
  })
  
  return response
}).pipe(Effect.provide(LLMManagerServiceLive))

const result = await Effect.runPromise(program)
```

### Testing with Mock Service

```typescript
import { LLMManagerServiceMock } from '@otel-ai/llm-manager'

const testProgram = Effect.gen(function* () {
  const manager = yield* LLMManagerService
  const response = yield* manager.generate({
    prompt: 'test',
    taskType: 'general'
  })
  
  // Mock always returns predictable responses
  expect(response.model).toBe('mock-model')
  expect(response.content).toContain('Mock response')
}).pipe(Effect.provide(LLMManagerServiceMock))
```

### Custom Test Services

```typescript
import { createTestLLMManagerService } from '@otel-ai/llm-manager'

const customService = createTestLLMManagerService({
  generateResponse: {
    content: 'Custom response',
    model: 'custom-model',
    usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, cost: 0 }
  },
  status: {
    models: ['custom-1', 'custom-2'],
    config: { custom: true }
  },
  shouldFail: false
})

const program = Effect.gen(function* () {
  const manager = yield* LLMManagerService
  const response = yield* manager.generate({ prompt: 'test', taskType: 'general' })
  return response
}).pipe(Effect.provide(customService))
```

## Model Selection

The service includes intelligent model selection based on task type:

- **analysis** - Prefers Claude for deep reasoning
- **ui-generation** - Prefers GPT for code generation
- **config-management** - Uses any available model
- **general** - Defaults to local model for cost efficiency

## Environment Configuration

The live service reads configuration from environment variables:

```bash
# Local LLM (LM Studio)
export LLM_ENDPOINT=http://localhost:1234/v1
export LLM_MODEL=llama-3.1-8b

# OpenAI
export OPENAI_API_KEY=sk-...
export OPENAI_MODEL=gpt-3.5-turbo

# Claude
export CLAUDE_API_KEY=sk-ant-...
export CLAUDE_MODEL=claude-3-haiku-20240307
```

## Layer Composition

Services can be composed with other Effect layers:

```typescript
import { Layer } from 'effect'
import { LLMManagerServiceLive } from '@otel-ai/llm-manager'
import { MyOtherService } from './my-service'

const AppLayer = Layer.mergeAll(
  LLMManagerServiceLive,
  MyOtherService
)

const program = Effect.gen(function* () {
  const llm = yield* LLMManagerService
  const other = yield* MyOtherService
  // Use both services
}).pipe(Effect.provide(AppLayer))
```

## Error Handling

All operations use Effect's error channel for structured error handling:

```typescript
const program = Effect.gen(function* () {
  const manager = yield* LLMManagerService
  const response = yield* manager.generate(request)
  return response
}).pipe(
  Effect.provide(LLMManagerServiceLive),
  Effect.catchAll(error => 
    Effect.succeed({
      content: 'Fallback response',
      model: 'fallback',
      // ... other fields
    })
  )
)
```

## Benefits

1. **Dependency Injection** - Services are injected, not imported directly
2. **Testability** - Easy to swap implementations for testing
3. **Type Safety** - Full type inference with Effect-TS
4. **Composability** - Layers can be composed and reused
5. **Error Handling** - Structured error handling with Effect's error channel

## See Also

- [examples/service-usage.ts](./examples/service-usage.ts) - Complete usage examples
- [test/integration/multi-model-integration.test.ts](./test/integration/multi-model-integration.test.ts) - Integration tests using the service layer