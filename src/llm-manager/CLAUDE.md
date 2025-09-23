# LLM Manager Package - Claude Context

## Package Overview
Multi-model LLM orchestration via Portkey gateway for intelligent routing, cost optimization, and unified API. Handles GPT, Claude, and local models with automatic fallback and response extraction.
This file is automatically read by Claude Code when working in this package.

## Mandatory Package Conventions
CRITICAL: These conventions MUST be followed in this package:
- All LLM operations use Effect-TS with proper error handling
- Schema validation required for all LLM responses
- Tests go in test/unit/ and test/integration/ subdirectories
- Never use scattered *.test.ts files in src/
- Use Portkey gateway for ALL model interactions
- Always implement retry logic with exponential backoff
- Response extraction must handle partial/malformed JSON

## Core Primitives & Patterns

### Service Definition Pattern
```typescript
// LLM Manager service definition
export interface LLMManager extends Context.Tag<"LLMManager", {
  readonly query: (request: LLMRequest) => Effect.Effect<LLMResponse, LLMError, never>
  readonly queryWithSchema: <A, I>(
    request: LLMRequest,
    schema: Schema.Schema<A, I>
  ) => Effect.Effect<A, LLMError | ParseError, never>
  readonly stream: (request: LLMRequest) => Stream.Stream<string, LLMError, never>
}>{}

export const LLMManagerLive = Layer.effect(
  LLMManager,
  Effect.gen(function* () {
    const config = yield* Config
    const portkeyClient = yield* PortkeyClient

    return LLMManager.of({
      query: (request) => Effect.gen(function* () {
        // Implementation with Portkey
      })
    })
  })
)
```

### Portkey Integration Pattern
```typescript
// Always use Portkey gateway with virtual keys
const portkeyRequest = {
  url: "https://api.portkey.ai/v1/chat/completions",
  headers: {
    "x-portkey-api-key": PORTKEY_API_KEY,
    "x-portkey-virtual-key": virtualKey, // Model-specific virtual key
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

### Response Extraction Pattern
```typescript
// Extract structured data from LLM responses
export const extractWithSchema = <A, I>(
  response: string,
  schema: Schema.Schema<A, I>
) => Effect.gen(function* () {
  // Try JSON block extraction first
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
  if (jsonMatch) {
    const json = JSON.parse(jsonMatch[1])
    return yield* Schema.decodeUnknown(schema)(json)
  }

  // Fallback to direct JSON parsing
  try {
    const json = JSON.parse(response)
    return yield* Schema.decodeUnknown(schema)(json)
  } catch {
    // Try to extract JSON object from mixed content
    const objectMatch = response.match(/\{[\s\S]*\}/)
    if (objectMatch) {
      const json = JSON.parse(objectMatch[0])
      return yield* Schema.decodeUnknown(schema)(json)
    }
  }

  return yield* Effect.fail(new ParseError("No valid JSON found"))
})
```

### Error Handling Pattern
```typescript
export type LLMError =
  | { _tag: "ModelUnavailable"; model: string; message: string }
  | { _tag: "RateLimitError"; retryAfter: number }
  | { _tag: "ValidationError"; message: string }
  | { _tag: "PortkeyError"; statusCode: number; message: string }
  | { _tag: "ExtractionError"; response: string; message: string }
```

## API Contracts

### LLM Manager Service Interface
```typescript
import { Context, Effect, Layer, Stream } from 'effect'
import { Schema } from '@effect/schema'

// Main LLM service
export interface LLMManager extends Context.Tag<"LLMManager", {
  // Basic query
  readonly query: (request: LLMRequest) => Effect.Effect<LLMResponse, LLMError, never>

  // Query with structured response
  readonly queryWithSchema: <A, I>(
    request: LLMRequest,
    schema: Schema.Schema<A, I>
  ) => Effect.Effect<A, LLMError | ParseError, never>

  // Streaming responses
  readonly stream: (request: LLMRequest) => Stream.Stream<string, LLMError, never>

  // Multi-model query (parallel)
  readonly queryMultiple: (
    request: LLMRequest,
    models: ReadonlyArray<ModelType>
  ) => Effect.Effect<ReadonlyArray<LLMResponse>, LLMError, never>
}>{}

