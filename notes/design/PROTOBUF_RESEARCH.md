# Protobuf Decompression Research for OTLP

## Research Summary

After extensive research into how other GitHub projects handle OTLP protobuf with gzip compression, here are the key findings:

## Issue Analysis

Our current error:
```
Error: incorrect header check
at Zlib.zlibOnError [as onerror] (node:zlib:189:17) {
  errno: -3,
  code: 'Z_DATA_ERROR'
}
```

This occurs when trying to decompress gzipped protobuf data from the OTel Collector.

## Key Findings from GitHub Projects

### 1. OTLP Specification Requirements
- OTLP/HTTP MUST set `Content-Type: application/x-protobuf` for binary protobuf
- Servers SHOULD accept both binary-encoded and JSON-encoded payloads
- Default port for OTLP/HTTP is 4318
- Standard endpoints: `/v1/traces`, `/v1/metrics`, `/v1/logs`

### 2. Common Express.js Patterns

#### Working Pattern from OpenTelemetry Projects:
```javascript
// Use express.raw() with inflate handling
app.use('/v1/*', express.raw({ 
  limit: '10mb',
  type: ['application/x-protobuf', 'application/protobuf'],
  inflate: true  // Let Express handle decompression
}))
```

#### Issue We're Facing:
The collector sends data with:
- `Content-Type: application/x-protobuf`
- `Content-Encoding: gzip`

But our `inflate: false` prevents automatic decompression, and manual decompression fails.

### 3. Successful Implementations Found

#### From opentelemetry-js Issues:
- Developers use `protobufjs` library to deserialize
- The official proto definitions are at `open-telemetry/opentelemetry-proto`
- Many struggled with empty `req.body` when collector sends protobuf

#### Solution Pattern:
```javascript
const protobuf = require('protobufjs')

// Load OTLP proto definitions
const root = await protobuf.load('path/to/otlp/trace.proto')
const TracesData = root.lookupType('opentelemetry.proto.trace.v1.TracesData')

// In route handler
app.post('/v1/traces', (req, res) => {
  // req.body is Buffer after express.raw()
  if (req.headers['content-type'].includes('protobuf')) {
    const decoded = TracesData.decode(req.body)
    const traces = TracesData.toObject(decoded)
    // Process traces...
  }
})
```

## Root Cause of Our Issue

1. **Middleware Conflict**: We're using `inflate: false` which prevents Express from decompressing
2. **Manual Decompression Failing**: The gzip header check fails when we try to decompress manually
3. **Data Format Mismatch**: The collector might be sending data in a format that doesn't match standard gzip

## Recommended Solutions

### Option 1: Enable Express Inflation (Simplest)
```javascript
app.use('/v1/*', express.raw({ 
  limit: '10mb',
  type: '*/*',
  inflate: true  // Let Express handle ALL decompression
}))
```

### Option 2: Conditional Inflation
```javascript
app.use('/v1/*', (req, res, next) => {
  const isProtobuf = req.headers['content-type']?.includes('protobuf')
  const isGzipped = req.headers['content-encoding'] === 'gzip'
  
  if (isProtobuf && isGzipped) {
    // Let Express handle gzip for protobuf
    express.raw({ 
      type: 'application/x-protobuf',
      inflate: true
    })(req, res, next)
  } else if (req.headers['content-type']?.includes('json')) {
    express.json({ limit: '10mb' })(req, res, next)
  } else {
    express.raw({ limit: '10mb' })(req, res, next)
  }
})
```

### Option 3: Use protobufjs for Proper Decoding
Install dependencies:
```bash
npm install protobufjs @opentelemetry/otlp-transformer
```

Then properly decode protobuf:
```javascript
import { IExportTraceServiceRequest } from '@opentelemetry/otlp-transformer'

app.post('/v1/traces', async (req, res) => {
  if (req.headers['content-type']?.includes('protobuf')) {
    // req.body is already decompressed Buffer if inflate: true
    const traces = IExportTraceServiceRequest.decode(req.body)
    // Process traces...
  }
})
```

## Other Projects' Approaches

### 1. Jaeger (Go)
- Uses built-in gzip handling in HTTP server
- Automatically decompresses based on Content-Encoding header

### 2. OpenTelemetry Collector (Go)
- Native support for gzip decompression in HTTP receiver
- Multiplexes based on Content-Type header

### 3. Grafana Tempo (Go)
- Similar approach with automatic gzip handling
- Uses protobuf unmarshalling after decompression

### 4. SigNoz (Go/React)
- Backend handles gzip transparently
- Frontend doesn't deal with protobuf directly

## Conclusion

The issue is that we're trying to manually handle gzip decompression when Express can do it automatically. Most successful implementations:

1. Let the HTTP framework (Express) handle gzip decompression
2. Focus on protobuf decoding after decompression
3. Use official OTLP protobuf definitions for proper parsing

## Next Steps

1. Change `inflate: false` to `inflate: true` in Express middleware
2. Install protobufjs if we want to properly parse protobuf data
3. Or continue with mock traces but let Express handle decompression