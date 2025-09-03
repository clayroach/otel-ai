// Mock data for AI Analyzer demonstration

export interface AnalysisResult {
  requestId: string
  type: 'architecture' | 'dataflow' | 'dependencies' | 'insights'
  summary: string
  architecture?: ApplicationArchitecture
  insights: AnalysisInsight[]
  documentation?: { markdown: string }
  metadata: {
    analyzedSpans: number
    analysisTimeMs: number
    llmTokensUsed: number
    confidence: number
    selectedModel?: string
    llmModel?: string
  }
}

export interface ApplicationArchitecture {
  applicationName: string
  description: string
  services: ServiceTopology[]
  dataFlows: DataFlow[]
  criticalPaths: CriticalPath[]
  generatedAt: Date
}

export interface ServiceTopology {
  service: string
  type: 'frontend' | 'api' | 'backend' | 'database' | 'queue' | 'cache' | 'external'
  operations: string[]
  dependencies: ServiceDependency[]
  metadata: Record<string, unknown>
}

export interface ServiceDependency {
  service: string
  operation: string
  callCount: number
  avgLatencyMs: number
  errorRate: number
}

export interface DataFlow {
  from: string
  to: string
  operation: string
  volume: number
  latency: {
    p50: number
    p95: number
    p99: number
  }
}

export interface CriticalPath {
  name: string
  services: string[]
  avgLatencyMs: number
  errorRate: number
}

export interface AnalysisInsight {
  type: 'performance' | 'reliability' | 'architecture' | 'optimization'
  severity: 'info' | 'warning' | 'critical'
  title: string
  description: string
  recommendation?: string
  evidence: string[]
}

