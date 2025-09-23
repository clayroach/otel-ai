---
title: "Building Self-Correcting LLM Systems: The Evaluator-Optimizer Pattern"
published: false
description: How to coach LLMs to fix their own SQL errors using structured feedback and iteration
tags: ai, llm, sql, observability
series: AI-Native Observability Platform - Productization
canonical_url: https://dev.to/clayroach/evaluator-optimizer-pattern-llm-sql
cover_image: https://dev-to-uploads.s3.amazonaws.com/uploads/articles/sql-optimization-hero.png
---

"Your SQL query failed. Let me fix that for you."

This simple capability transforms LLM-generated SQL from a source of frustration into a reliable system component. Instead of trying to make LLMs perfect on the first try, we built a system where they can learn from their mistakes in real-time.

## The Challenge: Rate Limiting and Retry Logic

When working with multiple LLM providers, we encountered varying rate limits and retry requirements. OpenAI might return 196-second retry-after headers, while Anthropic uses different patterns entirely.

Our solution involved implementing intelligent retry logic that:

1. **Respects Long Delays**: Properly handles retry-after headers beyond typical timeout limits
2. **Uses Exponential Backoff**: Implements jitter to prevent thundering herd problems
3. **Selective Retries**: Only retries on rate limit errors (HTTP 429), not on actual failures

This approach reduces wasted API calls and improves system reliability.

## The SQL Evaluator-Optimizer: Coaching LLMs Without Retraining

LLMs often generate SQL with the right intent but wrong syntax - using MySQL patterns in ClickHouse, misremembering column names, or violating aggregation rules.

