/**
 * Test file with intentional architectural violations
 * This file is created to test the code review agent's ability to detect and comment on violations
 */

// VIOLATION 1: Direct ClickHouse import outside storage package
import { createClient } from '@clickhouse/client'
import { Effect } from 'effect'

// VIOLATION 2: Direct client creation bypassing service abstraction
export class ViolationService {
  private client = createClient({
    host: 'localhost:8123',
    username: 'default',
    password: ''
  })

  // VIOLATION 3: Raw SQL query outside storage package
  async getTraces() {
    const sql = `
      SELECT trace_id, span_id, service_name
      FROM otel.traces
      WHERE service_name = 'frontend'
      LIMIT 100
    `
    return await this.client.query({ query: sql })
  }

  // VIOLATION 4: Direct database operations
  async insertAnnotation(data: any) {
    const insertSQL = `INSERT INTO otel.annotations (id, text) VALUES (?, ?)`
    return await this.client.exec({
      query: insertSQL,
      values: [data.id, data.text]
    })
  }
}

// VIOLATION 5: Bypassing StorageServiceTag
import { ClickhouseClient } from '../storage/client'

export const directDatabaseAccess = Effect.gen(function* () {
  const client = new ClickhouseClient()
  const result = yield* client.executeQuery('SELECT * FROM traces')
  return result
})

// VIOLATION 6: Traditional class service instead of Effect-TS Context.Tag
export class TraditionalService {
  constructor(private db: any) {}

  async process() {
    // Direct database access
    return this.db.query('SELECT COUNT(*) FROM traces')
  }
}
