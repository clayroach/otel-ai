---
id: packages.llm-manager
title: LLM Manager Package
desc: 'Multi-model LLM orchestration for GPT, Claude, and local Llama models'
updated: 2025-08-13
created: 2025-08-13
---

# LLM Manager Package

## Package Overview

<!-- COPILOT_CONTEXT: This note describes the llm-manager package -->

### Purpose

Orchestrates multiple LLM models (GPT, Claude, local Llama) for the AI-native observability platform. Provides intelligent routing, cost optimization, fallback strategies, and unified API for AI-powered features including anomaly analysis, UI generation, and configuration management.

### Architecture

- **Multi-Model Support**: Unified interface for GPT, Claude, and local Llama models
- **Intelligent Routing**: Route requests to optimal model based on task type and performance
- **Cost Optimization**: Balance between accuracy, latency, and cost
- **Fallback Strategies**: Graceful degradation when models are unavailable
- **Context Management**: Maintain conversation context and memory across requests

## API Surface

<!-- COPILOT_GENERATE: Based on this description, generate TypeScript interfaces -->

### Public Interfaces

```typescript
import { Effect, Context, Layer, Stream, Schedule } from 'effect'
import { Schema } from '@effect/schema'

// Effect-TS Schema definitions for LLM management
const LLMConfigSchema = Schema.Struct({
  models: Schema.Struct({
    gpt: Schema.optional(
      Schema.Struct({
        apiKey: Schema.String,
        model: Schema.String, // "gpt-4", "gpt-3.5-turbo"
        maxTokens: Schema.Number,
        temperature: Schema.Number,
        endpoint: Schema.optional(Schema.String)
      })
    ),
    claude: Schema.optional(
      Schema.Struct({
        apiKey: Schema.String,
        model: Schema.String, // "claude-3-opus", "claude-3-sonnet"
        maxTokens: Schema.Number,
        temperature: Schema.Number,
        endpoint: Schema.optional(Schema.String)
      })
    ),
    llama: Schema.optional(
      Schema.Struct({
        modelPath: Schema.String,
        contextLength: Schema.Number,
        threads: Schema.Number,
        gpuLayers: Schema.optional(Schema.Number)
      })
    )
  }),
  routing: Schema.Struct({
    strategy: Schema.Literal('cost', 'performance', 'balanced'),
    fallbackOrder: Schema.Array(Schema.Literal('gpt', 'claude', 'llama')),
    maxRetries: Schema.Number,
    timeoutMs: Schema.Number
  }),
  cache: Schema.Struct({
    enabled: Schema.Boolean,
    ttlSeconds: Schema.Number,
    maxSize: Schema.Number
  })
})

const LLMRequestSchema = Schema.Struct({
  prompt: Schema.String,
  taskType: Schema.Literal('analysis', 'ui-generation', 'config-management', 'general'),
  context: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  preferences: Schema.optional(
    Schema.Struct({
      model: Schema.optional(Schema.Literal('gpt', 'claude', 'llama')),
      maxTokens: Schema.optional(Schema.Number),
      temperature: Schema.optional(Schema.Number),
      priority: Schema.optional(Schema.Literal('low', 'medium', 'high'))
    })
  ),
  streaming: Schema.optional(Schema.Boolean)
})

const LLMResponseSchema = Schema.Struct({
  content: Schema.String,
  model: Schema.String,
  usage: Schema.Struct({
    promptTokens: Schema.Number,
    completionTokens: Schema.Number,
    totalTokens: Schema.Number,
    cost: Schema.optional(Schema.Number)
  }),
  metadata: Schema.Struct({
    latencyMs: Schema.Number,
    retryCount: Schema.Number,
    cached: Schema.Boolean,
    confidence: Schema.optional(Schema.Number)
  })
})

const ConversationContextSchema = Schema.Struct({
  id: Schema.String,
  messages: Schema.Array(
    Schema.Struct({
      role: Schema.Literal('user', 'assistant', 'system'),
      content: Schema.String,
      timestamp: Schema.Number
    })
  ),
  metadata: Schema.Record(Schema.String, Schema.Unknown),
  createdAt: Schema.Number,
  updatedAt: Schema.Number
})

type LLMConfig = Schema.Schema.Type<typeof LLMConfigSchema>
type LLMRequest = Schema.Schema.Type<typeof LLMRequestSchema>
type LLMResponse = Schema.Schema.Type<typeof LLMResponseSchema>
type ConversationContext = Schema.Schema.Type<typeof ConversationContextSchema>

// LLM Error ADT
type LLMError =
  | { _tag: 'ModelUnavailable'; model: string; message: string }
  | { _tag: 'RateLimitExceeded'; model: string; retryAfter: number }
  | { _tag: 'InvalidRequest'; message: string; request: LLMRequest }
  | { _tag: 'AuthenticationFailed'; model: string; message: string }
  | { _tag: 'TimeoutError'; model: string; timeoutMs: number }
  | { _tag: 'ContextTooLarge'; model: string; tokenCount: number; maxTokens: number }
```

