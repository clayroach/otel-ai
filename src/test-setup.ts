/**
 * Test setup and configuration
 */

// Global test setup
console.log('🧪 Test environment setup')

// Set test environment variables if not already set
if (!process.env.CLICKHOUSE_HOST) {
  process.env.CLICKHOUSE_HOST = 'localhost'
}
if (!process.env.CLICKHOUSE_PORT) {
  process.env.CLICKHOUSE_PORT = '8123'
}
if (!process.env.CLICKHOUSE_DATABASE) {
  process.env.CLICKHOUSE_DATABASE = 'otel'
}
if (!process.env.CLICKHOUSE_USERNAME) {
  process.env.CLICKHOUSE_USERNAME = 'otel'
}
if (!process.env.CLICKHOUSE_PASSWORD) {
  process.env.CLICKHOUSE_PASSWORD = 'otel123'
}

// Global test setup complete
console.log('✅ Test setup complete')
