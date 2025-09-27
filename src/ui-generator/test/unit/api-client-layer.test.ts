/**
 * Unit tests for UI Generator API Client Layer
 *
 * Tests the Effect-TS layer interface used by server.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Effect, Layer, Stream } from 'effect'
import {
  UIGeneratorAPIClientTag,
  UIGeneratorAPIClientLayer,
  makeUIGeneratorAPIClientService,
  generateQuery,
  generateMultipleQueries,
  validateQuery,
  type UIGeneratorAPIClientService
} from '../../api-client-layer.js'
import type { QueryGenerationAPIRequest, QueryGenerationAPIResponse } from '../../api-client.js'
import { UIGeneratorService, UIGeneratorServiceTag } from '../../service.js'
import { ConfigServiceTag } from '../../../storage/services.js'
import { LLMManagerServiceTag, type LLMManagerService } from '../../../llm-manager/llm-manager-service.js'
import { StorageServiceTag, type StorageService } from '../../../storage/services.js'

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
      // Create a mock UIGeneratorService
      const mockUIGeneratorService: UIGeneratorService = {
        generateQuery: () => Effect.succeed({
          sql: 'SELECT * FROM traces',
          model: 'mock',
          description: 'Mock query',
          expectedColumns: [],
          generationTimeMs: 100
        }),
        generateMultipleQueries: () => Effect.succeed([]),
        validateQuery: () => Effect.succeed({ valid: true, errors: [] })
      }

      const mockLayer = Layer.succeed(UIGeneratorServiceTag, mockUIGeneratorService)

      const service = await Effect.runPromise(
        Effect.provide(makeUIGeneratorAPIClientService, mockLayer)
      )

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

      const mockLLMLayer = Layer.succeed(LLMManagerServiceTag, {
        generate: () => Effect.succeed({
          model: 'mock',
          content: 'mock response',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          metadata: {
            latencyMs: 0,
            retryCount: 0,
            cached: false
          }
        }),
        generateStream: () => Stream.fromIterable(['mock']),
        isHealthy: () => Effect.succeed(true),
        getStatus: () => Effect.succeed({
          availableModels: [],
          healthStatus: {},
          config: {}
        }),
        getAvailableModels: () => Effect.succeed([]),
        getDefaultModel: () => Effect.succeed('mock'),
        getModelInfo: () => Effect.succeed({
          id: 'mock',
          provider: 'custom' as const,
          name: 'Mock Model',
          capabilities: [],
          metadata: {
            contextLength: 4096,
            maxTokens: 2048,
            temperature: 0.7
          }
        }),
        getModelsByCapability: () => Effect.succeed([]),
        getModelsByProvider: () => Effect.succeed([]),
        getAllModels: () => Effect.succeed([])
      })

      const mockStorageLayer = Layer.succeed(StorageServiceTag, {
        writeOTLP: () => Effect.succeed(undefined),
        writeBatch: () => Effect.succeed(undefined),
        queryTraces: () => Effect.succeed([]),
        queryMetrics: () => Effect.succeed([]),
        queryLogs: () => Effect.succeed([]),
        queryForAI: () => Effect.succeed({
          features: [],
          metadata: {},
          timeRange: { start: 0, end: 0 },
          sampleCount: 0
        }),
        queryRaw: () => Effect.succeed([]),
        insertRaw: () => Effect.succeed(undefined),
        queryText: () => Effect.succeed(''),
        archiveData: () => Effect.succeed(undefined),
        applyRetentionPolicies: () => Effect.succeed(undefined),
        healthCheck: () => Effect.succeed({ clickhouse: true, s3: true }),
        getStorageStats: () => Effect.succeed({
          clickhouse: { totalTraces: 0, totalMetrics: 0, totalLogs: 0, diskUsage: "0B" },
          s3: { totalSize: "0B", totalObjects: 0, oldestObject: null, newestObject: null }
        })
      })

      // Also need ConfigService for complete dependency chain
      const mockConfigLayer = Layer.succeed(ConfigServiceTag, {
        clickhouse: {
          host: 'localhost',
          port: 8123,
          database: 'otel',
          username: 'otel',
          password: 'otel123'
        },
        s3: {
          accessKeyId: 'minioadmin',
          secretAccessKey: 'minioadmin',
          endpoint: 'http://minio:9000',
          region: 'us-east-1',
          bucket: 'otel-archive'
        },
        retention: {
          traces: { clickhouse: '30d', s3: '1y' },
          metrics: { clickhouse: '90d', s3: '2y' },
          logs: { clickhouse: '7d', s3: '30d' }
        },
        performance: {
          batchSize: 1000,
          flushInterval: 5000,
          maxConcurrentWrites: 5
        }
      })

      // Provide dependencies to the layer, then use it in the program
      const completeLayer = Layer.provide(
        UIGeneratorAPIClientLayer,
        Layer.mergeAll(mockLLMLayer, mockStorageLayer, mockConfigLayer)
      )

      const service = await Effect.runPromise(
        Effect.provide(program, completeLayer)
      )

      expect(service).toBeDefined()
      expect(service.generateQuery).toBeInstanceOf(Function)
      expect(service.generateMultipleQueries).toBeInstanceOf(Function)
      expect(service.validateQuery).toBeInstanceOf(Function)
    })
  })

  describe('Service Methods', () => {
    let service: UIGeneratorAPIClientService
    let mockLLMService: LLMManagerService
    let mockStorageService: StorageService

    beforeEach(async () => {
      mockLLMService = {
        generate: () => Effect.succeed({
          model: 'mock',
          content: 'mock response',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          metadata: {
            latencyMs: 0,
            retryCount: 0,
            cached: false
          }
        }),
        generateStream: () => Stream.fromIterable(['mock']),
        isHealthy: () => Effect.succeed(true),
        getStatus: () => Effect.succeed({
          availableModels: [],
          healthStatus: {},
          config: {}
        }),
        getAvailableModels: () => Effect.succeed([]),
        getDefaultModel: () => Effect.succeed('mock'),
        getModelInfo: () => Effect.succeed({
          id: 'mock',
          provider: 'custom' as const,
          name: 'Mock Model',
          capabilities: [],
          metadata: {
            contextLength: 4096,
            maxTokens: 2048,
            temperature: 0.7
          }
        }),
        getModelsByCapability: () => Effect.succeed([]),
        getModelsByProvider: () => Effect.succeed([]),
        getAllModels: () => Effect.succeed([])
      }

      mockStorageService = {
        writeOTLP: () => Effect.succeed(undefined),
        writeBatch: () => Effect.succeed(undefined),
        queryTraces: () => Effect.succeed([]),
        queryMetrics: () => Effect.succeed([]),
        queryLogs: () => Effect.succeed([]),
        queryForAI: () => Effect.succeed({
          features: [],
          metadata: {},
          timeRange: { start: 0, end: 0 },
          sampleCount: 0
        }),
        queryRaw: () => Effect.succeed([]),
        insertRaw: () => Effect.succeed(undefined),
        queryText: () => Effect.succeed(''),
        archiveData: () => Effect.succeed(undefined),
        applyRetentionPolicies: () => Effect.succeed(undefined),
        healthCheck: () => Effect.succeed({ clickhouse: true, s3: true }),
        getStorageStats: () => Effect.succeed({
          clickhouse: { totalTraces: 0, totalMetrics: 0, totalLogs: 0, diskUsage: "0B" },
          s3: { totalSize: "0B", totalObjects: 0, oldestObject: null, newestObject: null }
        })
      }

      // Create mock UIGeneratorService for testing
      const mockUIGeneratorService: UIGeneratorService = {
        generateQuery: () => Effect.succeed({
          sql: 'SELECT * FROM traces',
          model: 'mock',
          description: 'Mock query',
          expectedColumns: [],
          generationTimeMs: 100
        }),
        generateMultipleQueries: () => Effect.succeed([]),
        validateQuery: () => Effect.succeed({ valid: true, errors: [] })
      }

      const mockLayer = Layer.succeed(UIGeneratorServiceTag, mockUIGeneratorService)

      service = await Effect.runPromise(
        Effect.provide(makeUIGeneratorAPIClientService, mockLayer)
      )
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

        // The service delegates to UIGeneratorService which returns this mock response
        const result = await Effect.runPromise(
          service.generateQuery(mockRequest).pipe(
            Effect.provideService(LLMManagerServiceTag, mockLLMService),
            Effect.provideService(StorageServiceTag, mockStorageService)
          )
        )

        // The mock UIGeneratorService returns a fixed response
        expect(result).toBeDefined()
        expect(result.sql).toBe('SELECT * FROM traces')
        expect(result.model).toBe('mock')
        expect(result.description).toBe('Mock query')
      })

      it('should delegate to UIGeneratorService', async () => {
        // Import UIGeneratorErrors to create proper error types
        const { UIGeneratorErrors } = await import('../../errors.js')

        // Create a service with a failing UIGeneratorService
        const failingUIGeneratorService: UIGeneratorService = {
          generateQuery: () => Effect.fail(UIGeneratorErrors.queryGeneration('Generation failed')),
          generateMultipleQueries: () => Effect.fail(UIGeneratorErrors.queryGeneration('Multiple generation failed')),
          validateQuery: () => Effect.fail(UIGeneratorErrors.validation('Validation failed', ['test error']))
        }

        const failingLayer = Layer.succeed(UIGeneratorServiceTag, failingUIGeneratorService)
        const failingService = await Effect.runPromise(
          Effect.provide(makeUIGeneratorAPIClientService, failingLayer)
        )

        const mockRequest: QueryGenerationAPIRequest = {
          path: {
            id: 'test-path',
            name: 'Test Path',
            services: ['service-a'],
            startService: 'service-a',
            endService: 'service-a'
          }
        }

        await expect(
          Effect.runPromise(
            failingService.generateQuery(mockRequest).pipe(
              Effect.provideService(LLMManagerServiceTag, mockLLMService),
              Effect.provideService(StorageServiceTag, mockStorageService)
            )
          )
        ).rejects.toThrow('Generation failed')
      })
    })

    describe('generateMultipleQueries', () => {
      it('should successfully generate multiple queries', async () => {
        // Create a service with a custom UIGeneratorService that returns multiple results
        const multiQueryService: UIGeneratorService = {
          generateQuery: () => Effect.succeed({
            sql: 'SELECT * FROM traces',
            model: 'mock',
            description: 'Mock query',
            expectedColumns: [],
            generationTimeMs: 100
          }),
          generateMultipleQueries: () => Effect.succeed([
            {
              sql: 'SELECT * FROM traces WHERE type = "latency"',
              model: 'mock',
              description: 'Latency query',
              expectedColumns: [],
              generationTimeMs: 100
            },
            {
              sql: 'SELECT * FROM traces WHERE type = "errors"',
              model: 'mock',
              description: 'Error query',
              expectedColumns: [],
              generationTimeMs: 150
            }
          ]),
          validateQuery: () => Effect.succeed({ valid: true, errors: [] })
        }

        const customLayer = Layer.succeed(UIGeneratorServiceTag, multiQueryService)
        const customService = await Effect.runPromise(
          Effect.provide(makeUIGeneratorAPIClientService, customLayer)
        )

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

        const result = await Effect.runPromise(
          customService.generateMultipleQueries(mockRequest).pipe(
            Effect.provideService(LLMManagerServiceTag, mockLLMService),
            Effect.provideService(StorageServiceTag, mockStorageService)
          )
        )

        expect(result).toHaveLength(2)
        expect(result[0]?.sql).toContain('latency')
        expect(result[1]?.sql).toContain('errors')
      })

      it('should handle errors in multiple query generation', async () => {
        // Import UIGeneratorErrors to create proper error types
        const { UIGeneratorErrors } = await import('../../errors.js')

        // Use the failingUIGeneratorService from the previous test
        const failingUIGeneratorService: UIGeneratorService = {
          generateQuery: () => Effect.fail(UIGeneratorErrors.queryGeneration('Generation failed')),
          generateMultipleQueries: () => Effect.fail(UIGeneratorErrors.queryGeneration('Multiple generation failed')),
          validateQuery: () => Effect.fail(UIGeneratorErrors.validation('Validation failed', ['test error']))
        }

        const failingLayer = Layer.succeed(UIGeneratorServiceTag, failingUIGeneratorService)
        const failingService = await Effect.runPromise(
          Effect.provide(makeUIGeneratorAPIClientService, failingLayer)
        )

        const mockRequest = {
          path: {
            id: 'test-path',
            name: 'Test Path',
            services: ['service-a'],
            startService: 'service-a',
            endService: 'service-a'
          }
        }

        await expect(
          Effect.runPromise(
            failingService.generateMultipleQueries(mockRequest).pipe(
              Effect.provideService(LLMManagerServiceTag, mockLLMService),
              Effect.provideService(StorageServiceTag, mockStorageService)
            )
          )
        ).rejects.toThrow('Multiple generation failed')
      })
    })

    describe('validateQuery', () => {
      it('should successfully validate a query', async () => {
        const sql = 'SELECT * FROM traces'

        const result = await Effect.runPromise(service.validateQuery(sql))

        // The mock UIGeneratorService always returns valid: true
        expect(result).toEqual({ valid: true, errors: [] })
      })

      it('should return validation errors', async () => {
        // Create a service with custom validation logic
        const customValidationService: UIGeneratorService = {
          generateQuery: () => Effect.succeed({
            sql: 'SELECT * FROM traces',
            model: 'mock',
            description: 'Mock query',
            expectedColumns: [],
            generationTimeMs: 100
          }),
          generateMultipleQueries: () => Effect.succeed([]),
          validateQuery: (sql: string) => Effect.succeed({
            valid: !sql.includes('INVALID'),
            errors: sql.includes('INVALID') ? ['Syntax error near INVALID'] : []
          })
        }

        const customLayer = Layer.succeed(UIGeneratorServiceTag, customValidationService)
        const customService = await Effect.runPromise(
          Effect.provide(makeUIGeneratorAPIClientService, customLayer)
        )

        const sql = 'INVALID SQL'
        const result = await Effect.runPromise(customService.validateQuery(sql))

        expect(result.valid).toBe(false)
        expect(result.errors).toHaveLength(1)
        expect(result.errors[0]).toBe('Syntax error near INVALID')
      })
    })
  })

  describe('Convenience Functions', () => {
    const mockLayer = Layer.succeed(UIGeneratorAPIClientTag, {
      generateQuery: (_request: QueryGenerationAPIRequest) =>
        Effect.succeed({
          sql: 'SELECT * FROM traces',
          model: 'test-model',
          actualModel: 'test-model',
          description: 'Test query',
          expectedColumns: [],
          generationTimeMs: 100
        }),
      generateMultipleQueries: () =>
        Effect.succeed([
          {
            sql: 'SELECT 1',
            model: 'test',
            actualModel: 'test',
            description: 'Test',
            expectedColumns: [],
            generationTimeMs: 100
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
          Effect.provide(generateQuery(request), mockLayer) as Effect.Effect<QueryGenerationAPIResponse, unknown, never>
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
          Effect.provide(generateMultipleQueries(request), mockLayer) as Effect.Effect<QueryGenerationAPIResponse[], unknown, never>
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