### Effect-TS Service Definitions

```typescript
// Service tags for dependency injection
class LLMManagerService extends Context.Tag('LLMManagerService')<
  LLMManagerService,
  {
    // Core LLM operations
    generate: (request: LLMRequest) => Effect.Effect<LLMResponse, LLMError, never>
    generateStream: (request: LLMRequest) => Stream.Stream<string, LLMError, never>

    // Conversation management
    startConversation: (systemPrompt?: string) => Effect.Effect<string, LLMError, never>
    continueConversation: (
      conversationId: string,
      message: string
    ) => Effect.Effect<LLMResponse, LLMError, never>
    getConversation: (conversationId: string) => Effect.Effect<ConversationContext, LLMError, never>

    // Model management
    getAvailableModels: () => Effect.Effect<string[], LLMError, never>
    getModelHealth: () => Effect.Effect<ModelHealthStatus[], LLMError, never>
    warmupModels: () => Effect.Effect<void, LLMError, never>
  }
>() {}

class ModelRouterService extends Context.Tag('ModelRouterService')<
  ModelRouterService,
  {
    selectModel: (request: LLMRequest) => Effect.Effect<string, LLMError, never>
    routeRequest: (request: LLMRequest) => Effect.Effect<LLMResponse, LLMError, never>
    getFallbackChain: (failedModel: string) => Effect.Effect<string[], never, never>
  }
>() {}

// Main LLM Manager implementation
const makeLLMManager = (config: LLMConfig) =>
  Effect.gen(function* (_) {
    const router = yield* _(ModelRouterService)
    const cache = yield* _(CacheService)

    return {
      generate: (request: LLMRequest) =>
        Effect.gen(function* (_) {
          // Validate request
          const validatedRequest = yield* _(Schema.decodeUnknown(LLMRequestSchema)(request))

          // Check cache first
          const cacheKey = generateCacheKey(validatedRequest)
          const cached = yield* _(cache.get(cacheKey), Effect.option)

          if (Option.isSome(cached)) {
            return { ...cached.value, metadata: { ...cached.value.metadata, cached: true } }
          }

          // Route to appropriate model with fallback
          const response = yield* _(
            router.routeRequest(validatedRequest).pipe(
              Effect.retry(
                Schedule.exponential('1 second').pipe(
                  Schedule.compose(Schedule.recurs(config.routing.maxRetries))
                )
              ),
              Effect.timeout(Duration.millis(config.routing.timeoutMs)),
              Effect.catchAll((error) =>
                Effect.logError(`LLM request failed: ${error.message}`).pipe(
                  Effect.zipRight(Effect.fail(error))
                )
              )
            )
          )

          // Cache successful response
          if (config.cache.enabled) {
            yield* _(cache.set(cacheKey, response, Duration.seconds(config.cache.ttlSeconds)))
          }

          return response
        }),

      generateStream: (request: LLMRequest) =>
        Stream.unwrap(
          Effect.gen(function* (_) {
            const validatedRequest = yield* _(Schema.decodeUnknown(LLMRequestSchema)(request))
            const selectedModel = yield* _(router.selectModel(validatedRequest))

            return createModelStream(selectedModel, validatedRequest).pipe(
              Stream.tap((chunk) =>
                Effect.logDebug(`Streaming chunk from ${selectedModel}: ${chunk.length} chars`)
              ),
              Stream.catchAll((error) =>
                Stream.fromEffect(
                  Effect.logError(`Streaming failed: ${error.message}`).pipe(
                    Effect.zipRight(Effect.fail(error))
                  )
                )
              )
            )
          })
        ),

      startConversation: (systemPrompt?: string) =>
        Effect.gen(function* (_) {
          const conversationId = yield* _(generateConversationId())
          const context: ConversationContext = {
            id: conversationId,
            messages: systemPrompt
              ? [{ role: 'system', content: systemPrompt, timestamp: Date.now() }]
              : [],
            metadata: {},
            createdAt: Date.now(),
            updatedAt: Date.now()
          }

          yield* _(saveConversation(context))
          return conversationId
        }),

      continueConversation: (conversationId: string, message: string) =>
        Effect.gen(function* (_) {
          const context = yield* _(loadConversation(conversationId))

          // Add user message
          const updatedContext = {
            ...context,
            messages: [
              ...context.messages,
              { role: 'user' as const, content: message, timestamp: Date.now() }
            ],
            updatedAt: Date.now()
          }

          // Generate response with conversation context
          const request: LLMRequest = {
            prompt: buildContextualPrompt(updatedContext),
            taskType: 'general',
            context: { conversationId }
          }

          const response = yield* _(router.routeRequest(request))

          // Add assistant message and save
          const finalContext = {
            ...updatedContext,
            messages: [
              ...updatedContext.messages,
              { role: 'assistant' as const, content: response.content, timestamp: Date.now() }
            ]
          }

          yield* _(saveConversation(finalContext))
          return response
        })
    }
  })

// Model-specific implementations
const makeGPTClient = (config: NonNullable<LLMConfig['models']['gpt']>) =>
  Effect.gen(function* (_) {
    return {
      generate: (request: LLMRequest) =>
        Effect.gen(function* (_) {
          const response = yield* _(
            callOpenAI({
              model: config.model,
              messages: [{ role: 'user', content: request.prompt }],
              max_tokens: request.preferences?.maxTokens ?? config.maxTokens,
              temperature: request.preferences?.temperature ?? config.temperature
            }).pipe(
              Effect.mapError((error) => ({
                _tag: 'ModelUnavailable' as const,
                model: 'gpt',
                message: error.message
              })),
              Effect.timeout(Duration.seconds(30))
            )
          )

          return transformOpenAIResponse(response)
        }),

      generateStream: (request: LLMRequest) =>
        Stream.unwrap(
          callOpenAIStream({
            model: config.model,
            messages: [{ role: 'user', content: request.prompt }],
            max_tokens: request.preferences?.maxTokens ?? config.maxTokens,
            temperature: request.preferences?.temperature ?? config.temperature,
            stream: true
          }).pipe(
            Effect.map((response) =>
              Stream.fromAsyncIterable(response, (error) => ({
                _tag: 'ModelUnavailable' as const,
                model: 'gpt',
                message: error.message
              })).pipe(
                Stream.map((chunk) => chunk.choices[0]?.delta?.content ?? ''),
                Stream.filter((content) => content.length > 0)
              )
            )
          )
        )
    }
  })

// Layers for dependency injection
const LLMManagerLayer = Layer.effect(
  LLMManagerService,
  Effect.gen(function* (_) {
    const config = yield* _(Effect.service(ConfigService))
    return makeLLMManager(config.llm)
  })
)

const ModelRouterLayer = Layer.effect(
  ModelRouterService,
  Effect.gen(function* (_) {
    const config = yield* _(Effect.service(ConfigService))
    return makeModelRouter(config.llm.routing)
  })
)
```

