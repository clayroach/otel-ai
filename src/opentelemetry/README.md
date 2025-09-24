# OpenTelemetry Package

Generated Protobuf TypeScript definitions for OpenTelemetry protocol (OTLP) data handling. Provides strongly-typed interfaces for traces, metrics, and logs using @bufbuild/protobuf.

## Current Implementation Status

✅ **Complete**: Static Protobuf code generation with full OTLP v1 protocol support for traces, metrics, and logs.

## Quick Start

```bash
# Install package
pnpm add @otel-ai/opentelemetry

# Regenerate protobuf definitions (if needed)
pnpm proto:generate
```

## Usage

### Import OTLP Types

```typescript
import {
  ExportTraceServiceRequest,
  ExportTraceServiceResponse,
  ResourceSpans,
  ScopeSpans,
  Span,
  Status,
  SpanKind
} from '@otel-ai/opentelemetry'
```

### Creating OTLP Traces

```typescript
import {
  ExportTraceServiceRequest,
  ResourceSpans,
  ScopeSpans,
  Span,
  Resource,
  InstrumentationScope,
  AnyValue
} from '@otel-ai/opentelemetry'

// Create a span
const span = new Span({
  traceId: new Uint8Array(16), // 16-byte trace ID
  spanId: new Uint8Array(8),   // 8-byte span ID
  name: "GET /api/users",
  kind: SpanKind.SERVER,
  startTimeUnixNano: BigInt(Date.now() * 1_000_000),
  endTimeUnixNano: BigInt((Date.now() + 100) * 1_000_000),
  attributes: [
    {
      key: "http.method",
      value: { stringValue: "GET" }
    },
    {
      key: "http.status_code",
      value: { intValue: BigInt(200) }
    }
  ],
  status: {
    code: Status_StatusCode.OK
  }
})

// Create resource spans
const resourceSpans = new ResourceSpans({
  resource: new Resource({
    attributes: [
      {
        key: "service.name",
        value: { stringValue: "api-service" }
      }
    ]
  }),
  scopeSpans: [
    new ScopeSpans({
      scope: new InstrumentationScope({
        name: "@otel-ai/instrumentation",
        version: "1.0.0"
      }),
      spans: [span]
    })
  ]
})

// Create export request
const request = new ExportTraceServiceRequest({
  resourceSpans: [resourceSpans]
})
```

### Parsing OTLP Data

```typescript
import { ExportTraceServiceRequest } from '@otel-ai/opentelemetry'

// Parse from binary (Protobuf)
const binaryData: Uint8Array = // ... received from collector
const request = ExportTraceServiceRequest.fromBinary(binaryData)

// Parse from JSON
const jsonData = // ... received as JSON
const request = ExportTraceServiceRequest.fromJson(jsonData)

// Access spans
for (const resourceSpan of request.resourceSpans) {
  const serviceName = resourceSpan.resource?.attributes
    ?.find(attr => attr.key === "service.name")
    ?.value?.stringValue

  for (const scopeSpan of resourceSpan.scopeSpans) {
    for (const span of scopeSpan.spans) {
      console.log(`${serviceName}: ${span.name} - ${span.duration}ns`)
    }
  }
}
```

### Working with Metrics

```typescript
import {
  ExportMetricsServiceRequest,
  ResourceMetrics,
  ScopeMetrics,
  Metric,
  Gauge,
  Sum,
  Histogram
} from '@otel-ai/opentelemetry'

// Create a gauge metric
const gauge = new Metric({
  name: "memory.usage",
  unit: "bytes",
  gauge: new Gauge({
    dataPoints: [
      {
        timeUnixNano: BigInt(Date.now() * 1_000_000),
        value: { asDouble: 1024.5 },
        attributes: [
          {
            key: "process.id",
            value: { stringValue: "12345" }
          }
        ]
      }
    ]
  })
})

// Create metrics export request
const metricsRequest = new ExportMetricsServiceRequest({
  resourceMetrics: [
    new ResourceMetrics({
      resource: new Resource({
        attributes: [
          {
            key: "service.name",
            value: { stringValue: "metrics-service" }
          }
        ]
      }),
      scopeMetrics: [
        new ScopeMetrics({
          metrics: [gauge]
        })
      ]
    })
  ]
})
```

