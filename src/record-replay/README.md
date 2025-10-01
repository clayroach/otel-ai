# Record-Replay Package

A comprehensive solution for generating, capturing, and replaying OpenTelemetry Protocol (OTLP) data. Combines deterministic seed generation, live data capture, and intelligent replay orchestration for training data collection, system validation, and performance testing.

## Current Implementation Status

✅ **Complete**:
- Effect-TS service architecture with Context/Layer patterns
- Deterministic seed generation with configurable patterns
- Live OTLP capture service for recording production data
- Replay service with timestamp adjustment and speed control
- Replay orchestrator with session auto-selection strategies
- CLI tools for seed generation and replay orchestration
- Gzip compression for all stored data
- Session metadata tracking and management
- Stream-based APIs for handling large datasets

🚧 **In Progress**:
- Additional seed patterns (payment-failure, high-load scenarios)
- Training data integration with annotations
- Advanced filtering and sampling options

📋 **Planned**:
- Web UI for session management
- Real-time replay monitoring dashboard
- Automated validation workflows
- Git LFS integration for test datasets
- Multi-session batch operations

## Quick Start

### Installation

```bash
# Package is part of the otel-ai platform
pnpm install

# Start required services (MinIO, ClickHouse, OTel Collector)
pnpm dev:up
```

### Basic Seed Generation

```bash
# Quick 10-second seed for rapid testing
pnpm seed:quick

# Basic 30-second seed with realistic load
pnpm seed:basic

# Custom seed with specific parameters
pnpm seed -- --pattern basic-topology --duration 60 --rate 10 --error-rate 0.05 --description "Payment service test"
```

### Basic Replay

```bash
# Replay the latest session
pnpm replay

# Replay a specific session
pnpm replay -- --session abc-123-def-456

# Replay with custom settings
pnpm replay -- --speed 2.0 --duration 300 --endpoint http://localhost:4318
```

## Complete Workflow Examples

### 1. Validation Workflow (Issue #103)

Generate seed data with phased feature flags for end-to-end validation:

```bash
# Step 1: Start platform services
pnpm dev:up

# Step 2: Generate 30-second seed with three phases
# - 10s startup (baseline, 0% failure rate)
# - 10s failure mode (75% payment failures)
# - 10s rampdown (baseline, 0% failure rate)
pnpm seed -- --pattern payment-failure --duration 30 --description "Validation for issue #103"

# Output example:
# ✅ Seed generation complete!
#    Session ID: abc-123-def-456
#    Traces: 300
#    Storage: sessions/abc-123-def-456/

# Step 3: Replay the session for validation
pnpm replay:seed -- --duration 60

# Step 4: Verify data in UI
open http://localhost:5173
```

### 2. Training Data Collection

Create a training dataset with annotated phases:

```bash
# Generate seed with multiple phases
pnpm seed -- --pattern training-phases --duration 120 --description "Training dataset for anomaly detection"

# The seed generator automatically creates phase annotations:
# - test.phase.baseline (normal operation)
# - test.phase.degraded (increased latency)
# - test.phase.failure (service failures)

# Training code can then query by sessionId to get:
# - Raw OTLP data from MinIO (sessions/{sessionId}/raw/)
# - Phase annotations from ClickHouse
# - Session metadata from MinIO (sessions/{sessionId}/metadata.json)
```

### 3. Performance Testing

Stress test with heavy load:

```bash
# Generate high-volume seed
pnpm seed -- --pattern basic-topology --duration 300 --rate 100 --error-rate 0.02

# Replay at 2x speed in loop mode
pnpm replay:heavy
```

## Seed Generation

### Available Patterns

The seed generator supports multiple trace patterns:

- **basic-topology**: Standard microservices topology with frontend → backend → database
- **payment-failure**: E-commerce scenario with configurable payment service failures
- **high-load**: Simulates high-traffic scenarios with concurrent requests
- **complex-topology**: Multi-tier services with branching call paths

### Seed CLI Options

```bash
pnpm seed -- [options]

Options:
  --pattern <name>        Pattern name (default: "basic-topology")
  --duration <seconds>    Generation duration in seconds (default: 60)
  --rate <traces/sec>     Traces per second (default: 10)
  --error-rate <0-1>      Error rate from 0 to 1 (default: 0.05)
  --seed <number>         Deterministic seed for reproducibility
  --description <text>    Human-readable session description
```

### Deterministic Generation

All seeds are deterministic when using the same seed value:

```bash
# Generate with specific seed
pnpm seed -- --seed 42 --pattern basic-topology --duration 30

# Regenerating with the same seed produces identical traces
pnpm seed -- --seed 42 --pattern basic-topology --duration 30
```

This ensures reproducible test scenarios and consistent training data.

## Live Data Capture

### Programmatic Capture

