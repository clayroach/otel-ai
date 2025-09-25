/**
 * OTLP Test Data Generator
 *
 * Generates realistic OTLP data for testing capture and replay functionality.
 * This can be used to bootstrap test fixtures or generate synthetic test data.
 */

import { randomUUID } from 'crypto'

export interface GenerateOtlpDataOptions {
  serviceName?: string
  traceCount?: number
  spanCount?: number
  includeErrors?: boolean
  includeSlowSpans?: boolean
  includeLogs?: boolean
  includeMetrics?: boolean
}

// Generate realistic OTLP trace data
export function generateTestOtlpData(options: GenerateOtlpDataOptions = {}) {
  const {
    serviceName = 'test-service',
    traceCount = 1,
    spanCount = 5,
    includeErrors = false,
    includeSlowSpans = false
  } = options

  const resourceSpans = []

  for (let t = 0; t < traceCount; t++) {
    const traceId = generateTraceId()
    const spans: Array<{
      traceId: string
      spanId: string
      parentSpanId?: string
      name: string
      kind: string
      startTimeUnixNano: string
      endTimeUnixNano: string
      attributes: Array<{ key: string; value: { stringValue?: string; intValue?: string } }>
      status: { code: string; message: string }
      events: Array<{
        timeUnixNano: string
        name: string
        attributes: Array<{ key: string; value: { stringValue: string } }>
      }>
      links: Array<unknown>
    }> = []

    for (let s = 0; s < spanCount; s++) {
      const spanId = generateSpanId()
      const parentSpanId: string | undefined = s > 0 ? spans[0]?.spanId : undefined

      // Generate realistic timing
      const now = Date.now()
      const startTime = now - Math.floor(Math.random() * 60000) // Within last minute
      const duration =
        includeSlowSpans && s % 3 === 0
          ? Math.floor(Math.random() * 5000) + 5000 // 5-10 seconds (slow)
          : Math.floor(Math.random() * 500) + 50 // 50-550ms (normal)
      const endTime = startTime + duration

      // Determine if this span should have an error
      const hasError = includeErrors && Math.random() < 0.3 // 30% error rate if errors enabled

      spans.push({
        traceId,
        spanId,
        ...(parentSpanId ? { parentSpanId } : {}),
        name: `${serviceName}.operation${s}`,
        kind: s === 0 ? 'SPAN_KIND_SERVER' : 'SPAN_KIND_INTERNAL',
        startTimeUnixNano: (startTime * 1_000_000).toString(),
        endTimeUnixNano: (endTime * 1_000_000).toString(),
        attributes: [
          { key: 'http.method', value: { stringValue: 'GET' } },
          { key: 'http.url', value: { stringValue: `/api/endpoint${s}` } },
          { key: 'http.status_code', value: { intValue: hasError ? '500' : '200' } },
          { key: 'service.version', value: { stringValue: '1.0.0' } },
          { key: 'test.scenario', value: { stringValue: 'integration-test' } }
        ],
        status: {
          code: hasError ? 'STATUS_CODE_ERROR' : 'STATUS_CODE_OK',
          message: hasError ? 'Internal server error' : ''
        },
        events: hasError
          ? [
              {
                timeUnixNano: ((startTime + duration / 2) * 1_000_000).toString(),
                name: 'exception',
                attributes: [
                  { key: 'exception.type', value: { stringValue: 'Error' } },
                  { key: 'exception.message', value: { stringValue: 'Test error occurred' } },
                  { key: 'exception.stacktrace', value: { stringValue: generateStackTrace() } }
                ]
              }
            ]
          : [],
        links: []
      })
    }

    resourceSpans.push({
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: serviceName } },
          { key: 'service.namespace', value: { stringValue: 'test' } },
          { key: 'service.instance.id', value: { stringValue: randomUUID() } },
          { key: 'telemetry.sdk.name', value: { stringValue: 'opentelemetry' } },
          { key: 'telemetry.sdk.language', value: { stringValue: 'nodejs' } },
          { key: 'telemetry.sdk.version', value: { stringValue: '1.0.0' } },
          { key: 'deployment.environment', value: { stringValue: 'test' } }
        ]
      },
      scopeSpans: [
        {
          scope: {
            name: '@opentelemetry/instrumentation-http',
            version: '0.35.0'
          },
          spans
        }
      ]
    })
  }

  return { resourceSpans }
}

// Generate test metrics data
export function generateTestMetricsData(options: GenerateOtlpDataOptions = {}) {
  const { serviceName = 'test-service' } = options
  const now = Date.now()

  return {
    resourceMetrics: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: serviceName } },
            { key: 'service.namespace', value: { stringValue: 'test' } }
          ]
        },
        scopeMetrics: [
          {
            scope: {
              name: 'test-metrics',
              version: '1.0.0'
            },
            metrics: [
              {
                name: 'http.server.duration',
                description: 'HTTP server request duration',
                unit: 'ms',
                histogram: {
                  dataPoints: [
                    {
                      startTimeUnixNano: ((now - 60000) * 1_000_000).toString(),
                      timeUnixNano: (now * 1_000_000).toString(),
                      count: '100',
                      sum: 5000,
                      bucketCounts: ['10', '20', '30', '20', '15', '5'],
                      explicitBounds: [10, 50, 100, 500, 1000, 5000],
                      attributes: [
                        { key: 'http.method', value: { stringValue: 'GET' } },
                        { key: 'http.status_code', value: { intValue: '200' } }
                      ]
                    }
                  ],
                  aggregationTemporality: 'AGGREGATION_TEMPORALITY_CUMULATIVE'
                }
              },
              {
                name: 'http.server.active_requests',
                description: 'Active HTTP requests',
                unit: '1',
                gauge: {
                  dataPoints: [
                    {
                      timeUnixNano: (now * 1_000_000).toString(),
                      asInt: '15',
                      attributes: []
                    }
                  ]
                }
              }
            ]
          }
        ]
      }
    ]
  }
}

