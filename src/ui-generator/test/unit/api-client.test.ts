/**
 * Unit tests for UI Generator API Client
 *
 * Tests the main API client that handles query generation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Effect, Layer, Stream } from 'effect'
import { UIGeneratorAPIClient } from '../../api-client.js'
import type { QueryGenerationAPIRequest } from '../../api-client.js'
import { LLMManagerServiceTag } from '../../../llm-manager/index.js'
import type { ManagerStatus } from '../../../llm-manager/index.js'
import type { LLMRequest, LLMResponse, LLMError } from '../../../llm-manager/types.js'

// Create a mock LLM Manager Layer for testing
const createMockLLMManagerLayer = (mockResponse?: Partial<LLMResponse>, shouldFail?: boolean, error?: LLMError) => {
  return Layer.succeed(LLMManagerServiceTag, {
    generate: (request: LLMRequest): Effect.Effect<LLMResponse, LLMError, never> => {
      if (shouldFail && error) {
        return Effect.fail(error)
      }
      if (shouldFail) {
        // Create a proper LLMError
        const llmError: LLMError = {
          _tag: 'NetworkError',
          model: request.preferences?.model || 'mock-model',
          message: 'LLM generation failed'
        }
        return Effect.fail(llmError)
      }

      const response: LLMResponse = {
        content: mockResponse?.content || 'Mock LLM response',
        model: mockResponse?.model || request.preferences?.model || 'mock-model',
        usage: mockResponse?.usage || {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
          cost: 0
        },
        metadata: mockResponse?.metadata || {
          latencyMs: 100,
          retryCount: 0,
          cached: false
        }
      }
      return Effect.succeed(response)
    },
    generateStream: (request: LLMRequest): Stream.Stream<string, LLMError, never> => {
      const error: LLMError = {
        _tag: 'NetworkError',
        model: request.preferences?.model || 'mock-model',
        message: 'Streaming not implemented in mock'
      }
      return Stream.fail(error)
    },
    isHealthy: () => Effect.succeed(true),
    getStatus: (): Effect.Effect<ManagerStatus, never, never> => Effect.succeed({
      availableModels: ['mock-model'],
      healthStatus: { 'mock-model': 'healthy' },
      config: {}
    } as ManagerStatus),
    getAvailableModels: () => Effect.succeed(['mock-model'])
  })
}

describe('UIGeneratorAPIClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Model selection now handled by Portkey configuration
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('generateQuery with mocked LLM layer', () => {
    it('should successfully generate and sanitize a query', async () => {
      const mockRequest: QueryGenerationAPIRequest = {
        path: {
          id: 'path-123',
          name: 'Critical Path',
          services: ['frontend', 'api', 'database'],
          startService: 'frontend',
          endService: 'database'
        },
        model: 'sqlcoder-7b-2'  // Specify the model to match expectations
      }

      // For sqlcoder models, the LLM returns raw SQL which gets wrapped by llm-query-generator
      // So our mock should return raw SQL, not JSON
      const mockLayer = createMockLLMManagerLayer({
        content: 'SELECT service_name, COUNT(*) FROM traces GROUP BY service_name;',
        model: 'sqlcoder-7b-2'
      })

      // Temporarily replace the LLMManagerLive import
      const originalModule = await import('../../../llm-manager/index.js')
      type LLMManagerLiveType = typeof originalModule.LLMManagerLive
      vi.spyOn(originalModule, 'LLMManagerLive', 'get').mockReturnValue(mockLayer as LLMManagerLiveType)

      const result = await UIGeneratorAPIClient.generateQuery(mockRequest)

      expect(result).toBeDefined()
      // The SQL should be sanitized (semicolon removed, otel. prefix added) and include metadata
      expect(result.sql).toContain('SELECT service_name, COUNT(*) FROM otel.traces GROUP BY service_name')
      expect(result.sql).toContain('-- Model: sqlcoder-7b-2')
      expect(result.sql).toContain('-- Services: frontend, api, database')
      expect(result.model).toBe('sqlcoder-7b-2')
      // For SQL-specific models, description is auto-generated
      expect(result.description).toContain('Query generated for')
      // SQL-specific models don't return expectedColumns (empty array)
      expect(result.expectedColumns).toHaveLength(0)
      expect(result.generationTimeMs).toBeGreaterThanOrEqual(0)
    })

    it('should handle JSON responses from non-SQL models', async () => {
      const mockRequest: QueryGenerationAPIRequest = {
        path: {
          id: 'path-456',
          name: 'JSON Path',
          services: ['service-a', 'service-b'],
          startService: 'service-a',
          endService: 'service-b'
        },
        model: 'gpt-3.5-turbo' // Non-SQL model
      }

      // For non-SQL models, return proper JSON
      const mockLayer = createMockLLMManagerLayer({
        content: JSON.stringify({
          sql: 'SELECT * FROM traces WHERE service_name IN (\'service-a\', \'service-b\');',
          description: 'Analyze path performance',
          expectedColumns: [
            { name: 'trace_id', type: 'string', description: 'Trace identifier' },
            { name: 'service_name', type: 'string', description: 'Service name' }
          ],
          reasoning: 'Analyzing critical path performance'
        }),
        model: 'gpt-3.5-turbo'
      })

      const originalModule = await import('../../../llm-manager/index.js')
      type LLMManagerLiveType = typeof originalModule.LLMManagerLive
      vi.spyOn(originalModule, 'LLMManagerLive', 'get').mockReturnValue(mockLayer as LLMManagerLiveType)

      const result = await UIGeneratorAPIClient.generateQuery(mockRequest)

      expect(result).toBeDefined()
      // The SQL should be sanitized (semicolon removed, otel. prefix added) and include metadata
      expect(result.sql).toContain('SELECT * FROM otel.traces WHERE service_name IN (\'service-a\', \'service-b\')')
      expect(result.sql).toContain('-- Model: gpt-3.5-turbo')
      expect(result.sql).toContain('-- Services: service-a, service-b')
      expect(result.model).toBe('gpt-3.5-turbo')
      expect(result.description).toBe('Analyze path performance')
      // Non-SQL models return proper expectedColumns
      expect(result.expectedColumns).toHaveLength(2)
      expect(result.expectedColumns?.[0]).toMatchObject({
        name: 'trace_id',
        type: 'string',
        description: 'Column: trace_id'
      })
      expect(result.generationTimeMs).toBeGreaterThanOrEqual(0)
    })

    it('should handle ModelUnavailable errors', async () => {
      const mockRequest: QueryGenerationAPIRequest = {
        path: {
          id: 'path-789',
          name: 'Test Path',
          services: ['service-x'],
          startService: 'service-x',
          endService: 'service-x'
        }
      }

      const modelUnavailableError: LLMError = {
        _tag: 'ModelUnavailable',
        model: 'test-model',
        message: 'Model is not available'
      }

      const mockLayer = createMockLLMManagerLayer(undefined, true, modelUnavailableError)
      const originalModule = await import('../../../llm-manager/index.js')
      type LLMManagerLiveType = typeof originalModule.LLMManagerLive
      vi.spyOn(originalModule, 'LLMManagerLive', 'get').mockReturnValue(mockLayer as LLMManagerLiveType)

      // The error gets wrapped by llm-query-generator, so we check the message contains the error
      await expect(UIGeneratorAPIClient.generateQuery(mockRequest)).rejects.toThrow(
        'LLM query generation failed'
      )
    })

    it('should generate fallback query for other errors', async () => {
      const mockRequest: QueryGenerationAPIRequest = {
        path: {
          id: 'path-fallback',
          name: 'Fallback Path',
          services: ['svc-1', 'svc-2', 'svc-3'],
          startService: 'svc-1',
          endService: 'svc-3'
        }
      }

      const mockLayer = createMockLLMManagerLayer(undefined, true)
      const originalModule = await import('../../../llm-manager/index.js')
      type LLMManagerLiveType = typeof originalModule.LLMManagerLive
      vi.spyOn(originalModule, 'LLMManagerLive', 'get').mockReturnValue(mockLayer as LLMManagerLiveType)

      const result = await UIGeneratorAPIClient.generateQuery(mockRequest)

      expect(result.sql).toContain('SELECT')
      expect(result.sql).toContain('svc-1')
      expect(result.sql).toContain('svc-2')
      expect(result.sql).toContain('svc-3')
      expect(result.sql).toContain('otel.traces')
      expect(result.model).toBe('fallback')
      expect(result.description).toContain('Fallback query generated due to error')
    })
  })

  describe('generateMultipleQueries with mocked LLM layer', () => {
    it('should generate multiple queries for different patterns', async () => {
      const mockRequest = {
        path: {
          id: 'multi-path',
          name: 'Multi Analysis',
          services: ['svc-a', 'svc-b'],
          startService: 'svc-a',
          endService: 'svc-b'
        },
        model: 'sqlcoder-7b-2',  // Specify the model to match expectations
        patterns: ['latency', 'errors']
      }

      let callCount = 0
      // For sqlcoder models, return raw SQL
      const responses = [
        'SELECT latency FROM traces;',
        'SELECT errors FROM traces;'
      ]

      const mockLayer = Layer.succeed(LLMManagerServiceTag, {
        generate: (request: LLMRequest): Effect.Effect<LLMResponse, LLMError, never> => {
          const response: LLMResponse = {
            content: responses[callCount] || '',
            model: request.preferences?.model || 'sqlcoder-7b-2',
            usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, cost: 0 },
            metadata: { latencyMs: 100, retryCount: 0, cached: false }
          }
          callCount++
          return Effect.succeed(response)
        },
        generateStream: (request: LLMRequest): Stream.Stream<string, LLMError, never> => {
          const error: LLMError = {
            _tag: 'NetworkError',
            model: request.preferences?.model || 'mock-model',
            message: 'Not implemented'
          }
          return Stream.fail(error)
        },
        isHealthy: () => Effect.succeed(true),
        getStatus: (): Effect.Effect<ManagerStatus, never, never> => Effect.succeed({
          availableModels: ['mock-model'],
          healthStatus: {},
          config: {}
        } as ManagerStatus),
        getAvailableModels: () => Effect.succeed(['mock-model'])
      })

      const originalModule = await import('../../../llm-manager/index.js')
      type LLMManagerLiveType = typeof originalModule.LLMManagerLive
      vi.spyOn(originalModule, 'LLMManagerLive', 'get').mockReturnValue(mockLayer as LLMManagerLiveType)

      const results = await UIGeneratorAPIClient.generateMultipleQueries(mockRequest)

      expect(results).toHaveLength(2)
      // Check that SQL content is present (with metadata comments)
      expect(results[0]?.sql).toContain('SELECT latency FROM otel.traces')
      expect(results[0]?.sql).toContain('-- Model: sqlcoder-7b-2')
      expect(results[0]?.sql).toContain('-- Analysis Goal: latency')
      expect(results[1]?.sql).toContain('SELECT errors FROM otel.traces')
      expect(results[1]?.sql).toContain('-- Model: sqlcoder-7b-2')
      expect(results[1]?.sql).toContain('-- Analysis Goal: errors')
    })
  })

  describe('validateQuery', () => {
    it('should validate a correct SQL query', () => {
      const sql = 'SELECT service_name, COUNT(*) FROM traces GROUP BY service_name'
      const result = UIGeneratorAPIClient.validateQuery(sql)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should detect missing SELECT keyword', () => {
      const sql = 'service_name FROM traces'
      const result = UIGeneratorAPIClient.validateQuery(sql)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Query must contain SELECT statement')
    })

    it('should detect missing FROM clause', () => {
      const sql = 'SELECT service_name'
      const result = UIGeneratorAPIClient.validateQuery(sql)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Query must specify FROM table')
    })

    it('should detect potentially dangerous operations', () => {
      const sql = 'SELECT * FROM traces; DROP TABLE users'
      const result = UIGeneratorAPIClient.validateQuery(sql)

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('Forbidden'))).toBe(true)
    })

    it('should validate empty or null queries', () => {
      expect(UIGeneratorAPIClient.validateQuery('').valid).toBe(false)
      expect(UIGeneratorAPIClient.validateQuery('   ').valid).toBe(false)
    })

    it('should detect DELETE operations', () => {
      const sql = 'SELECT * FROM traces WHERE id = 1; DELETE FROM users'
      const result = UIGeneratorAPIClient.validateQuery(sql)

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('DELETE'))).toBe(true)
    })

    it('should detect INSERT operations', () => {
      const sql = 'INSERT INTO traces VALUES (1, 2, 3)'
      const result = UIGeneratorAPIClient.validateQuery(sql)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Query must contain SELECT statement')
      expect(result.errors.some(e => e.includes('INSERT'))).toBe(true)
    })

    it('should detect UPDATE operations', () => {
      const sql = 'UPDATE traces SET status = "OK"'
      const result = UIGeneratorAPIClient.validateQuery(sql)

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('UPDATE'))).toBe(true)
    })

    it('should allow complex valid queries', () => {
      const sql = `
        SELECT
          service_name,
          COUNT(*) as count,
          AVG(duration_ns) as avg_duration
        FROM traces
        WHERE start_time > now() - INTERVAL 1 HOUR
        GROUP BY service_name
        HAVING count > 100
        ORDER BY avg_duration DESC
      `
      const result = UIGeneratorAPIClient.validateQuery(sql)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })
  })

  describe('Helper Methods', () => {
    describe('sanitizeSQL', () => {
      it('should remove trailing semicolons from SQL', () => {
        const sql = 'SELECT * FROM traces;'
        // @ts-ignore - accessing private method for testing
        const sanitized = UIGeneratorAPIClient.sanitizeSQL(sql)

        expect(sanitized).toBe('SELECT * FROM otel.traces')
        expect(sanitized).not.toContain(';')
      })

      it('should add otel prefix to traces table', () => {
        const sql = 'SELECT * FROM traces WHERE service_name = "test"'
        // @ts-ignore - accessing private method for testing
        const sanitized = UIGeneratorAPIClient.sanitizeSQL(sql)

        expect(sanitized).toBe('SELECT * FROM otel.traces WHERE service_name = "test"')
      })

      it('should handle multiple FROM traces occurrences', () => {
        const sql = 'SELECT * FROM traces UNION SELECT * FROM traces'
        // @ts-ignore - accessing private method for testing
        const sanitized = UIGeneratorAPIClient.sanitizeSQL(sql)

        expect(sanitized).toBe('SELECT * FROM otel.traces UNION SELECT * FROM otel.traces')
      })

      it('should trim whitespace', () => {
        const sql = '  SELECT * FROM traces  '
        // @ts-ignore - accessing private method for testing
        const sanitized = UIGeneratorAPIClient.sanitizeSQL(sql)

        expect(sanitized).toBe('SELECT * FROM otel.traces')
      })

      it('should handle case insensitive FROM traces', () => {
        const sql = 'SELECT * from Traces'
        // @ts-ignore - accessing private method for testing
        const sanitized = UIGeneratorAPIClient.sanitizeSQL(sql)

        expect(sanitized).toBe('SELECT * FROM otel.traces')
      })
    })

    describe('generateFallbackQuery', () => {
      it('should generate a basic query for the given path', () => {
        const path = {
          id: 'fallback-test',
          name: 'Fallback Test',
          services: ['api', 'database'],
          startService: 'api',
          endService: 'database'
        }

        // @ts-ignore - accessing private method for testing
        const fallbackQuery = UIGeneratorAPIClient.generateFallbackQuery(path)

        expect(fallbackQuery).toContain('SELECT')
        expect(fallbackQuery).toContain('api')
        expect(fallbackQuery).toContain('database')
        expect(fallbackQuery).toContain('otel.traces')
        expect(fallbackQuery).toContain('service_name IN')
      })

      it('should escape single quotes in service names', () => {
        const path = {
          id: 'escape-test',
          name: 'Escape Test',
          services: ["service'with'quotes"],
          startService: "service'with'quotes",
          endService: "service'with'quotes"
        }

        // @ts-ignore - accessing private method for testing
        const fallbackQuery = UIGeneratorAPIClient.generateFallbackQuery(path)

        expect(fallbackQuery).toContain("service''with''quotes")
      })
    })

    describe('getExpectedColumns', () => {
      it('should return standard trace columns', () => {
        // @ts-ignore - accessing private method for testing
        const columns = UIGeneratorAPIClient.getExpectedColumns()

        expect(columns).toBeDefined()
        expect(Array.isArray(columns)).toBe(true)
        expect(columns.length).toBeGreaterThan(0)
        expect(columns[0]).toHaveProperty('name')
        expect(columns[0]).toHaveProperty('type')
        expect(columns[0]).toHaveProperty('description')
      })

      it('should include expected column names', () => {
        // @ts-ignore - accessing private method for testing
        const columns = UIGeneratorAPIClient.getExpectedColumns() as Array<{ name: string; type: string; description: string }>
        const columnNames = columns.map(c => c.name)

        expect(columnNames).toContain('service_name')
        expect(columnNames).toContain('minute')
        expect(columnNames).toContain('request_count')
        expect(columnNames).toContain('p50_ms')
        expect(columnNames).toContain('p95_ms')
        expect(columnNames).toContain('p99_ms')
        expect(columnNames).toContain('error_count')
        expect(columnNames).toContain('error_rate')
      })
    })
  })
})