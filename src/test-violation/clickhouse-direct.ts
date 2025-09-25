/**
 * TEST FILE: This file intentionally violates architectural rules
 * to test the Claude Code architectural review system.
 *
 * VIOLATION: Direct ClickHouse client usage outside storage package
 * This should be caught by the automated review process.
 */

import { createClient } from '@clickhouse/client';

export class DirectDatabaseAccess {
  private client;

  constructor() {
    // ARCHITECTURAL VIOLATION: Direct ClickHouse client creation
    // Should use StorageServiceTag instead
    this.client = createClient({
      host: 'http://localhost:8123',
      username: 'default',
      password: '',
      database: 'otel'
    });
  }

  async executeRawSQL() {
    // ARCHITECTURAL VIOLATION: Raw SQL query outside storage service
    const result = await this.client.query({
      query: 'SELECT * FROM traces LIMIT 10',
      format: 'JSONEachRow'
    });

    return result.json();
  }

  async insertDirectly(data: any) {
    // ARCHITECTURAL VIOLATION: Direct insert bypassing storage abstraction
    await this.client.insert({
      table: 'traces',
      values: [data],
      format: 'JSONEachRow'
    });
  }
}

// Additional violation: Raw SQL string constant
export const RAW_QUERY = `
  SELECT
    service_name,
    COUNT(*) as count
  FROM traces
  WHERE timestamp > now() - INTERVAL 1 HOUR
  GROUP BY service_name
`;