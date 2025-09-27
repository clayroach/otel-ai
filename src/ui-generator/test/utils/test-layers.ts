/**
 * UI Generator Test Utilities
 *
 * Shared test Layer utilities for UI generator tests.
 * Builds on storage test utilities for consistency and reusability.
 */

import { Effect, Layer, Stream } from 'effect'
import {
  LLMManagerServiceTag,
  type LLMManagerService,
  type ManagerStatus,
  type LLMRequest,
  type LLMResponse,
  type LLMError
} from '../../../llm-manager/index.js'
import { TestStorageLayer } from '../../../storage/index.js'
import { createDiagnosticQueryTestLayer } from '../../../storage/test-utils.js'
import { NetworkError, ModelUnavailable } from '../../../llm-manager/types.js'
import {
  CriticalPath,
  QueryPattern,
  type GeneratedQueryWithThunk
} from '../../query-generator/types.js'

// ============================================================================
// Test Data Factories
// ============================================================================

export const createMockCriticalPath = (overrides: Partial<CriticalPath> = {}): CriticalPath => ({
  id: 'test-path-123',
  name: 'Test Critical Path',
  services: ['frontend', 'api', 'database'],
  startService: 'frontend',
  endService: 'database',
  metadata: {
    criticality: 'high',
    sla: '99.9%'
  },
  ...overrides
})

export const createCheckoutFlowPath = (): CriticalPath => ({
  id: 'checkout-flow',
  name: 'E-commerce Checkout Flow',
  services: ['frontend', 'cart', 'checkout', 'payment', 'email'],
  startService: 'frontend',
  endService: 'email',
  metadata: {
    criticality: 'high',
    sla: '99.9%'
  }
})

export const createMockGeneratedQuery = (
  overrides: Partial<GeneratedQueryWithThunk> = {}
): GeneratedQueryWithThunk => ({
  id: 'test-query-123',
  name: 'Test Query',
  description: 'Mock test query',
  pattern: QueryPattern.SERVICE_LATENCY,
  sql: 'SELECT service_name, COUNT(*) FROM traces GROUP BY service_name',
  expectedSchema: {
    service_name: 'string',
    count: 'number'
  },
  executeThunk: () =>
    Effect.succeed({
      queryId: 'test-query-123',
      data: [
        { service_name: 'frontend', count: 100 },
        { service_name: 'api', count: 80 }
      ],
      executionTimeMs: 50,
      rowCount: 2
    }),
  ...overrides
})

// ============================================================================
// Mock LLM Manager Options
// ============================================================================

export interface MockLLMManagerOptions {
  shouldFail?: boolean
  customError?: LLMError
  customResponse?: Partial<LLMResponse>
  responses?: string[] // For sequential responses
  failureRate?: number // 0-1, chance of failure per request
}

// ============================================================================
// Mock LLM Manager Layer Implementation
// ============================================================================

/**
 * Configurable Mock LLM Manager Layer
 * Use this for tests that need to control LLM behavior
 */