### Working with Logs

```typescript
import {
  ExportLogsServiceRequest,
  ResourceLogs,
  ScopeLogs,
  LogRecord,
  SeverityNumber
} from '@otel-ai/opentelemetry'

// Create a log record
const logRecord = new LogRecord({
  timeUnixNano: BigInt(Date.now() * 1_000_000),
  severityNumber: SeverityNumber.INFO,
  severityText: "INFO",
  body: { stringValue: "Application started successfully" },
  attributes: [
    {
      key: "component",
      value: { stringValue: "startup" }
    }
  ]
})

// Create logs export request
const logsRequest = new ExportLogsServiceRequest({
  resourceLogs: [
    new ResourceLogs({
      resource: new Resource({
        attributes: [
          {
            key: "service.name",
            value: { stringValue: "log-service" }
          }
        ]
      }),
      scopeLogs: [
        new ScopeLogs({
          logRecords: [logRecord]
        })
      ]
    })
  ]
})
```

## Architecture

### Protobuf Code Generation

This package uses static code generation with `@bufbuild/protobuf` for optimal performance and type safety:

```bash
# Generate TypeScript from .proto files
pnpm proto:generate

# Files are generated in src/opentelemetry/proto/
```

### Generated Structure

```
src/opentelemetry/
├── proto/
│   ├── collector/          # Collector service definitions
│   │   ├── trace/v1/      # Trace collector service
│   │   ├── metrics/v1/    # Metrics collector service
│   │   └── logs/v1/       # Logs collector service
│   ├── trace/v1/          # Trace data types
│   ├── metrics/v1/        # Metrics data types
│   ├── logs/v1/           # Logs data types
│   ├── common/v1/         # Common data types
│   └── resource/v1/       # Resource definitions
└── index.ts               # Re-exports for convenience
```

## API Reference

### Core Types

#### Traces
- `ExportTraceServiceRequest` - Request to export traces
- `ResourceSpans` - Spans from a resource
- `ScopeSpans` - Spans from an instrumentation scope
- `Span` - Individual span data
- `Status` - Span status information
- `SpanKind` - Type of span (SERVER, CLIENT, etc.)

#### Metrics
- `ExportMetricsServiceRequest` - Request to export metrics
- `ResourceMetrics` - Metrics from a resource
- `ScopeMetrics` - Metrics from an instrumentation scope
- `Metric` - Individual metric data
- `Gauge`, `Sum`, `Histogram` - Metric types

#### Logs
- `ExportLogsServiceRequest` - Request to export logs
- `ResourceLogs` - Logs from a resource
- `ScopeLogs` - Logs from an instrumentation scope
- `LogRecord` - Individual log entry
- `SeverityNumber` - Log severity levels

#### Common
- `AnyValue` - Polymorphic value type
- `KeyValue` - Attribute key-value pairs
- `Resource` - Resource information
- `InstrumentationScope` - Scope information

### Type Conversions

```typescript
// Binary to/from object
const binary = request.toBinary()
const parsed = ExportTraceServiceRequest.fromBinary(binary)

// JSON to/from object
const json = request.toJson()
const parsed = ExportTraceServiceRequest.fromJson(json)

// JsonValue for flexible parsing
const jsonValue = request.toJsonValue()
```

## Integration with Storage Package

The OpenTelemetry types integrate seamlessly with the storage package:

```typescript
import { ExportTraceServiceRequest } from '@otel-ai/opentelemetry'
import { SimpleStorage } from '@otel-ai/storage'

// Parse OTLP data
const request = ExportTraceServiceRequest.fromBinary(otlpData)

// Store in ClickHouse
await storage.writeTracesToSimplifiedSchema(request.resourceSpans)
```

