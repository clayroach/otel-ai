/**
 * Test fixtures for ai-insights package tests
 */

import type { ServiceMetrics, CriticalPath } from '../../src/types.js'

/**
 * Mock service metrics for testing
 */
export const mockServiceMetrics: ServiceMetrics[] = [
  {
    serviceName: 'frontend',
    callCount: 50000,
    errorRate: 0.005,
    avgLatency: 120,
    p99Latency: 800,
    dependencies: [
      { targetService: 'api-gateway', callCount: 48000, errorRate: 0.002, avgLatency: 50 },
      { targetService: 'auth-service', callCount: 15000, errorRate: 0.001, avgLatency: 30 }
    ]
  },
  {
    serviceName: 'api-gateway',
    callCount: 48000,
    errorRate: 0.008,
    avgLatency: 150,
    p99Latency: 1000,
    dependencies: [
      { targetService: 'cart-service', callCount: 20000, errorRate: 0.01, avgLatency: 80 },
      { targetService: 'payment-service', callCount: 15000, errorRate: 0.05, avgLatency: 200 },
      { targetService: 'user-service', callCount: 30000, errorRate: 0.003, avgLatency: 60 }
    ]
  },
  {
    serviceName: 'cart-service',
    callCount: 20000,
    errorRate: 0.01,
    avgLatency: 80,
    p99Latency: 500,
    dependencies: [
      { targetService: 'database', callCount: 18000, errorRate: 0.001, avgLatency: 40 },
      { targetService: 'cache', callCount: 19000, errorRate: 0.0001, avgLatency: 5 }
    ]
  },
  {
    serviceName: 'payment-service',
    callCount: 15000,
    errorRate: 0.05,
    avgLatency: 200,
    p99Latency: 2000,
    dependencies: [
      { targetService: 'payment-gateway', callCount: 14000, errorRate: 0.08, avgLatency: 300 },
      { targetService: 'fraud-detection', callCount: 14500, errorRate: 0.02, avgLatency: 150 }
    ]
  },
  {
    serviceName: 'database',
    callCount: 100000,
    errorRate: 0.001,
    avgLatency: 40,
    p99Latency: 200,
    dependencies: []
  },
  {
    serviceName: 'cache',
    callCount: 80000,
    errorRate: 0.0001,
    avgLatency: 5,
    p99Latency: 20,
    dependencies: []
  }
]

/**
 * Mock critical path for testing
 */
export const mockCriticalPath: CriticalPath = {
  id: 'test-checkout-path',
  name: 'User Checkout Flow',
  description: 'Complete purchase transaction from cart to payment confirmation',
  services: ['frontend', 'api-gateway', 'cart-service', 'payment-service', 'database'],
  startService: 'frontend',
  endService: 'database',
  edges: [
    { source: 'frontend', target: 'api-gateway' },
    { source: 'api-gateway', target: 'cart-service' },
    { source: 'cart-service', target: 'payment-service' },
    { source: 'payment-service', target: 'database' }
  ],
  metrics: {
    requestCount: 15000,
    avgLatency: 470,
    errorRate: 0.05,
    p99Latency: 3000
  },
  priority: 'critical',
  severity: 0.85,
  lastUpdated: new Date('2025-01-19T10:00:00Z'),
  metadata: {
    discoveredBy: 'llm',
    timeRange: {
      startTime: '2025-01-19T09:00:00Z',
      endTime: '2025-01-19T10:00:00Z'
    }
  }
}

/**
 * Mock LLM response for critical path discovery
 */
export const mockLLMResponse = {
  paths: [
    {
      name: 'User Checkout Flow',
      description: 'Complete purchase transaction from cart to payment confirmation',
      services: ['frontend', 'api-gateway', 'cart-service', 'payment-service', 'database'],
      priority: 'critical' as const,
      severity: 0.9
    },
    {
      name: 'Product Search',
      description: 'Search and browse product catalog',
      services: ['frontend', 'api-gateway', 'search-service', 'database'],
      priority: 'high' as const,
      severity: 0.7
    }
  ]
}
