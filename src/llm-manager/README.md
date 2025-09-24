# LLM Manager Package

Multi-model LLM orchestration via Portkey gateway for intelligent routing, cost optimization, and unified API. Handles GPT, Claude, and local models with automatic fallback and response extraction.

## Current Implementation Status

✅ **Complete**: Portkey gateway integration with multi-model orchestration, response extraction, and comprehensive testing (55/55 tests passing).

## Quick Start

```bash
# Install package
pnpm add @otel-ai/llm-manager

# Configure Portkey Gateway
export PORTKEY_API_KEY="your-portkey-key"
export PORTKEY_GPT4_VIRTUAL_KEY="virtual-key-1"
export PORTKEY_CLAUDE_VIRTUAL_KEY="virtual-key-2"
export PORTKEY_LLAMA_VIRTUAL_KEY="virtual-key-3"

# Optional: Local model setup
export LM_STUDIO_URL="http://localhost:1234"
```

## Usage

### Basic Query with Layer Pattern

```typescript
import { LLMManagerServiceTag, LLMManagerLive } from '@otel-ai/llm-manager'
import { Effect } from 'effect'

const program = Effect.gen(function* () {
  const llm = yield* LLMManagerServiceTag

  const response = yield* llm.generate({
    prompt: "Analyze this anomaly pattern",
    taskType: 'analysis',
    preferences: {
      maxTokens: 1000,
      temperature: 0.7
    }
  })

  return response
})

const main = program.pipe(Effect.provide(LLMManagerLive))
Effect.runPromise(main).then(console.log)
```

### Structured Response Extraction

```typescript
import { LLMManagerServiceTag, LLMManagerLive } from '@otel-ai/llm-manager'
import { Schema } from '@effect/schema'
import { Effect } from 'effect'

const AnomalySchema = Schema.Struct({
  severity: Schema.Literal("low", "medium", "high", "critical"),
  service: Schema.String,
  description: Schema.String,
  recommendation: Schema.String
})

const extractAnomaly = Effect.gen(function* () {
  const llm = yield* LLMManagerServiceTag

  const anomaly = yield* llm.queryWithSchema(
    {
      prompt: "Analyze this trace data for anomalies",
      taskType: 'analysis'
    },
    AnomalySchema
  )

  return anomaly
}).pipe(Effect.provide(LLMManagerLive))
```

### Streaming Responses

```typescript
const streamProgram = Effect.gen(function* () {
  const llm = yield* LLMManagerServiceTag

  const stream = yield* llm.generateStream({
    prompt: "Generate detailed UI component",
    taskType: 'ui-generation'
  })

  yield* Stream.runForEach(stream, (chunk) =>
    Effect.sync(() => process.stdout.write(chunk))
  )
}).pipe(Effect.provide(LLMManagerLive))
```

### Multi-Model Parallel Query

```typescript
const parallelQuery = Effect.gen(function* () {
  const llm = yield* LLMManagerServiceTag

  const responses = yield* llm.queryMultiple(
    { prompt: "Complex analysis task", taskType: 'analysis' },
    ['gpt-4', 'claude-3-opus', 'llama-70b']
  )

  // Compare responses from different models
  return responses
}).pipe(Effect.provide(LLMManagerLive))
```

## Key Features

- **Portkey Gateway Integration**: Virtual keys, automatic routing, telemetry
- **Multi-Model Orchestration**: GPT-4, Claude 3, local Llama with unified interface
- **Intelligent Response Extraction**: JSON parsing from markdown, mixed content
- **Effect-TS Architecture**: Type-safe services with dependency injection
- **Automatic Fallback**: Seamless model switching on failures
- **Cost Optimization**: Task-based routing for optimal cost/quality balance
- **Response Caching**: TTL-based caching with configurable limits
- **Streaming Support**: Real-time streaming for long-form content

## Architecture

### Service Layer Design

The LLM Manager follows strict Effect-TS Layer patterns:

