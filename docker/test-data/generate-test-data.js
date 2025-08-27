#!/usr/bin/env node

/**
 * Continuous Test Data Generator for AI-Native Observability Platform
 * Generates realistic telemetry data for both collector and direct ingestion paths
 */

const { NodeSDK } = require('@opentelemetry/sdk-node')
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http')
const { Resource } = require('@opentelemetry/resources')
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions')
const { trace, SpanStatusCode, SpanKind } = require('@opentelemetry/api')
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http')
const axios = require('axios')

// Configuration from environment variables
const OTLP_ENDPOINT = process.env.OTLP_ENDPOINT || 'http://localhost:4318'
const DIRECT_OTLP_ENDPOINT = process.env.DIRECT_OTLP_ENDPOINT || 'http://localhost:4319'
const CLICKHOUSE_URL = process.env.CLICKHOUSE_URL || 'http://localhost:8123'
const GENERATE_INTERVAL = process.env.GENERATE_INTERVAL || '30s'
const DIRECT_INGESTION_RATIO = 0.2 // 20% direct, 80% collector

console.log('🚀 Starting AI-Native Observability Test Data Generator')
console.log(`📡 OTLP Collector Endpoint: ${OTLP_ENDPOINT}`)
console.log(`🎯 Direct OTLP Endpoint: ${DIRECT_OTLP_ENDPOINT}`)
console.log(`💾 ClickHouse URL: ${CLICKHOUSE_URL}`)
console.log(`⏱️  Generation Interval: ${GENERATE_INTERVAL}`)

// Service definitions for realistic data
const SERVICES = [
  { name: 'rect-ingestion-service', version: '1.2.0', type: 'ingestion' },
  { name: 'st-telemetry-generator', version: '2.1.1', type: 'generator' },
  { name: 'ai-analyzer-service', version: '0.9.3', type: 'ai' },
  { name: 'config-manager-service', version: '1.0.0', type: 'config' },
  { name: 'llm-orchestrator', version: '0.8.2', type: 'llm' }
]

const OPERATIONS = {
  ingestion: ['ingest-traces', 'validate-schema', 'parse-otlp', 'enrich-metadata'],
  generator: ['generate-span', 'emit-metric', 'create-log-entry', 'batch-telemetry'],
  ai: ['detect-anomaly', 'train-model', 'predict-pattern', 'analyze-performance'],
  config: ['validate-config', 'apply-settings', 'reload-rules', 'sync-state'],
  llm: ['route-request', 'generate-dashboard', 'optimize-query', 'personalize-ui']
}

// Initialize OpenTelemetry SDK for collector path
const resource = Resource.default().merge(
  new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'test-data-generator',
    [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0'
  })
)

const sdk = new NodeSDK({
  resource: resource,
  traceExporter: new OTLPTraceExporter({
    url: `${OTLP_ENDPOINT}/v1/traces`
  }),
  instrumentations: [new HttpInstrumentation()]
})

// Start the SDK
sdk.start()
console.log('✅ OpenTelemetry SDK initialized for collector path')

// Get tracer
const tracer = trace.getTracer('test-data-generator', '1.0.0')

// Generate random trace data
function generateTraceId() {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

function generateSpanId() {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

function getRandomElement(array) {
  return array[Math.floor(Math.random() * array.length)]
}

function generateRandomDuration() {
  // Generate realistic durations: mostly fast (10-500ms), some slow (1-10s), few very slow (10-30s)
  const rand = Math.random()
  if (rand < 0.7) return Math.floor(Math.random() * 490) + 10 // 10-500ms
  if (rand < 0.95) return Math.floor(Math.random() * 9000) + 1000 // 1-10s
  return Math.floor(Math.random() * 20000) + 10000 // 10-30s
}

// Generate test trace via collector path (OpenTelemetry SDK)
async function generateCollectorTrace() {
  const service = getRandomElement(SERVICES)
  const operation = getRandomElement(OPERATIONS[service.type])
  const isError = Math.random() < 0.1 // 10% error rate

  return new Promise((resolve) => {
    const span = tracer.startSpan(`${operation}`, {
      kind: SpanKind.SERVER,
      attributes: {
        'service.name': service.name,
        'service.version': service.version,
        'service.type': service.type,
        'operation.name': operation,
        'test.data.source': 'collector',
        'test.data.generator': 'otel-ai-test-generator',
        'http.method': getRandomElement(['GET', 'POST', 'PUT', 'DELETE']),
        'http.status_code': isError
          ? getRandomElement([400, 404, 500, 503])
          : getRandomElement([200, 201, 204]),
        'user.id': `user-${Math.floor(Math.random() * 1000)}`,
        'session.id': generateSpanId(),
        environment: 'development'
      }
    })

    // Simulate work duration
    const duration = generateRandomDuration()

    setTimeout(
      () => {
        if (isError) {
          span.recordException(new Error(`Simulated error in ${operation}`))
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'Simulated test error' })
        } else {
          span.setStatus({ code: SpanStatusCode.OK })
        }

        // Add some events
        span.addEvent('operation.start', {
          component: service.type,
          'thread.id': Math.floor(Math.random() * 8) + 1
        })

        if (Math.random() < 0.3) {
          // 30% chance of additional event
          span.addEvent('cache.hit', {
            'cache.key': `cache-${Math.floor(Math.random() * 100)}`,
            'cache.type': getRandomElement(['redis', 'memory', 'disk'])
          })
        }

        span.addEvent('operation.complete', {
          'records.processed': Math.floor(Math.random() * 1000),
          'duration.ms': duration
        })

        span.end()
        resolve({
          traceId: span.spanContext().traceId,
          spanId: span.spanContext().spanId,
          service: service.name,
          operation,
          duration,
          status: isError ? 'ERROR' : 'OK'
        })
      },
      Math.min(duration, 1000)
    ) // Cap actual delay at 1s for faster generation
  })
}