// Generate test logs data
export function generateTestLogsData(options: GenerateOtlpDataOptions = {}) {
  const { serviceName = 'test-service', includeErrors = false } = options
  const now = Date.now()
  const logs = []

  for (let i = 0; i < 10; i++) {
    const severity = includeErrors && i % 4 === 0 ? 'ERROR' : i % 3 === 0 ? 'WARN' : 'INFO'

    logs.push({
      timeUnixNano: ((now - i * 1000) * 1_000_000).toString(),
      severityNumber: severity === 'ERROR' ? 17 : severity === 'WARN' ? 13 : 9,
      severityText: severity,
      body: {
        stringValue: `Test log message ${i}: ${severity === 'ERROR' ? 'Something went wrong' : 'Normal operation'}`
      },
      attributes: [
        { key: 'log.file.name', value: { stringValue: 'app.js' } },
        { key: 'log.file.line', value: { intValue: (100 + i).toString() } }
      ],
      traceId: generateTraceId(),
      spanId: generateSpanId()
    })
  }

  return {
    resourceLogs: [
      {
        resource: {
          attributes: [{ key: 'service.name', value: { stringValue: serviceName } }]
        },
        scopeLogs: [
          {
            scope: {
              name: 'test-logger',
              version: '1.0.0'
            },
            logRecords: logs
          }
        ]
      }
    ]
  }
}

// Helper to generate a valid trace ID (32 hex chars)
function generateTraceId(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

// Helper to generate a valid span ID (16 hex chars)
function generateSpanId(): string {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

// Generate a simple stack trace for error scenarios
function generateStackTrace(): string {
  return `Error: Test error occurred
    at processRequest (/app/src/handler.js:45:15)
    at async handleHTTP (/app/src/server.js:123:7)
    at async Server.<anonymous> (/app/src/index.js:89:5)`
}

// Bootstrap function to capture real data from OpenTelemetry Demo
export async function captureRealOtlpDataFromDemo(
  captureService: {
    startCapture: (config: {
      sessionId: string
      description: string
      enabledFlags: string[]
      captureTraces: boolean
      captureMetrics: boolean
      captureLogs: boolean
      compressionEnabled: boolean
    }) => Promise<{ sessionId: string }>
    stopCapture: (sessionId: string) => Promise<{
      capturedTraces: number
      capturedMetrics: number
      capturedLogs: number
      totalSizeBytes: number
    }>
  },
  duration: number = 60000
): Promise<string> {
  console.log('🎬 Starting real OTLP data capture from demo...')

  // Start a capture session
  const session = await captureService.startCapture({
    sessionId: `bootstrap-${Date.now()}`,
    description: 'Bootstrap capture from OpenTelemetry Demo',
    enabledFlags: ['demo-capture'],
    captureTraces: true,
    captureMetrics: true,
    captureLogs: true,
    compressionEnabled: true
  })

  console.log(`⏱️ Capturing for ${duration / 1000} seconds...`)

  // Wait for the specified duration to capture data
  await new Promise((resolve) => setTimeout(resolve, duration))

  // Stop capture
  const finalSession = await captureService.stopCapture(session.sessionId)

  console.log(`✅ Captured:
    - ${finalSession.capturedTraces} trace batches
    - ${finalSession.capturedMetrics} metric batches
    - ${finalSession.capturedLogs} log batches
    - Total size: ${(finalSession.totalSizeBytes / 1024 / 1024).toFixed(2)} MB`)

  return session.sessionId
}

// Export captured data as test fixtures
export async function exportCapturedDataAsFixtures(
  replayService: {
    replayDataStream: (
      sessionId: string,
      type: string
    ) => {
      pipeTo: (handler: (chunk: Uint8Array) => Promise<void>) => Promise<void>
    }
  },
  sessionId: string,
  outputDir: string = './test/fixtures/captured'
): Promise<void> {
  console.log('📦 Exporting captured data as test fixtures...')

  // Stream the captured data
  const tracesStream = replayService.replayDataStream(sessionId, 'traces')
  // TODO: Implement metrics and logs stream export when needed
  // const metricsStream = replayService.replayDataStream(sessionId, 'metrics')
  // const logsStream = replayService.replayDataStream(sessionId, 'logs')

  // Save to fixture files
  const fs = await import('fs/promises')
  const path = await import('path')

  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true })

  // Export traces
  let traceCount = 0
  await tracesStream.pipeTo(async (chunk: Uint8Array) => {
    const filename = path.join(outputDir, `traces-${traceCount++}.otlp.gz`)
    await fs.writeFile(filename, chunk)
    console.log(`  📝 Wrote ${filename}`)
  })

  console.log(`✅ Exported ${traceCount} trace fixtures`)

  // Create a manifest file
  const manifest = {
    sessionId,
    capturedAt: new Date().toISOString(),
    fixtures: {
      traces: traceCount,
      outputDir
    }
  }

  await fs.writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

  console.log('✅ Export complete!')
}

// Load fixtures for testing
export async function loadTestFixtures(fixtureDir: string = './test/fixtures/captured') {
  const fs = await import('fs/promises')
  const path = await import('path')

  const manifestPath = path.join(fixtureDir, 'manifest.json')
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'))

  const fixtures = []

  // Load trace fixtures
  for (let i = 0; i < manifest.fixtures.traces; i++) {
    const fixturePath = path.join(fixtureDir, `traces-${i}.otlp.gz`)
    const data = await fs.readFile(fixturePath)
    fixtures.push({
      type: 'traces',
      index: i,
      data
    })
  }

  return {
    manifest,
    fixtures
  }
}
