# Topology Analyzer Package

Statistical analysis of service architecture and telemetry data. Discovers service dependencies, identifies performance bottlenecks, and generates topology visualizations from OpenTelemetry trace data.

## Current Implementation Status

✅ **Complete**: Service topology mapping, statistical analysis, dependency discovery, and comprehensive testing
🚀 **Future Enhancement**: LLM-powered insights and autoencoder anomaly detection for advanced ML capabilities

## Quick Start

```bash
# Install dependencies
pnpm add @otel-ai/topology-analyzer
```

## Usage

### Basic Topology Analysis

```typescript
import { TopologyAnalyzerClient, TopologyAnalyzerClientLive } from '@otel-ai/topology-analyzer'
import { Effect } from 'effect'

const program = Effect.gen(function* () {
  const analyzer = yield* TopologyAnalyzerClient

  // Get service topology
  const topology = yield* analyzer.getTopology({
    startTime: '2025-01-01T00:00:00Z',
    endTime: '2025-01-01T01:00:00Z'
  })

  // Statistical architecture analysis
  const analysis = yield* analyzer.analyze({
    type: 'architecture',
    timeRange: {
      startTime: '2025-01-01T00:00:00Z',
      endTime: '2025-01-01T01:00:00Z'
    }
  })

  return { topology, analysis }
})

const main = program.pipe(Effect.provide(TopologyAnalyzerClientLive()))
Effect.runPromise(main).then(console.log)
```

### Using the Service Layer

```typescript
import { TopologyAnalyzerService, TopologyAnalyzerLayer } from '@otel-ai/topology-analyzer'
import { StorageLayer } from '@otel-ai/storage'
import { Effect, Layer } from 'effect'

const program = Effect.gen(function* () {
  const analyzer = yield* TopologyAnalyzerService

  const result = yield* analyzer.analyzeArchitecture({
    type: 'architecture',
    timeRange: {
      startTime: new Date('2025-01-01T00:00:00Z'),
      endTime: new Date('2025-01-01T01:00:00Z')
    }
  })

  return result
})

// Provide necessary layers
const AppLayer = Layer.merge(
  TopologyAnalyzerLayer(),
  StorageLayer
)

Effect.runPromise(program.pipe(Effect.provide(AppLayer)))
```

## Key Features

- **Service Topology Mapping**: Automatic discovery and visualization of service dependencies
- **Statistical Analysis**: Performance bottlenecks, error rate analysis, latency patterns
- **Dependency Discovery**: Call graphs, critical paths, service relationships
- **Architecture Insights**: Service classifications, complexity metrics, health summaries
- **Effect-TS Integration**: Type-safe analysis pipelines with structured error handling

## Architecture

### Service Layer Design

```typescript
export interface TopologyAnalyzerService extends Context.Tag<"TopologyAnalyzerService", {
  // Architecture analysis with statistical insights
  readonly analyzeArchitecture: (
    request: AnalysisRequest
  ) => Effect.Effect<AnalysisResult, AnalysisError, never>

  // Service topology discovery
  readonly getServiceTopology: (
    request: { startTime: Date; endTime: Date }
  ) => Effect.Effect<ReadonlyArray<ServiceTopology>, AnalysisError, never>
}>{}
```

### Statistical Insights

The analyzer generates insights based on statistical analysis:

- **High Latency Services**: Services with p95 latency > 1000ms
- **Error-Prone Services**: Services with error rate > 5%
- **Complex Dependencies**: Services with > 5 downstream dependencies
- **Data Flow Analysis**: Critical paths and bottlenecks in service communication

## API Reference

### Core Types