## Performance Considerations

### Binary vs JSON

| Format | Parse Time | Size | Use Case |
|--------|------------|------|----------|
| Binary (Protobuf) | ~10ms for 1000 spans | 1x (baseline) | Production, high-volume |
| JSON | ~50ms for 1000 spans | 2-3x larger | Development, debugging |

### Memory Usage

- **Streaming**: Process large datasets without loading everything into memory
- **Pooling**: Reuse objects when processing high-volume data
- **Lazy Parsing**: Only parse fields that are accessed

### BigInt Handling

All nanosecond timestamps use `BigInt` for precision:

```typescript
// Convert JavaScript Date to nanoseconds
const nanos = BigInt(Date.now() * 1_000_000)

// Convert nanoseconds to JavaScript Date
const date = new Date(Number(nanos / 1_000_000n))
```

## Testing

### Unit Tests

```bash
# Run protobuf parsing tests
pnpm test opentelemetry

# Test specific functionality
pnpm test proto-parsing
pnpm test type-conversion
```

### Integration Tests

```bash
# Test with real OTLP data
pnpm test:integration opentelemetry
```

## Configuration

### Proto Files Location

The package expects OpenTelemetry proto files in:
```
proto/opentelemetry-proto/
├── opentelemetry/
│   └── proto/
│       ├── collector/
│       ├── common/
│       ├── logs/
│       ├── metrics/
│       ├── resource/
│       └── trace/
```

### Build Configuration

```json
{
  "scripts": {
    "proto:generate": "buf generate proto/opentelemetry-proto",
    "proto:clean": "rm -rf src/opentelemetry/proto",
    "proto:rebuild": "pnpm proto:clean && pnpm proto:generate"
  }
}
```

## Troubleshooting

### Common Issues

#### Type Mismatch Errors
- **Cause**: Version mismatch between generated code and proto files
- **Solution**: Regenerate with `pnpm proto:generate`

#### BigInt Serialization
- **Cause**: JSON.stringify doesn't handle BigInt
- **Solution**: Use `.toJson()` method or custom replacer

#### Memory Issues with Large Datasets
- **Cause**: Loading entire dataset into memory
- **Solution**: Use streaming processing or batch operations

## Migration Guide

### From Dynamic Protobuf Loading

```typescript
// Before: Dynamic loading with protobufjs
const root = await protobuf.load("trace.proto")
const TraceRequest = root.lookupType("ExportTraceServiceRequest")
const message = TraceRequest.decode(buffer)

// After: Static types with @bufbuild/protobuf
import { ExportTraceServiceRequest } from '@otel-ai/opentelemetry'
const message = ExportTraceServiceRequest.fromBinary(buffer)
```

### From Manual JSON Parsing

```typescript
// Before: Manual parsing
const spans = json.resourceSpans.map(rs => ({
  serviceName: rs.resource.attributes.find(a => a.key === "service.name")?.value.stringValue,
  spans: rs.instrumentationLibrarySpans[0].spans
}))

// After: Typed parsing
const request = ExportTraceServiceRequest.fromJson(json)
for (const resourceSpan of request.resourceSpans) {
  const serviceName = resourceSpan.resource?.attributes
    ?.find(attr => attr.key === "service.name")
    ?.value?.stringValue
  // ... typed access to all fields
}
```

## Dependencies

- `@bufbuild/protobuf` - Protobuf runtime and code generation
- `@bufbuild/protoc-gen-es` - TypeScript code generator

## References

- [OpenTelemetry Protocol Specification](https://github.com/open-telemetry/opentelemetry-proto)
- [Buf Build Documentation](https://buf.build/docs)
- [@bufbuild/protobuf Documentation](https://github.com/bufbuild/protobuf-es)
- [OTLP/HTTP Specification](https://opentelemetry.io/docs/specs/otlp/)

---

Part of the [otel-ai](../../README.md) AI-native observability platform.