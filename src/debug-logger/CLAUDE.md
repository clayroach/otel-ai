# Debug Logger Package - Claude Context

## Package Overview

Production-ready debug logging with ASCII trace visualization and dynamic configuration hot-reload. Provides level-based filtering (TRACE/DEBUG/INFO/WARN/ERROR) and automatic file-watching for config changes.

This file is automatically read by Claude Code when working in this package.

## Mandatory Package Conventions

CRITICAL: These conventions MUST be followed in this package:

- **ONLY export Effect Layers for external consumption** (no factory functions)
- External packages must use DebugLoggerLive Layer
- All async operations use Effect-TS patterns or Promises (config watcher)
- Schema validation required for all configuration
- Tests go in test/unit/ and test/integration/ subdirectories
- NEVER export `createDebugLogger` or other factory functions
- Always validate config with Schema.decodeSync before using
- File watching must handle errors gracefully (don't crash service)

## Core Primitives & Patterns

### Service Definition Pattern

```typescript
// Service interface (not Effect-TS tag in this case - simpler approach)
export interface DebugLogger {
  readonly trace: (message: string, data?: unknown) => void
  readonly debug: (message: string, data?: unknown) => void
  readonly info: (message: string, data?: unknown) => void
  readonly warn: (message: string, data?: unknown) => void
  readonly error: (message: string, data?: unknown) => void
  readonly logTrace: (traceId: string, spans: SpanData[]) => void
  readonly setLevel: (level: LogLevelString) => void
  readonly getLevel: () => LogLevelString
}

export const DebugLoggerTag = Context.GenericTag<DebugLogger>('DebugLogger')
```

### Layer Composition Pattern

```typescript
// Individual layers
export const TraceFormatterLive = Layer.succeed(
  TraceFormatterTag,
  createTraceFormatter()
)

export const ConfigWatcherLive = Layer.succeed(
  ConfigWatcherTag,
  createConfigWatcher(configPath)
)

// Dependent layer
export const DebugLoggerLive = Layer.effect(
  DebugLoggerTag,
  Layer.gen(function* () {
    const configWatcher = yield* ConfigWatcherTag
    const traceFormatter = yield* TraceFormatterTag
    return createDebugLogger(configWatcher, traceFormatter)
  })
)

// Combined layer
export const DebugLoggerLayerLive = Layer.mergeAll(
  TraceFormatterLive,
  ConfigWatcherLive,
  DebugLoggerLive
)
```

### Level-Based Filtering Pattern

```typescript
// LogLevel enum (ordered by severity)
enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  OFF = 5
}

// Filter check
const shouldLog = (messageLevel: LogLevel): boolean => {
  return messageLevel >= currentLevel
}

// Early return for performance
if (!shouldLog(LogLevel.TRACE)) return
```

### Config Hot-Reload Pattern

```typescript
// File watcher with debouncing
const watcher = watch(configPath, {
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 100,
    pollInterval: 50
  }
})

watcher.on('change', () => {
  // Debounce rapid changes
  clearTimeout(debounceTimeout)
  debounceTimeout = setTimeout(async () => {
    await reload()
  }, config.debug.hotReload.debounceMs)
})
```

### Trace Tree Building Pattern

```typescript
// Build hierarchical tree from flat spans
const buildSpanTree = (spans: SpanData[]): SpanTreeNode[] => {
  const spanMap = new Map<string, SpanData>()
  const childrenMap = new Map<string, SpanData[]>()
  const rootSpans: SpanData[] = []

  // Map spans by ID and parent
  for (const span of spans) {
    spanMap.set(span.spanId, span)
    if (!span.parentSpanId) {
      rootSpans.push(span)
    } else {
      const siblings = childrenMap.get(span.parentSpanId) || []
      siblings.push(span)
      childrenMap.set(span.parentSpanId, siblings)
    }
  }

  // Sort children by start time
  for (const children of childrenMap.values()) {
    children.sort((a, b) => /* compare start times */)
  }

  // Recursive tree build
  return rootSpans.map(span => buildNode(span, 0))
}
```

## Known Issues & Workarounds

### Config File Missing on Startup

- **Problem**: If config/debug.yaml doesn't exist, watcher fails silently
- **Workaround**: Returns default config and logs error
- **Fix**: Create config/debug.yaml in setup script

### ANSI Colors in Non-Terminal Output

- **Problem**: Color codes appear as raw text in logs/files
- **Workaround**: Set `colorOutput: false` in config
- **Fix**: Auto-detect TTY and disable colors for non-terminals

### File Watcher Memory Leak

- **Problem**: Chokidar watchers not closed on service shutdown
- **Workaround**: Manual cleanup required
- **Fix**: Implement proper shutdown hook

## Common Pitfalls

❌ **DON'T**: Call `logTrace` for every trace in high-volume systems
✅ **DO**: Sample or filter traces before logging

❌ **DON'T**: Set `showAttributes: true` with large attribute sets
✅ **DO**: Limit to 5 attributes per span (already done in formatter)

❌ **DON'T**: Use TRACE level in production without sampling
✅ **DO**: Use INFO level by default, enable TRACE only for debugging

❌ **DON'T**: Disable hot-reload - defeats the purpose
✅ **DO**: Keep `hotReload.enabled: true` for development flexibility

❌ **DON'T**: Export factory functions like `createDebugLogger`
✅ **DO**: Export only Layers: `DebugLoggerLive`

❌ **DON'T**: Forget to close file watchers on shutdown
✅ **DO**: Implement cleanup in service shutdown hooks

## Quick Command Reference

```bash
# Development with trace logging
pnpm dev:debug

# Run unit tests
pnpm test src/debug-logger/test/unit/

# Run all debug-logger tests
pnpm test src/debug-logger/

# Enable trace logging via environment
DEBUG_LEVEL=trace pnpm dev

# Edit config (auto-reloads)
vim config/debug.yaml
```

## Dependencies & References

- **External**:
  - `chokidar` ^4.0.0 - File watching
  - `js-yaml` ^4.1.0 - YAML parsing
  - `@effect/schema` - Config validation
  - `effect` - Service implementation
- **Internal**:
  - Compatible with `storage` package SpanData types
  - Can integrate with any package that uses standard OTLP spans
- **Documentation**:
  - Full docs: See README.md
  - Chokidar docs: https://github.com/paulmillr/chokidar
  - Effect-TS docs: https://effect.website

## Package-Specific Patterns

### Timing Calculations

Always use BigInt for nanosecond timestamps:

```typescript
const startNs = BigInt(span.startTimeUnixNano)
const endNs = BigInt(span.endTimeUnixNano)
const durationNs = endNs - startNs

// Convert to milliseconds
const durationMs = Number(durationNs) / 1_000_000
```

### Box Drawing Characters

Use UTF-8 box drawing for visual clarity:

```typescript
const boxChars = {
  branch: '├─',      // Middle child
  last: '└─',        // Last child
  vertical: '│',     // Continuation line
  space: '  '        // Indentation
}
```

### Color Codes

ANSI color codes for terminal output:

```typescript
const colors = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  green: '\x1b[32m',  // OK status
  red: '\x1b[31m',    // ERROR status
  cyan: '\x1b[36m'    // Headers
}
```

## Integration Points

### With Storage Package

```typescript
// Hook into trace ingestion
import { DebugLoggerTag } from '@/debug-logger'

const writeTraces = Effect.gen(function* () {
  const debugLogger = yield* DebugLoggerTag
  const spans = yield* /* fetch spans */

  // Log trace if TRACE level enabled
  debugLogger.logTrace(traceId, spans)

  // Continue with normal storage
  yield* clickhouse.writeTraces(spans)
})
```

### With Custom Services

```typescript
// Use for any structured logging
const myService = Effect.gen(function* () {
  const logger = yield* DebugLoggerTag

  logger.info('Service started')
  logger.debug('Config loaded', { config })

  try {
    // Service logic
  } catch (error) {
    logger.error('Service failed', { error })
  }
})
```

## Testing Strategies

### Unit Tests

- Trace formatter with various span hierarchies
- LogLevel filtering logic
- Config schema validation
- Edge cases: zero-duration, orphaned spans, deep nesting

### Integration Tests

- Hot-reload: Modify config and verify changes apply
- File watching: Create, modify, delete config file
- Performance: Benchmark trace formatting speed

### Fixtures

Use realistic test data:

```typescript
export const hierarchicalTrace: SpanData[] = [
  {
    traceId: 'trace-001',
    spanId: 'root',
    serviceName: 'frontend',
    operationName: 'render',
    startTimeUnixNano: '1000000000000000',
    endTimeUnixNano: '1000000450000000',
    durationNs: 450000000
  },
  // ... child spans
]
```

## Performance Considerations

### Optimization Rules

1. **Only format when needed**: Check level before processing
2. **Limit tree depth**: Use maxDepth to prevent huge output
3. **Debounce file watching**: Prevent rapid reload thrashing
4. **Sample high-volume traces**: Don't log every trace in production

### Performance Targets

- Trace formatting: <10ms for 100 spans
- Config reload: <500ms from save to applied
- Memory footprint: <5MB for watcher
- Zero overhead when disabled (level > TRACE)

## Quick Start Example

```typescript
import { DebugLoggerLayerLive, DebugLoggerTag } from '@/debug-logger'
import { Effect } from 'effect'

const program = Effect.gen(function* () {
  const logger = yield* DebugLoggerTag

  logger.info('Application started')
  logger.debug('Loading configuration')

  // Log a trace
  const spans = /* fetch spans from storage */
  logger.logTrace('trace-id-123', spans)
})

await Effect.runPromise(
  program.pipe(Effect.provide(DebugLoggerLayerLive))
)
```
