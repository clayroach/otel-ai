/**
 * ClickHouse test container utilities for annotations tests
 */

import { createClient, type ClickHouseClient } from '@clickhouse/client'
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Interface for ClickHouse test container with client
 */
export interface ClickHouseTestContainer {
  container: StartedTestContainer
  client: ClickHouseClient
}

/**
 * Get the ClickHouse version from docker-compose.yaml
 */
function getClickHouseVersion(): string {
  try {
    const dockerComposePath = join(process.cwd(), 'docker-compose.yaml')
    const dockerComposeContent = readFileSync(dockerComposePath, 'utf-8')

    const versionMatch = dockerComposeContent.match(/clickhouse\/clickhouse-server:(\d+\.\d+)/i)
    if (versionMatch && versionMatch[1]) {
      return versionMatch[1]
    }
  } catch (error) {
    console.warn('Could not extract ClickHouse version from docker-compose.yaml, using default')
  }

  return '25.7'
}

/**
 * Start a ClickHouse test container
 */
export async function startClickHouseContainer(): Promise<ClickHouseTestContainer> {
  const clickhouseVersion = getClickHouseVersion()
  console.log(`🚀 Starting ClickHouse test container (version ${clickhouseVersion})...`)

  try {
    const container = await new GenericContainer(
      `clickhouse/clickhouse-server:${clickhouseVersion}`
    )
      .withExposedPorts(8123, 9000)
      .withEnvironment({
        CLICKHOUSE_DB: 'otel',
        CLICKHOUSE_USER: 'otel',
        CLICKHOUSE_PASSWORD: 'otel123',
        CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT: '1'
      })
      .withStartupTimeout(120000)
      .withWaitStrategy(Wait.forAll([Wait.forListeningPorts(), Wait.forHealthCheck()]))
      .withHealthCheck({
        test: [
          'CMD',
          'clickhouse-client',
          '--user',
          'otel',
          '--password',
          'otel123',
          '--query',
          'SELECT 1'
        ],
        interval: 5000,
        timeout: 3000,
        retries: 20,
        startPeriod: 10000
      })
      .start()

    const port = container.getMappedPort(8123)
    const host = container.getHost()

    console.log(`✅ ClickHouse container started on ${host}:${port}`)

    // Wait for ClickHouse to be ready
    await new Promise((resolve) => setTimeout(resolve, 3000))

    // Create ClickHouse client
    const client = createClient({
      url: `http://${host}:${port}`,
      username: 'otel',
      password: 'otel123',
      database: 'default',
      request_timeout: 30000
    })

    // Test the connection
    await client.ping()
    console.log('✅ ClickHouse connection verified')

    return { container, client }
  } catch (error) {
    console.error('❌ Failed to start ClickHouse container:', error)
    throw error
  }
}

/**
 * Set up annotations table schema
 */
export async function setupAnnotationsSchema(client: ClickHouseClient): Promise<void> {
  console.log('📊 Setting up annotations table schema...')

  // Create database
  await client.command({
    query: 'CREATE DATABASE IF NOT EXISTS otel'
  })

  // Switch to otel database
  await client.command({
    query: 'USE otel'
  })

  // Read the annotations migration file
  const migrationPath = join(
    process.cwd(),
    'migrations/clickhouse/20250924000001_create_annotations_table.sql'
  )
  const migration = readFileSync(migrationPath, 'utf8')

  // Extract just the CREATE TABLE statement (up to the first semicolon)
  const createTableMatch = migration.match(/CREATE TABLE[^;]+;/s)
  if (!createTableMatch) {
    throw new Error('Could not find CREATE TABLE statement in migration file')
  }

  // Execute the CREATE TABLE statement with otel database prefix
  try {
    const tableQuery = createTableMatch[0].replace(
      'CREATE TABLE IF NOT EXISTS annotations',
      'CREATE TABLE IF NOT EXISTS otel.annotations'
    )
    await client.command({ query: tableQuery })
    console.log('✅ Annotations table created successfully')
  } catch (error) {
    console.error('❌ Failed to create annotations table:', error)
    throw error
  }

  // Create convenient views
  const views = [
    `CREATE VIEW IF NOT EXISTS otel.trace_annotations AS
     SELECT * FROM otel.annotations WHERE signal_type = 'trace'`,

    `CREATE VIEW IF NOT EXISTS otel.metric_annotations AS
     SELECT * FROM otel.annotations WHERE signal_type = 'metric'`,

    `CREATE VIEW IF NOT EXISTS otel.log_annotations AS
     SELECT * FROM otel.annotations WHERE signal_type = 'log'`
  ]

  for (const viewQuery of views) {
    await client.command({ query: viewQuery })
  }

  console.log('✅ Views created successfully')
}

/**
 * Clean up ClickHouse test container
 */
export async function cleanupClickHouseContainer(
  testContainer: ClickHouseTestContainer
): Promise<void> {
  console.log('🧹 Cleaning up test container...')
  if (testContainer.client) {
    await testContainer.client.close()
  }
  if (testContainer.container) {
    await testContainer.container.stop()
  }
}

/**
 * Clear test data from annotations table
 */
export async function clearTestData(client: ClickHouseClient): Promise<void> {
  await client.command({
    query: `DELETE FROM otel.annotations WHERE created_by LIKE 'test-%'`
  })
}