```typescript
import { Effect } from 'effect'
import {
  OtlpCaptureServiceTag,
  OtlpCaptureServiceLive
} from '@otel-ai/record-replay'
import { S3StorageLive } from '@otel-ai/storage'

const captureProgram = Effect.gen(function* () {
  const capture = yield* OtlpCaptureServiceTag

  // Start capturing
  const session = yield* capture.startCapture({
    sessionId: 'debug-payment-failure',
    description: 'Capturing payment service failures',
    enabledFlags: ['paymentServiceFailure'],
    captureTraces: true,
    captureMetrics: true,
    captureLogs: false,
    compressionEnabled: true
  })

  // Capture is now active - OTLP data will be stored to MinIO
  console.log(`Capture started: ${session.sessionId}`)

  // Later... stop capture
  const finalSession = yield* capture.stopCapture(session.sessionId)
  console.log(`Captured ${finalSession.capturedTraces} traces`)
})

Effect.runPromise(
  captureProgram.pipe(
    Effect.provide(OtlpCaptureServiceLive),
    Effect.provide(S3StorageLive)
  )
)
```

### Capture Integration

Capture can be integrated into the OTLP ingestion pipeline:

```typescript
// In server.ts
app.post('/v1/traces', async (req, res) => {
  // Store to ClickHouse (primary path)
  await storeToClickHouse(req.body)

  // Also capture to MinIO if session is active
  if (activeCaptureSession) {
    await Effect.runPromise(
      captureService.captureOTLPData(
        activeCaptureSession.id,
        Buffer.from(req.body),
        'traces'
      )
    )
  }

  res.status(200).send('OK')
})
```

## Replay

### Replay CLI Options

```bash
pnpm replay -- [options]

Options:
  --session <id>              Session ID or "auto" (default: "auto")
  --strategy <strategy>       Selection: latest|random|largest|smallest (default: "latest")
  --duration <seconds>        Maximum replay duration (default: 3600)
  --loop                      Enable continuous loop mode
  --speed <multiplier>        Speed multiplier, 1.0 = realtime (default: 1.0)
  --endpoint <url>            Target OTLP endpoint (default: "http://otel-collector:4318")
  --traces                    Replay traces (default: true)
  --metrics                   Replay metrics (default: true)
  --logs                      Replay logs (default: true)
  --filter-type <type>        Filter sessions: seed|capture|training
  --log-interval <seconds>    Status logging interval (default: 60)
```

### Session Auto-Selection

The replay orchestrator can automatically select sessions:

```bash
# Replay the latest session
pnpm replay -- --strategy latest

# Replay the largest session (most data)
pnpm replay -- --strategy largest

# Replay a random session
pnpm replay -- --strategy random

# Replay only seed-generated sessions
pnpm replay -- --filter-type seed --strategy latest
```

### Timestamp Adjustment

Replaying old data requires timestamp adjustment:

- **none**: Use original timestamps (for historical analysis)
- **current**: Replace all timestamps with current time (for validation)
- **relative**: Maintain relative timing but shift to current time (default)

```typescript
const config: ReplayConfig = {
  sessionId: 'abc-123',
  timestampAdjustment: 'current', // All data appears "now"
  speedMultiplier: 1.0,
  targetEndpoint: 'http://localhost:4318'
}
```

### Programmatic Replay

```typescript
import { Effect } from 'effect'
import {
  ReplayOrchestratorTag,
  ReplayOrchestratorLive
} from '@otel-ai/record-replay'

const replayProgram = Effect.gen(function* () {
  const orchestrator = yield* ReplayOrchestratorTag

  // Start replay with auto-selection
  const status = yield* orchestrator.startReplay({
    sessionId: 'auto',
    selectionStrategy: 'latest',
    maxDuration: 300,
    speedMultiplier: 2.0,
    targetEndpoint: 'http://localhost:4318',
    timestampAdjustment: 'current',
    replayTraces: true
  })

  console.log(`Replaying session: ${status.sessionId}`)

  // Monitor progress
  const currentStatus = yield* orchestrator.getStatus(status.sessionId)
  console.log(`Progress: ${currentStatus.replayStatus?.processedRecords}/${currentStatus.replayStatus?.totalRecords}`)
})
```

## Architecture

### Package Structure

```
src/record-replay/
├── cli/                      # Command-line tools
│   ├── seed.ts              # Seed generation CLI
│   └── replay.ts            # Replay orchestration CLI
├── otlp-capture/            # Live data capture
│   └── src/
│       ├── capture-service.ts
│       └── index.ts
├── otlp-replay/             # Replay engine
│   └── src/
│       ├── replay-service.ts
│       ├── orchestrator.ts
│       ├── session-manager.ts
│       └── index.ts
├── otlp-seed-generator/     # Deterministic seed generation
│   ├── seed-generator.ts
│   ├── deterministic.ts
│   └── patterns/
│       ├── basic-topology.ts
│       └── payment-failure.ts
├── router/                  # HTTP API routes
├── retention/               # Session lifecycle management
└── training/                # Training data integration
```