// Request/Response schemas
export const LLMRequestSchema = Schema.Struct({
  prompt: Schema.String,
  model: Schema.optional(Schema.Literal("gpt-4", "claude-3-opus", "llama-70b")),
  temperature: Schema.optional(Schema.Number),
  maxTokens: Schema.optional(Schema.Number),
  systemPrompt: Schema.optional(Schema.String)
})

export const LLMResponseSchema = Schema.Struct({
  content: Schema.String,
  model: Schema.String,
  usage: Schema.Struct({
    promptTokens: Schema.Number,
    completionTokens: Schema.Number,
    totalCost: Schema.optional(Schema.Number)
  }),
  latencyMs: Schema.Number
})

// Specialized query schemas
export const ComponentGenerationSchema = Schema.Struct({
  component: Schema.String, // React component code
  dependencies: Schema.Array(Schema.String),
  props: Schema.Record(Schema.String, Schema.Unknown)
})

export const AnomalyAnalysisSchema = Schema.Struct({
  anomalies: Schema.Array(Schema.Struct({
    service: Schema.String,
    severity: Schema.Literal("low", "medium", "high", "critical"),
    description: Schema.String,
    recommendation: Schema.String
  }))
})
```

## Common Pitfalls & Anti-Patterns
AVOID these common mistakes:
- ❌ Direct API calls to OpenAI/Anthropic (always use Portkey)
- ❌ Not handling rate limits (429 errors need retry logic)
- ❌ Parsing LLM responses without validation
- ❌ Missing timeout configuration (can hang indefinitely)
- ❌ Not extracting JSON from markdown code blocks
- ❌ Hardcoding API keys (use environment variables)
- ❌ Sequential model queries (use parallel when possible)
- ❌ Not implementing circuit breakers for failing models

## Testing Requirements
- Unit tests: Mock Portkey responses for all scenarios
- Integration tests: Require Portkey container or API access
- Response extraction tests: Various malformed JSON scenarios
- Rate limit tests: Validate retry logic with 429 responses
- Multi-model tests: Parallel query execution
- Test commands: `pnpm test:unit:llm-manager`, `pnpm test:integration:llm-manager`

## Performance Considerations

### Optimization Strategies
- Cache frequent queries with Redis (5-minute TTL)
- Use streaming for long responses (>1000 tokens)
- Implement circuit breakers per model
- Batch similar queries when possible
- Use model-specific virtual keys for cost tracking

### Portkey Configuration
```typescript
// Environment variables
PORTKEY_API_KEY=your-api-key
PORTKEY_GPT4_VIRTUAL_KEY=virtual-key-1
PORTKEY_CLAUDE_VIRTUAL_KEY=virtual-key-2
PORTKEY_LLAMA_VIRTUAL_KEY=virtual-key-3

// Retry configuration
const retrySchedule = Schedule.exponential(Duration.seconds(1))
  .pipe(Schedule.jittered)
  .pipe(Schedule.upTo(Duration.seconds(60)))
```

### Rate Limiting
- GPT-4: 10,000 TPM (tokens per minute)
- Claude Opus: 20,000 TPM
- Local Llama: Unlimited (CPU/GPU bound)
- Implement client-side retry for 429 errors

## Dependencies & References
- External:
  - `effect` ^3.11.0
  - `@effect/schema` ^0.78.0
  - `@effect/platform` ^0.69.0 (HTTP client)
- Internal:
  - Storage package (for caching)
- Documentation:
  - Portkey Docs: https://docs.portkey.ai
  - Virtual Keys: https://docs.portkey.ai/docs/product/ai-gateway/virtual-keys
  - Rate Limits: https://docs.portkey.ai/docs/product/ai-gateway/rate-limits

## Quick Start Commands
```bash
# Development
pnpm dev:llm-manager

# Testing
pnpm test:unit:llm-manager
pnpm test:integration:llm-manager

# Test with local Portkey
docker run -p 8787:8787 portkeyai/gateway

# Building
pnpm build:llm-manager

# Find active work
mcp__github__search_issues query:"package:llm-manager is:open"
```