export const createMockLLMManagerLive = (
  options: MockLLMManagerOptions = {}
): Layer.Layer<LLMManagerServiceTag, never, never> => {
  const {
    shouldFail = false,
    customError = new NetworkError({
      model: 'mock-model',
      message: 'Mock LLM error'
    }),
    customResponse = {},
    responses = [],
    failureRate = 0
  } = options

  let callCount = 0

  return Layer.succeed(LLMManagerServiceTag, {
    generate: (request: LLMRequest): Effect.Effect<LLMResponse, LLMError, never> => {
      // Check failure rate
      if (failureRate > 0 && Math.random() < failureRate) {
        return Effect.fail(customError)
      }

      if (shouldFail) {
        return Effect.fail(customError)
      }

      // Provide more specific mock responses based on the request context
      let content = customResponse.content || 'Mock LLM response'

      if (
        request.preferences?.model?.includes('codellama') ||
        request.preferences?.model?.includes('sqlcoder')
      ) {
        // For SQL models, return raw SQL - use the first response for 'latency', second for 'errors'
        // This is specifically for the multiple queries test
        if (responses.length > 0) {
          content = responses[callCount % responses.length] || content
          callCount++
        }
        // Fallback for single queries - analyze the prompt content
        else if (request.prompt?.includes('latency') && !request.prompt?.includes('percentiles')) {
          content = 'SELECT latency FROM traces'
        } else if (request.prompt?.includes('errors') && !request.prompt?.includes('percentiles')) {
          content = 'SELECT errors FROM traces'
        } else {
          content = 'SELECT service_name, COUNT(*) FROM traces GROUP BY service_name'
        }
      }
      // Use sequential responses if provided AND we haven't set specific content above
      else if (responses.length > 0) {
        content = responses[callCount % responses.length] || content
        callCount++
      }
      // For general models, return JSON responses that match test expectations
      else if (request.prompt?.includes('service-a') && request.prompt?.includes('service-b')) {
        content = JSON.stringify({
          sql: "SELECT * FROM traces WHERE service_name IN ('service-a', 'service-b')",
          description: 'Analyze path performance',
          expectedColumns: [
            { name: 'trace_id', type: 'string', description: 'Trace identifier' },
            { name: 'service_name', type: 'string', description: 'Service name' }
          ],
          reasoning: 'Analyzing critical path performance'
        })
      }
      // Default JSON response
      else if (
        request.prompt?.includes('JSON') ||
        request.prompt?.includes('json') ||
        !request.preferences?.model?.includes('sql')
      ) {
        content = JSON.stringify({
          sql: "SELECT * FROM traces WHERE service_name IN ('test-service')",
          description: 'Mock query description',
          expectedColumns: [{ name: 'trace_id', type: 'string', description: 'Trace identifier' }]
        })
      }

      const response: LLMResponse = {
        content,
        model: request.preferences?.model || 'mock-model',
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
          cost: 0,
          ...customResponse.usage
        },
        metadata: {
          latencyMs: 100,
          retryCount: 0,
          cached: false,
          ...customResponse.metadata
        }
      }

      return Effect.succeed(response)
    },

    generateStream: (_request: LLMRequest): Stream.Stream<string, LLMError, never> => {
      if (shouldFail) {
        return Stream.fail(customError)
      }

      const chunks = ['Mock', ' streaming', ' response']
      return Stream.fromIterable(chunks)
    },

    isHealthy: () => Effect.succeed(!shouldFail),

    getStatus: (): Effect.Effect<ManagerStatus, never, never> =>
      Effect.succeed({
        availableModels: ['mock-model', 'gpt-3.5-turbo', 'claude-3-sonnet'],
        healthStatus: { 'mock-model': shouldFail ? 'unhealthy' : 'healthy' },
        config: {}
      } as ManagerStatus),

    getAvailableModels: () => Effect.succeed(['mock-model', 'gpt-3.5-turbo', 'claude-3-sonnet']),

    getDefaultModel: (taskType?: 'sql' | 'general' | 'code') => {
      switch (taskType) {
        case 'sql':
          return Effect.succeed('codellama-7b-instruct')
        case 'code':
          return Effect.succeed('gpt-4')
        default:
          return Effect.succeed('gpt-3.5-turbo')
      }
    },

    getModelInfo: (modelId: string) =>
      Effect.succeed({
        id: modelId,
        name: `Mock ${modelId}`,
        provider: 'openai' as const,
        capabilities: ['general'] as ('general' | 'sql' | 'code' | 'embedding')[],
        metadata: {
          contextLength: 4096,
          maxTokens: 2048,
          temperature: 0.7
        },
        status: 'available' as const
      }),

    getModelsByCapability: (_capability: string) =>
      Effect.succeed([
        {
          id: 'mock-model',
          name: 'Mock Model',
          provider: 'openai' as const,
          capabilities: ['general'] as ('general' | 'sql' | 'code' | 'embedding')[],
          metadata: {
            contextLength: 4096,
            maxTokens: 2048,
            temperature: 0.7
          },
          status: 'available' as const
        }
      ]),

    getModelsByProvider: (_provider: string) =>
      Effect.succeed([
        {
          id: 'mock-model',
          name: 'Mock Model',
          provider: 'openai' as const,
          capabilities: ['general'] as ('general' | 'sql' | 'code' | 'embedding')[],
          metadata: {
            contextLength: 4096,
            maxTokens: 2048,
            temperature: 0.7
          },
          status: 'available' as const
        }
      ]),

    getAllModels: () =>
      Effect.succeed([
        {
          id: 'mock-model',
          name: 'Mock Model',
          provider: 'openai' as const,
          capabilities: ['general'] as ('general' | 'sql' | 'code' | 'embedding')[],
          metadata: {
            contextLength: 4096,
            maxTokens: 2048,
            temperature: 0.7
          },
          status: 'available' as const
        }
      ])
  } satisfies LLMManagerService)
}

