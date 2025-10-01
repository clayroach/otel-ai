# Record-Replay Package - Claude Context

## Package Overview
Unified record-replay system for capturing, generating, and replaying OTLP data. Combines seed generation, live capture, and orchestrated replay for training data, testing, and validation workflows.
This file is automatically read by Claude Code when working in this package.

## Mandatory Package Conventions
CRITICAL: These conventions MUST be followed in this package:
- **ONLY export Effect Layers for external consumption** (no factory functions)
- External packages must use service Layers (OtlpCaptureServiceLive, OtlpReplayServiceLive, SeedGeneratorLive)
- All async operations use Effect-TS with proper error handling
- Data is always compressed with gzip before storage
- Tests go in test/unit/ and test/integration/ subdirectories
- Sessions are tied to diagnostic sessions via sessionId linkage
- Timestamp adjustment must preserve relative timing between spans
- CLI commands provide complete workflow orchestration

## Core Primitives & Patterns

### Seed Generation Pattern
```typescript
// Generate deterministic seed data
const program = Effect.gen(function* () {
  const seedGen = yield* SeedGeneratorTag

  const session = yield* seedGen.generateSeed({
    patternName: 'basic-topology',
    duration: 60,
    tracesPerSecond: 10,
    errorRate: 0.05,
    captureToMinIO: true
  })

  console.log(`Session: ${session.sessionId}`)
})
```

### Replay Orchestration Pattern
```typescript
// Replay session with orchestration
const program = Effect.gen(function* () {
  const orchestrator = yield* ReplayOrchestratorTag

  const status = yield* orchestrator.startReplay({
    sessionId: 'auto',
    selectionStrategy: 'latest',
    maxDuration: 300,
    speedMultiplier: 1.0,
    targetEndpoint: 'http://otel-collector:4318',
    timestampAdjustment: 'current'
  })
})
```

### Storage Structure
```
s3://otel-data/sessions/{session-id}/
├── metadata.json
└── raw/YYYY-MM-DD/HH/
    ├── traces-{timestamp}-{uuid}.otlp.gz
    ├── metrics-{timestamp}-{uuid}.otlp.gz
    └── logs-{timestamp}-{uuid}.otlp.gz
```

## Known Issues & Workarounds

### Timestamp Adjustment
- **Problem**: Original timestamps become stale during replay
- **Workaround**: Three modes: 'none', 'relative', 'current'
- **Fix**: Use 'current' for validation, 'relative' for temporal analysis

### Large Session Volumes
- **Problem**: Sessions can generate GB of data
- **Workaround**: Gzip compression, streaming APIs, session filtering
- **Fix**: Auto-selection strategies (latest, largest, smallest, random)

## Common Pitfalls

❌ **DON'T**: Store uncompressed OTLP data
✅ **DO**: Always use gzip compression (automatic)

❌ **DON'T**: Manually create session metadata
✅ **DO**: Use CLI commands (seed/replay) for orchestration

❌ **DON'T**: Replay without timestamp adjustment
✅ **DO**: Use 'current' adjustment for validation workflows

❌ **DON'T**: Create separate training data formats
✅ **DO**: Use sessionId linkage pattern (metadata + annotations)

## Quick Command Reference

### Seed Generation
```bash
# Quick 10-second seed
pnpm seed:quick

# Basic 30-second seed with 5 traces/sec
pnpm seed:basic

# Custom seed
pnpm seed -- --pattern basic-topology --duration 60 --rate 10 --error-rate 0.1
```

### Replay
```bash
# Replay latest session
pnpm replay

# Replay specific session
pnpm replay -- --session abc-123

# Heavy load testing (largest session, 2x speed, loop)
pnpm replay:heavy

# Seed-only replay (validation)
pnpm replay:seed
```

### MinIO Inspection
```bash
# List sessions
docker exec -it otel-ai-minio mc ls local/otel-data/sessions/

# View metadata
docker exec -it otel-ai-minio mc cat local/otel-data/sessions/{id}/metadata.json

# Count files
docker exec -it otel-ai-minio mc ls --recursive local/otel-data/sessions/{id}/raw/ | wc -l
```

## End-to-End Record/Replay Workflow

### Validation Workflow (Issue #103)
```bash
# 1. Start platform services
pnpm dev:up

# 2. Generate seed with phased feature flags (30s total)
#    - 10s startup (0% paymentFailure)
#    - 10s failure mode (75% paymentFailure)
#    - 10s rampdown (0% paymentFailure)
pnpm seed -- --pattern payment-failure --duration 30 --description "Validation seed for #103"

# 3. Replay session for validation
pnpm replay:seed -- --duration 60

# 4. Verify data in ClickHouse and UI
open http://localhost:5173
```

### Training Data Workflow
Sessions created with seed or capture automatically work with training:
- Session metadata stored in MinIO (metadata.json)
- Phase annotations stored in ClickHouse (test.phase.*)
- Training code links via sessionId
- No duplication, no exports, no manifests

## Dependencies & References
- `@aws-sdk/client-s3` - S3/MinIO client
- `@effect/schema` - Schema validation
- `effect` - Effect-TS runtime
- `commander` - CLI argument parsing
- `zlib` - Compression/decompression
- Full documentation: See README.md
