# Debug Logger Package

Production-ready debug logging system with ASCII trace visualization and dynamic configuration hot-reload.

## Current Implementation Status

✅ **Complete**:
- LogLevel-based filtering (TRACE, DEBUG, INFO, WARN, ERROR, OFF)
- ASCII trace tree rendering with hierarchical visualization
- Dynamic configuration hot-reload via file watching
- UTF-8 box drawing characters for tree structure
- Timing visualization (relative and duration)
- ANSI color support for terminal output
- Configurable depth limits and attribute display
- Effect-TS Layer-based architecture

🚧 **In Progress**:
- Integration with trace ingestion pipeline
- Integration tests for hot-reload functionality

📋 **Planned**:
- Environment variable overrides for all config options
- Trace filtering by service/operation patterns
- Performance benchmarks

## Quick Start

### Installation

The package is already part of the monorepo. No separate installation needed.

### Basic Usage

```typescript
import { DebugLoggerLive, DebugLoggerTag } from '@/debug-logger'
import { Effect } from 'effect'

const program = Effect.gen(function* () {
  const logger = yield* DebugLoggerTag

  // Standard logging
  logger.info('Service started')
  logger.debug('Processing request', { userId: '123' })
  logger.warn('Rate limit approaching')

  // Trace visualization
  logger.logTrace(traceId, spans)
})

// Provide the debug logger layer
await Effect.runPromise(
  program.pipe(Effect.provide(DebugLoggerLive))
)
```

### Configuration

Edit `config/debug.yaml`:

```yaml
debug:
  level: trace  # trace | debug | info | warn | error | off

  traces:
    enabled: true     # Enable ASCII trace visualization
    console: both     # server | browser | both
    maxDepth: 10
    showTimings: true
    showAttributes: false
    colorOutput: false  # Set false for browser compatibility

  hotReload:
    enabled: true
    debounceMs: 500
```

Changes apply automatically within 500ms - no restart required!

### Enable via Environment Variable

```bash
DEBUG_LEVEL=trace pnpm dev
# or
pnpm dev:debug  # Convenience script
```

## Usage

### Standard Logging

```typescript
const logger = yield* DebugLoggerTag

// Different log levels
logger.trace('Detailed trace information')
logger.debug('Debug diagnostics', { context: 'value' })
logger.info('Informational message')
logger.warn('Warning condition')
logger.error('Error occurred', { error: 'details' })

// Set level programmatically
logger.setLevel('debug')
const currentLevel = logger.getLevel() // Returns 'debug'
```

### Trace Visualization

```typescript
// Log entire trace with ASCII tree
logger.logTrace(traceId, spans)
```

**Example Output:**

```
[TRACE] Trace a1b2c3d4e5f6... (450ms total, 4 spans)
└─ frontend.handleRequest (0ms → 450ms) [450ms]
   ├─ frontend.fetchData (10ms → 300ms) [290ms]
   │  └─ database.query (50ms → 280ms) [230ms]
   └─ frontend.compileTemplate (310ms → 440ms) [130ms]
Services: frontend, database
```

### Hierarchical Visualization

The trace formatter automatically builds a tree structure from flat span arrays:

- **Parent-child relationships**: Spans with matching `parentSpanId`
- **Temporal ordering**: Siblings sorted by start time
- **Box drawing characters**: UTF-8 `├─ │ └─` for visual hierarchy
- **Depth limiting**: Configurable maximum nesting level

### With Span Attributes

Enable in config:

```yaml
traces:
  showAttributes: true
```

Output includes up to 5 attributes per span:

```
└─ api.http.request (0ms → 200ms) [200ms]
   http.method: "GET"
   http.url: "/api/users"
   http.status_code: 200
   ... (4 more)
```

## Console Output Targets

Control where traces are logged using the `console` configuration option. This feature allows flexible debugging across server and browser environments.

### Configuration Options

```yaml
debug:
  traces:
    enabled: true
    console: both  # 'server' | 'browser' | 'both'
```

**Console Target Modes:**

- **`server`** (default): Traces logged to server console only
- **`browser`**: Traces formatted for browser console (available via API, not logged to server)
- **`both`**: Traces logged to both server and browser consoles

### Server Console Mode

Use `console: server` or `console: both` to see traces in server logs.

```yaml
debug:
  traces:
    enabled: true
    console: server
```

Traces will appear in your server console during development:

```
[TRACE] Trace 1489ccae... (4ms total, 7 spans)
0. load-generator:user_browse_product
   0.00ms ████████████████████ 4.11ms [depth=0]
1.   ├─ load-generator:product
   0.04ms ████████████ 3.06ms [depth=1]
...
Services: load-generator, frontend, productcatalogservice
```

