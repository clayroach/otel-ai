# Feature 008: LLM Health Monitoring

## Overview

Implement comprehensive health monitoring for LLM providers and models, enabling real-time status tracking, automatic failover, and proactive issue detection across all configured models in the Portkey gateway.

## Status

- **Created**: 2025-09-16
- **Status**: Design Complete
- **Priority**: High
- **Dependencies**:
  - Feature 006b (Portkey DRYness) ✅ Complete
  - Feature 007 (Dual Model Selection) - Complementary
- **Related Features**: [Feature 007 - Dual LLM Model Selection](./feature-007-dual-llm-model-selection.md)

## Problem Statement

The observability platform needs comprehensive health monitoring for LLM models to ensure reliable model selection and failover capabilities. Since Portkey gateway doesn't automatically poll upstream models for health status, we need to implement our own monitoring system that provides real-time health insights and performance metrics.

### Current Issues

1. **Visibility Gap**:
   - No proactive health monitoring for cloud LLM providers
   - Cannot detect degradation before user requests fail
   - Missing real-time status for model selection decisions

2. **Local Model Discovery**:
   - LM Studio and Ollama models require direct polling
   - No unified health status across cloud and local models
   - Manual intervention needed to detect availability changes

3. **Performance Metrics**:
   - Portkey metrics not integrated into health decisions
   - No historical trending of model performance
   - Circuit breaker risks not proactively identified

4. **User Experience**:
   - No visibility into model health in UI
   - Model selection may route to unhealthy providers
   - No alerts for degraded performance

## Proposed Solution

### High-Level Architecture

Implement a multi-layered health monitoring system that combines synthetic canary probes, direct endpoint polling, and OpenTelemetry metrics to provide comprehensive health status for all LLM models.

#### Metrics Flow Architecture

```
Portkey Gateway
     ↓
  OTLP Metrics (gRPC/HTTP)
     ↓
OpenTelemetry Collector
     ↓
  ClickHouse Exporter
     ↓
ClickHouse (metrics table)
     ↓
Health Aggregator Service (queries metrics)
```

This approach leverages our existing OpenTelemetry infrastructure, avoiding the need to scrape and parse Prometheus text format.

### Technical Design

#### Component Architecture

```
src/llm-manager/health/
├── index.ts                           # Public API exports
├── canary-probe-service.ts           # Synthetic probe management
├── canary-probe-service-live.ts      # Live implementation
├── local-model-health-service.ts     # Local model polling
├── local-model-health-service-live.ts
├── prometheus-metrics-service.ts     # Metrics scraping
├── prometheus-metrics-service-live.ts
├── health-aggregator-service.ts      # Combined health status
├── health-aggregator-service-live.ts
├── health-storage-service.ts         # ClickHouse persistence
├── health-storage-service-live.ts
├── types.ts                          # Health status types
├── schemas.ts                        # Schema validation
├── errors.ts                         # Error definitions
├── config.ts                         # Configuration
└── test/
    ├── unit/
    │   ├── canary-probe-service.test.ts
    │   ├── local-model-health.test.ts
    │   ├── prometheus-metrics.test.ts
    │   └── health-aggregator.test.ts
    └── integration/
        ├── health-monitoring.test.ts
        └── metrics-scraping.test.ts
```

#### Service Interface Design

