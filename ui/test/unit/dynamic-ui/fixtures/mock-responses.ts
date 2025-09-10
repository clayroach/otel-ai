/**
 * Mock API responses for testing query generation
 */

import type { CriticalPath } from '../../../../src/components/ServiceTopology/types'
import type { QueryGenerationResult, LLMModel } from '../../../../src/services/query-generator'

/**
 * Mock critical paths for testing
 */
export const mockCriticalPaths: Record<string, CriticalPath> = {
  checkoutFlow: {
    id: 'checkout-flow',
    name: 'Checkout Flow',
    services: ['frontend', 'cart', 'checkout', 'payment', 'email'],
    edges: [
      { source: 'frontend', target: 'cart' },
      { source: 'cart', target: 'checkout' },
      { source: 'checkout', target: 'payment' },
      { source: 'payment', target: 'email' }
    ],
    metrics: {
      avgLatency: 450,
      p99Latency: 850,
      errorRate: 0.02,
      requestCount: 1000
    },
    priority: 'critical' as const,
    lastUpdated: new Date()
  },
  highErrorPath: {
    id: 'high-error-path',
    name: 'Payment Processing',
    services: ['checkoutservice', 'paymentservice', 'currencyservice'],
    edges: [
      { source: 'checkoutservice', target: 'paymentservice' },
      { source: 'paymentservice', target: 'currencyservice' }
    ],
    metrics: {
      avgLatency: 800,
      p99Latency: 1500,
      errorRate: 0.08, // High error rate
      requestCount: 500
    },
    priority: 'high' as const,
    lastUpdated: new Date()
  },
  slowPath: {
    id: 'slow-path',
    name: 'Product Recommendation',
    services: ['frontend', 'productcatalogservice', 'recommendationservice'],
    edges: [
      { source: 'frontend', target: 'productcatalogservice' },
      { source: 'productcatalogservice', target: 'recommendationservice' }
    ],
    metrics: {
      avgLatency: 2000,
      p99Latency: 3000, // Very slow
      errorRate: 0.01,
      requestCount: 200
    },
    priority: 'medium' as const,
    lastUpdated: new Date()
  }
}

/**
 * Mock query generation results
 */
export const mockQueryResults: Record<string, QueryGenerationResult> = {
  checkoutSuccess: {
    sql: `SELECT 
    service_name,
    operation_name,
    toStartOfMinute(start_time) AS time_bucket,
    quantile(0.50)(duration_ns/1000000) AS p50_ms,
    quantile(0.95)(duration_ns/1000000) AS p95_ms,
    quantile(0.99)(duration_ns/1000000) AS p99_ms,
    count() AS request_count
FROM otel.traces
WHERE 
    service_name IN ('frontend', 'cart', 'checkout', 'payment', 'email')
    AND start_time >= now() - INTERVAL 15 MINUTE
GROUP BY 
    service_name,
    operation_name,
    time_bucket`,
    model: 'claude-3-5-sonnet-20241022',
    generationTime: 250,
    description: 'Analyzing checkout flow performance metrics',
    criticalPath: 'Checkout Flow',
    analysisType: 'latency'
  },
  errorAnalysis: {
    sql: `SELECT 
    service_name,
    countIf(status_code != 'OK') as error_count,
    count() as total_requests,
    round(error_count * 100.0 / total_requests, 2) as error_rate
FROM otel.traces
WHERE 
    service_name IN ('checkoutservice', 'paymentservice', 'currencyservice')
    AND start_time >= now() - INTERVAL 30 MINUTE
GROUP BY service_name
ORDER BY error_rate DESC`,
    model: 'gpt-4o',
    generationTime: 180,
    description: 'Identifying error patterns in payment processing',
    criticalPath: 'Payment Processing',
    analysisType: 'errors'
  },
  bottleneckAnalysis: {
    sql: `SELECT 
    service_name,
    operation_name,
    quantile(0.99)(duration_ns/1000000) as p99_ms,
    sum(duration_ns/1000000) as total_time_ms
FROM otel.traces
WHERE 
    service_name IN ('frontend', 'productcatalogservice', 'recommendationservice')
    AND start_time >= now() - INTERVAL 1 HOUR
GROUP BY service_name, operation_name
ORDER BY p99_ms DESC`,
    model: 'codellama',
    generationTime: 150,
    description: 'Detecting performance bottlenecks',
    criticalPath: 'Product Recommendation',
    analysisType: 'bottlenecks'
  }
}

/**
 * Mock available models response
 */
export const mockAvailableModels: LLMModel[] = [
  {
    name: 'claude-3-5-sonnet-20241022',
    provider: 'anthropic',
    description: 'Claude 3.5 Sonnet - Best for complex SQL generation',
    available: true
  },
  {
    name: 'gpt-4o',
    provider: 'openai',
    description: 'GPT-4 Optimized - Good balance of speed and quality',
    available: true
  },
  {
    name: 'codellama',
    provider: 'local',
    description: 'Code Llama - Fast local SQL generation',
    available: true
  },
  {
    name: 'rule-based',
    provider: 'local',
    description: 'Rule-based - Fallback for simple queries',
    available: true
  }
]

/**
 * Mock trace data for testing query results
 */
export const mockTraceData = {
  checkoutTraces: [
    {
      trace_id: 'trace-001',
      span_id: 'span-001',
      service_name: 'frontend',
      operation_name: 'HTTP GET /checkout',
      start_time: new Date('2024-01-15T14:00:00Z'),
      duration_ns: 250_000_000,
      status_code: 'OK'
    },
    {
      trace_id: 'trace-001',
      span_id: 'span-002',
      service_name: 'cart',
      operation_name: 'GetCart',
      start_time: new Date('2024-01-15T14:00:00.050Z'),
      duration_ns: 100_000_000,
      status_code: 'OK'
    },
    {
      trace_id: 'trace-001',
      span_id: 'span-003',
      service_name: 'checkout',
      operation_name: 'PlaceOrder',
      start_time: new Date('2024-01-15T14:00:00.160Z'),
      duration_ns: 80_000_000,
      status_code: 'OK'
    }
  ],
  errorTraces: [
    {
      trace_id: 'trace-002',
      span_id: 'span-004',
      service_name: 'paymentservice',
      operation_name: 'ProcessPayment',
      start_time: new Date('2024-01-15T14:01:00Z'),
      duration_ns: 500_000_000,
      status_code: 'ERROR',
      status_message: 'Payment gateway timeout'
    }
  ]
}

/**
 * Mock API error responses
 */
export const mockErrorResponses = {
  timeout: {
    code: 'ECONNABORTED',
    message: 'timeout of 15000ms exceeded'
  },
  serverError: {
    response: {
      status: 500,
      data: {
        error: 'Internal server error',
        message: 'Failed to generate query'
      }
    }
  },
  unauthorized: {
    response: {
      status: 401,
      data: {
        error: 'Unauthorized',
        message: 'Invalid API key'
      }
    }
  }
}
