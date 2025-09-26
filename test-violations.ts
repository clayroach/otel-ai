/**
 * TEST FILE: Architectural Violations for Claude Code Review
 * This file intentionally contains violations to test inline commenting
 */

// VIOLATION 1: Direct ClickHouse client import outside storage package
import { createClient } from '@clickhouse/client'

// VIOLATION 2: Direct database client usage
export class DirectDatabaseAccess {
  private client = createClient({
    host: 'localhost:8123',
    username: 'default',
    password: ''
  })

  // VIOLATION 3: Raw SQL query outside storage service
  async queryDirectly() {
    const sql = `
      SELECT trace_id, span_id, service_name
      FROM otel.traces
      WHERE service_name = 'frontend'
      LIMIT 100
    `
    return await this.client.query({ query: sql })
  }
}

// VIOLATION 4: Bypassing StorageServiceTag abstraction
import { ClickhouseClient } from '../storage/client'

export const badServiceImplementation = async () => {
  const client = new ClickhouseClient()
  // Direct client usage instead of StorageServiceTag
  const result = await client.executeQuery('SELECT * FROM traces')
  return result
}

// VIOLATION 5: Test file in wrong location (should be in test/ subdirectory)
// This file itself is a violation as it's not in the proper test structure
