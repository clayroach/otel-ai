#!/usr/bin/env node

// Infrastructure validation script
// Tests Docker Compose services and basic connectivity

const { exec } = require('child_process')
const { promisify } = require('util')

const execAsync = promisify(exec)

async function checkService(name, healthCommand, description) {
  console.log(`🔍 Checking ${description}...`)
  try {
    const { stdout, stderr } = await execAsync(healthCommand)
    console.log(`✅ ${name}: ${description} is healthy`)
    return true
  } catch (error) {
    console.log(`❌ ${name}: ${description} is NOT healthy`)
    console.log(`   Error: ${error.message}`)
    return false
  }
}

async function validateInfrastructure() {
  console.log('🏗️ Validating Docker Compose Infrastructure')
  console.log('===========================================\n')

  const services = [
    {
      name: 'ClickHouse',
      command: 'curl -s -u otel:otel123 "http://localhost:8123/?query=SELECT%201"',
      description: 'ClickHouse database connectivity'
    },
    {
      name: 'MinIO',
      command: 'curl -s -f http://localhost:9010/minio/health/live',
      description: 'MinIO object storage'
    },
    {
      name: 'OTel Collector',
      command: 'curl -s -f http://localhost:13133/health',
      description: 'OpenTelemetry Collector health'
    },
    {
      name: 'OTLP HTTP',
      command: 'curl -s -f http://localhost:4318/',
      description: 'OTLP HTTP receiver endpoint'
    }
  ]

  const results = []
  for (const service of services) {
    const healthy = await checkService(service.name, service.command, service.description)
    results.push({ ...service, healthy })
    console.log('') // Add spacing
  }

  const allHealthy = results.every((r) => r.healthy)

  console.log('📊 Infrastructure Validation Summary')
  console.log('===================================')

  results.forEach((result) => {
    const status = result.healthy ? '✅ PASS' : '❌ FAIL'
    console.log(`${status} ${result.name}: ${result.description}`)
  })

  console.log('')
  if (allHealthy) {
    console.log('🎉 All infrastructure services are healthy and ready!')
    console.log('✅ Ready for end-to-end telemetry testing')
    process.exit(0)
  } else {
    console.log('⚠️  Some services are not healthy - check Docker Compose setup')
    console.log('💡 Try: docker compose up -d && docker compose ps')
    process.exit(1)
  }
}

validateInfrastructure()