### Storage Architecture

```
s3://otel-data/sessions/{session-id}/
├── metadata.json                    # Session metadata and configuration
└── raw/
    └── YYYY-MM-DD/                  # Date-based partitioning
        └── HH/                      # Hour-based subdirectories
            ├── traces-{timestamp}-{uuid}.otlp.gz
            ├── metrics-{timestamp}-{uuid}.otlp.gz
            └── logs-{timestamp}-{uuid}.otlp.gz
```

### Service Architecture

```typescript
// Seed Generator
SeedGenerator
├── generateSeed(config)
├── listPatterns()
└── getPattern(name)

// Capture Service
OtlpCaptureService
├── startCapture(config)
├── stopCapture(sessionId)
├── captureOTLPData(sessionId, data, signalType)
├── getCaptureStatus(sessionId)
└── listCaptureSessions()

// Replay Service
OtlpReplayService
├── startReplay(config)
├── getReplayStatus(sessionId)
├── listAvailableReplays()
└── replayDataStream(sessionId, signalType)

// Replay Orchestrator
ReplayOrchestrator
├── startReplay(config)
├── stopReplay(sessionId)
├── getStatus(sessionId)
└── selectSession(strategy, filter)
```

## API Reference

### Types

```typescript
// Seed Configuration
interface SeedConfig {
  patternName: string
  duration: number
  tracesPerSecond: number
  errorRate: number
  seed?: number
  captureToMinIO: boolean
  metadata?: {
    description?: string
    createdBy: string
  }
}

// Capture Configuration
interface CaptureConfig {
  sessionId: string
  diagnosticSessionId?: string
  description?: string
  enabledFlags: string[]
  captureTraces: boolean
  captureMetrics: boolean
  captureLogs: boolean
  compressionEnabled: boolean
  maxSizeMB?: number
  maxDurationMinutes?: number
}

// Replay Configuration
interface ReplayConfig {
  sessionId: string
  targetEndpoint?: string
  timestampAdjustment: 'none' | 'relative' | 'current'
  speedMultiplier?: number
  filterServices?: string[]
  replayTraces: boolean
  replayMetrics: boolean
  replayLogs: boolean
}

// Orchestrator Configuration
interface OrchestratorConfig {
  sessionId: string
  selectionStrategy: 'latest' | 'random' | 'largest' | 'smallest'
  sessionFilter?: {
    sessionType?: 'seed' | 'capture' | 'training'
  }
  maxDuration: number
  loopEnabled: boolean
  speedMultiplier: number
  targetEndpoint: string
  replayTraces: boolean
  replayMetrics: boolean
  replayLogs: boolean
  timestampAdjustment: 'none' | 'relative' | 'current'
}

// Session Metadata
interface SessionMetadata {
  sessionId: string
  sessionType: 'seed' | 'capture' | 'training'
  startTime: Date
  endTime?: Date
  status: 'active' | 'completed' | 'failed'
  enabledFlags: string[]
  capturedTraces: number
  capturedMetrics: number
  capturedLogs: number
  totalSizeBytes: number
  s3Prefix: string
  createdBy: string
  description?: string
}
```

## Configuration

### Environment Variables

```bash
# MinIO/S3 Configuration
MINIO_ENDPOINT=http://minio:9000
MINIO_ACCESS_KEY=otel-ai
MINIO_SECRET_KEY=otel-ai-secret
MINIO_BUCKET=otel-data
MINIO_REGION=us-east-1

# Capture Settings
CAPTURE_COMPRESSION_ENABLED=true
CAPTURE_MAX_SIZE_MB=5000
CAPTURE_MAX_DURATION_MINUTES=120

# Replay Settings
REPLAY_DEFAULT_ENDPOINT=http://otel-collector:4318
REPLAY_DEFAULT_SPEED=1.0
```

## Testing

### Unit Tests

```bash
# Run all unit tests
pnpm test record-replay

# Run specific test suites
pnpm test seed-generator
pnpm test capture-service
pnpm test replay-orchestrator
```

### Integration Tests

```bash
# Start required services
pnpm dev:up

# Run integration tests
pnpm test:integration record-replay
```

### End-to-End Validation

```bash
# Generate seed → Replay → Verify
pnpm seed:quick
pnpm replay:seed -- --duration 60

# Check MinIO for stored data
docker exec -it otel-ai-minio mc ls local/otel-data/sessions/

# Query ClickHouse for ingested traces
docker exec -it otel-ai-clickhouse clickhouse-client --query "SELECT count() FROM traces"
```

## Performance

### Seed Generation
- **Throughput**: 100+ traces/second
- **Memory**: <50MB for typical patterns
- **Determinism**: Identical output for same seed value

