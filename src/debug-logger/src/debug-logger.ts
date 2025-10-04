/**
 * Debug Logger Service
 * Provides level-based logging with ASCII trace visualization
 */

import type {
  DebugLogger,
  LogLevel,
  LogLevelString,
  SpanData,
  ConfigWatcher,
  TraceFormatter
} from './types.js'
import { stringToLogLevel, logLevelToString } from './types.js'

/**
 * Create debug logger instance
 */
export const createDebugLogger = (
  configWatcher: ConfigWatcher,
  traceFormatter: TraceFormatter
): DebugLogger => {
  let currentLevel: LogLevel = stringToLogLevel(configWatcher.getCurrentConfig().debug.level)

  // Subscribe to config changes
  configWatcher.subscribe((config) => {
    const newLevel = stringToLogLevel(config.debug.level)
    if (newLevel !== currentLevel) {
      currentLevel = newLevel
      console.log(`[DebugLogger] Log level changed to: ${logLevelToString(currentLevel)}`)
    }
  })

  /**
   * Check if a message should be logged based on current level
   */
  const shouldLog = (messageLevel: LogLevel): boolean => {
    return messageLevel >= currentLevel
  }

  /**
   * Format log message with timestamp and level
   */
  const formatMessage = (level: string, message: string, data?: unknown): string => {
    const timestamp = new Date().toISOString()
    let formattedMessage = `[${level.toUpperCase()} ${timestamp}] ${message}`

    if (data !== undefined) {
      formattedMessage += `\n${JSON.stringify(data, null, 2)}`
    }

    return formattedMessage
  }

  /**
   * Log at TRACE level
   */
  const trace = (message: string, data?: unknown): void => {
    if (!shouldLog(0)) return // LogLevel.TRACE = 0

    console.log(formatMessage('trace', message, data))
  }

  /**
   * Log at DEBUG level
   */
  const debug = (message: string, data?: unknown): void => {
    if (!shouldLog(1)) return // LogLevel.DEBUG = 1

    console.log(formatMessage('debug', message, data))
  }

  /**
   * Log at INFO level
   */
  const info = (message: string, data?: unknown): void => {
    if (!shouldLog(2)) return // LogLevel.INFO = 2

    console.log(formatMessage('info', message, data))
  }

  /**
   * Log at WARN level
   */
  const warn = (message: string, data?: unknown): void => {
    if (!shouldLog(3)) return // LogLevel.WARN = 3

    console.warn(formatMessage('warn', message, data))
  }

  /**
   * Log at ERROR level
   */
  const error = (message: string, data?: unknown): void => {
    if (!shouldLog(4)) return // LogLevel.ERROR = 4

    console.error(formatMessage('error', message, data))
  }

  /**
   * Format trace internally (shared logic for logTrace and formatTrace)
   */
  const formatTraceInternal = (traceId: string, spans: SpanData[]): string => {
    const config = configWatcher.getCurrentConfig()

    return traceFormatter.formatTrace(traceId, spans, {
      maxDepth: config.debug.traces.maxDepth,
      showTimings: config.debug.traces.showTimings,
      showAttributes: config.debug.traces.showAttributes,
      colorOutput: false // Always false for browser compatibility
    })
  }

  /**
   * Log an entire trace with ASCII visualization (server console only)
   */
  const logTrace = (traceId: string, spans: SpanData[]): void => {
    // Only log traces at TRACE level
    if (!shouldLog(0)) return // LogLevel.TRACE = 0

    const config = configWatcher.getCurrentConfig()

    // Check if trace logging is enabled
    if (!config.debug.traces.enabled) {
      return
    }

    // Only log to SERVER console if 'server' or 'both'
    const shouldLogToServer =
      config.debug.traces.console === 'server' || config.debug.traces.console === 'both'

    if (!shouldLogToServer) return

    // Format and log the trace
    const formattedTrace = formatTraceInternal(traceId, spans)
    console.log(formattedTrace)
  }

  /**
   * Format trace for browser console (does not log to server)
   */
  const formatTrace = (traceId: string, spans: SpanData[]): string => {
    return formatTraceInternal(traceId, spans)
  }

  /**
   * Set the log level
   */
  const setLevel = (level: LogLevelString): void => {
    currentLevel = stringToLogLevel(level)
    console.log(`[DebugLogger] Log level set to: ${level}`)
  }

  /**
   * Get the current log level
   */
  const getLevel = (): LogLevelString => {
    return logLevelToString(currentLevel)
  }

  return {
    trace,
    debug,
    info,
    warn,
    error,
    logTrace,
    formatTrace,
    setLevel,
    getLevel
  }
}
