#!/usr/bin/env tsx

/**
 * OpenTelemetry Demo Setup Script
 *
 * This script implements a "Bring Your Own Backend" approach for integrating
 * the official OpenTelemetry demo with our AI-native observability platform.
 *
 * It clones the latest OTel demo source and applies our custom configuration
 * to redirect telemetry to our otel-ai-collector instead of the demo's built-in collector.
 *
 * Based on: https://opentelemetry.io/docs/demo/docker-deployment/#bring-your-own-backend
 */

import { execSync, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import chalk from 'chalk'

const DEMO_DIR = 'demo/otel-demo-app'
const DEMO_REPO = 'https://github.com/open-telemetry/opentelemetry-demo.git'
const DEMO_BRANCH = 'main' // Use latest from main branch

interface DemoConfig {
  demoDir: string
  envOverrides: Record<string, string>
  composeOverride: string
}

class DemoSetup {
  private config: DemoConfig

  constructor() {
    this.config = {
      demoDir: DEMO_DIR,
      envOverrides: {
        // Point to our collector instead of demo's collector
        OTEL_COLLECTOR_HOST: 'otel-ai-collector',
        OTEL_COLLECTOR_PORT_GRPC: '4317',
        OTEL_COLLECTOR_PORT_HTTP: '4318',

        // Use external network to connect to our platform
        NETWORK_NAME: 'otel-ai-network',

        // Reduce resource usage for development
        LOCUST_USERS: '5',

        // Disable components we don't need
        DISABLE_TRACETEST: 'true'
      },
      composeOverride: this.generateComposeOverride()
    }
  }

  private generateComposeOverride(): string {
    return `# Docker Compose Override for otel-ai integration
# This file modifies the original demo to use our external backend

# Use external network to connect to our platform
networks:
  default:
    name: otel-ai-network
    external: true

services:
  # Replace the demo's built-in collector with a minimal dummy service
  otel-collector:
    image: alpine:latest
    command: ["sh", "-c", "echo 'Dummy collector - telemetry goes to otel-ai-collector' && sleep infinity"]
    restart: unless-stopped
  
  # Replace heavy telemetry components with minimal dummy services
  jaeger:
    image: alpine:latest
    command: ["sh", "-c", "echo 'Dummy jaeger service' && sleep infinity"]
    restart: unless-stopped
  
  grafana:
    image: alpine:latest
    command: ["sh", "-c", "echo 'Dummy grafana service' && sleep infinity"] 
    restart: unless-stopped
    
  prometheus:
    image: alpine:latest
    command: ["sh", "-c", "echo 'Dummy prometheus service' && sleep infinity"]
    restart: unless-stopped
    
  opensearch:
    image: alpine:latest
    command: ["sh", "-c", "echo 'Dummy opensearch service' && sleep infinity"]
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "echo", "healthy"]
      interval: 5s
      timeout: 3s
      retries: 3

  # Fix load-generator port mapping - ensure it's available on localhost:8089
  load-generator:
    ports:
      - "8089:8089"

  # Fix shipping service health check - distroless containers don't have shell utilities  
  # Use a simple approach: disable the problematic shell-based health check
  shipping:
    healthcheck:
      disable: true
`
  }

  private log(message: string, type: 'info' | 'success' | 'error' | 'warn' = 'info'): void {
    const colors = {
      info: chalk.blue,
      success: chalk.green,
      error: chalk.red,
      warn: chalk.yellow
    }
    console.log(colors[type](`[demo] ${message}`))
  }

  private execCommand(command: string, cwd?: string): string {
    try {
      return execSync(command, {
        cwd,
        encoding: 'utf8',
        stdio: 'pipe'
      })
        .toString()
        .trim()
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(`Command failed: ${command}\n${errorMessage}`)
    }
  }

  private execCommandWithOutput(command: string, cwd?: string): void {
    try {
      execSync(command, {
        cwd,
        stdio: 'inherit'
      })
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(`Command failed: ${command}\n${errorMessage}`)
    }
  }

  async clone(): Promise<void> {
    this.log('Cloning OpenTelemetry Demo repository...')

    if (fs.existsSync(this.config.demoDir)) {
      this.log('Demo directory exists, pulling latest changes...')
      this.execCommandWithOutput(`git pull origin ${DEMO_BRANCH}`, this.config.demoDir)
    } else {
      this.execCommandWithOutput(
        `git clone --depth 1 --branch ${DEMO_BRANCH} ${DEMO_REPO} ${this.config.demoDir}`
      )
    }

    this.log(`Demo cloned successfully to ${this.config.demoDir}`, 'success')
  }

  async setup(): Promise<void> {
    if (!fs.existsSync(this.config.demoDir)) {
      this.log('Demo not found, cloning first...')
      await this.clone()
    }

    this.log('Setting up demo configuration for otel-ai integration...')

    // Create .env.override file with our custom configuration
    const envOverridePath = path.join(this.config.demoDir, '.env.override')
    const envContent =
      Object.entries(this.config.envOverrides)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n') + '\n'

    fs.writeFileSync(envOverridePath, envContent)
    this.log('Created .env.override with our configuration')

    // Create docker-compose.override.yml
    const composeOverridePath = path.join(this.config.demoDir, 'docker-compose.override.yml')
    fs.writeFileSync(composeOverridePath, this.config.composeOverride)
    this.log('Created docker-compose.override.yml')

    // Create a script to ensure our platform is running
    const setupScriptPath = path.join(this.config.demoDir, 'setup-otel-ai.sh')
    const setupScript = `#!/bin/bash
# Ensure otel-ai platform is running before starting demo

echo "Checking otel-ai platform status..."
if ! docker network ls | grep -q "otel-ai-network"; then
  echo "ERROR: otel-ai-network not found. Please run 'pnpm dev:up' in the main project first."
  exit 1
fi

if ! docker ps | grep -q "otel-ai-collector"; then
  echo "ERROR: otel-ai-collector not running. Please run 'pnpm dev:up' in the main project first."
  exit 1
fi

echo "✅ otel-ai platform is ready"
echo "Starting OpenTelemetry Demo with otel-ai backend..."
`

    fs.writeFileSync(setupScriptPath, setupScript)
    this.execCommand(`chmod +x ${setupScriptPath}`)
    this.log('Created setup script')

    this.log('Demo setup completed successfully!', 'success')
    this.log('')
    this.log('Next steps:', 'info')
    this.log('1. Ensure your otel-ai platform is running: pnpm dev:up')
    this.log('2. Start the demo: pnpm demo:up')
    this.log('3. Visit the demo at http://localhost:8080')
    this.log('4. Check telemetry in your platform at http://localhost:5173')
  }

  async up(): Promise<void> {
    if (!fs.existsSync(this.config.demoDir)) {
      this.log('Demo not found, setting up first...')
      await this.setup()
    }

    this.log('Starting OpenTelemetry Demo with otel-ai backend...')

    // Check if our platform is running
    try {
      this.execCommand('docker network ls | grep otel-ai-network')
      this.execCommand('docker ps | grep otel-ai-collector')
    } catch (error) {
      this.log('otel-ai platform not running. Please run: pnpm dev:up', 'error')
      process.exit(1)
    }

    // Start the demo with override files
    this.execCommandWithOutput(
      'docker compose --env-file .env --env-file .env.override up -d',
      this.config.demoDir
    )

    this.log('Demo started successfully!', 'success')
    this.log('')
    this.log('🌐 Demo Frontend: http://localhost:8080')
    this.log('🎯 Load Generator: http://localhost:8089')
    this.log('📊 Your Platform: http://localhost:5173')
    this.log('')
    this.log('Run "pnpm demo:logs" to see container logs')
  }

  async down(): Promise<void> {
    if (!fs.existsSync(this.config.demoDir)) {
      this.log('Demo not found', 'warn')
      return
    }

    this.log('Stopping OpenTelemetry Demo...')
    this.execCommandWithOutput('docker compose down', this.config.demoDir)
    this.log('Demo stopped', 'success')
  }

  async logs(): Promise<void> {
    if (!fs.existsSync(this.config.demoDir)) {
      this.log('Demo not found', 'error')
      return
    }

    this.log('Showing demo logs (Ctrl+C to exit)...')
    const child = spawn('docker', ['compose', 'logs', '-f'], {
      cwd: this.config.demoDir,
      stdio: 'inherit'
    })

    process.on('SIGINT', () => {
      child.kill()
      process.exit(0)
    })
  }

  async clean(): Promise<void> {
    if (!fs.existsSync(this.config.demoDir)) {
      this.log('Demo not found', 'warn')
      return
    }

    this.log('Cleaning up demo containers and volumes...')
    this.execCommandWithOutput('docker compose down -v', this.config.demoDir)
    this.log('Demo cleaned up', 'success')
  }

  async status(): Promise<void> {
    if (!fs.existsSync(this.config.demoDir)) {
      this.log('Demo not cloned yet. Run: pnpm demo:clone', 'warn')
      return
    }

    this.log('Demo Status:')
    this.log('')

    try {
      const output = this.execCommand('docker compose ps', this.config.demoDir)
      console.log(output)
    } catch (error) {
      this.log('Failed to get demo status', 'error')
    }
  }
}

// Main execution
async function main() {
  const command = process.argv[2]
  const demo = new DemoSetup()

  try {
    switch (command) {
      case 'clone':
        await demo.clone()
        break
      case 'setup':
        await demo.setup()
        break
      case 'up':
        await demo.up()
        break
      case 'down':
        await demo.down()
        break
      case 'logs':
        await demo.logs()
        break
      case 'clean':
        await demo.clean()
        break
      case 'status':
        await demo.status()
        break
      default:
        console.log(chalk.yellow('Usage: pnpm demo:<command>'))
        console.log('')
        console.log('Available commands:')
        console.log('  clone  - Clone the OpenTelemetry demo repository')
        console.log('  setup  - Set up demo configuration for otel-ai integration')
        console.log('  up     - Start the demo with otel-ai backend')
        console.log('  down   - Stop the demo')
        console.log('  logs   - Show demo container logs')
        console.log('  clean  - Clean up demo containers and volumes')
        console.log('  status - Show current demo status')
        process.exit(1)
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(chalk.red(`Error: ${errorMessage}`))
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