/**
 * Standard Mock LLM Manager Layer
 * Use this for most tests that just need working LLM mocks
 */
export const MockLLMManagerLive = createMockLLMManagerLive()

/**
 * Failing LLM Manager Layer for error testing
 * Use this to test error handling scenarios
 */
export const FailingLLMManagerLive = createMockLLMManagerLive({
  shouldFail: true,
  customError: new ModelUnavailable({
    model: 'test-model',
    message: 'Model temporarily unavailable'
  })
})

/**
 * Fallback Test Layer - simulates LLM failures to trigger fallback behavior
 */
export const FallbackTestLayer = Layer.mergeAll(TestStorageLayer, FailingLLMManagerLive)

/**
 * Network Error Test Layer - simulates network errors to trigger fallback behavior
 */
export const NetworkErrorTestLayer = Layer.mergeAll(
  TestStorageLayer,
  createMockLLMManagerLive({
    shouldFail: true,
    customError: new NetworkError({
      model: 'test-model',
      message: 'Network connection failed'
    })
  })
)

/**
 * SQL vs GPT Mock Manager for comparison tests
 * Returns different responses based on model type
 */
export const SQLvsGPTMockLLMManagerLive = createMockLLMManagerLive({
  responses: [
    // SQL model responses (raw SQL)
    'SELECT service_name, COUNT(*) as request_count FROM traces GROUP BY service_name',
    // GPT model responses (JSON)
    JSON.stringify({
      sql: 'SELECT service_name, AVG(duration_ns/1000000) as avg_latency FROM traces GROUP BY service_name',
      description: 'Analyze average latency by service',
      expectedColumns: [
        { name: 'service_name', type: 'string', description: 'Service name' },
        { name: 'avg_latency', type: 'number', description: 'Average latency in ms' }
      ]
    })
  ]
})

/**
 * Multiple Queries Test Layer - for testing multiple query generation
 * Provides sequential responses for latency and errors patterns
 */
export const MultipleQueriesTestLayer = Layer.mergeAll(
  TestStorageLayer,
  createMockLLMManagerLive({
    responses: [
      'SELECT latency FROM traces', // First query for 'latency'
      'SELECT errors FROM traces' // Second query for 'errors'
    ]
  })
)

// ============================================================================
// Pre-composed Test Layers
// ============================================================================

/**
 * Complete UI Generator Test Layer
 * Includes Storage + LLM Manager mocks for comprehensive testing
 */
export const UIGeneratorTestLayer = Layer.mergeAll(TestStorageLayer, MockLLMManagerLive)

/**
 * Diagnostic Query Test Layer
 * Specialized for diagnostic query generation tests
 */
export const DiagnosticQueryTestLayer = Layer.mergeAll(
  createDiagnosticQueryTestLayer(),
  MockLLMManagerLive
)

/**
 * SQL vs GPT Comparison Test Layer
 * For testing different model behaviors
 */
export const SQLvsGPTTestLayer = Layer.mergeAll(
  createDiagnosticQueryTestLayer(),
  SQLvsGPTMockLLMManagerLive
)

