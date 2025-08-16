---
id: packages.storage
title: Storage Package
desc: 'Clickhouse integration and S3 backend storage layer'
updated: 2025-08-13
created: 2025-08-13
---

# Storage Package

## Package Overview

<!-- COPILOT_CONTEXT: This note describes the storage package -->

### Purpose

Provides the storage abstraction layer for the AI-native observability platform, integrating Clickhouse for real-time analytics and S3/MinIO for raw data storage. **NEW**: Supports dual ingestion architecture with both OTel Collector (OTLP native) and direct OTLP protocol ingestion. Includes unified schema harmonization for AI analysis across both data paths.

### Architecture

- **Clickhouse Primary**: Real-time analytics and query engine for traces, metrics, logs
- **Dual Schema Support**: 
  - `otel_traces` (OTLP native via Collector)
  - `traces` (AI-optimized custom schema via Direct OTLP)
  - `ai_traces_unified` (harmonized view for AI processing)
- **S3/MinIO Backend**: Raw data storage with configurable retention policies
- **Dual OTLP Ingestion**: 
  - Collector-mediated ingestion (standard OTLP)
  - Direct OTLP protocol support for custom processing
- **AI Query Interface**: Optimized data access patterns for AI/ML workloads across both schemas
- **Cross-Path Analytics**: Performance and quality analysis across ingestion methods

## API Surface

<!-- COPILOT_GENERATE: Based on this description, generate TypeScript interfaces -->

### Public Interfaces

```typescript
import { Effect, Context, Layer } from 'effect'
import { Schema } from '@effect/schema'

// Effect-TS Schema definitions
const StorageConfigSchema = Schema.Struct({
  clickhouse: Schema.Struct({
    host: Schema.String,
    port: Schema.Number,
    database: Schema.String,
    username: Schema.String,
    password: Schema.String
  }),
  s3: Schema.Struct({
    endpoint: Schema.String,
    accessKey: Schema.String,
    secretKey: Schema.String,
    bucket: Schema.String,
    region: Schema.optional(Schema.String)
  }),
  retention: Schema.Struct({
    traces: Schema.String, // e.g., "30d"
    metrics: Schema.String, // e.g., "90d"
    logs: Schema.String // e.g., "7d"
  })
})

const OTLPDataSchema = Schema.Struct({
  traces: Schema.optional(Schema.Array(TraceDataSchema)),
  metrics: Schema.optional(Schema.Array(MetricDataSchema)),
  logs: Schema.optional(Schema.Array(LogDataSchema)),
  timestamp: Schema.Number
})

const QueryParamsSchema = Schema.Struct({
  timeRange: Schema.Struct({
    start: Schema.Number,
    end: Schema.Number
  }),
  filters: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  limit: Schema.optional(Schema.Number),
  aggregation: Schema.optional(Schema.String)
})

type StorageConfig = Schema.Schema.Type<typeof StorageConfigSchema>
type OTLPData = Schema.Schema.Type<typeof OTLPDataSchema>
type QueryParams = Schema.Schema.Type<typeof QueryParamsSchema>

// Effect-based service interfaces
interface StorageWriter {
  writeOTLP: (data: OTLPData) => Effect.Effect<void, StorageError, never>
  writeBatch: (data: OTLPData[]) => Effect.Effect<void, StorageError, never>
}

interface StorageReader {
  queryTraces: (params: QueryParams) => Effect.Effect<TraceData[], StorageError, never>
  queryMetrics: (params: QueryParams) => Effect.Effect<MetricData[], StorageError, never>
  queryLogs: (params: QueryParams) => Effect.Effect<LogData[], StorageError, never>
  queryForAI: (params: AIQueryParams) => Effect.Effect<AIDataset, StorageError, never>
}

// Storage Error ADT
type StorageError =
  | { _tag: 'ConnectionError'; message: string }
  | { _tag: 'ValidationError'; message: string; errors: Schema.ParseError }
  | { _tag: 'QueryError'; message: string; query: string }
  | { _tag: 'RetentionError'; message: string }
```

### Effect-TS Service Definitions