```typescript
// Canary Probe Service
export interface CanaryProbeService {
  readonly probeModel: (
    modelId: string,
    config: ProbeConfig
  ) => Effect.Effect<ProbeResult, CanaryProbeError, never>

  readonly startScheduledProbes: (
    models: readonly ModelConfig[]
  ) => Effect.Effect<Fiber.RuntimeFiber<never, never>, CanaryProbeError, never>

  readonly stopScheduledProbes: () => Effect.Effect<void, never, never>
}

export const CanaryProbeService = Context.GenericTag<CanaryProbeService>(
  'CanaryProbeService'
)

// Local Model Health Service
export interface LocalModelHealthService {
  readonly checkLMStudio: () => Effect.Effect<
    LocalModelStatus,
    LocalHealthCheckError,
    never
  >

  readonly checkOllama: () => Effect.Effect<
    LocalModelStatus,
    LocalHealthCheckError,
    never
  >

  readonly startPolling: (
    interval: Duration.Duration
  ) => Effect.Effect<Fiber.RuntimeFiber<never, never>, never, never>
}

export const LocalModelHealthService = Context.GenericTag<LocalModelHealthService>(
  'LocalModelHealthService'
)

// OpenTelemetry Metrics Service
export interface OTelMetricsService {
  readonly queryModelMetrics: (
    modelId: string,
    timeRange: TimeRange
  ) => Effect.Effect<ModelMetrics, MetricsQueryError, never>

  readonly calculateErrorRate: (
    modelId: string,
    window: Duration.Duration
  ) => Effect.Effect<number, MetricsQueryError, never>

  readonly getLatencyPercentiles: (
    modelId: string,
    window: Duration.Duration
  ) => Effect.Effect<LatencyPercentiles, MetricsQueryError, never>

  readonly getCircuitBreakerStatus: (
    modelId: string
  ) => Effect.Effect<CircuitBreakerStatus, never, never>
}

export const OTelMetricsService = Context.GenericTag<OTelMetricsService>(
  'OTelMetricsService'
)

// Health Aggregator Service
export interface HealthAggregatorService {
  readonly getHealthStatus: (
    modelId: string
  ) => Effect.Effect<ModelHealthStatus, HealthAggregationError, never>

  readonly getAllHealthStatuses: () => Effect.Effect<
    readonly ModelHealthStatus[],
    HealthAggregationError,
    never
  >

  readonly getHealthSummary: () => Effect.Effect<
    HealthSummary,
    never,
    never
  >

  readonly triggerImmediateCheck: (
    modelId?: string
  ) => Effect.Effect<void, HealthCheckError, never>

  readonly subscribeToHealthChanges: () => Stream.Stream<
    HealthChangeEvent,
    never,
    never
  >
}

export const HealthAggregatorService = Context.GenericTag<HealthAggregatorService>(
  'HealthAggregatorService'
)

// Health Storage Service
export interface HealthStorageService {
  readonly storeHealthSnapshot: (
    snapshot: HealthSnapshot
  ) => Effect.Effect<void, StorageError, never>

  readonly getHealthHistory: (
    modelId: string,
    timeRange: TimeRange
  ) => Effect.Effect<readonly HealthSnapshot[], StorageError, never>

  readonly getHealthTrends: (
    modelId: string,
    window: Duration.Duration
  ) => Effect.Effect<HealthTrends, StorageError, never>
}

export const HealthStorageService = Context.GenericTag<HealthStorageService>(
  'HealthStorageService'
)
```

#### Schema Definitions

```typescript
import * as Schema from '@effect/schema/Schema'

// Probe Configuration
export const ProbeConfigSchema = Schema.Struct({
  modelId: Schema.String,
  prompt: Schema.String.pipe(Schema.default("ping")),
  maxTokens: Schema.Number.pipe(Schema.default(1)),
  temperature: Schema.Number.pipe(Schema.default(0)),
  timeout: Schema.Duration,
  metadata: Schema.Record(Schema.String, Schema.Unknown).pipe(
    Schema.default({ probe: "canary", service: "otel-ai" })
  )
})

// Health Status
export const HealthStatusSchema = Schema.Literal(
  "healthy",
  "degraded",
  "unhealthy",
  "unknown"
)

// Model Health Status
export const ModelHealthStatusSchema = Schema.Struct({
  modelId: Schema.String,
  provider: Schema.String,
  status: HealthStatusSchema,
  latency: Schema.Struct({
    p50: Schema.Number,
    p90: Schema.Number,
    p99: Schema.Number
  }),
  errorRate: Schema.Number,
  availability: Schema.Number,
  lastCheck: Schema.Date,
  lastSuccessfulResponse: Schema.optional(Schema.Date),
  consecutiveFailures: Schema.Number,
  metadata: Schema.Record(Schema.String, Schema.Unknown)
})

// Prometheus Metrics
export const PortkeyMetricsSchema = Schema.Struct({
  timestamp: Schema.Date,
  providers: Schema.Array(Schema.Struct({
    name: Schema.String,
    models: Schema.Array(Schema.Struct({
      id: Schema.String,
      requestCount: Schema.Record(Schema.String, Schema.Number),
      latencyHistogram: Schema.Record(Schema.String, Schema.Number),
      errorCount: Schema.Number,
      successCount: Schema.Number
    }))
  }))
})

// Health Snapshot for Storage
export const HealthSnapshotSchema = Schema.Struct({
  timestamp: Schema.Date,
  modelId: Schema.String,
  status: HealthStatusSchema,
  metrics: Schema.Struct({
    latencyP50: Schema.Number,
    latencyP90: Schema.Number,
    latencyP99: Schema.Number,
    errorRate: Schema.Number,
    requestCount: Schema.Number,
    availability: Schema.Number
  }),
  probeResult: Schema.optional(Schema.Struct({
    success: Schema.Boolean,
    latency: Schema.Number,
    error: Schema.optional(Schema.String)
  }))
})

// Health Change Event
export const HealthChangeEventSchema = Schema.Struct({
  modelId: Schema.String,
  previousStatus: HealthStatusSchema,
  currentStatus: HealthStatusSchema,
  timestamp: Schema.Date,
  reason: Schema.String
})
```