```typescript
// Service definition
export interface LLMManager extends Context.Tag<"LLMManager", {
  readonly generate: (request: LLMRequest) => Effect.Effect<LLMResponse, LLMError, never>
  readonly generateStream: (request: LLMRequest) => Stream.Stream<string, LLMError, never>
  readonly queryWithSchema: <A, I>(
    request: LLMRequest,
    schema: Schema.Schema<A, I>
  ) => Effect.Effect<A, LLMError | ParseError, never>
  readonly queryMultiple: (
    request: LLMRequest,
    models: ReadonlyArray<ModelType>
  ) => Effect.Effect<ReadonlyArray<LLMResponse>, LLMError, never>
}>{}

// Layer implementation (internal only - use via dependency injection)
export const LLMManagerLive = Layer.effect(
  LLMManager,
  Effect.gen(function* () {
    const config = yield* Config
    const portkeyClient = yield* PortkeyClient
    return LLMManager.of({
      // Implementation
    })
  })
)
```

### Portkey Gateway Integration

All LLM requests flow through Portkey for unified management:

```typescript
const portkeyRequest = {
  url: "https://api.portkey.ai/v1/chat/completions",
  headers: {
    "x-portkey-api-key": PORTKEY_API_KEY,
    "x-portkey-virtual-key": virtualKey, // Model-specific
    "x-portkey-mode": "single", // or "fallback" for multi-model
    "Content-Type": "application/json"
  },
  body: {
    messages: [{ role: "user", content: prompt }],
    max_tokens: maxTokens,
    temperature: temperature
  }
}
```

## API Reference

### Core Service Interface

```typescript
export interface LLMManagerService {
  // Basic generation
  generate: (request: LLMRequest) => Effect.Effect<LLMResponse, LLMError, never>

  // Streaming generation
  generateStream: (request: LLMRequest) => Stream.Stream<string, LLMError, never>

  // Structured response extraction
  queryWithSchema: <A, I>(
    request: LLMRequest,
    schema: Schema.Schema<A, I>
  ) => Effect.Effect<A, LLMError | ParseError, never>

  // Multi-model parallel query
  queryMultiple: (
    request: LLMRequest,
    models: ReadonlyArray<ModelType>
  ) => Effect.Effect<ReadonlyArray<LLMResponse>, LLMError, never>

  // Health and status
  isHealthy: () => Effect.Effect<boolean, LLMError, never>
  getStatus: () => Effect.Effect<ManagerStatus, LLMError, never>
  getAvailableModels: () => Effect.Effect<string[], LLMError, never>
}
```

### Request/Response Types

```typescript
interface LLMRequest {
  prompt: string
  taskType?: 'analysis' | 'ui-generation' | 'config-management' | 'general'
  preferences?: {
    model?: 'gpt-4' | 'claude-3-opus' | 'llama-70b'
    maxTokens?: number
    temperature?: number
    priority?: 'low' | 'medium' | 'high'
  }
  streaming?: boolean
}

interface LLMResponse {
  content: string
  model: string
  usage: {
    promptTokens: number
    completionTokens: number
    totalCost?: number
  }
  latencyMs: number
}
```

### Error Types

```typescript
type LLMError =
  | { _tag: "ModelUnavailable"; model: string; message: string }
  | { _tag: "RateLimitError"; retryAfter: number }
  | { _tag: "ValidationError"; message: string }
  | { _tag: "PortkeyError"; statusCode: number; message: string }
  | { _tag: "ExtractionError"; response: string; message: string }
```

## Task-Based Routing Strategy

The manager intelligently routes requests based on task type for optimal performance and cost:

| Task Type | Primary Model | Fallback Order | Rationale |
|-----------|--------------|----------------|-----------|
| `analysis` | Claude 3 | GPT-4 → Llama | Best analytical reasoning |
| `ui-generation` | GPT-4 | Claude → Llama | Superior code generation |
| `config-management` | Llama | GPT-4 → Claude | Cost-effective for structured tasks |
| `general` | GPT-4 | Claude → Llama | Balanced performance |

