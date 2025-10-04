/**
 * Unit tests for debug logger
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createDebugLogger } from '../../src/debug-logger.js'
import type { ConfigWatcher, TraceFormatter, DebugConfig } from '../../src/types.js'
import { hierarchicalTrace } from '../fixtures/test-traces.js'

describe('DebugLogger', () => {
  // Mock console.log to test server logging
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  describe('Console Target: server', () => {
    it('should log to console when console=server', () => {
      const mockConfig: DebugConfig = {
        debug: {
          level: 'trace',
          traces: {
            enabled: true,
            console: 'server',
            maxDepth: 10,
            showTimings: true,
            showAttributes: false,
            colorOutput: false
          },
          hotReload: {
            enabled: true,
            debounceMs: 500
          }
        }
      }

      const mockConfigWatcher: ConfigWatcher = {
        getCurrentConfig: () => mockConfig,
        reload: vi.fn(),
        subscribe: vi.fn(() => () => {})
      }

      const mockTraceFormatter: TraceFormatter = {
        formatTrace: vi.fn(() => '[TRACE] Mock formatted trace')
      }

      const logger = createDebugLogger(mockConfigWatcher, mockTraceFormatter)

      // Call logTrace
      logger.logTrace('trace-001', hierarchicalTrace)

      // Assert console.log was called
      expect(consoleLogSpy).toHaveBeenCalledWith('[TRACE] Mock formatted trace')
    })
  })

  describe('Console Target: browser', () => {
    it('should NOT log to console when console=browser', () => {
      const mockConfig: DebugConfig = {
        debug: {
          level: 'trace',
          traces: {
            enabled: true,
            console: 'browser',
            maxDepth: 10,
            showTimings: true,
            showAttributes: false,
            colorOutput: false
          },
          hotReload: {
            enabled: true,
            debounceMs: 500
          }
        }
      }

      const mockConfigWatcher: ConfigWatcher = {
        getCurrentConfig: () => mockConfig,
        reload: vi.fn(),
        subscribe: vi.fn(() => () => {})
      }

      const mockTraceFormatter: TraceFormatter = {
        formatTrace: vi.fn(() => '[TRACE] Mock formatted trace')
      }

      const logger = createDebugLogger(mockConfigWatcher, mockTraceFormatter)

      // Call logTrace
      logger.logTrace('trace-001', hierarchicalTrace)

      // Assert console.log was NOT called
      expect(consoleLogSpy).not.toHaveBeenCalled()
    })
  })

  describe('Console Target: both', () => {
    it('should log to console when console=both', () => {
      const mockConfig: DebugConfig = {
        debug: {
          level: 'trace',
          traces: {
            enabled: true,
            console: 'both',
            maxDepth: 10,
            showTimings: true,
            showAttributes: false,
            colorOutput: false
          },
          hotReload: {
            enabled: true,
            debounceMs: 500
          }
        }
      }

      const mockConfigWatcher: ConfigWatcher = {
        getCurrentConfig: () => mockConfig,
        reload: vi.fn(),
        subscribe: vi.fn(() => () => {})
      }

      const mockTraceFormatter: TraceFormatter = {
        formatTrace: vi.fn(() => '[TRACE] Mock formatted trace')
      }

      const logger = createDebugLogger(mockConfigWatcher, mockTraceFormatter)

      // Call logTrace
      logger.logTrace('trace-001', hierarchicalTrace)

      // Assert console.log was called
      expect(consoleLogSpy).toHaveBeenCalledWith('[TRACE] Mock formatted trace')
    })
  })

  describe('formatTrace method', () => {
    it('should format trace without logging', () => {
      const mockConfig: DebugConfig = {
        debug: {
          level: 'trace',
          traces: {
            enabled: true,
            console: 'server',
            maxDepth: 10,
            showTimings: true,
            showAttributes: false,
            colorOutput: false
          },
          hotReload: {
            enabled: true,
            debounceMs: 500
          }
        }
      }

      const mockConfigWatcher: ConfigWatcher = {
        getCurrentConfig: () => mockConfig,
        reload: vi.fn(),
        subscribe: vi.fn(() => () => {})
      }

      const mockTraceFormatter: TraceFormatter = {
        formatTrace: vi.fn(() => '[TRACE] Mock formatted trace')
      }

      const logger = createDebugLogger(mockConfigWatcher, mockTraceFormatter)

      // Reset spy to ensure clean state
      consoleLogSpy.mockClear()

      // Call formatTrace
      const result = logger.formatTrace('trace-001', hierarchicalTrace)

      // Assert returns formatted string
      expect(result).toBe('[TRACE] Mock formatted trace')

      // Assert console.log was NOT called
      expect(consoleLogSpy).not.toHaveBeenCalled()
    })

    it('should work regardless of console setting', () => {
      const mockConfig: DebugConfig = {
        debug: {
          level: 'trace',
          traces: {
            enabled: true,
            console: 'browser', // Different setting
            maxDepth: 10,
            showTimings: true,
            showAttributes: false,
            colorOutput: false
          },
          hotReload: {
            enabled: true,
            debounceMs: 500
          }
        }
      }

      const mockConfigWatcher: ConfigWatcher = {
        getCurrentConfig: () => mockConfig,
        reload: vi.fn(),
        subscribe: vi.fn(() => () => {})
      }

      const mockTraceFormatter: TraceFormatter = {
        formatTrace: vi.fn(() => '[TRACE] Mock formatted trace')
      }

      const logger = createDebugLogger(mockConfigWatcher, mockTraceFormatter)

      // Call formatTrace
      const result = logger.formatTrace('trace-001', hierarchicalTrace)

      // Assert returns formatted string
      expect(result).toBe('[TRACE] Mock formatted trace')
    })

    it('should always use colorOutput: false for browser compatibility', () => {
      const mockConfig: DebugConfig = {
        debug: {
          level: 'trace',
          traces: {
            enabled: true,
            console: 'both',
            maxDepth: 5,
            showTimings: false,
            showAttributes: true,
            colorOutput: true // Even if true in config
          },
          hotReload: {
            enabled: true,
            debounceMs: 500
          }
        }
      }

      const mockConfigWatcher: ConfigWatcher = {
        getCurrentConfig: () => mockConfig,
        reload: vi.fn(),
        subscribe: vi.fn(() => () => {})
      }

      const mockTraceFormatter: TraceFormatter = {
        formatTrace: vi.fn(() => '[TRACE] Mock formatted trace')
      }

      const logger = createDebugLogger(mockConfigWatcher, mockTraceFormatter)

      // Call formatTrace
      logger.formatTrace('trace-001', hierarchicalTrace)

      // Assert formatTrace was called with colorOutput: false
      expect(mockTraceFormatter.formatTrace).toHaveBeenCalledWith(
        'trace-001',
        hierarchicalTrace,
        {
          maxDepth: 5,
          showTimings: false,
          showAttributes: true,
          colorOutput: false // Should be false for browser compatibility
        }
      )
    })
  })
})
