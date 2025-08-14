/**
 * Main entry point for the AI-native observability platform
 */

import { SimpleStorage, type SimpleStorageConfig } from './storage/simple-storage.js'

// Simple main application for validation
const main = async () => {
  console.log('🚀 AI-native Observability Platform Starting...')

  // Initialize simple storage
  const config: SimpleStorageConfig = {
    clickhouse: {
      host: process.env.CLICKHOUSE_HOST || 'localhost',
      port: parseInt(process.env.CLICKHOUSE_PORT || '8123'),
      database: process.env.CLICKHOUSE_DATABASE || 'otel',
      username: process.env.CLICKHOUSE_USERNAME || 'otel',
      password: process.env.CLICKHOUSE_PASSWORD || 'otel123'
    }
  }

  const storage = new SimpleStorage(config)

  try {
    // Perform health check
    const isHealthy = await storage.healthCheck()
    console.log(`Health Check: ClickHouse=${isHealthy}`)

    if (isHealthy) {
      // Test data ingestion
      const testData = {
        traces: [
          {
            traceId: 'test-trace-123',
            spanId: 'test-span-123',
            operationName: 'test-operation',
            startTime: Date.now() * 1000000, // nanoseconds
            serviceName: 'test-service',
            statusCode: 1,
            attributes: { 'test.key': 'test.value' }
          }
        ],
        timestamp: Date.now()
      }

      await storage.writeOTLP(testData)
      console.log('✅ Test data written successfully')

      // Test querying
      const traces = await storage.queryTraces({
        start: Date.now() - 3600000, // Last hour
        end: Date.now()
      })

      console.log(`📊 Found ${traces.length} traces`)
    }

    console.log('✅ Platform ready for telemetry ingestion')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  } finally {
    await storage.close()
  }
}

// Execute if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}

export { main }
