#!/usr/bin/env node
/**
 * Process Portkey config to substitute environment variables
 * This script is run before starting Portkey to create a processed config
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

// Load environment variables from .env file
dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Read the template config
// When running in Docker, config is at /config/config.json
// When running locally, it's at ../config/portkey/config.json
const configPath = fs.existsSync('/config/config.json')
  ? '/config/config.json'
  : path.join(__dirname, '../config/portkey/config.json')
const configContent = fs.readFileSync(configPath, 'utf8')

// Replace __VARIABLE__ placeholders with environment variable values
const processedConfig = configContent.replace(/__([A-Z_]+)__/g, (match, varName) => {
  let value = process.env[varName]

  // Handle special cases with defaults
  if (!value) {
    if (varName === 'LM_STUDIO_ENDPOINT') {
      value = 'http://host.docker.internal:1234/v1'
    } else if (varName === 'OLLAMA_ENDPOINT') {
      value = 'http://host.docker.internal:11434'
    } else {
      // Keep the placeholder if no value found (for debugging)
      value = match
    }
  }

  // Mask sensitive values in logs
  const logValue =
    varName.includes('API_KEY') && value !== match ? `${value.substring(0, 10)}...` : value
  console.log(`[Config Processing] ${varName} = ${logValue}`)

  return value
})

// Parse to validate JSON
try {
  JSON.parse(processedConfig)
  console.log('[Config Processing] Configuration is valid JSON')
} catch (error) {
  console.error('[Config Processing] Invalid JSON after processing:', error.message)
  process.exit(1)
}

// Write the processed config to target directory
const targetDir = path.join(__dirname, '../target/config/portkey')

// Create target directory if it doesn't exist
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true })
  console.log(`[Config Processing] Created target directory: ${targetDir}`)
}

const outputPath = process.env.PORTKEY_CONFIG_OUTPUT || path.join(targetDir, 'config.json')

fs.writeFileSync(outputPath, processedConfig)
console.log(`[Config Processing] Processed config written to ${outputPath}`)
