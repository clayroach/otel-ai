#!/usr/bin/env node

// End-to-end telemetry test: Script -> OTel Collector -> ClickHouse
// Tests the complete OTLP ingestion pipeline

const { trace } = require('@opentelemetry/api')
const { Resource } = require('@opentelemetry/resources')
const {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_SERVICE_NAMESPACE
} = require('@opentelemetry/semantic-conventions')
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http')
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node')
const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base')

// Create a tracer provider with resource information
const provider = new NodeTracerProvider({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: 'test-telemetry-generator',
    [ATTR_SERVICE_VERSION]: '1.0.0',
    [ATTR_SERVICE_NAMESPACE]: 'ai-native-observability'
  })
})

// Configure OTLP exporter
const exporter = new OTLPTraceExporter({
  url: 'http://localhost:4318/v1/traces'
})

// Add span processor
provider.addSpanProcessor(new SimpleSpanProcessor(exporter))

// Register the provider
provider.register()

console.log('🚀 OpenTelemetry tracer configured successfully')

// Get tracer
const tracer = trace.getTracer('test-telemetry-generator', '1.0.0')

async function generateTestTraces() {
  console.log('📊 Generating test telemetry data...')

  for (let i = 0; i < 5; i++) {
    const span = tracer.startSpan(`test-operation-${i}`, {
      kind: 1, // SPAN_KIND_CLIENT
      attributes: {
        'test.iteration': i,
        'test.type': 'ui-validation',
        'user.id': `user-${Math.floor(Math.random() * 100)}`,
        'request.method': ['GET', 'POST', 'PUT'][Math.floor(Math.random() * 3)]
      }
    })

    // Simulate work
    const duration = Math.random() * 1000 + 100 // 100-1100ms
    await new Promise((resolve) => setTimeout(resolve, duration))

    // Add some events
    span.addEvent('processing.start', {
      'processing.type': 'data-validation'
    })

    await new Promise((resolve) => setTimeout(resolve, 50))

    span.addEvent('processing.complete', {
      'processing.result': 'success',
      'records.processed': Math.floor(Math.random() * 1000)
    })

    // Randomly set error status
    if (Math.random() < 0.2) {
      span.recordException(new Error(`Simulated error in operation ${i}`))
      span.setStatus({ code: 2, message: 'Operation failed' }) // ERROR
    } else {
      span.setStatus({ code: 1 }) // OK
    }

    span.end()
    console.log(`✅ Generated trace ${i + 1}/5`)
  }

  console.log('🏁 Test telemetry generation complete!')
  console.log('📋 Check ClickHouse for data in ~5 seconds...')

  // Give time for data to be processed
  setTimeout(async () => {
    await checkClickHouseData()
    process.exit(0)
  }, 5000)
}

async function checkClickHouseData() {
  console.log('\n🔍 Checking ClickHouse for received data...')

  try {
    // Use correct credentials and OTLP native table
    const auth = Buffer.from('otel:otel123').toString('base64')
    const headers = { Authorization: `Basic ${auth}` }

    const response = await fetch(
      'http://localhost:8123/?query=SELECT count(*) FROM otel.traces',
      { headers }
    )
    const countText = await response.text()
    const count = parseInt(countText.trim())

    console.log(`📊 Total traces in ClickHouse: ${count}`)

    if (count > 0) {
      console.log('✅ End-to-end validation SUCCESS!')
      console.log('   - Test script generated traces ✓')
      console.log('   - OTel Collector received data ✓')
      console.log('   - ClickHouse stored data ✓')

      // Show recent traces
      const tracesResponse = await fetch(
        'http://localhost:8123/?query=SELECT trace_id, service_name, operation_name, duration_ms, start_time FROM otel.traces ORDER BY start_time DESC LIMIT 5 FORMAT JSON',
        { headers }
      )
      const tracesData = await tracesResponse.json()

      console.log('\n📋 Recent traces:')
      tracesData.data.forEach((trace, i) => {
        const durationMs = Math.round(trace.Duration / 1000000) // Convert nanoseconds to ms
        console.log(`   ${i + 1}. ${trace.ServiceName}/${trace.SpanName} (${durationMs}ms)`)
      })
    } else {
      console.log('⚠️  No traces found - check OTel Collector logs')
    }
  } catch (error) {
    console.log('❌ Error checking ClickHouse:', error.message)
  }
}

// Start generating test data
generateTestTraces()
