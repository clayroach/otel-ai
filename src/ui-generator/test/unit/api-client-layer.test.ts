/**
 * Unit tests for UI Generator API Client Layer
 *
 * Tests the Effect-TS layer interface used by server.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Effect, Layer } from 'effect'
import {
  UIGeneratorAPIClientTag,
  UIGeneratorAPIClientLayer,
  makeUIGeneratorAPIClientService,
  generateQuery,
  generateMultipleQueries,
  validateQuery,
  type UIGeneratorAPIClientService
} from '../../api-client-layer.js'
import { UIGeneratorAPIClient } from '../../api-client.js'
import type { QueryGenerationAPIRequest, QueryGenerationAPIResponse } from '../../api-client.js'

// Mock the UIGeneratorAPIClient
vi.mock('../../api-client.js', () => ({
  UIGeneratorAPIClient: {
    generateQuery: vi.fn(),
    generateMultipleQueries: vi.fn(),
    validateQuery: vi.fn()
  }
}))

describe('UI Generator API Client Layer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('UIGeneratorAPIClientTag', () => {
    it('should be a valid Context Tag', () => {
      expect(UIGeneratorAPIClientTag).toBeDefined()
      // Context.Tag is a class/function, not an instance
      expect(typeof UIGeneratorAPIClientTag).toBe('function')
    })
  })

  describe('makeUIGeneratorAPIClientService', () => {
    it('should create a service with all required methods', async () => {
      const service = await Effect.runPromise(makeUIGeneratorAPIClientService)

      expect(service).toBeDefined()
      expect(service.generateQuery).toBeInstanceOf(Function)
      expect(service.generateMultipleQueries).toBeInstanceOf(Function)
      expect(service.validateQuery).toBeInstanceOf(Function)
    })
  })

  describe('UIGeneratorAPIClientLayer', () => {
    it('should provide the service through Effect Layer', async () => {
      const program = Effect.gen(function* () {
        const service = yield* UIGeneratorAPIClientTag
        return service
      })

      const service = await Effect.runPromise(
        Effect.provide(program, UIGeneratorAPIClientLayer)
      )

      expect(service).toBeDefined()
      expect(service.generateQuery).toBeInstanceOf(Function)
      expect(service.generateMultipleQueries).toBeInstanceOf(Function)
      expect(service.validateQuery).toBeInstanceOf(Function)
    })
  })

  describe('Service Methods', () => {
    let service: UIGeneratorAPIClientService

    beforeEach(async () => {
      service = await Effect.runPromise(makeUIGeneratorAPIClientService)
    })

    describe('generateQuery', () => {
      it('should successfully generate a query', async () => {
        const mockRequest: QueryGenerationAPIRequest = {
          path: {
            id: 'test-path',
            name: 'Test Path',
            services: ['service-a', 'service-b'],
            startService: 'service-a',
            endService: 'service-b'
          },
          analysisGoal: 'latency',
          model: 'test-model'
        }

        const mockResponse: QueryGenerationAPIResponse = {
          sql: 'SELECT * FROM traces',
          model: 'test-model',
          description: 'Test query',
          generationTimeMs: 100
        }

        vi.mocked(UIGeneratorAPIClient.generateQuery).mockResolvedValue(mockResponse)

        const result = await Effect.runPromise(service.generateQuery(mockRequest))

        expect(result).toEqual(mockResponse)
        expect(UIGeneratorAPIClient.generateQuery).toHaveBeenCalledWith(mockRequest)
      })

      it('should handle errors properly', async () => {
        const mockRequest: QueryGenerationAPIRequest = {
          path: {
            id: 'test-path',
            name: 'Test Path',
            services: ['service-a'],
            startService: 'service-a',
            endService: 'service-a'
          }
        }

        const mockError = new Error('Generation failed')
        vi.mocked(UIGeneratorAPIClient.generateQuery).mockRejectedValue(mockError)

        await expect(
          Effect.runPromise(service.generateQuery(mockRequest))
        ).rejects.toThrow('Generation failed')
      })
    })

    describe('generateMultipleQueries', () => {
      it('should successfully generate multiple queries', async () => {
        const mockRequest = {
          path: {
            id: 'test-path',
            name: 'Test Path',
            services: ['service-a', 'service-b'],
            startService: 'service-a',
            endService: 'service-b'
          },
          patterns: ['latency', 'errors']
        }

        const mockResponses: QueryGenerationAPIResponse[] = [
          {
            sql: 'SELECT * FROM traces WHERE type = "latency"',
            model: 'test-model',
            description: 'Latency query',
            generationTimeMs: 100
          },
          {
            sql: 'SELECT * FROM traces WHERE type = "errors"',
            model: 'test-model',
            description: 'Error query',
            generationTimeMs: 150
          }
        ]

        vi.mocked(UIGeneratorAPIClient.generateMultipleQueries).mockResolvedValue(mockResponses)

        const result = await Effect.runPromise(service.generateMultipleQueries(mockRequest))

        expect(result).toEqual(mockResponses)
        expect(UIGeneratorAPIClient.generateMultipleQueries).toHaveBeenCalledWith(mockRequest)
      })

      it('should handle errors in multiple query generation', async () => {
        const mockRequest = {
          path: {
            id: 'test-path',
            name: 'Test Path',
            services: ['service-a'],
            startService: 'service-a',
            endService: 'service-a'
          }
        }

        const mockError = new Error('Multiple generation failed')
        vi.mocked(UIGeneratorAPIClient.generateMultipleQueries).mockRejectedValue(mockError)

        await expect(
          Effect.runPromise(service.generateMultipleQueries(mockRequest))
        ).rejects.toThrow('Multiple generation failed')
      })
    })

    describe('validateQuery', () => {
      it('should successfully validate a query', async () => {
        const sql = 'SELECT * FROM traces'
        const mockValidation = { valid: true, errors: [] }

        vi.mocked(UIGeneratorAPIClient.validateQuery).mockReturnValue(mockValidation)

        const result = await Effect.runPromise(service.validateQuery(sql))

        expect(result).toEqual(mockValidation)
        expect(UIGeneratorAPIClient.validateQuery).toHaveBeenCalledWith(sql)
      })

      it('should return validation errors', async () => {
        const sql = 'INVALID SQL'
        const mockValidation = {
          valid: false,
          errors: ['Syntax error near INVALID']
        }

        vi.mocked(UIGeneratorAPIClient.validateQuery).mockReturnValue(mockValidation)

        const result = await Effect.runPromise(service.validateQuery(sql))

        expect(result).toEqual(mockValidation)
        expect(result.valid).toBe(false)
        expect(result.errors).toHaveLength(1)
      })
    })
  })

  describe('Convenience Functions', () => {
    const mockLayer = Layer.succeed(UIGeneratorAPIClientTag, {
      generateQuery: (_request: QueryGenerationAPIRequest) =>
        Effect.succeed({
          sql: 'SELECT * FROM traces',
          model: 'test-model',
          description: 'Test query',
          generationTimeMs: 100
        }),
      generateMultipleQueries: () =>
        Effect.succeed([
          {
            sql: 'SELECT 1',
            model: 'test',
            description: 'Test'
          }
        ]),
      validateQuery: (sql: string) =>
        Effect.succeed({ valid: sql.includes('SELECT'), errors: [] })
    })

    describe('generateQuery convenience function', () => {
      it('should work with the provided layer', async () => {
        const request: QueryGenerationAPIRequest = {
          path: {
            id: 'test',
            name: 'Test',
            services: ['a'],
            startService: 'a',
            endService: 'a'
          }
        }

        const result = await Effect.runPromise(
          Effect.provide(generateQuery(request), mockLayer)
        )

        expect(result).toBeDefined()
        expect(result.sql).toBe('SELECT * FROM traces')
      })
    })

    describe('generateMultipleQueries convenience function', () => {
      it('should work with the provided layer', async () => {
        const request = {
          path: {
            id: 'test',
            name: 'Test',
            services: ['a'],
            startService: 'a',
            endService: 'a'
          },
          patterns: ['test']
        }

        const result = await Effect.runPromise(
          Effect.provide(generateMultipleQueries(request), mockLayer)
        )

        expect(result).toBeDefined()
        expect(result).toHaveLength(1)
      })
    })

    describe('validateQuery convenience function', () => {
      it('should work with the provided layer', async () => {
        const sql = 'SELECT * FROM traces'

        const result = await Effect.runPromise(
          Effect.provide(validateQuery(sql), mockLayer)
        )

        expect(result).toBeDefined()
        expect(result.valid).toBe(true)
        expect(result.errors).toHaveLength(0)
      })
    })
  })
})