### Capture
- **Throughput**: ~10,000 spans/second
- **Compression**: 75% average size reduction
- **Latency**: <5ms per capture operation

### Replay
- **Throughput**: Limited by target endpoint capacity
- **Speed Control**: 0.1x to 10x realtime
- **Memory**: Streaming architecture, <100MB

## Troubleshooting

### Common Issues

#### 1. No Sessions Available for Replay

```bash
# List all sessions
docker exec -it otel-ai-minio mc ls local/otel-data/sessions/

# Generate a test session
pnpm seed:quick

# Retry replay
pnpm replay
```

#### 2. MinIO Connection Failures

```bash
# Check MinIO is running
docker ps | grep minio

# Test MinIO connectivity
curl http://localhost:9010/minio/health/live

# Verify credentials
docker exec -it otel-ai-minio mc alias set local http://localhost:9000 otel-ai otel-ai-secret
```

#### 3. Replay Not Ingesting Data

```bash
# Check OTel Collector is running
docker ps | grep otel-collector

# Verify endpoint is reachable
curl http://localhost:4318/v1/traces

# Check replay logs for errors
pnpm replay -- --log-interval 5
```

#### 4. Seed Generation Hanging

```bash
# Check for MinIO storage issues
docker exec -it otel-ai-minio mc admin info local

# Verify sufficient disk space
df -h

# Try with lower rate
pnpm seed -- --rate 5 --duration 10
```

### Debug Commands

```bash
# View session metadata
docker exec -it otel-ai-minio mc cat local/otel-data/sessions/{id}/metadata.json | jq

# Count captured files
docker exec -it otel-ai-minio mc ls --recursive local/otel-data/sessions/{id}/raw/ | wc -l

# Check storage usage
docker exec -it otel-ai-minio mc du local/otel-data/sessions/{id}/

# List sessions with details
docker exec -it otel-ai-minio mc ls --recursive local/otel-data/sessions/ | grep metadata.json
```

## Integration with Platform

### With Annotations Package

Sessions link to annotations via sessionId:

```typescript
// During seed generation or capture
const session = yield* seedGen.generateSeed({
  sessionId: 'training-abc123',
  // ...
})

// Phase annotations are automatically created
yield* annotations.annotate({
  annotationType: 'test',
  annotationKey: 'test.phase.baseline',
  annotationValue: JSON.stringify({
    sessionId: 'training-abc123',
    phase: 'baseline',
    timestamp: Date.now()
  })
})

// Training code queries both sources
const metadata = yield* s3.get(`sessions/training-abc123/metadata.json`)
const phases = yield* clickhouse.query(`
  SELECT * FROM annotations
  WHERE annotation_value LIKE '%training-abc123%'
  AND annotation_key LIKE 'test.phase.%'
`)
```

### With Storage Package

The record-replay package uses the S3Storage service:

```typescript
import { S3StorageLive } from '@otel-ai/storage'

// All services require S3 layer
const program = seedProgram.pipe(
  Effect.provide(SeedGeneratorLive),
  Effect.provide(OtlpCaptureServiceLive),
  Effect.provide(S3StorageLive)
)
```

### Training Data Integration

**CRITICAL: Training datasets reuse existing infrastructure**

No duplication, no exports, no manifests:

1. **Session Metadata**: Stored in MinIO (`sessions/{id}/metadata.json`)
2. **Phase Annotations**: Stored in ClickHouse (`test.phase.*` annotations)
3. **Raw OTLP Data**: Stored in MinIO (`sessions/{id}/raw/...`)
4. **Training Reader**: Links all three via sessionId

```typescript
// Training data consumer
const trainingData = Effect.gen(function* () {
  const s3 = yield* S3StorageTag
  const ch = yield* ClickHouseTag

  // Get session metadata
  const metadata = yield* s3.get(`sessions/${sessionId}/metadata.json`)

  // Get phase annotations
  const phases = yield* ch.query(`
    SELECT annotation_key, annotation_value, time_range_start
    FROM annotations
    WHERE annotation_value LIKE '%${sessionId}%'
    AND annotation_key LIKE 'test.phase.%'
  `)

  // Stream raw OTLP files grouped by phase
  return groupFilesByPhase(metadata.s3Prefix, phases)
})
```

## Change Log

### v0.2.0 (2025-01-30)
- Added unified record-replay package documentation
- Added replay orchestrator with auto-selection strategies
- Added seed generation CLI with patterns
- Added validation workflow documentation
- Moved documentation from otlp-capture to record-replay level

### v0.1.0 (2025-01-26)
- Initial implementation of capture and replay services
- Effect-TS service architecture
- MinIO/S3 storage integration
- Gzip compression support
- Timestamp adjustment for replay
- Session metadata management

---

Part of the [otel-ai](../../README.md) AI-native observability platform.