## Response Extraction Patterns

### JSON from Markdown Code Blocks

```typescript
// Extracts JSON from markdown code blocks
const response = `
Here's the analysis:
\`\`\`json
{"severity": "high", "service": "api-gateway", "error": "timeout"}
\`\`\`
`

const extracted = await extractWithSchema(response, AnalysisSchema)
// Result: { severity: "high", service: "api-gateway", error: "timeout" }
```

### Mixed Content Extraction

```typescript
// Handles responses with mixed text and JSON
const response = "The error occurred in {\"service\": \"auth\", \"code\": 500}"
const data = await extractJSON(response)
// Result: { service: "auth", code: 500 }
```

### Partial/Malformed JSON Recovery

```typescript
// Attempts to recover from incomplete responses
const partial = '{"status": "success", "data": [1, 2,'
const recovered = await recoverJSON(partial)
// Result: { status: "success", data: [1, 2] }
```

## Performance Optimization

### Caching Strategy

```typescript
// Responses cached with 5-minute TTL
const cacheConfig = {
  enabled: true,
  ttlSeconds: 300,
  maxSize: 100 // Maximum cached responses
}
```

### Rate Limiting & Retries

```typescript
// Exponential backoff with jitter
const retrySchedule = Schedule.exponential(Duration.seconds(1))
  .pipe(Schedule.jittered)
  .pipe(Schedule.upTo(Duration.seconds(60)))
```

### Model Performance Characteristics

| Model | Average Latency | Cost per 1K Tokens | Rate Limit | Best For |
|-------|-----------------|-------------------|------------|----------|
| GPT-4 | 1-3 seconds | $0.03 | 10,000 TPM | Code generation |
| Claude 3 | 2-4 seconds | $0.015 | 20,000 TPM | Complex analysis |
| Llama 70B | 0.5-2 seconds | $0 (local) | Unlimited | Bulk processing |

## Configuration

### Environment Variables

```bash
# Portkey Gateway (Required)
PORTKEY_API_KEY=your-api-key

# Virtual Keys for Models
PORTKEY_GPT4_VIRTUAL_KEY=virtual-key-1
PORTKEY_CLAUDE_VIRTUAL_KEY=virtual-key-2
PORTKEY_LLAMA_VIRTUAL_KEY=virtual-key-3

# Optional: Local Model Configuration
LM_STUDIO_URL=http://localhost:1234
LLAMA_MODEL_PATH=/path/to/model.gguf

# Optional: Rate Limiting
MAX_REQUESTS_PER_MINUTE=100
MAX_TOKENS_PER_MINUTE=10000
```

### Custom Layer Configuration

```typescript
import { createLLMManagerLive } from '@otel-ai/llm-manager'

const customConfig = {
  portkey: {
    apiKey: process.env.CUSTOM_PORTKEY_KEY,
    baseUrl: "https://custom-gateway.portkey.ai"
  },
  routing: {
    strategy: 'cost', // or 'performance', 'balanced'
    fallbackOrder: ['llama', 'gpt', 'claude']
  },
  cache: {
    enabled: true,
    ttlSeconds: 600,
    maxSize: 200
  }
}

const CustomLLMLayer = createLLMManagerLive(customConfig)

// Use custom layer
const program = myProgram.pipe(Effect.provide(CustomLLMLayer))
```

## Testing

### Unit Tests

```bash
# Run unit tests with mocked responses
pnpm test:unit:llm-manager

# Run specific test patterns
pnpm test response-extractor
pnpm test portkey-client
```

### Integration Tests

```bash
# Requires Portkey API key and virtual keys
pnpm test:integration:llm-manager

