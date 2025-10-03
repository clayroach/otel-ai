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
   * Log an entire trace with ASCII visualization
   */
  const logTrace = (traceId: string, spans: SpanData[]): void => {
    // Only log traces at TRACE level
    if (!shouldLog(0)) return // LogLevel.TRACE = 0

    const config = configWatcher.getCurrentConfig()

    // Check if trace logging is enabled
    if (!config.debug.traces.enabled) {
      return
    }

    // Format the trace
    const formattedTrace = traceFormatter.formatTrace(traceId, spans, {
      maxDepth: config.debug.traces.maxDepth,
      showTimings: config.debug.traces.showTimings,
      showAttributes: config.debug.traces.showAttributes,
      colorOutput: config.debug.traces.colorOutput
    })

    // Log the formatted trace
    console.log(formattedTrace)
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
    setLevel,
    getLevel
  }
}