```typescript
// Service tags for dependency injection
class ClickhouseStorageService extends Context.Tag('ClickhouseStorageService')<
  ClickhouseStorageService,
  StorageWriter & StorageReader
>() {}

class S3StorageService extends Context.Tag('S3StorageService')<
  S3StorageService,
  {
    storeRawData: (data: Uint8Array, key: string) => Effect.Effect<void, StorageError, never>
    retrieveRawData: (key: string) => Effect.Effect<Uint8Array, StorageError, never>
    applyRetentionPolicy: () => Effect.Effect<void, StorageError, never>
  }
>() {}

// Service implementations
const makeClickhouseStorage = (config: StorageConfig): ClickhouseStorageService =>
  ClickhouseStorageService.of({
    // OTLP Ingestion with Effect-TS error handling
    writeOTLP: (data: OTLPData) =>
      Effect.gen(function* (_) {
        // Validate input data
        const validatedData = yield* _(Schema.decodeUnknown(OTLPDataSchema)(data))

        // Write to Clickhouse with automatic retries and circuit breaker
        yield* _(
          writeToClickhouse(validatedData).pipe(
            Effect.retry(
              Schedule.exponential('100 millis').pipe(Schedule.compose(Schedule.recurs(3)))
            ),
            Effect.timeout('30 seconds'),
            Effect.catchAll((error) =>
              Effect.fail({ _tag: 'ConnectionError', message: error.message })
            )
          )
        )
      }),

    writeBatch: (data: OTLPData[]) =>
      Effect.gen(function* (_) {
        // Process in parallel with concurrency control
        yield* _(
          Effect.forEach(data, writeOTLP, { concurrency: 'unbounded' }).pipe(
            Effect.catchAll((error) => Effect.fail({ _tag: 'BatchError', message: error.message }))
          )
        )
      }),

    // Query interface with streaming for large datasets
    queryTraces: (params: QueryParams) =>
      Effect.gen(function* (_) {
        const validatedParams = yield* _(Schema.decodeUnknown(QueryParamsSchema)(params))

        const results = yield* _(
          streamQueryResults(validatedParams).pipe(
            Stream.run(Sink.collectAll()),
            Effect.map(Chunk.toReadonlyArray),
            Effect.timeout('60 seconds'),
            Effect.catchAll((error) =>
              Effect.fail({
                _tag: 'QueryError',
                message: error.message,
                query: buildQuery(validatedParams)
              })
            )
          )
        )

        return results
      }),

    // AI-optimized queries with caching
    queryForAI: (params: AIQueryParams) =>
      Effect.gen(function* (_) {
        // Check cache first
        const cached = yield* _(getCachedAIData(params), Effect.option)

        if (Option.isSome(cached)) {
          return cached.value
        }

        // Execute optimized AI query
        const results = yield* _(
          executeAIQuery(params).pipe(
            Effect.tap((data) => cacheAIData(params, data)),
            Effect.timeout('120 seconds')
          )
        )

        return results
      })
  })

// Layer for dependency injection
const ClickhouseStorageLayer = Layer.effect(
  ClickhouseStorageService,
  Effect.gen(function* (_) {
    const config = yield* _(Effect.service(ConfigService))
    return makeClickhouseStorage(config.storage)
  })
)
```

## Implementation Notes

<!-- COPILOT_SYNC: Analyze code in src/storage and update this section -->

### Core Components

- **ClickhouseStorage**: Main storage engine with OTLP ingestion and query capabilities
- **S3Storage**: Raw data archival and retrieval with automated retention
- **SchemaManager**: Manages Clickhouse table schemas optimized for OpenTelemetry data
- **RetentionManager**: Automated data lifecycle management

### Dependencies

- Internal dependencies: None (foundational package)
- External dependencies:
  - `@effect/platform` - Effect-TS platform abstractions
  - `@effect/schema` - Schema validation and transformation
  - `@clickhouse/client` - Clickhouse client library
  - `@aws-sdk/client-s3` - S3 client (works with MinIO)
  - `@opentelemetry/otlp-transformer` - OTLP data transformation

## Code Generation Prompts

### Generate Base Implementation

Use this in Copilot Chat:

```
@workspace Based on the package overview in notes/packages/storage/package.md, generate the initial implementation for:
- ClickhouseStorage class in src/storage/clickhouse.ts with OTLP ingestion
- S3Storage class in src/storage/s3.ts with retention policies
- Schema definitions in src/storage/schemas.ts optimized for OTel data
- Configuration management in src/storage/config.ts
- Comprehensive unit tests in src/storage/__tests__/
- Integration tests with real Clickhouse/MinIO in src/storage/__tests__/integration/
```