# Test specific models
pnpm test:integration multi-model
pnpm test:integration streaming
```

### Performance Testing

```bash
# Benchmark response times and costs
pnpm test:integration:llm-manager -- --grep "performance"
```

### Test Results

- **55/55 tests passing** across all client implementations
- **Real API Integration**: Tests with Portkey, OpenAI, Claude, and LM Studio
- **Performance Benchmarks**: Response time and cost tracking validated
- **Streaming Tests**: Multi-model streaming comparison complete
- **Concurrent Request Tests**: Load testing and reliability validated

## Layer-Only Instantiation Pattern

**CRITICAL**: The LLM Manager ONLY supports Layer-based instantiation following strict Effect-TS patterns. Direct constructor functions are NOT exported.

### Available Layers

```typescript
// Production layer (uses environment configuration)
import { LLMManagerLive } from '@otel-ai/llm-manager'

// Development layer (with enhanced logging)
import { LLMManagerDev } from '@otel-ai/llm-manager'

// Custom configuration layer
import { createLLMManagerLive } from '@otel-ai/llm-manager'
const customLayer = createLLMManagerLive(config)
```

### Testing with Layers

```typescript
import { LLMManagerLive, LLMManagerServiceTag } from '@otel-ai/llm-manager'

it('should generate response using Layer pattern', async () => {
  const request: LLMRequest = {
    prompt: "Test prompt",
    taskType: 'general'
  }

  const response = await Effect.runPromise(
    Effect.gen(function* () {
      const service = yield* LLMManagerServiceTag
      return yield* service.generate(request)
    }).pipe(Effect.provide(LLMManagerLive))
  )

  expect(response.content).toBeDefined()
})
```

## Troubleshooting

### Common Issues

#### Model Unavailable
- **Cause**: API key missing or invalid virtual key
- **Solution**: Check environment variables and Portkey configuration

#### Rate Limit Errors
- **Cause**: Exceeding model TPM limits
- **Solution**: Implement client-side rate limiting or upgrade API tier

#### Extraction Failures
- **Cause**: Malformed JSON in LLM response
- **Solution**: Use more specific prompts or adjust temperature

#### High Latency
- **Cause**: Cold start or network issues
- **Solution**: Implement warmup calls or use local models

### Debug Mode

```typescript
// Enable debug logging
DEBUG_PORTKEY_TIMING=1 pnpm test:integration
```

## Integration with Platform

The LLM Manager integrates with other platform packages:

- **AI Analyzer**: Provides LLM-powered anomaly analysis
- **UI Generator**: Generates React components with LLM assistance
- **Config Manager**: Uses LLM for intelligent configuration management
- **Storage**: Persists conversation contexts and metrics

## Migration Guide

### From Direct API Calls

```typescript
// Before: Direct OpenAI
const openai = new OpenAI({ apiKey })
const response = await openai.chat.completions.create({...})

// After: LLM Manager with Layers
const response = await Effect.runPromise(
  Effect.gen(function* () {
    const llm = yield* LLMManagerServiceTag
    return yield* llm.generate({ prompt, taskType: 'general' })
  }).pipe(Effect.provide(LLMManagerLive))
)
```

### From Multiple Model Clients

```typescript
// Before: Separate clients
const gptResponse = await gptClient.query(prompt)
const claudeResponse = await claudeClient.query(prompt)

// After: Unified interface with parallel query
const responses = await Effect.runPromise(
  Effect.gen(function* () {
    const llm = yield* LLMManagerServiceTag
    return yield* llm.queryMultiple(
      { prompt, taskType: 'analysis' },
      ['gpt-4', 'claude-3-opus']
    )
  }).pipe(Effect.provide(LLMManagerLive))
)
```

## Change Log

### 2025-09-05 - REFACTOR: Layer-Only Instantiation Pattern
- **BREAKING**: Removed direct constructor exports
- **ARCHITECTURE**: Enforced strict Effect-TS Layer pattern
- **TESTS**: Updated all tests to use Layer pattern
- **COMPLIANCE**: Ensures architectural consistency

### 2025-08-22 - Complete Implementation
- **MAJOR**: 55/55 tests passing with full multi-model support
- Implemented Portkey gateway integration
- Added response extraction with schema validation
- Created comprehensive test suite

---

Part of the [otel-ai](../../README.md) AI-native observability platform.