## Implementation Notes

<!-- COPILOT_SYNC: Analyze code in src/llm-manager and update this section -->

### Current Implementation Status (Day 9 - COMPLETE ✅)

The LLM Manager package is **fully implemented and tested** with 55/55 tests passing. Key achievements:

**✅ Completed Features:**
- **Multi-model Support**: GPT, Claude, and local Llama models with unified API
- **Layer-Based Architecture**: Strict Effect-TS Layer pattern for instantiation
- **Local Model Integration**: LM Studio integration with streaming support
- **OpenAI Client**: Complete GPT integration with streaming and error handling
- **Claude Client**: Full Claude API integration with conversation management
- **Configuration**: Environment-based config with comprehensive validation
- **Error Handling**: Tagged union error types with fallback strategies
- **Testing**: Comprehensive test suite with Layer-based patterns

**🧪 Test Coverage:**
- **55/55 tests passing** across all client implementations
- **Real API Integration**: Tests with OpenAI, Claude, and LM Studio
- **Performance Benchmarks**: Response time and cost tracking
- **Streaming Tests**: Multi-model streaming comparison
- **Concurrent Request Tests**: Load testing and reliability validation
- **Error Handling Tests**: Authentication, timeout, and retry scenarios

**🚀 Ready for Production:**
- Layer-based architecture following strict Effect-TS patterns
- Multi-model performance comparison
- Intelligent task type routing strategy
- Cost tracking and optimization
- Comprehensive documentation and examples