export const mockAnalysisResult: AnalysisResult = {
  requestId: 'ai-analysis-1234567890',
  type: 'architecture',
  summary: `## Application Architecture Analysis

This distributed application follows a microservices pattern with 8 core services handling approximately 50,000 requests per hour. The architecture demonstrates good separation of concerns with distinct frontend, API gateway, backend services, and data layer.

### Key Findings:
- **Frontend Layer**: React SPA with efficient client-side routing
- **API Gateway**: Kong gateway handling authentication and rate limiting  
- **Business Logic**: 4 backend services (user, order, payment, inventory)
- **Data Layer**: PostgreSQL primary database with Redis cache
- **Message Queue**: RabbitMQ for async processing

### Performance Characteristics:
- Average request latency: 185ms (well within acceptable bounds)
- 99.2% success rate with excellent error handling
- Cache hit rate: 78% significantly reducing database load`,
  architecture: {
    applicationName: 'E-Commerce Platform',
    description:
      'Modern microservices-based e-commerce platform with React frontend, Kong API gateway, and distributed backend services',
    services: [
      {
        service: 'mfrontend-web',
        type: 'frontend',
        operations: ['page-load', 'api-call', 'user-interaction'],
        dependencies: [
          {
            service: 'mapi-gateway',
            operation: 'api-request',
            callCount: 15000,
            avgLatencyMs: 45,
            errorRate: 0.002
          }
        ],
        metadata: {
          avgLatencyMs: 120,
          errorRate: 0.001,
          totalSpans: 15000,
          technology: 'React',
          version: '18.2.0'
        }
      },
      {
        service: 'mapi-gateway',
        type: 'api',
        operations: ['route', 'auth', 'rate-limit'],
        dependencies: [
          {
            service: 'muser-service',
            operation: 'get-user',
            callCount: 8000,
            avgLatencyMs: 85,
            errorRate: 0.003
          },
          {
            service: 'morder-service',
            operation: 'create-order',
            callCount: 3000,
            avgLatencyMs: 150,
            errorRate: 0.005
          }
        ],
        metadata: {
          avgLatencyMs: 50,
          errorRate: 0.002,
          totalSpans: 14500,
          technology: 'Kong',
          version: '3.0'
        }
      },
      {
        service: 'muser-service',
        type: 'backend',
        operations: ['get-user', 'create-user', 'update-profile'],
        dependencies: [
          {
            service: 'mpostgres-db',
            operation: 'query',
            callCount: 8500,
            avgLatencyMs: 25,
            errorRate: 0.001
          },
          {
            service: 'mredis-cache',
            operation: 'get',
            callCount: 6000,
            avgLatencyMs: 3,
            errorRate: 0.0001
          }
        ],
        metadata: {
          avgLatencyMs: 95,
          errorRate: 0.003,
          totalSpans: 8200,
          technology: 'Node.js',
          version: '20.0'
        }
      },
      {
        service: 'morder-service',
        type: 'backend',
        operations: ['create-order', 'get-orders', 'cancel-order'],
        dependencies: [
          {
            service: 'mpostgres-db',
            operation: 'transaction',
            callCount: 3200,
            avgLatencyMs: 45,
            errorRate: 0.002
          },
          {
            service: 'mpayment-service',
            operation: 'process-payment',
            callCount: 2800,
            avgLatencyMs: 250,
            errorRate: 0.008
          }
        ],
        metadata: {
          avgLatencyMs: 180,
          errorRate: 0.005,
          totalSpans: 3100,
          technology: 'Java Spring',
          version: '3.1'
        }
      },
      {
        service: 'mpayment-service',
        type: 'backend',
        operations: ['process-payment', 'refund', 'validate-card'],
        dependencies: [
          {
            service: 'mstripe-api',
            operation: 'charge',
            callCount: 2800,
            avgLatencyMs: 180,
            errorRate: 0.01
          },
          {
            service: 'mpostgres-db',
            operation: 'insert',
            callCount: 2900,
            avgLatencyMs: 20,
            errorRate: 0.001
          }
        ],
        metadata: {
          avgLatencyMs: 220,
          errorRate: 0.008,
          totalSpans: 2850,
          technology: 'Python',
          version: '3.11'
        }
      },
      {
        service: 'mpostgres-db',
        type: 'database',
        operations: ['SELECT', 'INSERT', 'UPDATE', 'BEGIN TRANSACTION'],
        dependencies: [],
        metadata: {
          avgLatencyMs: 28,
          errorRate: 0.001,
          totalSpans: 18500,
          technology: 'PostgreSQL',
          version: '15.0'
        }
      },
      {
        service: 'mredis-cache',
        type: 'cache',
        operations: ['GET', 'SET', 'DEL', 'EXPIRE'],
        dependencies: [],
        metadata: {
          avgLatencyMs: 3,
          errorRate: 0.0001,
          totalSpans: 12000,
          technology: 'Redis',
          version: '7.0'
        }
      },
      {
        service: 'mstripe-api',
        type: 'external',
        operations: ['charge', 'refund', 'webhook'],
        dependencies: [],
        metadata: {
          avgLatencyMs: 180,
          errorRate: 0.01,
          totalSpans: 2900,
          technology: 'REST API',
          version: '2023-10-16'
        }
      }
    ],
    dataFlows: [
      {
        from: 'mfrontend-web',
        to: 'mapi-gateway',
        operation: 'api-request',
        volume: 15000,
        latency: { p50: 45, p95: 120, p99: 200 }
      },
      {
        from: 'mapi-gateway',
        to: 'muser-service',
        operation: 'get-user',
        volume: 8000,
        latency: { p50: 85, p95: 180, p99: 300 }
      },
      {
        from: 'mapi-gateway',
        to: 'morder-service',
        operation: 'create-order',
        volume: 3000,
        latency: { p50: 150, p95: 350, p99: 500 }
      },
      {
        from: 'muser-service',
        to: 'mpostgres-db',
        operation: 'query',
        volume: 8500,
        latency: { p50: 25, p95: 60, p99: 120 }
      },
      {
        from: 'muser-service',
        to: 'mredis-cache',
        operation: 'get',
        volume: 6000,
        latency: { p50: 3, p95: 8, p99: 15 }
      },
      {
        from: 'morder-service',
        to: 'mpayment-service',
        operation: 'process-payment',
        volume: 2800,
        latency: { p50: 250, p95: 500, p99: 800 }
      },
      {
        from: 'mpayment-service',
        to: 'mstripe-api',
        operation: 'charge',
        volume: 2800,
        latency: { p50: 180, p95: 400, p99: 600 }
      }
    ],
    criticalPaths: [
      {
        name: 'User Registration Flow',
        services: ['mfrontend-web', 'mapi-gateway', 'muser-service', 'mpostgres-db'],
        avgLatencyMs: 195,
        errorRate: 0.003
      },
      {
        name: 'Order Checkout Flow',
        services: [
          'mfrontend-web',
          'mapi-gateway',
          'morder-service',
          'mpayment-service',
          'mstripe-api'
        ],
        avgLatencyMs: 485,
        errorRate: 0.012
      },
      {
        name: 'User Profile Lookup',
        services: ['mfrontend-web', 'mapi-gateway', 'muser-service', 'mredis-cache'],
        avgLatencyMs: 133,
        errorRate: 0.002
      }
    ],
    generatedAt: new Date()
  },
  insights: [
    {
      type: 'performance',
      severity: 'warning',
      title: 'Payment Service Latency Spike',
      description:
        'Payment service shows 250ms average latency, which is 40% higher than recommended for checkout flows',
      recommendation:
        'Consider implementing circuit breaker pattern and async payment processing for non-critical validations',
      evidence: []
    },
    {
      type: 'reliability',
      severity: 'critical',
      title: 'External API Dependency Risk',
      description:
        'Stripe API has 1% error rate affecting order completion. No fallback mechanism detected',
      recommendation:
        'Implement retry logic with exponential backoff and consider alternative payment providers for redundancy',
      evidence: []
    },
    {
      type: 'architecture',
      severity: 'info',
      title: 'Excellent Cache Utilization',
      description:
        'Redis cache shows 78% hit rate with sub-5ms response times, significantly reducing database load',
      recommendation: 'Consider expanding cache coverage to order summary and product catalog data',
      evidence: []
    },
    {
      type: 'optimization',
      severity: 'warning',
      title: 'Database Query Optimization Opportunity',
      description:
        'User service generates 8500 database queries with some showing >60ms P95 latency',
      recommendation:
        'Review N+1 query patterns and consider database connection pooling optimization',
      evidence: []
    }
  ],
  metadata: {
    analyzedSpans: 87150,
    analysisTimeMs: 2340,
    llmTokensUsed: 3850,
    confidence: 0.94
  }
}

