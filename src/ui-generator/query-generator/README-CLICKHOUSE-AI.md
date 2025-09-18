# ClickHouse AI Query Generator

## Overview

The ClickHouse AI Query Generator provides programmatic access to AI-powered SQL generation, similar to ClickHouse's built-in `??` command but designed for application integration.

## Features

- **Automatic Query Generation**: Generates optimized ClickHouse queries based on critical paths
- **Query Optimization**: Takes existing SQL and optimizes it for ClickHouse
- **Query Explanation**: Provides natural language explanations of complex queries
- **Model Preference Support**: Uses configured general-purpose AI models (Claude, GPT, local models)

## Configuration

All model routing is now handled by Portkey Gateway. Configure API keys in your `.env` file:

```env
# API Keys for Portkey Gateway routing
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Portkey configuration (handled automatically)
# - SQL queries: Use codellama-7b-instruct, sqlcoder-7b-2, or other SQL-optimized models
# - General queries: Use claude-3-haiku-20240307, gpt-3.5-turbo, or other general models
# - All routing configured in config/portkey/config.json

# Skip tests in CI
SKIP_LLM_TESTS=false
```

## Usage

```typescript
import { Effect } from "effect"
import { 
  CriticalPathQueryGeneratorClickHouseAI,
  CriticalPathQueryGeneratorClickHouseAILive 
} from "./service-clickhouse-ai"

// Define a critical path
const criticalPath = {
  id: "checkout-flow",
  name: "E-commerce Checkout",
  services: ["frontend", "cart", "payment", "notification"],
  startService: "frontend",
  endService: "notification"
}

// Generate queries
const program = Effect.gen(function* () {
  const generator = yield* CriticalPathQueryGeneratorClickHouseAI
  
  // Generate multiple analysis queries
  const queries = yield* generator.generateQueries(criticalPath)
  
  // Execute a query
  const result = yield* queries[0].executeThunk()
  
  // Optimize an existing query
  const optimized = yield* generator.optimizeQuery(
    "SELECT * FROM traces WHERE service_name = 'frontend'",
    "Analyze frontend performance"
  )
  
  // Get explanation
  const explanation = yield* generator.explainQuery(optimized)
  
  return { queries, result, optimized, explanation }
})

// Run with dependencies
const runnable = Effect.provide(program, YourAppLayer)
```

## Generated Query Patterns

The generator automatically creates queries for:

1. **End-to-End Latency Analysis** - Complete latency distribution across the critical path
2. **Service Bottleneck Detection** - Identify services causing delays
3. **Error Impact Analysis** - Understand error effects on the critical path
4. **Time Series Performance** - Analyze trends over time
5. **Resource Utilization Correlation** - Correlate performance with resource metrics

## Comparison with ClickHouse CLI

| Feature | ClickHouse CLI `??` | AI Query Generator |
|---------|-------------------|-------------------|
| Natural language input | ✅ | ✅ |
| Programmatic access | ❌ | ✅ |
| Batch query generation | ❌ | ✅ |
| Query optimization | ❌ | ✅ |
| Custom model selection | Limited | ✅ |
| Offline capability | ❌ | ✅ (with local models) |

## Testing

Run tests with:

```bash
# With local LLM
pnpm test src/ui-generator/test/unit/clickhouse-ai-query-generator.test.ts

# Skip LLM tests (for CI)
SKIP_LLM_TESTS=true pnpm test
```

## Implementation Notes

- Uses general-purpose models (Claude, GPT) for better reasoning capabilities
- Automatically maps analysis goals to ClickHouse-specific query patterns
- Includes proper error handling and type safety with Effect-TS
- Supports both API-based and local LLM models
