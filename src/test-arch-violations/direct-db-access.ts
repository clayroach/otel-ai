/**
 * TEST FILE: Architectural Violation Test
 *
 * This file intentionally violates architectural boundaries to test:
 * 1. Claude Code architectural review detection on PR open
 * 2. Slack notification improvements for error reporting
 * 3. Confidence scoring in violation detection
 *
 * EXPECTED VIOLATIONS:
 * - HIGH: Direct ClickHouse client usage outside storage package
 * - HIGH: Raw SQL queries in non-storage code
 * - HIGH: Bypassing StorageServiceTag abstraction
 */

import { createClient } from '@clickhouse/client'
import { Effect } from 'effect'

// VIOLATION 1: Direct ClickHouse client instantiation
export class DirectDatabaseViolation {
  private readonly clickhouseClient

  constructor() {
    // HIGH CONFIDENCE VIOLATION: Creating ClickHouse client directly
    this.clickhouseClient = createClient({
      host: process.env.CLICKHOUSE_HOST || 'http://localhost:8123',
      username: 'default',
      password: '',
      database: 'otel'
    })
  }

  // VIOLATION 2: Raw SQL query execution
  async executeRawQuery() {
    // HIGH CONFIDENCE VIOLATION: Raw SQL outside storage package
    const DIRECT_SQL = `
      SELECT
        trace_id,
        span_id,
        service_name,
        operation_name,
        duration_ns
      FROM traces
      WHERE start_time > now() - INTERVAL 1 HOUR
      ORDER BY duration_ns DESC
      LIMIT 100
    `

    const result = await this.clickhouseClient.query({
      query: DIRECT_SQL,
      format: 'JSONEachRow'
    })

    return result.json()
  }

  // VIOLATION 3: Direct data insertion
  async insertDataDirectly(data: any) {
    // HIGH CONFIDENCE VIOLATION: Direct insert bypassing storage layer
    await this.clickhouseClient.insert({
      table: 'traces',
      values: [data],
      format: 'JSONEachRow'
    })
  }

  // VIOLATION 4: Creating tables directly
  async createTableDirectly() {
    // EXTREME VIOLATION: DDL operations outside storage package
    const CREATE_TABLE_SQL = `
      CREATE TABLE IF NOT EXISTS test_violations (
        id UInt64,
        data String
      ) ENGINE = MergeTree()
      ORDER BY id
    `

    await this.clickhouseClient.query({
      query: CREATE_TABLE_SQL
    })
  }
}

// VIOLATION 5: Exporting raw SQL constants
export const RAW_QUERIES = {
  GET_TRACES: 'SELECT * FROM traces',
  GET_METRICS: 'SELECT * FROM metrics',
  DELETE_OLD: 'DELETE FROM traces WHERE start_time < now() - INTERVAL 30 DAY'
}

// VIOLATION 6: Effect service that directly uses ClickHouse
export const ViolatingService = Effect.gen(function* () {
  const client = createClient({
    host: 'localhost:8123'
  })

  return {
    getData: () => client.query({ query: 'SELECT * FROM data' })
  }
})
