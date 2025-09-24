# OpenTelemetry Package - Claude Context

## Package Overview
Generated Protobuf TypeScript definitions for OTLP data handling with @bufbuild/protobuf.
This file is automatically read by Claude Code when working in this package.

## Mandatory Package Conventions
CRITICAL: These conventions MUST be followed in this package:
- **This package exports types only** (no Layers needed for pure type definitions)
- External packages import types directly from this package
- This is a GENERATED CODE package - do not manually edit proto/ files
- All proto files generated via `pnpm proto:generate`
- Tests go in test/unit/ and test/integration/ subdirectories
- Use BigInt for all nanosecond timestamps
- Prefer binary format over JSON for production

## Core Primitives & Patterns

### Import Pattern
```typescript
import {
  ExportTraceServiceRequest,
  ResourceSpans,
  Span,
  SpanKind,
  Status_StatusCode
} from '@otel-ai/opentelemetry'
```

### Creating OTLP Data
```typescript
const span = new Span({
  traceId: new Uint8Array(16),  // 16-byte trace ID
  spanId: new Uint8Array(8),     // 8-byte span ID
  name: "operation.name",
  startTimeUnixNano: BigInt(Date.now() * 1_000_000),
  endTimeUnixNano: BigInt((Date.now() + 100) * 1_000_000)
})
```

### Parsing OTLP Data
```typescript
// From binary (preferred)
const request = ExportTraceServiceRequest.fromBinary(binaryData)

// From JSON (development/debugging)
const request = ExportTraceServiceRequest.fromJson(jsonData)
```

## Known Issues & Workarounds

### BigInt JSON Serialization
- **Problem**: JSON.stringify doesn't handle BigInt
- **Workaround**: Use `.toJson()` method or custom replacer
- **Example**: `request.toJson()` instead of `JSON.stringify(request)`

### Memory with Large Datasets
- **Problem**: Loading entire OTLP batch into memory
- **Workaround**: Process in chunks, use streaming where possible
- **Fix**: Implement streaming parser (planned)

## Common Pitfalls

❌ **DON'T**: Manually edit generated proto files
❌ **DON'T**: Use Number for nanosecond timestamps (loses precision)
❌ **DON'T**: Parse JSON format in production (3x slower)
❌ **DON'T**: Forget to regenerate after proto updates

✅ **DO**: Use `pnpm proto:generate` to update definitions
✅ **DO**: Use BigInt for all timestamp operations
✅ **DO**: Use binary format for production systems
✅ **DO**: Validate proto compatibility before regenerating

## Quick Command Reference

```bash
# Generate/regenerate protobuf code
pnpm proto:generate

# Clean generated files
pnpm proto:clean

# Full rebuild
pnpm proto:rebuild

# Run tests
pnpm test opentelemetry
```

## Dependencies & References
- `@bufbuild/protobuf` - Runtime and code generation
- `@bufbuild/protoc-gen-es` - TypeScript generator
- Proto source: https://github.com/open-telemetry/opentelemetry-proto
- Full documentation: See README.md