// Generate test trace via direct ingestion path (using OTLP but with direct metadata)
async function generateDirectTrace() {
  console.log('📍 ENTRY: generateDirectTrace() called - using OTLP with direct metadata')
  const service = getRandomElement(SERVICES)
  const operation = getRandomElement(OPERATIONS[service.type])
  const isError = Math.random() < 0.08 // Slightly lower error rate for direct path
  const traceId = generateTraceId()
  const spanId = generateSpanId()
  const duration = generateRandomDuration()

  // Create OTLP trace data with special metadata to mark it as "direct" ingestion
  const otlpTrace = {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: service.name } },
            { key: 'service.version', value: { stringValue: service.version } },
            { key: 'service.type', value: { stringValue: service.type } },
            // Special marker for direct ingestion path
            { key: 'ingestion.path', value: { stringValue: 'direct' } },
            { key: 'ingestion.method', value: { stringValue: 'otlp-direct' } },
            { key: 'test.data.source', value: { stringValue: 'direct-generator' } },
            { key: 'environment', value: { stringValue: 'development' } }
          ]
        },
        scopeSpans: [
          {
            spans: [
              {
                traceId: traceId,
                spanId: spanId,
                name: operation,
                kind: 'SPAN_KIND_SERVER',
                startTimeUnixNano: (Date.now() - duration) * 1000000,
                endTimeUnixNano: Date.now() * 1000000,
                status: {
                  code: isError ? 'STATUS_CODE_ERROR' : 'STATUS_CODE_OK',
                  message: isError ? 'Simulated direct ingestion error' : 'OK'
                },
                attributes: [
                  {
                    key: 'http.method',
                    value: { stringValue: getRandomElement(['GET', 'POST', 'PUT', 'DELETE']) }
                  },
                  {
                    key: 'http.status_code',
                    value: {
                      intValue: isError
                        ? getRandomElement([400, 404, 500, 503])
                        : getRandomElement([200, 201, 204])
                    }
                  },
                  {
                    key: 'user.id',
                    value: { stringValue: `user-${Math.floor(Math.random() * 1000)}` }
                  },
                  { key: 'session.id', value: { stringValue: generateSpanId() } },
                  { key: 'ai.optimization.enabled', value: { boolValue: true } },
                  { key: 'direct.ingestion.marker', value: { stringValue: 'true' } }, // Special marker
                  { key: 'test.generator.type', value: { stringValue: 'direct-path' } }
                ],
                events: [
                  {
                    name: 'operation.start',
                    timeUnixNano: (Date.now() - duration) * 1000000,
                    attributes: [{ key: 'component', value: { stringValue: service.type } }]
                  },
                  {
                    name: 'operation.complete',
                    timeUnixNano: Date.now() * 1000000,
                    attributes: [
                      {
                        key: 'records.processed',
                        value: { intValue: Math.floor(Math.random() * 1000) }
                      },
                      { key: 'duration.ms', value: { intValue: duration } }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }

  try {
    console.log(`🔍 Sending direct OTLP trace to ${DIRECT_OTLP_ENDPOINT}/v1/traces`)
    console.log(`🔍 Direct trace data:`, {
      traceId: traceId.substring(0, 8) + '...',
      service: service.name,
      operation: operation,
      ingestionPath: 'direct'
    })

    // Send to backend OTLP endpoint for direct ingestion
    const response = await axios.post(`${DIRECT_OTLP_ENDPOINT}/v1/traces`, otlpTrace, {
      headers: {
        'Content-Type': 'application/json',
        'X-Ingestion-Path': 'direct', // Custom header to help identify
        'X-Generator-Type': 'direct-test-generator'
      },
      timeout: 10000
    })

    console.log(`✅ Direct OTLP trace sent successfully, status: ${response.status}`)

    return {
      traceId: traceId,
      spanId: spanId,
      service: service.name,
      operation,
      duration,
      status: isError ? 'ERROR' : 'OK',
      path: 'direct'
    }
  } catch (error) {
    console.error('❌ Failed to send direct OTLP trace:', error.message)
    console.error('❌ Error details:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      url: `${DIRECT_OTLP_ENDPOINT}/v1/traces`,
      method: 'POST'
    })
    throw error
  }
}

// Parse interval string to milliseconds
function parseInterval(interval) {
  const match = interval.match(/^(\d+)([smh])$/)
  if (!match) return 30000 // Default 30 seconds

  const [, value, unit] = match
  const multipliers = { s: 1000, m: 60000, h: 3600000 }
  return parseInt(value) * multipliers[unit]
}

// Main generation loop
async function startDataGeneration() {
  const intervalMs = parseInterval(GENERATE_INTERVAL)
  console.log(`🔄 Starting data generation every ${intervalMs}ms`)

  let generationCount = 0
  let collectorCount = 0
  let directCount = 0

  const generateBatch = async () => {
    try {
      const batchSize = Math.floor(Math.random() * 5) + 3 // 3-7 traces per batch
      const promises = []

      for (let i = 0; i < batchSize; i++) {
        if (Math.random() < DIRECT_INGESTION_RATIO) {
          console.log(`🎯 Generating direct trace ${i + 1} of ${batchSize}`)
          promises.push(generateDirectTrace().then((result) => ({ ...result, path: 'direct' })))
          directCount++
        } else {
          console.log(`🎯 Generating collector trace ${i + 1} of ${batchSize}`)
          promises.push(
            generateCollectorTrace().then((result) => ({ ...result, path: 'collector' }))
          )
          collectorCount++
        }
      }

      const results = await Promise.allSettled(promises)
      const successful = results.filter((r) => r.status === 'fulfilled').length
      const failed = results.length - successful

      // Log details about failed promises
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.log(`❌ Promise ${index} failed:`, result.reason?.message || result.reason)
        }
      })

      generationCount += successful

      console.log(
        `📊 Batch ${Math.floor(generationCount / 5)}: ${successful} traces generated${failed > 0 ? ` (${failed} failed)` : ''}`
      )
      console.log(
        `📈 Total: ${generationCount} traces (${collectorCount} collector, ${directCount} direct)`
      )

      if (generationCount % 50 === 0) {
        console.log('🎯 Milestone: 50+ traces generated! Data should be visible in UI')
      }
    } catch (error) {
      console.error('❌ Batch generation failed:', error.message)
    }
  }

  // Generate initial batch immediately
  await generateBatch()

  // Continue generating at intervals
  setInterval(generateBatch, intervalMs)
}

// Wait for dependencies and start generation
async function waitForDependencies() {
  console.log('⏳ Waiting for ClickHouse to be ready...')

  let retries = 30
  while (retries > 0) {
    try {
      await axios.get(`${CLICKHOUSE_URL}/ping`, {
        headers: {
          Authorization: 'Basic ' + Buffer.from('otel:otel123').toString('base64')
        },
        timeout: 5000
      })
      console.log('✅ ClickHouse is ready')
      break
    } catch (error) {
      retries--
      if (retries === 0) {
        console.error('❌ ClickHouse not available after 30 retries')
        process.exit(1)
      }
      console.log(`🔄 ClickHouse not ready, retrying... (${retries} attempts left)`)
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }

  // Start data generation
  await startDataGeneration()
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...')
  sdk.shutdown().then(() => {
    console.log('✅ OpenTelemetry SDK shut down')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...')
  sdk.shutdown().then(() => {
    console.log('✅ OpenTelemetry SDK shut down')
    process.exit(0)
  })
})

// Start the application
waitForDependencies().catch((error) => {
  console.error('💥 Fatal error:', error)
  process.exit(1)
})
