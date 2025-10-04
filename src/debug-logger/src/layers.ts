/**
 * Effect-TS Layers for debug-logger package
 */

import { Layer, Effect } from 'effect'
import { join } from 'path'
import { DebugLoggerTag, ConfigWatcherTag, TraceFormatterTag } from './types.js'
import { createDebugLogger } from './debug-logger.js'
import { createConfigWatcher } from './config-watcher.js'
import { createTraceFormatter } from './trace-formatter.js'

/**
 * Default config path (relative to project root)
 */
const DEFAULT_CONFIG_PATH = join(process.cwd(), 'config', 'debug.yaml')

/**
 * Layer for TraceFormatter (no dependencies)
 */
export const TraceFormatterLive = Layer.succeed(TraceFormatterTag, createTraceFormatter())

/**
 * Layer for ConfigWatcher (no dependencies)
 */
export const ConfigWatcherLive = Layer.succeed(
  ConfigWatcherTag,
  createConfigWatcher(process.env.DEBUG_CONFIG_PATH || DEFAULT_CONFIG_PATH)
)

/**
 * Layer for DebugLogger (depends on ConfigWatcher and TraceFormatter)
 */
export const DebugLoggerLive = Layer.effect(
  DebugLoggerTag,
  Effect.gen(function* () {
    const configWatcher = yield* ConfigWatcherTag
    const traceFormatter = yield* TraceFormatterTag

    return createDebugLogger(configWatcher, traceFormatter)
  })
)

/**
 * Combined layer providing all debug-logger services
 * Exposes DebugLogger, ConfigWatcher, and TraceFormatter for external use
 */
export const DebugLoggerLayerLive = Layer.mergeAll(
  TraceFormatterLive,
  ConfigWatcherLive,
  DebugLoggerLive.pipe(Layer.provide(Layer.mergeAll(TraceFormatterLive, ConfigWatcherLive)))
)
