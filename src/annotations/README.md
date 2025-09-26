# Annotations Package

Universal annotation system for OpenTelemetry signals with diagnostic session management and feature flag integration.

## Overview

The Annotations package provides a comprehensive annotation system that allows attaching metadata to any OpenTelemetry signal without modifying the original telemetry data. This package supports multiple features across the platform:

- **Feature-005 (Diagnostics)**: Feature flag testing and diagnostic session management
- **Feature-012 (Model Training)**: Data labeling for model fine-tuning pipelines
- **Feature flag tracking** - Annotate when feature flags are enabled/disabled
- **Diagnostic investigations** - Add hypotheses, evidence, and conclusions to traces
- **Model training** - Label data for supervised learning without contamination
- **Human insights** - Capture SRE observations and validations
- **Anti-contamination** - Ensure test/training data doesn't leak to production

## Features

- **Multi-signal support** - Annotate traces, metrics, logs, or any time range
- **Prefix-based namespacing** - Enforced conventions (test.*, diag.*, human.*, llm.*, meta.*, train.*)
- **Anti-contamination service** - Prevents test/training prefixes in production
- **Time-based TTL** - Automatic cleanup of expired annotations
- **Full audit trail** - Track who created what and when

## Quick Start

```typescript
import { AnnotationServiceLive } from '@otel-ai/annotations'

// Annotate a trace
const result = await Effect.runPromise(
  annotationService.annotateTrace({
    traceId: 'abc-123',
    annotation: {
      type: 'diag',
      key: 'diag.hypothesis.slow_db',
      value: { theory: 'Connection pool exhaustion', confidence: 0.75 }
    }
  }).pipe(Effect.provide(AnnotationServiceLive))
)

// Query annotations for a time range
const annotations = await Effect.runPromise(
  annotationService.query({
    signalType: 'metric',
    timeRange: { start: new Date('2025-01-01'), end: new Date() }
  }).pipe(Effect.provide(AnnotationServiceLive))
)

// Sanitize data for training (removes test/train prefixes)
const cleanData = await Effect.runPromise(
  antiContaminationService.sanitizeForTraining(traces)
    .pipe(Effect.provide(AntiContaminationServiceLive))
)
```

## Architecture

### Database Schema

Annotations are stored in a separate ClickHouse table with indexes optimized for:
- Signal type filtering
- Time range queries
- Service name lookups
- Annotation type filtering

### Signal Support

| Signal Type | Reference Fields | Use Cases |
|------------|-----------------|-----------|
| trace | trace_id, span_id | Debug investigations, error analysis |
| metric | metric_name, labels | Threshold annotations, anomaly markers |
| log | timestamp, body_hash | Pattern detection, correlation |
| any | time_range, service | Feature flags, deployments |

### Annotation Types

| Prefix | Type | Description | Appears in Production |
|--------|------|-------------|----------------------|
| `test.*` | Test scenarios | Feature flags, injected issues | NEVER |
| `diag.*` | Diagnostics | Hypotheses, evidence, conclusions | Yes |
| `human.*` | Human insights | SRE observations and validations | Yes |
| `llm.*` | AI analysis | Model predictions and patterns | Yes |
| `meta.*` | Metadata | Session info, capture context | Yes |
| `train.*` | Training | Labels for model training | NEVER |

## API Reference

### AnnotationService

```typescript
interface AnnotationService {
  // Universal annotation
  annotate(params: AnnotateParams): Effect<string, AnnotationError>

  // Signal-specific helpers
  annotateTrace(traceId: string, annotation: Annotation): Effect<string, AnnotationError>
  annotateMetric(name: string, timeRange: TimeRange, annotation: Annotation): Effect<string, AnnotationError>
  annotateLog(timestamp: Date, annotation: Annotation): Effect<string, AnnotationError>

  // Query operations
  query(filter: AnnotationFilter): Effect<readonly Annotation[], AnnotationError>
  getBySignal(signalType: SignalType, id: string): Effect<readonly Annotation[], AnnotationError>
}
```

### AntiContaminationService

```typescript
interface AntiContaminationService {
  // Remove prohibited annotations
  sanitizeForTraining<T>(data: T[], signalType: SignalType): Effect<T[], never>

  // Validate no test prefixes
  validateNoTestPrefixes(data: OTLPData): Effect<ValidationResult, ValidationError>

  // Strip specific annotation types
  stripAnnotations(annotations: Annotation[], prohibited: AnnotationType[]): Effect<Annotation[], never>
}
```

## Testing

```bash
# Unit tests
pnpm test annotations

# Integration tests with ClickHouse
pnpm test:integration annotations
```

## Configuration

Environment variables:

```bash
# ClickHouse connection
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=8124
CLICKHOUSE_DATABASE=otel
CLICKHOUSE_USER=otel
CLICKHOUSE_PASSWORD=otel123

# Annotation defaults
ANNOTATION_TTL_DAYS=30
ANNOTATION_MAX_VALUE_SIZE=65536
```

## Integration with Platform

The annotation system integrates with:

- **Feature-005**: Diagnostics UI for feature flag control and session management
- **Feature-005a**: OTLP capture/replay sessions with annotation markers
- **Feature-005c**: Training data pipeline using sessionId linkage pattern
- **Feature-012**: Model fine-tuning pipeline using labeled data
- **Storage**: Direct ClickHouse access for high-performance queries

### Training Data Integration (Feature-005c)

**CRITICAL: Phase annotations link training timelines to captured OTLP data via sessionId**

The annotation system provides the linkage mechanism for training data without requiring data duplication:

```typescript
// Phase annotations mark timeline transitions
const phaseAnnotations = [
  {
    annotationType: 'test',
    annotationKey: 'test.phase.baseline',
    annotationValue: JSON.stringify({
      sessionId: 'training-abc123',    // Links to MinIO sessions/training-abc123/
      flagName: 'paymentServiceFailure',
      flagValue: 0.0                   // Ground truth: normal
    })
  },
  {
    annotationType: 'test',
    annotationKey: 'test.phase.anomaly',
    annotationValue: JSON.stringify({
      sessionId: 'training-abc123',
      flagName: 'paymentServiceFailure',
      flagValue: 0.5                   // Ground truth: 50% failure rate
    })
  }
]

// Training data reader queries annotations by sessionId
const trainingPhases = await clickhouse.query(`
  SELECT annotation_key, annotation_value, time_range_start
  FROM annotations
  WHERE annotation_value LIKE '%training-abc123%'
  AND annotation_key LIKE 'test.phase.%'
  ORDER BY time_range_start
`)
```

**Benefits**:
- Enables training data creation without duplicating raw OTLP files
- Provides ground truth labels through flag values in annotation_value
- Links timeline phases to specific MinIO capture sessions
- Supports streaming access to large training datasets

## Performance

- Annotation inserts: <10ms
- Query by signal ID: <50ms
- Time range queries: <100ms (indexed)
- Anti-contamination filtering: <5ms per 1000 records

## Migration

The annotation table is created via migration:
```
migrations/clickhouse/20250924000001_create_annotations_table.sql
```

Run migrations:
```bash
pnpm db:migrate
```

---

Part of the [otel-ai](../../README.md) AI-native observability platform.