Rather than retraining or fine-tuning models (which is expensive and locks you into specific versions), we implemented [Anthropic's evaluator-optimizer pattern](https://www.anthropic.com/engineering/building-effective-agents) to fix queries on the fly. The key insight: **preserve the original analysis goal while iteratively fixing syntax errors** - turning model weaknesses into learning opportunities.

### How We Coach Models to Self-Correct

The system operates on a simple principle: **maintain context while fixing syntax**. Here's the workflow:

### Step 1: Preserve Intent

When a query fails, we capture:

- Original analysis goal ("find slow endpoints")
- Target services and time ranges
- Desired metrics and groupings

### Step 2: Evaluate with Precision

- `EXPLAIN AST` validates syntax (10ms, no data scanned)
- `SELECT ... LIMIT 1` tests execution (50ms, minimal cost)
- Error classifier identifies specific issues (wrong table names, invalid aggregations)

### Step 3: Optimize Using Same Context

Instead of regenerating from scratch, we coach the model:

```text
Your query for "find slow cartservice endpoints" failed with:
Error 215: 'count() * duration_ns' - duration_ns must be under aggregate

Fix: Replace with sum(duration_ns) to get total duration
Keep: Your service filter and grouping are correct
```

### Step 4: Apply Learned Patterns

When LLMs fail to correct themselves, rule-based fixes using common patterns ensure the query still runs. These patterns can be incorporated into future prompts to improve first-attempt success rates.

### Example: Common SQL Generation Errors

User asks: "Calculate total request duration for frontend and backend services"

```sql
-- Attempt 1: LLM generates (common mistake across ALL models)
SELECT
  service_name,
  count() * (duration_ns/1000000) as total_duration_ms,
  count() as request_count
FROM otel.traces
WHERE service_name IN ('frontend', 'backend')
GROUP BY service_name
ORDER BY total_duration_ms DESC
```

**Evaluator finds 2 critical errors:**

1. **Error 215 (NOT_AN_AGGREGATE)**: `count() * (duration_ns/1000000)` - ClickHouse requires `duration_ns` to be under an aggregate function
2. **Error 60 (UNKNOWN_TABLE)**: `otel.traces` - ClickHouse connection already specifies database

**Optimizer coaches with preserved context:**

```text
Analysis goal unchanged: "Calculate total request duration"
Your logic is correct but syntax needs adjustment:

1. Replace count() * duration with sum(duration)
   - You want total duration, sum() gives you that directly
2. Use 'traces' not 'otel.traces'
   - Database is already selected in connection

Maintain your service filter and grouping - those are perfect.
```

```sql
-- Attempt 2: Model self-corrects with coaching
SELECT
  service_name,
  sum(duration_ns/1000000) as total_duration_ms,
  count() as request_count,
  avg(duration_ns/1000000) as avg_duration_ms
FROM traces
WHERE service_name IN ('frontend', 'backend')
GROUP BY service_name
ORDER BY total_duration_ms DESC
```

**Success!** The model even added `avg_duration_ms` for better analysis. Same goal achieved with correct ClickHouse syntax.

### Why This Pattern Works

The evaluator-optimizer approach succeeds because it matches how developers actually debug:

1. **Clear evaluation criteria**: SQL either executes or returns a specific error code
2. **Demonstrable improvement**: Each iteration fixes one identified issue
3. **Context preservation**: The analysis goal never changes, only syntax gets corrected
4. **Cost efficiency**: Fixing syntax is cheaper than regenerating entire queries

When LLMs fail to self-correct, rule-based fallbacks catch common patterns like:
- `count() * column` → `sum(column)`
- `otel.traces` → `traces`
- Aggregates in WHERE → Move to HAVING

This mirrors Anthropic's evaluator-optimizer pattern: one component evaluates (ClickHouse), another optimizes (LLM + rules), iterating until success. No model retraining needed - just real-time coaching using the same context.

### Phase 3: Rule-Based Optimization Fallback

When LLM optimization fails or returns empty results, rule-based fixes provide reliability:

```typescript
// Real example from production
const input = "SELECT count() * duration_ns FROM otel.traces WHERE avg(duration) > 1000"
const output = applyRuleBasedOptimization(input)
// Result: "SELECT sum(duration_ns) FROM traces GROUP BY service_name HAVING avg(duration) > 1000"

// Three fixes in one pass:
// 1. count() * duration_ns → sum(duration_ns)
// 2. otel.traces → traces
// 3. WHERE avg() → HAVING avg()
```

### Comprehensive Metadata Comments

Every SQL query includes detailed metadata for complete observability:

```sql
-- Model: gpt-4-turbo-2024-04-09
-- Mode: ClickHouse AI (General model for SQL generation)
-- Generated: 2025-09-20T16:17:16.281Z
-- Analysis Goal: Analyze service latency patterns showing p50, p95, p99 percentiles over time for performance monitoring
-- Services: frontend, cart, checkout, payment, email
-- Tokens: 2190 (prompt: 1305, completion: 885)
-- Generation Time: 18970ms
-- Reasoning: The query structure is optimal for real-time troubleshooting of the checkout flow by focusing on recent, problematic traces and providing detailed, actionable metrics. By segmenting the analysis by service and operation and ranking by severity, it allows for rapid identification and prioritization of issues that could impact critical business processes.
-- =========================================
-- ========== VALIDATION ATTEMPTS ==========
-- Total Attempts: 1
-- Attempt 1: ✅ VALID
--   Execution Time: 96ms
-- Final Status: ✅ Query validated successfully
-- =========================================
SELECT
  service_name,
  operation_name,
  quantile(0.50)(duration_ns/1000000) as p50_ms,
  quantile(0.95)(duration_ns/1000000) as p95_ms,
  quantile(0.99)(duration_ns/1000000) as p99_ms,
  count() as request_count,
  toStartOfInterval(timestamp, INTERVAL 5 minute) as time_bucket
FROM traces
WHERE service_name IN ('frontend', 'cart', 'checkout', 'payment', 'email')
  AND timestamp >= now() - INTERVAL 1 HOUR
GROUP BY service_name, operation_name, time_bucket
HAVING request_count > 10
ORDER BY p99_ms DESC
LIMIT 100
```

This metadata serves five critical functions:

1. **Performance Tracking**: Generation time (18.9s) and token usage (2190) for cost optimization
2. **Debugging**: Complete validation history showing what worked on first attempt
3. **Business Context**: The reasoning explains why this query structure matters for checkout flow monitoring
4. **Model Accountability**: Exact model version for reproducibility
5. **Operational Intelligence**: Execution time (96ms) proves query efficiency

## Configuration Centralization with Smart Caching

The Portkey gateway client implements intelligent configuration caching with content-based invalidation:

```typescript
const loadPortkeyConfig = (): Effect.Effect<PortkeyConfig, LLMError, never> =>
  Effect.gen(function* () {
    const rawConfig = readFileSync(configPath, 'utf8')

    // Calculate hash of the raw content
    const currentHash = calculateHash(rawConfig)

    // Check if config has changed
    if (configCache.config && configCache.contentHash === currentHash) {
      return configCache.config // Config unchanged, use cache
    }

    // Process placeholders and environment variables
    let processedConfig = rawConfig.replace(/\$\{([^}]+)\}/g, (match, envVar) => {
      const [varName, defaultValue] = envVar.split(':-')
      return process.env[varName.trim()] || defaultValue?.trim() || match
    })

    // Update cache with new config
    configCache = {
      config: JSON.parse(processedConfig),
      contentHash: currentHash,
      lastLoaded: new Date()
    }

    return configCache.config
  })
```

This eliminated 31 environment variables while enabling hot-reloading of configuration changes.

## The Impact: What Actually Changed

### Before Implementation
- **Manual debugging**: Engineers spending hours fixing LLM-generated SQL
- **Unpredictable failures**: Different errors from different models
- **No learning**: Same mistakes repeated across sessions
- **High operational cost**: Both in API calls and engineering time

### After Implementation
- **Automated recovery**: The evaluator-optimizer pattern fixes most errors automatically
- **Consistent improvement**: Each fixed query teaches the system
- **Model-aware routing**: Use the right model for the right query type
- **Reduced costs**: Fewer API calls through smarter retries and caching

### Common Error Patterns We Now Handle

```text
Aggregation Errors:     count() * column → sum(column)
Table References:       otel.traces → traces
WHERE vs HAVING:        Aggregates automatically moved to HAVING
Column Names:           Fuzzy matching for typos and variations
Function Syntax:        MySQL/PostgreSQL → ClickHouse conversions
```

The key metric that matters: **Engineers now trust the system** to generate working SQL, allowing them to focus on analysis rather than syntax debugging.

## The Lesson: Coaching Over Retraining

The evaluator-optimizer pattern proves a crucial point: you don't need to retrain models to improve their output. By implementing intelligent error handling and contextual coaching, we transformed unreliable LLM-generated SQL into a production-ready system.

The approach is simple but powerful:
- **Evaluate** with clear criteria (does the SQL execute?)
- **Optimize** based on specific errors (not generic retries)
- **Preserve** the original intent while fixing syntax
- **Learn** from patterns to prevent future errors

This pattern applies beyond SQL generation - any LLM output that has clear success criteria can benefit from this approach.

---

*Part of the 30-day AI-native observability platform series. Follow along as we build production-ready AI infrastructure.*
