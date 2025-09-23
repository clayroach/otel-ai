# Storage Package - Claude Context

## Package Overview
ClickHouse integration with S3/MinIO backend for high-performance telemetry storage. Handles OTLP ingestion, AI-optimized queries, and topology analysis.
This file is automatically read by Claude Code when working in this package.

## Mandatory Package Conventions
CRITICAL: These conventions MUST be followed in this package:
- All async operations use Effect-TS
- Schema validation required for all OTLP data inputs
- Tests go in test/unit/ and test/integration/ subdirectories
- Never use scattered *.test.ts files in src/
- Use ClickHouse client for all database operations
- Handle high-volume data with streaming/batching

## Core Primitives & Patterns

### Service Definition Pattern
```typescript
// Storage service definition
export interface Storage extends Context.Tag<"Storage", {
  readonly writeTraces: (traces: ReadonlyArray<Trace>) => Effect.Effect<void, StorageError, never>
  readonly queryTraces: (params: QueryParams) => Effect.Effect<ReadonlyArray<Trace>, StorageError, never>
  readonly getTopology: (timeRange: TimeRange) => Effect.Effect<ServiceTopology, StorageError, never>
}>{}

export const StorageLive = Layer.effect(
  Storage,
  Effect.gen(function* () {
    const client = yield* ClickhouseClient
    return Storage.of({
      writeTraces: (traces) => Effect.gen(function* () {
        // Implementation with validation
      })
    })
  })
)
```

### Error Handling Pattern
```typescript
export type StorageError =
  | { _tag: "ConnectionError"; message: string; cause?: unknown }
  | { _tag: "QueryError"; query: string; message: string }
  | { _tag: "ValidationError"; message: string }
  | { _tag: "TopologyQueryError"; message: string; tracesCount: number }
```

### ClickHouse Query Pattern
```typescript
// Always use parameterized queries
const query = `
  SELECT * FROM traces
  WHERE service_name = {service:String}
  AND start_time >= {start:DateTime64}
  AND start_time < {end:DateTime64}
`
const params = {
  service,
  start: new Date(timeRange.start),
  end: new Date(timeRange.end)
}
```

## API Contracts

### Storage Service Interface
```typescript
import { Context, Effect, Layer } from 'effect'
import { Schema } from '@effect/schema'

// Main storage service
export interface Storage extends Context.Tag<"Storage", {
  // Write operations
  readonly writeTraces: (traces: ReadonlyArray<Trace>) => Effect.Effect<void, StorageError, never>
  readonly writeBatch: (data: OTLPData) => Effect.Effect<void, StorageError, never>

  // Query operations
  readonly queryTraces: (params: QueryParams) => Effect.Effect<ReadonlyArray<Trace>, StorageError, never>
  readonly queryMetrics: (params: QueryParams) => Effect.Effect<ReadonlyArray<Metric>, StorageError, never>

  // Topology operations (performance-critical)
  readonly getServiceTopology: (timeRange: TimeRange) => Effect.Effect<ServiceTopology, StorageError, never>
  readonly getTraceFlows: (timeRange: TimeRange) => Effect.Effect<ReadonlyArray<TraceFlow>, StorageError, never>

  // AI-optimized queries
  readonly queryForAI: (params: AIQueryParams) => Effect.Effect<AIDataset, StorageError, never>
}>{}

// Schemas for validation
export const TraceSchema = Schema.Struct({
  trace_id: Schema.String,
  span_id: Schema.String,
  parent_span_id: Schema.optional(Schema.String),
  service_name: Schema.String,
  operation_name: Schema.String,
  start_time: Schema.Number,
  end_time: Schema.Number,
  duration_ns: Schema.Number,
  status_code: Schema.String,
  encoding_type: Schema.Literal("protobuf", "json")
})

export const QueryParamsSchema = Schema.Struct({
  timeRange: TimeRangeSchema,
  filters: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  limit: Schema.optional(Schema.Number),
  orderBy: Schema.optional(Schema.String)
})
```

## Common Pitfalls & Anti-Patterns
AVOID these common mistakes:
- ❌ Using self-joins for topology queries (causes OOM with large datasets - see GitHub #57)
- ❌ Missing indexes on (trace_id, span_id) and (trace_id, parent_span_id)
- ❌ Not using parameterized queries (SQL injection risk)
- ❌ Loading full datasets into memory (use streaming)
- ❌ Direct console.log instead of structured logging
- ❌ Unbounded queries without LIMIT clauses
- ❌ Not handling ClickHouse connection failures

## Testing Requirements
- Unit tests: Mock ClickHouse client responses
- Integration tests: Require Docker with ClickHouse container
- Performance tests: Required for topology queries (must handle 1M+ traces)
- Load tests: Validate handling of 10M+ traces without OOM
- Test commands: `pnpm test:unit:storage`, `pnpm test:integration:storage`

## Performance Considerations

### Known Issues
- **GitHub #57**: Service topology queries cause ClickHouse OOM with ~3M traces
  - Root cause: Inefficient self-joins in trace flow analysis
  - Mitigation: Add query timeouts, result caching, and progressive loading
  - Long-term fix: Materialized views for pre-computed dependencies

### Optimization Strategies
- Use ClickHouse arrays instead of self-joins
- Implement Redis caching for topology results (5-minute TTL)
- Progressive loading: Start with 1-hour window, expand as needed
- Query limits: 30-second timeout, 1GB memory per query
- Batch writes: Group traces in 1000-record batches

### ClickHouse Optimizations
```sql
-- Required indexes for performance
ALTER TABLE traces ADD INDEX idx_trace_parent (trace_id, parent_span_id) TYPE bloom_filter GRANULARITY 4;
ALTER TABLE traces ADD INDEX idx_trace_span (trace_id, span_id) TYPE bloom_filter GRANULARITY 4;

-- TTL for data retention
ALTER TABLE traces MODIFY TTL start_time + INTERVAL 7 DAY;
```

## Dependencies & References
- External:
  - `@clickhouse/client` ^1.7.0
  - `@effect/schema` ^0.78.0
  - `effect` ^3.11.0
- Internal:
  - None (base package)
- Documentation:
  - ClickHouse optimization: https://clickhouse.com/docs/en/sql-reference/statements/select/join
  - Materialized views: https://clickhouse.com/docs/en/guides/developer/cascading-materialized-views

## Quick Start Commands
```bash
# Development
pnpm dev:storage

# Testing
pnpm test:unit:storage
pnpm test:integration:storage

# Performance testing
pnpm test:perf:storage

# Building
pnpm build:storage

# Find active work
mcp__github__search_issues query:"package:storage is:open"

# Check known issues
mcp__github__get_issue owner:clayroach repo:otel-ai issue_number:57
```