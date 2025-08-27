/**
 * Test setup and configuration
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// Global test setup
console.log('🧪 Test environment setup')

// Load .env file if it exists
const envPath = join(process.cwd(), '.env')
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8')
  envContent.split('\n').forEach((line) => {
    const [key, ...values] = line.split('=')
    if (key && values.length > 0 && !process.env[key]) {
      process.env[key] = values.join('=').trim()
    }
  })
  console.log('📄 Loaded .env file for tests')
}

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