### Core Components

- **LLMManagerService**: Main orchestration service with unified API for all models
- **ModelRouterService**: Intelligent routing based on task type, cost, and performance
- **GPTClient**: OpenAI GPT integration with streaming support
- **ClaudeClient**: Anthropic Claude integration with conversation management
- **LlamaClient**: Local Llama model integration with resource management
- **CacheService**: Response caching with TTL and size limits

### Dependencies

- Internal dependencies: `storage` package for conversation persistence
- External dependencies:
  - `@effect/platform` - Effect-TS platform abstractions
  - `@effect/schema` - Schema validation and transformation
  - `openai` - OpenAI API client
  - `@anthropic-ai/sdk` - Claude API client
  - `node-llama-cpp` - Local Llama model support

## Model Routing Strategy

### Task-Based Routing

```typescript
const routingStrategy = {
  analysis: {
    preferred: 'claude', // Best for analytical tasks
    fallback: ['gpt', 'llama']
  },
  'ui-generation': {
    preferred: 'gpt', // Best for code generation
    fallback: ['claude', 'llama']
  },
  'config-management': {
    preferred: 'llama', // Cost-effective for structured tasks
    fallback: ['gpt', 'claude']
  },
  general: {
    preferred: 'gpt', // Balanced performance
    fallback: ['claude', 'llama']
  }
}
```

### Cost Optimization

- **Local Llama**: Zero cost per request, higher setup cost
- **GPT**: Moderate cost, fast responses
- **Claude**: Higher cost, best quality for complex analysis
- **Dynamic routing**: Balance cost vs quality based on request priority

## Code Generation Prompts

### Generate Base Implementation

Use this in Copilot Chat:

```
@workspace Based on the package overview in notes/packages/llm-manager/package.md, generate the initial implementation for:
- LLMManagerService in src/llm-manager/manager.ts with multi-model orchestration
- ModelRouterService in src/llm-manager/router.ts with intelligent routing
- Model clients in src/llm-manager/clients/ for GPT, Claude, and Llama
- Caching layer in src/llm-manager/cache.ts with TTL support
- Conversation management in src/llm-manager/conversations.ts
- Comprehensive unit tests with mocked API responses
- Integration tests with real model endpoints (configurable)
```

### Update from Code

Use this in Copilot Chat:

```
@workspace Analyze the code in src/llm-manager and update notes/packages/llm-manager/package.md with:
- Current routing algorithms and performance metrics
- Model client implementations and API integrations
- Caching strategies and hit rates
- Conversation management patterns
- Recent optimizations and improvements
```

## Testing Strategy

<!-- Test coverage and testing approach -->

### Unit Tests

- Coverage target: 80%
- Key test scenarios:
  - Model routing with different task types
  - Fallback strategies when models fail
  - Caching behavior and TTL expiration
  - Conversation context management
  - Error handling for each model type

### Integration Tests

- Test with real model APIs (rate-limited)
- Performance benchmarks:
  - <2 second response time for standard requests
  - <500ms for cached responses
  - > 99% uptime with fallback strategies
  - Cost tracking and optimization validation

