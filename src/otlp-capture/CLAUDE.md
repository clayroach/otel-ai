# OTLP Capture Package - Claude Context

## Package Overview
Captures raw OTLP data to MinIO/S3 during diagnostic sessions for replay and analysis.
This file is automatically read by Claude Code when working in this package.

## Mandatory Package Conventions
CRITICAL: These conventions MUST be followed in this package:
- **ONLY export Effect Layers for external consumption** (no factory functions)
- External packages must use OtlpCaptureServiceLive/OtlpReplayServiceLive Layers
- All async operations use Effect-TS with proper error handling
- Data is always compressed with gzip before storage
- Tests go in test/unit/ and test/integration/ subdirectories
- Sessions are tied to diagnostic sessions from annotations package
- Timestamp adjustment must preserve relative timing between spans

## Core Primitives & Patterns

### Service Pattern
```typescript
// Capture service usage
const program = Effect.gen(function* () {
  const capture = yield* OtlpCaptureServiceTag
  const session = yield* capture.startCapture({
    sessionId: 'test-session',
    enabledFlags: ['paymentServiceFailure'],
    captureTraces: true,
    compressionEnabled: true
  })
  // Capture OTLP data
  yield* capture.captureOTLPData(sessionId, otlpBytes, 'traces')
})

// Provide the layer
program.pipe(
  Effect.provide(OtlpCaptureServiceLive),
  Effect.provide(S3StorageLive)
)
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
- **Fix**: Preserve span durations when adjusting

### Large Data Volumes
- **Problem**: Sessions can generate GB of data
- **Workaround**: Gzip compression, streaming APIs
- **Fix**: Implement data sampling options

## Training Data Integration Pattern

🔑 **CRITICAL: Use existing infrastructure for training data - DO NOT over-engineer!**

Training datasets leverage the sessionId linkage pattern:

```typescript
// 1. Capture session stores metadata + raw OTLP in MinIO
const session = yield* capture.startCapture({
  sessionId: 'training-abc123',
  enabledFlags: ['paymentServiceFailure']
})

// 2. Phase annotations mark timeline transitions in ClickHouse
yield* annotations.annotate({
  annotationType: 'test',
  annotationKey: 'test.phase.baseline',
  annotationValue: JSON.stringify({
    sessionId: 'training-abc123',
    flagValue: 0.0
  })
})

// 3. Training code reads both via sessionId linkage
const metadata = yield* s3.get(`sessions/training-abc123/metadata.json`)
const phases = yield* clickhouse.query(`
  SELECT * FROM annotations
  WHERE annotation_value LIKE '%training-abc123%'
  AND annotation_key LIKE 'test.phase.%'
`)
```

**Key Benefits**:
- ❌ **NO data duplication** - reuse raw OTLP files
- ❌ **NO export formats** - consume OTLP directly
- ❌ **NO manifest files** - metadata.json + annotations suffice
- ✅ **sessionId links everything** - MinIO metadata, ClickHouse annotations, OTLP files

## Common Pitfalls

❌ **DON'T**: Store uncompressed OTLP data
✅ **DO**: Always gzip before storage

❌ **DON'T**: Load entire sessions into memory
✅ **DO**: Use streaming APIs for large datasets

❌ **DON'T**: Replay without timestamp adjustment
✅ **DO**: Use 'current' or 'relative' adjustment

❌ **DON'T**: Create separate training data exports
✅ **DO**: Use sessionId linkage pattern for training data

## Quick Command Reference

```bash
# Testing
pnpm test otlp-capture           # Unit tests
pnpm test:integration otlp-capture # Integration tests

# MinIO access
docker exec -it otel-ai-minio mc alias set local http://localhost:9000 otel-ai otel-ai-secret
docker exec -it otel-ai-minio mc ls local/otel-data/sessions/

# View captured data
docker exec -it otel-ai-minio mc cat local/otel-data/sessions/{id}/metadata.json
```

## Dependencies & References
- `@aws-sdk/client-s3` - S3/MinIO client
- `@effect/schema` - Schema validation
- `effect` - Effect-TS runtime
- `zlib` - Compression/decompression
- Full documentation: See README.md