#### Error Types

```typescript
// Canary Probe Errors
export class CanaryProbeError extends Schema.TaggedError<CanaryProbeError>()(
  "CanaryProbeError",
  {
    modelId: Schema.String,
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
    retryable: Schema.Boolean
  }
) {}

// Local Health Check Errors
export class LocalHealthCheckError extends Schema.TaggedError<LocalHealthCheckError>()(
  "LocalHealthCheckError",
  {
    service: Schema.Literal("lmstudio", "ollama"),
    endpoint: Schema.String,
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown)
  }
) {}

// Metrics Errors
export class MetricsScrapeError extends Schema.TaggedError<MetricsScrapeError>()(
  "MetricsScrapeError",
  {
    endpoint: Schema.String,
    message: Schema.String,
    statusCode: Schema.optional(Schema.Number)
  }
) {}

export class MetricsParseError extends Schema.TaggedError<MetricsParseError>()(
  "MetricsParseError",
  {
    message: Schema.String,
    line: Schema.optional(Schema.Number),
    cause: Schema.optional(Schema.Unknown)
  }
) {}

// Aggregation Errors
export class HealthAggregationError extends Schema.TaggedError<HealthAggregationError>()(
  "HealthAggregationError",
  {
    modelId: Schema.optional(Schema.String),
    message: Schema.String,
    sources: Schema.Array(Schema.String)
  }
) {}

// Storage Errors
export class HealthStorageError extends Schema.TaggedError<HealthStorageError>()(
  "HealthStorageError",
  {
    operation: Schema.Literal("insert", "query", "aggregate"),
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown)
  }
) {}
```

## Implementation Plan

### Phase 1: Core Services Implementation
- [ ] Define service interfaces with Context.GenericTag
- [ ] Create Schema definitions for all health data models
- [ ] Define error types as discriminated unions
- [ ] Implement configuration management with environment variables
- [ ] Set up basic project structure and exports

### Phase 2: Canary Probe Service
- [ ] Implement minimal token probe generation
- [ ] Add Portkey gateway integration with metadata tagging
- [ ] Implement scheduled probing with Effect.Schedule
- [ ] Add exponential backoff for failed probes
- [ ] Create probe result caching with TTL

### Phase 3: Local Model Health Service
- [ ] Implement LM Studio health endpoint polling
- [ ] Implement Ollama API tags endpoint polling
- [ ] Add scheduled polling with configurable intervals
- [ ] Implement connection pooling and timeout handling
- [ ] Cache local model availability status

### Phase 4: OpenTelemetry Metrics Integration
- [ ] Configure Portkey to export OTLP metrics to OTel Collector
- [ ] Process metrics through OTel Collector pipeline
- [ ] Store metrics in ClickHouse via OTel exporter
- [ ] Query metrics from ClickHouse for health calculations
- [ ] Detect circuit breaker activation patterns from metrics

