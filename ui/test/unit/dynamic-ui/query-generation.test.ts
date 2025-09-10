/**
 * Unit tests for Query Generator Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { 
  checkoutFlowQuery,
  productSearchQuery,
  currencyConversionQuery,
  shippingCalculatorQuery,
  fraudDetectionQuery
} from './fixtures/diagnostic-queries'
import { 
  mockCriticalPaths, 
  mockQueryResults,
  mockAvailableModels,
  mockErrorResponses 
} from './fixtures/mock-responses'

// Setup module mocks
const mockPost = vi.fn()
const mockGet = vi.fn()

vi.mock('axios', () => {
  const mockAxiosInstance = {
    post: (...args: unknown[]) => mockPost(...args),
    get: (...args: unknown[]) => mockGet(...args),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() }
    }
  }

  return {
    default: {
      create: vi.fn(() => mockAxiosInstance)
    }
  }
})

// Import after mocking
const queryGeneratorModule = await import('../../../src/services/query-generator')
const QueryGeneratorService = queryGeneratorModule.default
type QueryGenerationRequest = import('../../../src/services/query-generator').QueryGenerationRequest

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    clear: () => { store = {} },
    removeItem: (key: string) => { delete store[key] },
    length: 0,
    key: () => null
  }
})()

// @ts-ignore
global.localStorage = localStorageMock

describe('QueryGeneratorService', () => {

  beforeEach(() => {
    // Reset mock functions
    mockPost.mockReset()
    mockGet.mockReset()
    vi.clearAllMocks()

    // Clear localStorage
    localStorageMock.clear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('generateQuery', () => {
    it('should generate checkout flow query successfully', async () => {
      // Setup mock response
      mockPost.mockResolvedValueOnce({
        data: {
          sql: checkoutFlowQuery.sql,
          model: 'codellama',
          generationTimeMs: 250,
          description: 'Analyzing checkout flow performance',
          analysisType: 'latency'
        }
      })

      const request: QueryGenerationRequest = {
        path: mockCriticalPaths.checkoutFlow,
        analysisGoal: 'Analyze checkout performance',
        preferredModel: 'codellama'
      }

      const result = await QueryGeneratorService.generateQuery(request)

      expect(result.sql).toBe(checkoutFlowQuery.sql)
      expect(result.model).toBe('codellama')
      expect(result.analysisType).toBe('latency')
      expect(result.criticalPath).toBe('Checkout Flow')
      
      // Verify API was called correctly
      expect(mockPost).toHaveBeenCalledWith(
        '/ui-generator/generate-query',
        expect.objectContaining({
          path: expect.objectContaining({
            id: 'checkout-flow',
            services: mockCriticalPaths.checkoutFlow.services
          }),
          analysisGoal: 'Analyze checkout performance',
          model: 'codellama'
        })
      )
    })

    it('should generate product search query with throughput analysis', async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          sql: productSearchQuery.sql,
          model: 'codellama',
          generationTimeMs: 180,
          description: 'Analyzing product search throughput',
          analysisType: 'throughput'
        }
      })

      const request: QueryGenerationRequest = {
        path: {
          id: 'product-search',
          name: 'Product Search Flow',
          services: ['frontend', 'product-catalog', 'recommendation', 'ad'],
          edges: [
            { source: 'frontend', target: 'product-catalog' },
            { source: 'frontend', target: 'recommendation' },
            { source: 'recommendation', target: 'ad' }
          ],
          metrics: {
            avgLatency: 200,
            p99Latency: 400,
            errorRate: 0.01,
            requestCount: 5000
          },
          priority: 'medium' as const,
          lastUpdated: new Date()
        }
      }

      const result = await QueryGeneratorService.generateQuery(request)

      expect(result.sql).toContain('requests_per_second')
      expect(result.sql).toContain('success_ratio')
      expect(result.analysisType).toBe('throughput')
    })

    it('should generate shipping calculator query with error analysis', async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          sql: shippingCalculatorQuery.sql,
          model: 'codellama',
          generationTimeMs: 300,
          description: 'Analyzing shipping calculator errors',
          analysisType: 'errors'
        }
      })

      const request: QueryGenerationRequest = {
        path: {
          id: 'shipping-calculator',
          name: 'Shipping Calculator Flow',
          services: ['frontend', 'shipping', 'currency'],
          edges: [
            { source: 'frontend', target: 'shipping' },
            { source: 'shipping', target: 'currency' }
          ],
          metrics: {
            avgLatency: 500,
            p99Latency: 1000,
            errorRate: 0.06, // High error rate triggers error analysis
            requestCount: 800
          },
          priority: 'high' as const,
          lastUpdated: new Date()
        }
      }

      const result = await QueryGeneratorService.generateQuery(request)

      expect(result.sql).toContain('problematic_traces')
      expect(result.sql).toContain('error_rate_pct')
      expect(result.sql).toContain('traces_with_errors')
      expect(result.analysisType).toBe('errors')
    })

    it('should generate fraud detection query with bottleneck analysis', async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          sql: fraudDetectionQuery.sql,
          model: 'codellama',
          generationTimeMs: 350,
          description: 'Analyzing fraud detection bottlenecks',
          analysisType: 'bottlenecks'
        }
      })

      const request: QueryGenerationRequest = {
        path: {
          id: 'fraud-detection',
          name: 'Fraud Detection Flow',
          services: ['payment', 'fraud-detection', 'accounting'],
          edges: [
            { source: 'payment', target: 'fraud-detection' },
            { source: 'fraud-detection', target: 'accounting' }
          ],
          metrics: {
            avgLatency: 1200,
            p99Latency: 2500, // Very high latency triggers bottleneck analysis
            errorRate: 0.02,
            requestCount: 300
          },
          priority: 'critical' as const,
          lastUpdated: new Date()
        }
      }

      const result = await QueryGeneratorService.generateQuery(request)

      expect(result.sql).toContain('slowest_operations')
      expect(result.sql).toContain('critical_path_impact')
      expect(result.sql).toContain('avg_trace_impact')
      expect(result.analysisType).toBe('bottlenecks')
    })

    it('should determine analysis goal based on metrics when not provided', async () => {
      mockPost.mockResolvedValueOnce({
        data: mockQueryResults.errorAnalysis
      })

      const request: QueryGenerationRequest = {
        path: mockCriticalPaths.highErrorPath // Has high error rate
        // No analysisGoal provided
      }

      await QueryGeneratorService.generateQuery(request)

      // Should detect high error rate and set appropriate goal
      expect(mockPost).toHaveBeenCalledWith(
        '/ui-generator/generate-query',
        expect.objectContaining({
          analysisGoal: expect.stringContaining('error patterns')
        })
      )
    })

    it('should generate fallback query when API fails', async () => {
      // Mock API failure
      mockPost.mockRejectedValueOnce(mockErrorResponses.serverError)

      const request: QueryGenerationRequest = {
        path: mockCriticalPaths.checkoutFlow
      }

      const result = await QueryGeneratorService.generateQuery(request)

      expect(result.model).toBe('fallback')
      expect(result.description).toBe('Fallback query - API unavailable')
      expect(result.sql).toContain('-- Fallback diagnostic query')
      expect(result.sql).toContain("service_name IN ('frontend', 'cart', 'checkout', 'payment', 'email')")
    })

    it('should handle timeout gracefully', async () => {
      mockPost.mockRejectedValueOnce(mockErrorResponses.timeout)

      const request: QueryGenerationRequest = {
        path: mockCriticalPaths.slowPath
      }

      const result = await QueryGeneratorService.generateQuery(request)

      expect(result.model).toBe('fallback')
      expect(result.sql).toBeDefined()
      expect(result.analysisType).toBe('bottlenecks') // Due to high p99 latency
    })

    it('should escape service names in fallback query', async () => {
      mockPost.mockRejectedValueOnce(mockErrorResponses.serverError)

      const pathWithQuotes = {
        ...mockCriticalPaths.checkoutFlow,
        services: ["service's-name", 'normal-service'] // Has apostrophe
      }

      const request: QueryGenerationRequest = {
        path: pathWithQuotes
      }

      const result = await QueryGeneratorService.generateQuery(request)

      // Should escape quotes properly
      expect(result.sql).toContain("'service''s-name'") // Escaped apostrophe
      expect(result.sql).toContain("'normal-service'")
    })
  })

  describe('getAvailableModels', () => {
    it('should return available models from API', async () => {
      mockGet.mockResolvedValueOnce({
        data: { models: mockAvailableModels }
      })

      const models = await QueryGeneratorService.getAvailableModels()

      expect(models).toHaveLength(4)
      expect(models[0].name).toBe('claude-3-5-sonnet-20241022')
      expect(models[1].name).toBe('gpt-4o')
      expect(models[2].name).toBe('codellama')
      expect(models[3].name).toBe('rule-based')
      
      expect(mockGet).toHaveBeenCalledWith('/ui-generator/models')
    })

    it('should return default models when API fails', async () => {
      mockGet.mockRejectedValueOnce(mockErrorResponses.serverError)

      const models = await QueryGeneratorService.getAvailableModels()

      expect(models).toHaveLength(3) // Default models
      expect(models[0].name).toBe('claude-3-5-sonnet-20241022')
      expect(models[0].available).toBe(false) // Not available when API fails
      expect(models[2].name).toBe('rule-based')
      expect(models[2].available).toBe(true) // Local model still available
    })
  })

  describe('validateQuery', () => {
    it('should validate correct SQL query from checkout flow', () => {
      const result = QueryGeneratorService.validateQuery(checkoutFlowQuery.sql)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should validate all real UI-generated queries', () => {
      const queries = [
        checkoutFlowQuery,
        productSearchQuery,
        currencyConversionQuery,
        shippingCalculatorQuery,
        fraudDetectionQuery
      ]

      queries.forEach(query => {
        const result = QueryGeneratorService.validateQuery(query.sql)
        expect(result.valid).toBe(true)
        expect(result.errors).toHaveLength(0)
      })
    })

    it('should reject queries without SELECT', () => {
      const result = QueryGeneratorService.validateQuery('FROM traces WHERE service = "test"')

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Query must contain SELECT statement')
    })

    it('should reject queries without FROM', () => {
      const result = QueryGeneratorService.validateQuery('SELECT * WHERE service = "test"')

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Query must specify FROM table')
    })

    it('should reject dangerous operations', () => {
      const dangerousQueries = [
        'SELECT * FROM traces; DROP TABLE traces;',
        'DELETE FROM traces WHERE 1=1',
        'UPDATE traces SET status = "OK"',
        'INSERT INTO traces VALUES (...)',
        'ALTER TABLE traces ADD COLUMN test',
        'CREATE TABLE new_table AS SELECT * FROM traces',
        'TRUNCATE TABLE traces',
        'GRANT ALL ON traces TO user',
        'REVOKE SELECT ON traces FROM user'
      ]

      dangerousQueries.forEach(query => {
        const result = QueryGeneratorService.validateQuery(query)
        expect(result.valid).toBe(false)
        expect(result.errors.length).toBeGreaterThan(0)
        expect(result.errors.some(e => e.includes('Forbidden operation'))).toBe(true)
      })
    })

    it('should handle case-insensitive validation', () => {
      const query = 'select * from traces where service_name = "test"'
      const result = QueryGeneratorService.validateQuery(query)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })
  })

  describe('model selection persistence', () => {
    it('should get default model when not set', () => {
      const model = QueryGeneratorService.getSelectedModel()
      expect(model).toBe('claude-3-5-sonnet-20241022')
    })

    it('should persist selected model to localStorage', () => {
      QueryGeneratorService.setSelectedModel('gpt-4o')
      
      const model = QueryGeneratorService.getSelectedModel()
      expect(model).toBe('gpt-4o')
      expect(localStorage.getItem('preferred-llm-model')).toBe('gpt-4o')
    })

    it('should retrieve persisted model from localStorage', () => {
      localStorage.setItem('preferred-llm-model', 'codellama')
      
      const model = QueryGeneratorService.getSelectedModel()
      expect(model).toBe('codellama')
    })
  })

  describe('analysis goal determination', () => {
    it('should detect error analysis needed for high error rates', async () => {
      mockPost.mockImplementation((_url, _data) => {
        return Promise.resolve({
          data: {
            sql: 'SELECT ...',
            model: 'test',
            analysisType: 'errors'
          }
        })
      })

      const request: QueryGenerationRequest = {
        path: {
          ...mockCriticalPaths.checkoutFlow,
          metrics: {
            ...mockCriticalPaths.checkoutFlow.metrics,
            errorRate: 0.08 // High error rate
          }
        }
      }

      await QueryGeneratorService.generateQuery(request)

      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          analysisGoal: expect.stringContaining('error patterns')
        })
      )
    })

    it('should detect bottleneck analysis for very high latency', async () => {
      mockPost.mockImplementation((_url, _data) => {
        return Promise.resolve({
          data: {
            sql: 'SELECT ...',
            model: 'test',
            analysisType: 'bottlenecks'
          }
        })
      })

      const request: QueryGenerationRequest = {
        path: {
          ...mockCriticalPaths.checkoutFlow,
          metrics: {
            ...mockCriticalPaths.checkoutFlow.metrics,
            p99Latency: 2500 // Very high latency
          }
        }
      }

      await QueryGeneratorService.generateQuery(request)

      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          analysisGoal: expect.stringContaining('bottlenecks')
        })
      )
    })

    it('should detect latency analysis for moderate high latency', async () => {
      mockPost.mockImplementation((_url, _data) => {
        return Promise.resolve({
          data: {
            sql: 'SELECT ...',
            model: 'test',
            analysisType: 'latency'
          }
        })
      })

      const request: QueryGenerationRequest = {
        path: {
          ...mockCriticalPaths.checkoutFlow,
          metrics: {
            ...mockCriticalPaths.checkoutFlow.metrics,
            p99Latency: 1200 // Moderate high latency
          }
        }
      }

      await QueryGeneratorService.generateQuery(request)

      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          analysisGoal: expect.stringContaining('latency patterns')
        })
      )
    })

    it('should default to throughput analysis for normal metrics', async () => {
      mockPost.mockImplementation((_url, _data) => {
        return Promise.resolve({
          data: {
            sql: 'SELECT ...',
            model: 'test',
            analysisType: 'throughput'
          }
        })
      })

      const request: QueryGenerationRequest = {
        path: {
          ...mockCriticalPaths.checkoutFlow,
          metrics: {
            avgLatency: 100,
            p99Latency: 200, // Low latency
            errorRate: 0.01, // Low error rate
            requestCount: 1000
          }
        }
      }

      await QueryGeneratorService.generateQuery(request)

      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          analysisGoal: expect.stringContaining('throughput')
        })
      )
    })
  })
})