// Model-specific insights for demonstration
const getModelSpecificInsights = (model: string): AnalysisInsight[] => {
  const baseInsights = mockAnalysisResult.insights

  if (model === 'local-statistical-analyzer') {
    // Statistical model returns fewer, basic insights
    return baseInsights.slice(0, 2).map((insight) => ({
      ...insight,
      type: 'performance',
      severity: 'info' as const
    }))
  }

  // Enhanced models have unique insights
  const modelInsights: Record<string, AnalysisInsight> = {
    claude: {
      title: 'Architectural Pattern Analysis',
      description:
        'Claude identifies sophisticated architectural patterns and suggests improvements based on domain-driven design principles.',
      type: 'architecture',
      severity: 'info',
      evidence: [
        'Microservices pattern detected',
        'Event-driven communication',
        'CQRS implementation opportunity'
      ],
      recommendation: 'Consider implementing event sourcing for audit trail capabilities.'
    },
    gpt: {
      title: 'Performance Optimization Opportunities',
      description:
        'GPT-4 analysis reveals specific performance bottlenecks and provides actionable optimization strategies.',
      type: 'performance',
      severity: 'warning',
      evidence: [
        'Database connection pooling inefficient',
        'Caching layer underutilized',
        'Query optimization needed'
      ],
      recommendation:
        'Implement connection pooling and add Redis caching layer for frequently accessed data.'
    },
    llama: {
      title: 'Resource Utilization & Scalability Analysis',
      description:
        'Llama provides detailed resource usage analysis and scalability recommendations for cloud deployment.',
      type: 'optimization',
      severity: 'info',
      evidence: [
        'CPU utilization spikes detected',
        'Memory usage patterns analyzed',
        'Scaling policies recommended'
      ],
      recommendation: 'Implement horizontal pod autoscaling with custom CPU and memory thresholds.'
    }
  }

  const modelSpecificInsight = modelInsights[model]
  if (modelSpecificInsight) {
    return [modelSpecificInsight, ...baseInsights]
  }

  return baseInsights
}

export const generateMockData = (
  analysisType: 'architecture' | 'dataflow' | 'dependencies' | 'insights',
  model: string = 'claude'
): AnalysisResult => {
  return {
    ...mockAnalysisResult,
    type: analysisType,
    insights: getModelSpecificInsights(model),
    summary:
      analysisType === 'dependencies'
        ? `Dependency analysis using ${model === 'local-statistical-analyzer' ? 'statistical analysis' : model + ' model'} shows well-structured service relationships with minimal circular dependencies`
        : analysisType === 'dataflow'
          ? `Data flow analysis using ${model === 'local-statistical-analyzer' ? 'statistical analysis' : model + ' model'} reveals efficient request patterns with optimal cache utilization`
          : analysisType === 'insights'
            ? `Performance insights using ${model === 'local-statistical-analyzer' ? 'statistical analysis' : model + ' model'} indicate overall healthy system with specific optimization opportunities`
            : `Architecture analysis using ${model === 'local-statistical-analyzer' ? 'statistical analysis' : model + ' model'}: ${mockAnalysisResult.summary}`,
    metadata: {
      ...mockAnalysisResult.metadata,
      selectedModel: model,
      llmModel:
        model === 'local-statistical-analyzer'
          ? 'local-statistical-analyzer'
          : `${model}-via-llm-manager`
    }
  }
}
