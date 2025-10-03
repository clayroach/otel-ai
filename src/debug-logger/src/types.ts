/**
 * Types and schemas for the debug-logger package
 */

import { Schema } from '@effect/schema'
import { Context } from 'effect'

// Log levels (ordered by severity)
export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  OFF = 5
}

// String representation of log levels
export type LogLevelString = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'off'

// Configuration schema for debug logger
export const DebugConfigSchema = Schema.Struct({
  debug: Schema.Struct({
    level: Schema.Literal('trace', 'debug', 'info', 'warn', 'error', 'off'),
    traces: Schema.Struct({
      enabled: Schema.Boolean,
      maxDepth: Schema.Number,
      showTimings: Schema.Boolean,
      showAttributes: Schema.Boolean,
      colorOutput: Schema.Boolean
    }),
    hotReload: Schema.Struct({
      enabled: Schema.Boolean,
      debounceMs: Schema.Number
    })
  })
})

export type DebugConfig = Schema.Schema.Type<typeof DebugConfigSchema>

// Default configuration
export const defaultDebugConfig: DebugConfig = {
  debug: {
    level: 'info',
    traces: {
      enabled: false,
      maxDepth: 10,
      showTimings: true,
      showAttributes: false,
      colorOutput: true
    },
    hotReload: {
      enabled: true,
      debounceMs: 500
    }
  }
}

// Trace formatting options
export interface FormatOptions {
  maxDepth: number
  showTimings: boolean
  showAttributes: boolean
  colorOutput: boolean
}

// Span data interface (compatible with storage package)
export interface SpanData {
  traceId: string
  spanId: string
  parentSpanId?: string | null
  serviceName: string
  operationName: string
  startTimeUnixNano: string
  endTimeUnixNano: string
  durationNs: number
  statusCode?: string
  attributes?: Record<string, unknown>
}

// Hierarchical span node for tree rendering
export interface SpanTreeNode {
  span: SpanData
  children: SpanTreeNode[]
  depth: number
}

// Debug logger service interface
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

// Config watcher service interface
export interface ConfigWatcher {
  readonly getCurrentConfig: () => DebugConfig
  readonly reload: () => Promise<void>
  readonly subscribe: (callback: (config: DebugConfig) => void) => () => void
}

export const ConfigWatcherTag = Context.GenericTag<ConfigWatcher>('ConfigWatcher')

// Trace formatter interface
export interface TraceFormatter {
  readonly formatTrace: (traceId: string, spans: SpanData[], options: FormatOptions) => string
}

export const TraceFormatterTag = Context.GenericTag<TraceFormatter>('TraceFormatter')

// Helper function to convert string to LogLevel enum
export const stringToLogLevel = (level: LogLevelString): LogLevel => {
  const levelMap: Record<LogLevelString, LogLevel> = {
    trace: LogLevel.TRACE,
    debug: LogLevel.DEBUG,
    info: LogLevel.INFO,
    warn: LogLevel.WARN,
    error: LogLevel.ERROR,
    off: LogLevel.OFF
  }
  return levelMap[level]
}

// Helper function to convert LogLevel enum to string
export const logLevelToString = (level: LogLevel): LogLevelString => {
  const stringMap: Record<LogLevel, LogLevelString> = {
    [LogLevel.TRACE]: 'trace',
    [LogLevel.DEBUG]: 'debug',
    [LogLevel.INFO]: 'info',
    [LogLevel.WARN]: 'warn',
    [LogLevel.ERROR]: 'error',
    [LogLevel.OFF]: 'off'
  }
  return stringMap[level]
}