```typescript
interface AnalysisRequest {
  type: 'architecture' | 'performance' | 'reliability'
  timeRange: {
    startTime: Date
    endTime: Date
  }
  filters?: Record<string, unknown>
  config?: {
    analysis?: {
      timeWindowHours: number
      minSpanCount: number
    }
    output?: {
      format: 'markdown' | 'json'
      includeDigrams: boolean
      detailLevel: 'summary' | 'detailed' | 'comprehensive'
    }
  }
}

interface AnalysisResult {
  requestId: string
  type: string
  summary: string
  architecture: ApplicationArchitecture
  insights: ReadonlyArray<Insight>
  metadata: {
    analyzedSpans: number
    analysisTimeMs: number
    confidence: number
  }
}

interface ServiceTopology {
  service: string
  type: 'frontend' | 'api' | 'backend' | 'database' | 'queue' | 'cache' | 'external'
  operations: string[]
  dependencies: Array<{
    service: string
    operation: string
    callCount: number
    avgLatencyMs: number
    errorRate: number
  }>
  metadata: {
    avgLatencyMs?: number
    p95LatencyMs?: number
    errorRate?: number
    totalSpans: number
    throughput?: number
  }
}

type AnalysisError =
  | { _tag: "InsufficientData"; message: string }
  | { _tag: "QueryError"; message: string; cause: unknown }
  | { _tag: "ConfigurationError"; message: string }
```

### API Endpoints

The topology analyzer provides HTTP endpoints via `TopologyAnalyzerRouterLive`:

- `GET /api/topology/health` - Health check
- `POST /api/topology/analyze` - Architecture analysis
- `POST /api/topology/services` - Service topology discovery
- `POST /api/topology/visualization` - Topology visualization data
- `GET /api/topology/performance` - Query performance metrics

## Configuration

### Environment Variables

```bash
# Service Configuration
TOPOLOGY_ANALYZER_PORT=4319
```

### Analysis Configuration

```typescript
const analysisConfig = {
  analysis: {
    timeWindowHours: 24,  // Time window for analysis
    minSpanCount: 100     // Minimum spans required
  },
  output: {
    format: 'json',
    includeDigrams: true,
    detailLevel: 'detailed'
  }
}
```

## Testing

### Unit Tests

```bash
# Run unit tests
pnpm test -- src/topology-analyzer/test/unit

# With coverage
pnpm test -- src/topology-analyzer/test/unit --coverage
```

### Integration Tests

```bash
# Requires ClickHouse running
pnpm test:integration -- src/topology-analyzer/test/integration
```

## Troubleshooting

### Common Issues

#### UI Time Range Picker Returns No Data

- **Cause**: Historical data not appearing when using absolute time ranges (startTime/endTime)
- **Root Cause**: ClickHouse queries were using `now() - INTERVAL X HOUR` instead of absolute timestamps
- **Solution**: This has been fixed (2025-10-01). Queries now use `parseDateTimeBestEffort()` for ISO 8601 timestamps
- **Verification**: Test with `curl -X POST http://localhost:4319/api/topology/visualization -H "Content-Type: application/json" -d '{"timeRange":{"startTime":"2025-10-01T01:00:00.000Z","endTime":"2025-10-01T02:00:00.000Z"}}'`

#### Insufficient Data
- **Cause**: Not enough spans in the requested time range
- **Solution**: Increase time window or reduce minSpanCount
- **Prevention**: Ensure trace collection is working

#### Query Timeout
- **Cause**: Large time windows causing slow ClickHouse queries
- **Solution**: Reduce time window or add more specific filters
- **Prevention**: Use aggregated tables for common queries

#### Missing Dependencies
- **Cause**: Services not sending trace context correctly
- **Solution**: Verify OpenTelemetry instrumentation setup
- **Prevention**: Validate trace propagation in tests

## Integration with Platform

The Topology Analyzer integrates with:

- **Storage**: Queries ClickHouse for span data and service metrics
- **UI**: Provides topology visualizations for dashboard rendering
- **Server**: Exposes HTTP API for analysis requests

## Change Log

### 2025-09-30 - Refactor to Topology Analyzer
- Renamed from ai-analyzer to topology-analyzer
- Removed unused LLM integration code
- Simplified to pure statistical analysis
- Cleaned up 800+ lines of unused code
- Updated API paths: `/api/ai-analyzer/*` → `/api/topology/*`

### 2025-09-15 - Initial Implementation
- Service topology mapping with dependency discovery
- Statistical analysis and insights generation
- Comprehensive testing suite
- Production-ready API client

---

Part of the [otel-ai](../../README.md) AI-native observability platform.