## Performance Characteristics

### Response Times

- **GPT**: 1-3 seconds typical
- **Claude**: 2-4 seconds typical
- **Local Llama**: 500ms-2 seconds (depends on hardware)
- **Cached responses**: <100ms

### Throughput

- **Concurrent requests**: 100+ with proper rate limiting
- **Batch processing**: Support for bulk operations
- **Streaming**: Real-time response streaming for long outputs

## Layer-Only Instantiation Pattern

**CRITICAL: The LLM Manager ONLY supports Layer-based instantiation following strict Effect-TS patterns. Direct constructor functions are NOT exported.**

### Available Layers

```typescript
// Default production layer (uses environment configuration)
import { LLMManagerLive } from '@/llm-manager'

// Development layer (with enhanced logging)
import { LLMManagerDev } from '@/llm-manager'

// Custom configuration layer
import { createLLMManagerLive } from '@/llm-manager'
const customLayer = createLLMManagerLive(config)
```

### Usage Examples

```typescript
import { Effect } from 'effect'
import { LLMManagerServiceTag, LLMManagerLive } from '@/llm-manager'
import type { LLMRequest } from '@/llm-manager'

// Generate response using Layer pattern
const generateResponse = (request: LLMRequest) =>
  Effect.gen(function* () {
    const service = yield* LLMManagerServiceTag
    return yield* service.generate(request)
  }).pipe(Effect.provide(LLMManagerLive))

// Example usage
const request: LLMRequest = {
  prompt: 'Analyze this telemetry data',
  taskType: 'analysis',
  preferences: {
    maxTokens: 1000,
    temperature: 0.7
  }
}

const response = await Effect.runPromise(generateResponse(request))
```

### Service Methods Available via Layers

```typescript
interface LLMManagerService {
  generate: (request: LLMRequest) => Effect.Effect<LLMResponse, LLMError, never>
  generateStream: (request: LLMRequest) => Stream.Stream<string, LLMError, never>
  isHealthy: () => Effect.Effect<boolean, LLMError, never>
  getStatus: () => Effect.Effect<ManagerStatus, LLMError, never>
  getAvailableModels: () => Effect.Effect<string[], LLMError, never>
}
```

### Testing with Layers

```typescript
import { LLMManagerLive } from '@/llm-manager'

// Test example
it('should generate response using Layer pattern', async () => {
  const request: LLMRequest = { /* ... */ }
  
  const response = await Effect.runPromise(
    Effect.gen(function* () {
      const service = yield* LLMManagerServiceTag
      return yield* service.generate(request)
    }).pipe(Effect.provide(LLMManagerLive))
  )
  
  expect(response.content).toBeDefined()
})
```

## Change Log

<!-- Auto-updated by Copilot when code changes -->

### 2025-09-05 - REFACTOR: Layer-Only Instantiation Pattern

- **BREAKING**: Removed `createLLMManager` and `createDefaultLLMManager` exports from index.ts
- **ARCHITECTURE**: Enforced strict Effect-TS Layer pattern - only Layer-based instantiation allowed
- **INTERNAL**: Made direct constructor functions internal to llm-manager.ts (not exported publicly)
- **TESTS**: Updated all tests to use Layer pattern instead of direct instantiation
- **DOCS**: Added comprehensive Layer-only usage examples and patterns
- **COMPLIANCE**: Ensures architectural consistency across the entire platform

### 2025-08-22 (Day 9)

- **MAJOR**: Complete LLM Manager implementation with 55/55 tests passing
- Implemented multi-model clients for GPT, Claude, and local Llama (LM Studio)
- Added comprehensive streaming support across all models  
- Created simple manager with `createDefaultLLMManager()` for immediate use
- Built real API integration tests with performance benchmarking
- Added intelligent task type routing with cost optimization
- Implemented robust error handling with tagged union types
- Created comprehensive documentation with setup and usage examples

### 2025-08-13

- Initial package creation
- Defined multi-model orchestration with GPT, Claude, Llama
- Specified intelligent routing and fallback strategies
- Added conversation management and caching capabilities
