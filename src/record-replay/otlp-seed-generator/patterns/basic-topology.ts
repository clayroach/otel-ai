/**
 * Basic Topology Pattern - Simple 5-service e-commerce topology
 */

import { Effect } from 'effect'
import { SeededRandom } from '../deterministic.js'

// Pattern metadata
export const BasicTopologyPattern = {
  name: 'basic-topology',
  version: '1.0.0',
  description: 'Simple 5-service e-commerce topology with basic interactions',

  // Service names
  services: ['frontend', 'cart', 'payment', 'shipping', 'catalog'] as const,

  // Operation templates per service
  operations: {
    frontend: ['GET /', 'GET /product/:id', 'POST /checkout', 'GET /cart'],
    cart: ['addItem', 'removeItem', 'getCart', 'clearCart'],
    payment: ['processPayment', 'validateCard', 'refund'],
    shipping: ['calculateShipping', 'createLabel', 'trackPackage'],
    catalog: ['getProduct', 'searchProducts', 'getCategories']
  } as const,

  // Generate a single trace
  generateTrace: (random: SeededRandom, config: { errorRate: number; sessionId?: string }) => {
    const traceId = random.traceId()
    const startTime = BigInt(Date.now()) * BigInt(1_000_000) // nanoseconds

    // Determine service prefix from session ID
    const servicePrefix = config.sessionId
      ? `seed-${config.sessionId.split('-')[1] || 'test'}`
      : 'seed'

    // Root span (frontend)
    const rootSpan: {
      traceId: string
      spanId: string
      name: string
      kind: number
      startTimeUnixNano: string
      endTimeUnixNano: string
      attributes: Array<{ key: string; value: { stringValue?: string; intValue?: number } }>
      status: { code: number }
    } = {
      traceId,
      spanId: random.spanId(),
      name: random.choice(BasicTopologyPattern.operations.frontend),
      kind: 1, // SPAN_KIND_SERVER
      startTimeUnixNano: startTime.toString(),
      endTimeUnixNano: (startTime + BigInt(random.nextInt(50_000_000, 500_000_000))).toString(), // 50-500ms
      attributes: [
        { key: 'service.name', value: { stringValue: `${servicePrefix}-frontend` } },
        { key: 'http.method', value: { stringValue: 'GET' } },
        { key: 'http.status_code', value: { intValue: 200 } },
        { key: 'seed.session_id', value: { stringValue: config.sessionId || 'unknown' } }
      ],
      status: { code: random.probability(config.errorRate) ? 2 : 1 } // ERROR or OK
    }

    // Child spans (downstream services)
    const childSpans: Array<{
      traceId: string
      spanId: string
      parentSpanId: string
      name: string
      kind: number
      startTimeUnixNano: string
      endTimeUnixNano: string
      attributes: Array<{ key: string; value: { stringValue: string } }>
      status: { code: number }
    }> = []
    const numChildren = random.nextInt(1, 4) // 1-3 downstream calls

    const availableServices = ['cart', 'payment', 'shipping', 'catalog'] as const
    const services = random.shuffle([...availableServices])
    for (let i = 0; i < numChildren; i++) {
      const service = services[i]
      if (!service) continue

      const childStartTime = startTime + BigInt(random.nextInt(1_000_000, 50_000_000))
      const operations = BasicTopologyPattern.operations[service]
      if (!operations) continue

      const childSpan = {
        traceId,
        spanId: random.spanId(),
        parentSpanId: rootSpan.spanId,
        name: random.choice(operations),
        kind: 3, // SPAN_KIND_CLIENT
        startTimeUnixNano: childStartTime.toString(),
        endTimeUnixNano: (
          childStartTime + BigInt(random.nextInt(10_000_000, 200_000_000))
        ).toString(),
        attributes: [
          { key: 'service.name', value: { stringValue: `${servicePrefix}-${service}` } },
          { key: 'rpc.service', value: { stringValue: `${servicePrefix}-${service}` } },
          { key: 'seed.session_id', value: { stringValue: config.sessionId || 'unknown' } }
        ],
        status: { code: random.probability(config.errorRate) ? 2 : 1 }
      }
      childSpans.push(childSpan)
    }

    // Create separate resourceSpans for each service
    const resourceSpans = [
      // Frontend resource with root span
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: `${servicePrefix}-frontend` } },
            { key: 'service.version', value: { stringValue: '1.0.0' } },
            { key: 'deployment.environment', value: { stringValue: 'seed' } },
            { key: 'seed.pattern', value: { stringValue: 'basic-topology' } },
            { key: 'seed.session_id', value: { stringValue: config.sessionId || 'unknown' } }
          ]
        },
        scopeSpans: [
          {
            scope: { name: 'otel-ai-seed-generator', version: '1.0.0' },
            spans: [rootSpan]
          }
        ]
      }
    ]

    // Add child service resourceSpans
    for (const childSpan of childSpans) {
      const serviceAttr = childSpan.attributes.find((attr) => attr.key === 'service.name')
      const serviceName = serviceAttr?.value?.stringValue || 'unknown'

      resourceSpans.push({
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: serviceName } },
            { key: 'service.version', value: { stringValue: '1.0.0' } },
            { key: 'deployment.environment', value: { stringValue: 'seed' } },
            { key: 'seed.pattern', value: { stringValue: 'basic-topology' } },
            { key: 'seed.session_id', value: { stringValue: config.sessionId || 'unknown' } }
          ]
        },
        scopeSpans: [
          {
            scope: { name: 'otel-ai-seed-generator', version: '1.0.0' },
            spans: [childSpan]
          }
        ]
      })
    }

    return { resourceSpans }
  },

  // Generate OTLP data
  generate: (config: {
    tracesPerSecond: number
    errorRate: number
    seed?: number
    sessionId?: string
  }): Effect.Effect<unknown, never, never> =>
    Effect.sync(() => {
      const random = new SeededRandom(config.seed)
      return BasicTopologyPattern.generateTrace(random, {
        errorRate: config.errorRate,
        ...(config.sessionId ? { sessionId: config.sessionId } : {})
      })
    })
}