### Browser Console Integration

Use `console: browser` or `console: both` to make formatted traces available for browser console logging.

**API Integration Example:**

```typescript
import { DebugLoggerTag } from '@/debug-logger'

// In your API endpoint
const handleGetTrace = Effect.gen(function* () {
  const debugLogger = yield* DebugLoggerTag
  const config = yield* ConfigWatcherTag

  // Fetch trace data
  const spans = yield* fetchSpans(traceId)

  // Check if browser logging is enabled
  const shouldIncludeBrowserTrace =
    config.getCurrentConfig().debug.traces.enabled &&
    (config.getCurrentConfig().debug.traces.console === 'browser' ||
     config.getCurrentConfig().debug.traces.console === 'both')

  // Format for browser if needed
  const debugTrace = shouldIncludeBrowserTrace
    ? debugLogger.formatTrace(traceId, spans)
    : undefined

  return {
    spans,
    metadata: {...},
    debugTrace // Include if browser logging enabled
  }
})
```

**Frontend Usage:**

```typescript
// Frontend code that logs formatted trace
const response = await fetch(`/api/traces/${traceId}/spans`)
const data = await response.json()

// Log to browser console if trace is provided
if (data.debugTrace) {
  console.log(data.debugTrace)
}
```

**Browser Console Output:**

Same formatted output appears in browser DevTools console:

```
[TRACE] Trace 1489ccae... (4ms total, 7 spans)
0. load-generator:user_browse_product
   0.00ms ████████████████████ 4.11ms [depth=0]
...
```

### formatTrace() Method

The `formatTrace()` method allows you to get a formatted trace string without logging to server console:

```typescript
const logger = yield* DebugLoggerTag

// Format trace without logging
const formattedTrace = logger.formatTrace(traceId, spans)

// Use in API responses, tests, or custom logging
return {
  trace: formattedTrace
}
```

**Key Benefits:**
- Works regardless of `console` setting
- Always uses `colorOutput: false` for browser compatibility
- Respects other config options (maxDepth, showTimings, showAttributes)
- Does not log to server console

### Browser Compatibility Note

When using browser console output, set `colorOutput: false` in configuration:

```yaml
debug:
  traces:
    console: browser  # or 'both'
    colorOutput: false  # ANSI codes don't work in browser
```

ANSI color codes work in terminal environments but appear as raw text in browser consoles. The debug logger automatically uses `colorOutput: false` when formatting traces with `formatTrace()` for browser compatibility.

## Key Features

### 1. Level-Based Filtering

Standard log levels with hierarchical filtering:

- `TRACE` (0): All messages including trace visualization
- `DEBUG` (1): Debug messages and above
- `INFO` (2): Informational messages and above (default)
- `WARN` (3): Warnings and errors only
- `ERROR` (4): Errors only
- `OFF` (5): No logging

Messages are only logged if `messageLevel >= currentLevel`.

### 2. ASCII Trace Visualization

Renders OpenTelemetry spans as hierarchical trees:

- Automatic parent-child relationship detection
- UTF-8 box drawing characters for visual clarity
- Relative timing (ms from trace start)
- Duration display for each span
- Service name aggregation
- Color-coded status (OK=green, ERROR=red)

### 3. Dynamic Configuration

File-based configuration with zero-downtime hot-reload:

- Watches `config/debug.yaml` for changes
- Debounced reload (configurable delay)
- Schema validation on reload
- Automatic subscriber notification
- No service restart required

### 4. ANSI Color Support

Terminal-friendly color coding:

- Cyan: Trace headers and metadata
- Green: Successful operations (`STATUS_CODE_OK`)
- Red: Failed operations (`STATUS_CODE_ERROR`)
- Gray: Supporting information (attributes, summaries)

Disable for file output or non-terminal destinations:

```yaml
traces:
  colorOutput: false
```

## Architecture

### Package Structure

```
src/debug-logger/
├── test/
│   ├── unit/              # Unit tests
│   ├── integration/       # Integration tests
│   └── fixtures/          # Test data
├── src/
│   ├── debug-logger.ts    # Main service
│   ├── trace-formatter.ts # ASCII rendering
│   ├── config-watcher.ts  # File watching
│   ├── types.ts           # Types and schemas
│   └── layers.ts          # Effect Layers
├── index.ts               # Exports (Layers only)
├── README.md
└── CLAUDE.md
```

### Services

1. **DebugLogger**: Main logging service with level control
2. **TraceFormatter**: Converts spans to ASCII trees
3. **ConfigWatcher**: Watches config file and notifies subscribers

