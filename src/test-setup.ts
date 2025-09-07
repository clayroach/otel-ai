/**
 * Test setup and configuration
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// Load .env file if it exists
// Check multiple possible locations for .env file (CI fix)
const possibleEnvPaths = [
  join(process.cwd(), '.env'),           // Current working directory
  join(process.cwd(), '..', '.env'),     // Parent directory (CI fix)
  join(process.cwd(), '../..', '.env'),  // Grandparent directory
]

let envPath: string | null = null
for (const path of possibleEnvPaths) {
  if (existsSync(path)) {
    envPath = path
    break
  }
}

if (envPath) {
  const envContent = readFileSync(envPath, 'utf-8')
  
  // Show configured LLM models for debugging
  const llmModelLines = envContent
    .split('\n')
    .filter((line) => line.startsWith('LLM_') && line.includes('MODEL'))
  
  if (llmModelLines.length > 0) {
    console.log('📋 LLM models configured:', llmModelLines.map(line => {
      const [key, value] = line.split('=')
      return `${key}=${value}`
    }))
  }
  
  envContent.split('\n').forEach((line) => {
    const [key, ...values] = line.split('=')
    if (key && values.length > 0 && !process.env[key]) {
      process.env[key] = values.join('=').trim()
    }
  })
}

// Set test environment variables if not already set
if (!process.env.CLICKHOUSE_HOST) {
  process.env.CLICKHOUSE_HOST = 'localhost'
}
if (!process.env.CLICKHOUSE_PORT) {
  process.env.CLICKHOUSE_PORT = '8124'
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

