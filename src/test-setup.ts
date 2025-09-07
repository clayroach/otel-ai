/**
 * Test setup and configuration
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// Global test setup
console.log('🧪 Test environment setup')

// Load .env file if it exists
// Check multiple possible locations for .env file
const possibleEnvPaths = [
  join(process.cwd(), '.env'), // Current working directory
  join(process.cwd(), '..', '.env'), // Parent directory (likely fix for CI)
  join(process.cwd(), '../..', '.env') // Grandparent directory (just in case)
]

let envPath: string | null = null
let envContent = ''

// Find the first existing .env file
for (const path of possibleEnvPaths) {
  if (existsSync(path)) {
    envPath = path
    envContent = readFileSync(path, 'utf-8')
    console.log(`✅ Found .env file at: ${path}`)
    break
  } else {
    console.log(`❌ No .env file at: ${path}`)
  }
}

if (envPath && envContent) {
  // Debug: Show what's in the .env file for CI troubleshooting
  const llmModelLines = envContent
    .split('\n')
    .filter((line) => line.startsWith('LLM_') && line.includes('MODEL'))
  if (llmModelLines.length > 0) {
    console.log('🔍 LLM Model env vars found in .env file:', llmModelLines)
  } else {
    console.log('⚠️ No LLM model env vars found in .env file')
    // Show first 10 lines of .env for debugging
    console.log('📄 .env file preview:', envContent.split('\n').slice(0, 10))
  }

  envContent.split('\n').forEach((line) => {
    const [key, ...values] = line.split('=')
    if (key && values.length > 0 && !process.env[key]) {
      process.env[key] = values.join('=').trim()
    }
  })
  console.log('📄 Loaded .env file for tests')

  // Debug: Verify the LLM model env vars were actually loaded into process.env
  const loadedLLMVars = Object.keys(process.env).filter(
    (key) => key.startsWith('LLM_') && key.includes('MODEL')
  )
  if (loadedLLMVars.length > 0) {
    console.log('✅ LLM Model env vars loaded into process.env:', loadedLLMVars)
  } else {
    console.log('❌ No LLM model env vars found in process.env after loading .env')
  }
} else {
  console.log('❌ No .env file found in any of the checked locations:')
  possibleEnvPaths.forEach((path) => console.log(`   - ${path}`))
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

// Global test setup complete
console.log('✅ Test setup complete')