### Phase 5: Health Aggregator Service
- [ ] Combine probe results with metrics data
- [ ] Implement health status determination logic
- [ ] Add weighted scoring for health degradation
- [ ] Create health change event stream
- [ ] Implement summary generation for UI

### Phase 6: Storage and Persistence
- [ ] Design ClickHouse schema for health history
- [ ] Implement batch insertion of health snapshots
- [ ] Add time-series queries for trending
- [ ] Implement data retention policies
- [ ] Add aggregation queries for reporting

### Phase 7: API Integration
- [ ] Implement `/api/llm-manager/health/detailed` endpoint
- [ ] Implement `/api/llm-manager/health/summary` endpoint
- [ ] Implement `/api/llm-manager/health/probe` trigger endpoint
- [ ] Implement `/api/llm-manager/metrics` passthrough endpoint
- [ ] Add WebSocket support for real-time updates

### Phase 8: Testing and Monitoring
- [ ] Unit tests for all service methods
- [ ] Integration tests with mock Portkey responses
- [ ] Load testing for high-frequency probing
- [ ] Add observability spans for monitoring operations
- [ ] Implement Prometheus alerting rules

## Testing Strategy

### Unit Testing Approach
- Mock Portkey gateway responses using Layer.succeed
- Test probe scheduling and cancellation
- Validate metrics parsing with sample Prometheus data
- Test health status calculation logic
- Verify error handling and retry mechanisms

### Integration Testing Approach
- Test with real Portkey gateway in test environment
- Validate local model endpoint discovery
- Test full health aggregation pipeline
- Verify ClickHouse storage operations
- Test WebSocket event streaming

### Test Data Requirements
- Sample Prometheus metrics in text format
- Mock LLM response fixtures
- Local model endpoint mock servers
- Historical health data for trend testing
- Circuit breaker activation scenarios

## Portkey Configuration

### Enable OTLP Metrics Export

Configure Portkey Gateway to export metrics to the OpenTelemetry Collector:

```yaml
# config/portkey/config.json or environment variables
{
  "telemetry": {
    "metrics": {
      "enabled": true,
      "exporter": "otlp",
      "endpoint": "http://otel-collector:4317",  # gRPC endpoint
      "interval": "10s",
      "labels": {
        "service.name": "portkey-gateway",
        "service.namespace": "llm-manager"
      }
    }
  }
}
```

### OpenTelemetry Collector Configuration

Add metrics pipeline to process Portkey metrics:

```yaml
# config/otel-collector/config.yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 10s

  attributes:
    actions:
      - key: service.name
        value: portkey-gateway
        action: upsert

exporters:
  clickhouse:
    endpoint: tcp://clickhouse:9000
    database: otel
    metrics_table: metrics
    timeout: 10s

service:
  pipelines:
    metrics:
      receivers: [otlp]
      processors: [batch, attributes]
      exporters: [clickhouse]
```

## Dependencies

### External Dependencies
- `@effect/platform` - HTTP client for endpoint polling
- `ws` - WebSocket support for real-time updates
- Existing Portkey gateway configuration with OTLP export
- OpenTelemetry Collector with metrics pipeline
- ClickHouse client for persistence

### Internal Dependencies
- `llm-manager/portkey-gateway-client` - Gateway integration
- `storage/clickhouse` - Database operations
- `config-manager` - Configuration management
- `observability` - Tracing and metrics

## Migration Strategy

Since this is a new feature, migration involves:

1. **Gradual Rollout**: Enable health monitoring per model
2. **Backward Compatibility**: Maintain existing model selection
3. **Feature Flag**: Toggle health-based routing
4. **Data Migration**: Backfill historical health data if available

## Performance Considerations

- **Probe Frequency**: 5-15 second intervals for cloud models
- **Local Polling**: 10 second intervals for local models
- **Metrics Scraping**: 30 second intervals from Portkey
- **Cache TTL**: 30 seconds for current status
- **Batch Inserts**: Aggregate 100 snapshots before ClickHouse write
- **Connection Pooling**: Reuse HTTP connections for polling
- **Circuit Breaking**: Stop probing after 5 consecutive failures

## Security Considerations