### Update from Code

Use this in Copilot Chat:

```
@workspace Analyze the code in src/storage and update notes/packages/storage/package.md with:
- Current API surface and method signatures
- Clickhouse schema optimizations
- S3 storage patterns and retention logic
- Performance characteristics and benchmarks
- Recent changes and improvements
```

## OpenTelemetry Integration

<!-- Specific OpenTelemetry patterns used in this package -->

### OTLP Ingestion

- **Direct OTLP Support**: Accepts OTLP/HTTP and OTLP/gRPC from OTel Collector
- **Batch Processing**: Efficient batching for high-throughput scenarios
- **Schema Mapping**: Optimized Clickhouse schemas following OTel semantic conventions

### Data Model

- **Traces Table**: Spans with nested attributes, optimized for distributed tracing queries
- **Metrics Table**: Time-series optimized for aggregation and AI analysis
- **Logs Table**: Structured logs with trace correlation and full-text search

### AI-Optimized Queries

- **Anomaly Detection**: Pre-aggregated views for autoencoder training
- **Pattern Recognition**: Indexed attributes for fast pattern matching
- **Time-Series**: Optimized for real-time AI analysis pipelines

## Testing Strategy

<!-- Test coverage and testing approach -->

### Unit Tests

- Coverage target: 80%
- Key test scenarios:
  - OTLP data ingestion and transformation
  - Clickhouse query generation and optimization
  - S3 storage and retrieval operations
  - Retention policy enforcement
  - Error handling and retry logic

### Integration Tests

- Test with real Clickhouse instance using Docker
- Test with MinIO for S3 compatibility
- Performance benchmarks:
  - 1M+ spans/second ingestion rate
  - <100ms query response for standard dashboards
  - AI query optimization for large datasets

## Deployment Configuration

### Clickhouse Schema

```sql
-- Optimized for OTel traces
CREATE TABLE traces (
  trace_id String,
  span_id String,
  parent_span_id String,
  operation_name String,
  start_time DateTime64(9),
  end_time DateTime64(9),
  duration UInt64,
  service_name String,
  attributes Map(String, String),
  events Array(Tuple(DateTime64(9), String, Map(String, String))),
  status_code UInt8,
  INDEX idx_trace_id trace_id TYPE bloom_filter GRANULARITY 1,
  INDEX idx_service service_name TYPE set(100) GRANULARITY 1
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(start_time)
ORDER BY (service_name, start_time, trace_id);

-- Optimized for OTel metrics
CREATE TABLE metrics (
  metric_name String,
  timestamp DateTime64(9),
  value Float64,
  attributes Map(String, String),
  resource_attributes Map(String, String),
  INDEX idx_metric_name metric_name TYPE set(1000) GRANULARITY 1
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (metric_name, timestamp);
```

## Change Log

<!-- Auto-updated by Copilot when code changes -->

### 2025-08-15 (Day 3) - MAJOR IMPLEMENTATION MILESTONE ✅

**Dual-Ingestion Architecture Completed:**
- ✅ **Implemented dual ingestion paths**: Collector → `otel_traces`, Direct → `ai_traces_direct`
- ✅ **Unified view created**: `traces_unified_view` with type conversion and path identification
- ✅ **Dynamic table management**: Views created after table initialization to prevent race conditions
- ✅ **Type compatibility layer**: Status code conversion, column name mapping between schemas
- ✅ **SimpleStorage class**: Working implementation with both ingestion paths
- ✅ **Comprehensive testing**: 42 passing tests including integration tests with TestContainers

**Technical Implementation Details:**
- **File**: `src/storage/simple-storage.ts` - Complete working implementation
- **Tables**: `otel_traces` (collector), `ai_traces_direct` (direct), `traces_unified_view` (combined)
- **Backend Service**: `src/server.ts` - Dynamic view creation and OTLP endpoint
- **Test Coverage**: Unit + integration tests with real ClickHouse instances
- **Schema Validation**: Proper DateTime64(9) handling and field type conversions

**Key Architectural Patterns Validated:**
- ✅ Dynamic resource creation (views after tables)
- ✅ Type compatibility handling between different schemas
- ✅ Dual ingestion path validation and testing
- ✅ Production-ready error handling and logging

### 2025-08-13

- Initial package creation
- Defined OTLP ingestion interfaces
- Specified Clickhouse schema optimizations
- Added S3 backend storage design