/**
 * Error Testing Layer
 * For testing error handling across the stack
 */
export const ErrorTestingLayer = Layer.mergeAll(TestStorageLayer, FailingLLMManagerLive)

// ============================================================================
// Utility Functions for UI Generator Tests
// ============================================================================

/**
 * Create mock diagnostic query responses
 * Returns realistic diagnostic data for testing
 */
export const createDiagnosticMockResponses = () => ({
  healthStatus: [
    {
      minute: new Date().toISOString(),
      service_name: 'payment',
      error_rate_pct: 8.5,
      avg_p95_ms: 850,
      health_status: 'CRITICAL'
    },
    {
      minute: new Date().toISOString(),
      service_name: 'checkout',
      error_rate_pct: 2.1,
      avg_p95_ms: 450,
      health_status: 'WARNING'
    }
  ],
  performance: [
    { service_name: 'frontend', p50_ms: 140, p95_ms: 180, p99_ms: 195 },
    { service_name: 'payment', p50_ms: 250, p95_ms: 450, p99_ms: 490 }
  ]
})

/**
 * Validate that a query has diagnostic patterns
 * Helper for testing diagnostic query generation
 */
export const validateDiagnosticPatterns = (sql: string) => {
  const lowerSQL = sql.toLowerCase()
  return {
    hasErrorAnalysis:
      lowerSQL.includes('error') && (lowerSQL.includes('countif') || lowerSQL.includes('count(')),
    hasVolumeContext: lowerSQL.includes('count()') || lowerSQL.includes('request_count'),
    hasHealthScoring:
      lowerSQL.includes('case') && (lowerSQL.includes('critical') || lowerSQL.includes('warning')),
    hasRealTimeFocus: lowerSQL.includes('15 minute') || lowerSQL.includes('interval'),
    usesJoins: lowerSQL.includes('join'),
    usesCTEs: lowerSQL.includes('with ') && lowerSQL.includes(' as ('),
    hasTraceFiltering: lowerSQL.includes('problematic_traces') || lowerSQL.includes('slow_traces')
  }
}

/**
 * Create a test layer that captures LLM requests
 * Useful for validating what prompts are being sent
 */
export const createRequestCapturingLLMLayer = () => {
  const capturedRequests: LLMRequest[] = []

  // Create capturing layer directly
  const capturingLayer = Layer.succeed(LLMManagerServiceTag, {
    generate: (request: LLMRequest) => {
      capturedRequests.push(request)
      return Effect.succeed({
        content: 'SELECT * FROM traces',
        model: request.preferences?.model || 'mock-model',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, cost: 0 },
        metadata: { latencyMs: 100, retryCount: 0, cached: false }
      })
    },
    generateStream: (request: LLMRequest) => {
      capturedRequests.push(request)
      return Stream.fromIterable(['Mock', ' response'])
    },
    isHealthy: () => Effect.succeed(true),
    getStatus: () =>
      Effect.succeed({
        availableModels: ['mock-model'],
        healthStatus: { 'mock-model': 'healthy' },
        config: {}
      } as ManagerStatus),
    getAvailableModels: () => Effect.succeed(['mock-model']),
    getDefaultModel: () => Effect.succeed('mock-model'),
    getModelInfo: (_modelId: string) =>
      Effect.succeed({
        id: 'mock-model',
        name: 'Mock Model',
        provider: 'openai' as const,
        capabilities: ['general'] as ('general' | 'sql' | 'code' | 'embedding')[],
        metadata: {
          contextLength: 4096,
          maxTokens: 2048,
          temperature: 0.7
        },
        status: 'available' as const
      }),
    getModelsByCapability: () => Effect.succeed([]),
    getModelsByProvider: () => Effect.succeed([]),
    getAllModels: () => Effect.succeed([])
  } satisfies LLMManagerService)

  return {
    layer: capturingLayer,
    getCapturedRequests: () => capturedRequests,
    clearCapturedRequests: () => {
      capturedRequests.length = 0
    }
  }
}
