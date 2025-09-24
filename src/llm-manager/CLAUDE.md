# LLM Manager Package - Claude Context

## Package Overview
Multi-model LLM orchestration via Portkey gateway with intelligent routing and cost optimization.
This file is automatically read by Claude Code when working in this package.

## Mandatory Package Conventions
CRITICAL: These conventions MUST be followed in this package:
- **ONLY export Effect Layers for external consumption** (no factory functions)
- External packages must use PortkeyGatewayLive Layer or create their own mock
- All LLM operations use Effect-TS with proper error handling
- Schema validation required for all LLM responses
- Tests go in test/unit/ and test/integration/ subdirectories
- Use Portkey gateway for ALL model interactions
- Always implement retry logic with exponential backoff
- Response extraction must handle partial/malformed JSON

## Core Primitives & Patterns

### Service Definition Pattern
```typescript
export interface LLMManager extends Context.Tag<"LLMManager", {
  readonly query: (request: LLMRequest) => Effect.Effect<LLMResponse, LLMError, never>
  readonly queryWithSchema: <A, I>(
    request: LLMRequest,
    schema: Schema.Schema<A, I>
  ) => Effect.Effect<A, LLMError | ParseError, never>
  readonly stream: (request: LLMRequest) => Stream.Stream<string, LLMError, never>
}>{}
```

### Portkey Request Pattern
```typescript
// Always use Portkey gateway with virtual keys
const portkeyRequest = {
  url: "https://api.portkey.ai/v1/chat/completions",
  headers: {
    "x-portkey-api-key": PORTKEY_API_KEY,
    "x-portkey-virtual-key": virtualKey, // Model-specific
    "x-portkey-mode": "single", // or "fallback"
  },
  body: { messages, max_tokens, temperature }
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
    return yield* Schema.decodeUnknown(schema)(JSON.parse(jsonMatch[1]))
  }
  // Fallback to direct parsing
  // Try object extraction from mixed content
})
```

## Known Issues & Workarounds

### Rate Limiting
- **Problem**: Models have TPM limits (GPT-4: 10K, Claude: 20K)
- **Workaround**: Client-side rate limiting with exponential backoff
- **Fix**: Upgrade API tier or use local models for bulk operations

### Response Extraction
- **Problem**: LLMs return mixed text/JSON or markdown code blocks
- **Workaround**: Multiple extraction strategies with fallbacks
- **Fix**: Use specific prompts requesting JSON-only responses

## Common Pitfalls

❌ **DON'T**: Direct API calls to OpenAI/Anthropic (always use Portkey)
❌ **DON'T**: Parse LLM responses without validation
❌ **DON'T**: Missing timeout configuration (can hang indefinitely)
❌ **DON'T**: Sequential model queries (use parallel when possible)

✅ **DO**: Use Portkey virtual keys for all models
✅ **DO**: Extract JSON from markdown code blocks
✅ **DO**: Implement circuit breakers for failing models
✅ **DO**: Cache frequent queries with Redis (5-minute TTL)

## Quick Command Reference

```bash
# Development
pnpm dev:llm-manager

# Testing
pnpm test:unit:llm-manager
pnpm test:integration:llm-manager

# Test with local Portkey
docker run -p 8787:8787 portkeyai/gateway

# Debug mode
DEBUG_PORTKEY_TIMING=1 pnpm test:integration
```

## Dependencies & References
- `effect` ^3.11.0
- `@effect/schema` ^0.78.0
- `@effect/platform` ^0.69.0 (HTTP client)
- Storage package (for caching)
- Full documentation: See README.md
- Portkey Docs: https://docs.portkey.ai