- **API Keys**: Secure storage of provider API keys
- **Rate Limiting**: Respect provider rate limits
- **Probe Tokens**: Minimize token usage to reduce costs
- **Metrics Access**: Authenticate Prometheus endpoint access
- **Audit Logging**: Track all health check operations

## Monitoring & Observability

### Key Metrics to Track
- `llm.health.probe.duration` - Canary probe latency
- `llm.health.probe.success.rate` - Probe success percentage
- `llm.health.status.changes` - Health status transitions
- `llm.health.checks.total` - Total health checks performed
- `llm.health.storage.lag` - Delay in persisting snapshots

### Log Levels and Messages
- INFO: Health status changes, probe completions
- WARN: Degraded health detected, high error rates
- ERROR: Probe failures, endpoint unreachable
- DEBUG: Detailed metrics parsing, calculation steps

### Tracing Requirements
- Span per health check operation
- Nested spans for probe, metrics, aggregation
- Baggage propagation for model ID tracking

### Alert Thresholds
- Model unhealthy for > 2 minutes
- Error rate > 10% for 5 minutes
- All models unavailable (critical)
- Probe latency > 5 seconds
- Storage lag > 60 seconds

## Prometheus Alerting Rules

```yaml
groups:
  - name: llm_health
    interval: 30s
    rules:
      - alert: LLMModelUnhealthy
        expr: llm_health_status{status="unhealthy"} == 1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "LLM Model {{ $labels.model_id }} is unhealthy"
          description: "Model has been unhealthy for more than 2 minutes"

      - alert: LLMHighErrorRate
        expr: rate(llm_requests_total{status=~"5.."}[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate for model {{ $labels.model_id }}"
          description: "Error rate exceeds 10% over 5 minutes"

      - alert: AllLLMModelsUnavailable
        expr: sum(llm_health_status{status="healthy"}) == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "All LLM models are unavailable"
          description: "No healthy LLM models detected"

      - alert: LLMProbeLatencyHigh
        expr: histogram_quantile(0.99, llm_probe_duration_seconds) > 5
        for: 3m
        labels:
          severity: warning
        annotations:
          summary: "LLM probe latency is high"
          description: "P99 probe latency exceeds 5 seconds"
```

## UI Component Requirements

### Health Dashboard Component
```typescript
interface HealthDashboardProps {
  refreshInterval?: number // Default: 5000ms
  showDetails?: boolean
  onModelSelect?: (modelId: string) => void
}

// Display requirements:
// - Traffic light status indicators (green/yellow/red/gray)
// - Sparkline charts for latency trends
// - Error rate percentage with trend arrow
// - Last check timestamp with auto-refresh
// - Expandable details per model
```

### Health Status Badge Component
```typescript
interface HealthBadgeProps {
  modelId: string
  size?: 'small' | 'medium' | 'large'
  showTooltip?: boolean
  onClick?: () => void
}

// Display requirements:
// - Colored dot/badge based on status
// - Hover tooltip with details
// - Click to view full health report
```

### Health Timeline Component
```typescript
interface HealthTimelineProps {
  modelId: string
  timeRange: '1h' | '6h' | '24h' | '7d'
  resolution?: number // Data points
}

// Display requirements:
// - Time-series chart of health status
// - Color-coded status periods
// - Incident markers with annotations
// - Interactive zoom and pan
```

## Documentation Requirements

- API documentation with OpenAPI specs
- Health monitoring user guide
- Troubleshooting guide for common issues
- Configuration reference with examples
- Metrics and alerting documentation

## Success Criteria

- [ ] All health check services operational
- [ ] < 100ms latency for cached health queries
- [ ] 99.9% uptime for monitoring system
- [ ] Accurate health status within 30 seconds
- [ ] All integration tests passing
- [ ] UI components displaying real-time health
- [ ] Alerting rules triggering correctly
- [ ] Documentation complete and reviewed

## Notes

- Consider implementing health prediction using historical data
- Evaluate custom metrics from model responses (e.g., coherence scores)
- Plan for multi-region health checking in future
- Consider cost optimization for canary probes
- Implement health-based auto-scaling triggers
- Add support for custom health check definitions per model