# CLAUDE.md - Diagnostics UI Package

AI assistance context for the OpenTelemetry universal annotation system.

## Package Overview

Universal annotation system for OpenTelemetry signals (traces, metrics, logs) with anti-contamination controls and TTL-based cleanup.

## Core Concepts

### Signal Types
- **trace**: Distributed trace annotations with trace_id/span_id
- **metric**: Metric annotations with metric_name/labels
- **log**: Log annotations with timestamp/body_hash
- **any**: Cross-signal annotations for time ranges

### Annotation Prefixes
Enforce namespace separation through required prefixes:
- `test.*` - Test data annotations
- `diag.*` - Diagnostic annotations
- `human.*` - Human reviewer annotations
- `llm.*` - LLM-generated annotations
- `meta.*` - Metadata annotations
- `train.*` - Training data annotations

### Anti-Contamination
Prevents test/training data from polluting production:
```typescript
// Production environment blocks test.* and train.* prefixes
validateNoContamination(annotations, 'production')
// Training environment blocks test.* prefixes only
validateNoContamination(annotations, 'training')
```

## Effect-TS Patterns

### Service Definition
```typescript
// Context.Tag for dependency injection
export class ServiceName extends Context.Tag('ServiceName')<
  ServiceName,
  ServiceImpl
>() {}

// Layer for service implementation
export const ServiceNameLive = Layer.succeed(ServiceName, impl)
```

### Error Handling
```typescript
// Tagged errors for precise error handling
export class AnnotationError extends Data.TaggedError('AnnotationError')<{
  readonly reason: 'StorageFailure' | 'InvalidAnnotation' | 'NotFound'
  readonly message: string
  readonly retryable: boolean
}> {}
```

## API Usage

### Annotating Signals
```typescript
// Annotate a trace
const annotation: Annotation = {
  signalType: 'trace',
  traceId: 'abc123',
  spanId: 'span456',
  timeRangeStart: new Date(),
  annotationType: 'diag',
  annotationKey: 'diag.performance.issue',
  annotationValue: JSON.stringify({ severity: 'high' }),
  createdBy: 'system'
}

// Annotate a metric
const metricAnnotation: Annotation = {
  signalType: 'metric',
  metricName: 'http.request.duration',
  metricLabels: { service: 'frontend' },
  timeRangeStart: new Date(),
  annotationType: 'llm',
  annotationKey: 'llm.anomaly.detected',
  annotationValue: JSON.stringify({ confidence: 0.95 }),
  createdBy: 'ai-analyzer'
}
```

### Querying Annotations
```typescript
// Query by signal type and service
const filter: AnnotationFilter = {
  signalType: 'trace',
  serviceName: 'frontend',
  limit: 100
}
```

## Database Schema

Single optimized table for all signal types:
- Columnar storage optimized for analytics
- TTL support for automatic cleanup
- Indexed by signal_type, time_range, service_name
- Views for signal-specific queries (trace_annotations, metric_annotations, log_annotations)

## Testing Patterns

### Unit Tests
Located in `test/unit/`:
- Schema validation tests
- Anti-contamination logic tests
- Service operation tests

### Integration Tests
Located in `test/integration/`:
- ClickHouse connectivity tests
- End-to-end annotation flow tests
- TTL cleanup verification

## Common Pitfalls

1. **Missing Prefix**: All annotation keys MUST have valid prefix
2. **Contamination**: Never use test.* or train.* prefixes in production
3. **Type Safety**: Use Schema.decode() for runtime validation
4. **Effect Context**: Remember to provide ClickhouseClient in Layer composition

## Quick Commands

```bash
# Run unit tests
pnpm test diagnostics-ui

# Run integration tests (requires ClickHouse)
pnpm test:integration diagnostics-ui

# Type check
pnpm typecheck

# Start development environment
pnpm dev:up
```

## Dependencies

- `@effect/schema`: Schema validation and type safety
- `effect`: Service layers and error handling
- `@clickhouse/client`: Database connectivity
- `@opentelemetry/api`: Signal type definitions

## Performance Considerations

- Batch annotations for bulk insert operations
- Use parameterized queries to prevent SQL injection
- Leverage ClickHouse's columnar storage for analytics queries
- Set appropriate TTLs to prevent unbounded data growth