### Effect-TS Integration

All services follow Effect-TS Layer pattern:

```typescript
// Layers are composed and provided to programs
export const DebugLoggerLayerLive = Layer.mergeAll(
  TraceFormatterLive,
  ConfigWatcherLive,
  DebugLoggerLive
)
```

## API Reference

### DebugLogger Interface

```typescript
interface DebugLogger {
  readonly trace: (message: string, data?: unknown) => void
  readonly debug: (message: string, data?: unknown) => void
  readonly info: (message: string, data?: unknown) => void
  readonly warn: (message: string, data?: unknown) => void
  readonly error: (message: string, data?: unknown) => void
  readonly logTrace: (traceId: string, spans: SpanData[]) => void
  readonly formatTrace: (traceId: string, spans: SpanData[]) => string
  readonly setLevel: (level: LogLevelString) => void
  readonly getLevel: () => LogLevelString
}
```

### ConfigWatcher Interface

```typescript
interface ConfigWatcher {
  readonly getCurrentConfig: () => DebugConfig
  readonly reload: () => Promise<void>
  readonly subscribe: (callback: (config: DebugConfig) => void) => () => void
}
```

### TraceFormatter Interface

```typescript
interface TraceFormatter {
  readonly formatTrace: (
    traceId: string,
    spans: SpanData[],
    options: FormatOptions
  ) => string
}
```

## Configuration

### Complete Schema

```yaml
debug:
  # Log level: trace | debug | info | warn | error | off
  level: info

  traces:
    enabled: false         # Enable ASCII visualization
    console: server        # Console target: server | browser | both
    maxDepth: 10           # Maximum nesting depth
    showTimings: true      # Display (start → end) [duration]
    showAttributes: false  # Show span attributes
    colorOutput: false     # ANSI color codes (false for browser compatibility)

  hotReload:
    enabled: true          # Watch config file
    debounceMs: 500        # Reload delay
```

### Environment Variables

- `DEBUG_LEVEL`: Override configured log level
- `DEBUG_CONFIG_PATH`: Custom config file location (default: `config/debug.yaml`)

## Testing

### Run Unit Tests

```bash
pnpm test src/debug-logger/test/unit/
```

### Run Integration Tests

```bash
pnpm test src/debug-logger/test/integration/
```

### Test Coverage

- Trace formatter: 100% coverage
- LogLevel filtering: Full coverage
- Edge cases: Zero-duration spans, orphaned spans, deep nesting

## Performance

### Optimization Strategies

1. **Lazy Evaluation**: Only format traces when level >= TRACE
2. **Early Returns**: Skip processing if level check fails
3. **Debounced Reload**: Prevent rapid config file changes from thrashing
4. **Depth Limits**: Configurable maximum to prevent huge output

### Performance Targets

- Config reload: <500ms from file save to applied
- Trace formatting: <10ms for typical trace (100 spans)
- Memory overhead: <5MB for config watcher
- CPU impact when disabled: <0.1%

### Zero Cost When Disabled

When `level > TRACE` or `traces.enabled: false`:

```typescript
if (!shouldLog(LogLevel.TRACE)) return  // Immediate return
```

No trace formatting, no memory allocation, minimal overhead.

## Troubleshooting

### Trace Not Appearing

1. Check log level: `level: trace` required for trace visualization
2. Verify traces enabled: `traces.enabled: true`
3. Confirm config file exists: `config/debug.yaml`
4. Check hot-reload: Changes apply automatically after 500ms

### Config Changes Not Applied

1. Verify `hotReload.enabled: true`
2. Check console for watcher errors
3. Validate YAML syntax (use online validator)
4. Manual reload: Restart service

### Performance Issues

1. Reduce maxDepth for deep traces
2. Disable showAttributes if not needed
3. Filter spans before logging (don't log all traces)
4. Consider sampling strategy for high-volume systems

### Colors Not Showing

1. Verify terminal supports ANSI colors
2. Check `colorOutput: true` in config
3. Some CI/CD systems require color flags

## Migration Guide

N/A - This is a new package with no previous versions.

## Integration with Platform

The debug-logger package integrates with:

1. **storage**: Hooks into `writeTraces` for automatic trace logging
2. **opentelemetry**: Uses standard OTLP span format
3. **llm-manager**: Could log LLM interactions with trace-like visualization

## Change Log

### v0.1.0 (2025-10-03)

Initial release:

- LogLevel-based filtering
- ASCII trace tree rendering
- Dynamic configuration hot-reload
- Effect-TS Layer architecture
- Comprehensive unit tests

---

Part of the [otel-ai](../../README.md) AI-native observability platform.
