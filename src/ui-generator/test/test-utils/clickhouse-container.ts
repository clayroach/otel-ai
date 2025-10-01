/**
 * Shared utilities for ClickHouse test container management
 * Used by both sql-evaluator-optimizer and sql-evaluator-multi-model tests
 */

import { createClient, type ClickHouseClient } from '@clickhouse/client'
import { Effect } from 'effect'
import { readFileSync } from 'fs'
import { join } from 'path'
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers'
import type { ClickHouseClient as EvaluatorClient } from '../../query-generator/sql-evaluator-optimizer.js'

/**
 * Interface for ClickHouse test container with client
 */
export interface ClickHouseTestContainer {
  container: StartedTestContainer
  client: ClickHouseClient
  evaluatorClient: EvaluatorClient
}

/**
 * Get the ClickHouse version from docker-compose.yaml
 * This ensures tests use the same version as production
 */
export function getClickHouseVersion(): string {
  try {
    const dockerComposePath = join(process.cwd(), 'docker-compose.yaml')
    const dockerComposeContent = readFileSync(dockerComposePath, 'utf-8')

    // Extract version from image: clickhouse/clickhouse-server:XX.X
    const versionMatch = dockerComposeContent.match(/clickhouse\/clickhouse-server:(\d+\.\d+)/i)
    if (versionMatch && versionMatch[1]) {
      return versionMatch[1]
    }
  } catch (error) {
    console.warn(
      'Could not extract ClickHouse version from docker-compose.yaml, using default',
      error
    )
  }

  // Default fallback version
  return '25.7'
}

/**
 * Start a ClickHouse test container with the production version
 */
export async function startClickHouseContainer(): Promise<ClickHouseTestContainer> {
  const clickhouseVersion = getClickHouseVersion()
  console.log(`🚀 Starting ClickHouse test container (version ${clickhouseVersion})...`)

  try {
    // Start ClickHouse container matching docker-compose version
    const container = await new GenericContainer(
      `clickhouse/clickhouse-server:${clickhouseVersion}`
    )
      .withExposedPorts(8123, 9000)
      .withEnvironment({
        CLICKHOUSE_DB: 'otel',
        CLICKHOUSE_USER: 'otel',
        CLICKHOUSE_PASSWORD: 'otel123',
        CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT: '1',
        CLICKHOUSE_MAX_MEMORY_USAGE: '2000000000',
        CLICKHOUSE_MAX_MEMORY_USAGE_FOR_USER: '3000000000'
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

    // Wait for ClickHouse to be fully ready
    await new Promise((resolve) => setTimeout(resolve, 5000))

    // Create ClickHouse client
    const client = createClient({
      url: `http://${host}:${port}`,
      username: 'otel',
      password: 'otel123',
      database: 'default', // Start with default, create otel later
      request_timeout: 30000
    })

    // Test the connection
    await client.ping()
    console.log('✅ ClickHouse connection verified')

    // Create Effect-based wrapper for evaluator
    const evaluatorClient: EvaluatorClient = {
      queryRaw: (sql: string) =>
        Effect.tryPromise({
          try: async () => {
            const result = await client.query({
              query: sql,
              format: 'JSONEachRow'
            })
            const data = await result.json()
            return Array.isArray(data) ? data : []
          },
          catch: (error) => new Error(String(error))
        }),
      queryText: (sql: string) =>
        Effect.tryPromise({
          try: async () => {
            const result = await client.query({
              query: sql,
              format: 'TabSeparated'
            })
            return await result.text()
          },
          catch: (error) => new Error(String(error))
        })
    }

    return { container, client, evaluatorClient }
  } catch (error) {
    console.error('❌ Failed to start ClickHouse container:', error)
    throw error
  }
}

/**
 * Set up ClickHouse schema from migration file
 */
export async function setupClickHouseSchema(client: ClickHouseClient): Promise<void> {
  console.log('📊 Setting up ClickHouse schema from migration file...')

  // Create database
  await client.command({
    query: 'CREATE DATABASE IF NOT EXISTS otel'
  })

  // Switch to otel database
  await client.command({
    query: 'USE otel'
  })

  // Read and execute the migration file
  const migrationPath = join(
    process.cwd(),
    'migrations/clickhouse/20250819000000_initial_schema.sql'
  )
  const migration = readFileSync(migrationPath, 'utf8')

  // Split by CREATE TABLE statements, preserving the full statement
  const statements = migration
    .split(/(?=CREATE TABLE)/gi)
    .filter((stmt) => stmt.trim().length > 0)
    .map((stmt) => {
      // Remove comment lines but keep the SQL
      return stmt
        .split('\n')
        .filter((line) => !line.trim().startsWith('--') || line.trim() === '')
        .join('\n')
        .trim()
    })
    .filter((stmt) => stmt.startsWith('CREATE TABLE'))

  console.log(`📜 Found ${statements.length} CREATE TABLE statements in migration file`)

  for (const statement of statements) {
    try {
      // Ensure we're using the otel database prefix
      const statementWithDb = statement.replace(
        /CREATE TABLE IF NOT EXISTS (\w+)/i,
        'CREATE TABLE IF NOT EXISTS otel.$1'
      )

      await client.command({ query: statementWithDb })

      // Extract table name for logging
      const tableMatch = statement.match(/CREATE TABLE IF NOT EXISTS (\S+)/i)
      const tableName = tableMatch ? tableMatch[1] : 'unknown'
      console.log(`  ✅ Created table: ${tableName}`)
    } catch (error) {
      console.error(`  ❌ Failed to create table:`, error)
      throw error
    }
  }

  console.log('✅ Schema created successfully from migration file')

  // Create validation tables with Null engine for semantic validation
  console.log('📊 Creating validation tables with Null engine...')
  const schemaInfo = getSchemaInfo()

  for (const tableName of schemaInfo.tables) {
    try {
      const validationTableQuery = `
        CREATE TABLE IF NOT EXISTS otel.${tableName}_validation
        AS otel.${tableName}
        ENGINE = Null
      `
      await client.command({ query: validationTableQuery })
      console.log(`  ✅ Created validation table: ${tableName}_validation`)
    } catch (error) {
      console.error(`  ❌ Failed to create validation table ${tableName}_validation:`, error)
      throw error
    }
  }

  console.log('✅ Validation tables created successfully')
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
 * Get schema information for test validation
 */
export function getSchemaInfo() {
  // Simple inline schema info since we know what tables we create
  return {
    tables: ['traces', 'ai_anomalies', 'ai_service_baselines'],
    columns: {
      traces: [
        'trace_id',
        'span_id',
        'parent_span_id',
        'start_time',
        'end_time',
        'duration_ns',
        'service_name',
        'operation_name',
        'status_code'
      ],
      ai_anomalies: [
        'timestamp',
        'service_name',
        'metric_type',
        'metric_value',
        'baseline_value',
        'anomaly_score',
        'is_anomaly',
        'detection_method'
      ],
      ai_service_baselines: [
        'service_name',
        'metric_type',
        'baseline_value',
        'threshold_lower',
        'threshold_upper',
        'last_updated',
        'sample_count'
      ]
    }
  }
}
