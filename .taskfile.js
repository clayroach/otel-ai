#!/usr/bin/env node
/**
 * Modern task runner for the AI-native observability platform
 * Run with: node .taskfile.js <command>
 * Or add alias: alias task='node .taskfile.js'
 */

import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import chalk from 'chalk'

const tasks = {
  // Main development workflow
  async setup() {
    console.log(chalk.blue('🚀 Setting up development environment...'))
    await runCommand('pnpm', ['install'])
    await runCommand('docker-compose', ['up', '-d'])
    console.log(chalk.green('✅ Setup complete! Run "pnpm dev" to start development'))
  },

  async dev() {
    console.log(chalk.blue('👨‍💻 Starting development mode...'))
    await Promise.all([
      runCommand('docker-compose', ['up', '-d']),
      runCommand('tsx', ['--watch', 'src/index.ts'])
    ])
  },

  async build() {
    console.log(chalk.blue('🔨 Building project...'))
    await runCommand('tsc')
    console.log(chalk.green('✅ Build complete!'))
  },

  async test() {
    console.log(chalk.blue('🧪 Running tests...'))
    await runCommand('vitest')
  },

  async clean() {
    console.log(chalk.blue('🧹 Cleaning build artifacts...'))
    await fs.rm('dist', { recursive: true, force: true })
    await fs.rm('node_modules', { recursive: true, force: true })
    console.log(chalk.green('✅ Cleaned!'))
  },

  // Infrastructure management
  async infraUp() {
    console.log(chalk.blue('🐳 Starting infrastructure...'))
    await runCommand('docker-compose', ['up', '-d'])
  },

  async infraDown() {
    console.log(chalk.blue('🛑 Stopping infrastructure...'))
    await runCommand('docker-compose', ['down'])
  },

  async infraReset() {
    console.log(chalk.blue('🔄 Resetting infrastructure...'))
    await runCommand('docker-compose', ['down', '-v'])
    await runCommand('docker-compose', ['up', '-d'])
  },

  async infraLogs() {
    await runCommand('docker-compose', ['logs', '-f'])
  },

  // Development container
  async devContainer() {
    console.log(chalk.blue('🐳 Starting development container...'))
    await runCommand('docker', [
      'build',
      '-t',
      'otel-ai:dev',
      '--target',
      'development',
      '-f',
      'Dockerfile.dev',
      '.'
    ])
    await runCommand('docker-compose', ['-f', 'docker-compose.dev.yaml', 'run', '--rm', 'dev'])
  },

  // Code quality
  async lint() {
    console.log(chalk.blue('🔍 Linting code...'))
    await runCommand('eslint', ['.', '--ext', '.ts,.tsx', '--max-warnings', '0'])
  },

  async format() {
    console.log(chalk.blue('💅 Formatting code...'))
    await runCommand('prettier', ['--write', '.'])
  },

  async typecheck() {
    console.log(chalk.blue('📝 Type checking...'))
    await runCommand('tsc', ['--noEmit'])
  },

  // CI workflow
  async ci() {
    console.log(chalk.blue('🤖 Running CI checks...'))
    await tasks.format()
    await tasks.lint()
    await tasks.typecheck()
    await tasks.test()
    console.log(chalk.green('✅ All CI checks passed!'))
  },

  // Help
  help() {
    console.log(
      chalk.cyan(`
📦 AI-Native Observability Platform - Task Runner

Available commands:
  ${chalk.yellow('setup')}         - Initial setup (install deps + start infrastructure)
  ${chalk.yellow('dev')}           - Start development mode
  ${chalk.yellow('build')}         - Build the project
  ${chalk.yellow('test')}          - Run tests
  ${chalk.yellow('clean')}         - Clean build artifacts
  
  ${chalk.gray('Infrastructure:')}
  ${chalk.yellow('infraUp')}       - Start infrastructure services
  ${chalk.yellow('infraDown')}     - Stop infrastructure services
  ${chalk.yellow('infraReset')}    - Reset infrastructure (clean volumes)
  ${chalk.yellow('infraLogs')}     - View infrastructure logs
  
  ${chalk.gray('Code Quality:')}
  ${chalk.yellow('lint')}          - Lint code
  ${chalk.yellow('format')}        - Format code
  ${chalk.yellow('typecheck')}     - Type check
  ${chalk.yellow('ci')}            - Run all CI checks
  
  ${chalk.gray('Development:')}
  ${chalk.yellow('devContainer')} - Run development container

Usage: node .taskfile.js <command>
Or add alias: alias task='node .taskfile.js'
    `)
    )
  }
}

// Helper function to run commands
function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32'
    })
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Command failed: ${command} ${args.join(' ')}`))
      } else {
        resolve()
      }
    })
  })
}

// Main execution
const taskName = process.argv[2] || 'help'
const task = tasks[taskName]

if (!task) {
  console.log(chalk.red(`❌ Unknown task: ${taskName}`))
  tasks.help()
  process.exit(1)
}

// Run the task
Promise.resolve(task()).catch((error) => {
  console.error(chalk.red(`❌ Task failed: ${error.message}`))
  process.exit(1)
})
