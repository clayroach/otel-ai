# Storage Package - Claude Context

## Package Overview
ClickHouse storage with OTLP ingestion and AI-optimized queries. Single-path architecture with encoding type tracking.
This file is automatically read by Claude Code when working in this package.

## Mandatory Package Conventions
CRITICAL: These conventions MUST be followed in this package:
- **ONLY export Effect Layers for external consumption** (no factory functions)
- **HTTP routers MUST be exported as Effect Layers** (use RouterTag pattern)
- External packages must use StorageLive Layer or create their own mock
- All async operations use Effect-TS with proper error handling
- Schema validation required for all OTLP data inputs
- Tests go in test/unit/ and test/integration/ subdirectories
- Always use parameterized queries to prevent SQL injection
- Handle DateTime64(9) with nanosecond precision conversion
- Router endpoints delegate to services, avoid business logic in routes

## Core Primitives & Patterns

### Effect-TS Service Pattern
```typescript
export interface Storage extends Context.Tag<"Storage", {
  readonly writeTraces: (traces: ReadonlyArray<Trace>) => Effect.Effect<void, StorageError, never>
  readonly queryTraces: (params: QueryParams) => Effect.Effect<ReadonlyArray<Trace>, StorageError, never>
}>{}

export const StorageLive = Layer.effect(Storage,
  Effect.gen(function* () {
    const client = yield* ClickhouseClient
    return Storage.of({ /* implementation */ })
  })
)
```

### HTTP Router Pattern
```typescript
// CRITICAL: All packages MUST export routers as Effect Layers
export interface StorageRouter {
  readonly router: express.Router
}

export const StorageRouterTag = Context.GenericTag<StorageRouter>('StorageRouter')

export const StorageRouterLive = Layer.effect(
  StorageRouterTag,
  Effect.gen(function* () {
    const storageClient = yield* StorageAPIClientTag
    const retentionService = yield* RetentionServiceTag

    const router = express.Router()

    // API endpoints
    router.post('/api/clickhouse/query', async (req, res) => {
      const result = await Effect.runPromise(
        storageClient.queryRaw(req.body.query)
      )
      res.json({ data: result })
    })

    return StorageRouterTag.of({ router })
  })
)
```

### ClickHouse Query Pattern
```typescript
// Always parameterized queries
const query = `
  SELECT * FROM traces
  WHERE service_name = {service:String}
  AND start_time >= {start:DateTime64}`
const params = { service, start: new Date(timeRange.start) }
```

## Known Issues & Workarounds

### GitHub #57: Service Topology OOM
- **Problem**: Self-joins crash with ~3M traces
- **Workaround**: Use arrays instead of joins, add query timeouts, implement caching
- **Fix**: Create materialized views (planned)

### DateTime64(9) Handling
- **Problem**: JavaScript Date loses nanosecond precision
- **Workaround**: `new Date(nanoTime / 1_000_000)` for millisecond precision
- **Note**: Full nanosecond precision stored but not exposed in JS

## Common Pitfalls

❌ **DON'T**: Use self-joins for topology queries - causes OOM
✅ **DO**: Use groupArray and array functions

❌ **DON'T**: Load full datasets into memory
✅ **DO**: Use streaming with Effect.Stream

❌ **DON'T**: Forget LIMIT clauses on exploratory queries
✅ **DO**: Always add LIMIT and timeouts

❌ **DON'T**: Use direct string concatenation for queries
✅ **DO**: Use parameterized queries with {param:Type}

❌ **DON'T**: Create factory functions for router creation
✅ **DO**: Export routers as Effect Layers only

❌ **DON'T**: Mix HTTP logic with service logic
✅ **DO**: Keep routers thin, delegate to services

## Quick Command Reference

```bash
# Development
pnpm dev:storage           # Run storage service

# Testing
pnpm test:unit:storage     # Unit tests only
pnpm test:integration:storage # Integration with Docker
pnpm test:storage          # All tests

# ClickHouse access
docker exec -it otel-ai-clickhouse clickhouse-client --user=otel --password=otel123

# Common queries
SELECT COUNT(*) FROM traces;
SELECT DISTINCT service_name FROM traces;
SELECT * FROM traces WHERE trace_id = 'xxx' FORMAT Vertical;

# Check encoding types
SELECT encoding_type, COUNT(*) FROM traces GROUP BY encoding_type;
```

## Dependencies & References
- `@clickhouse/client` - ClickHouse Node.js client
- `@effect/schema` - Schema validation
- `effect` - Effect-TS runtime
- Full documentation: See README.md
- Performance guide: https://clickhouse.com/docs/en/operations/performance