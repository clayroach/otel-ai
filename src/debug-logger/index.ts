/**
 * Debug Logger Package
 *
 * Provides ASCII trace visualization and dynamic configuration hot-reload.
 *
 * @example
 * ```typescript
 * import { DebugLoggerLive } from '@/debug-logger'
 * import { Effect } from 'effect'
 *
 * const program = Effect.gen(function* () {
 *   const logger = yield* DebugLoggerTag
 *   logger.trace('Trace message', { data: 'example' })
 * })
 *
 * Effect.runPromise(program.pipe(Effect.provide(DebugLoggerLive)))
 * ```
 */

// Export types
export type {
  DebugLogger,
  ConfigWatcher,
  TraceFormatter,
  DebugConfig,
  LogLevelString,
  FormatOptions,
  SpanData,
  SpanTreeNode
} from './src/types.js'

// Export tags
export {
  DebugLoggerTag,
  ConfigWatcherTag,
  TraceFormatterTag,
  LogLevel,
  stringToLogLevel,
  logLevelToString,
  defaultDebugConfig
} from './src/types.js'

// Export layers (ONLY export Layers for external consumption)
export {
  TraceFormatterLive,
  ConfigWatcherLive,
  DebugLoggerLive,
  DebugLoggerLayerLive
} from './src/layers.js'
