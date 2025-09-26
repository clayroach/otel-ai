/**
 * FINAL ARCHITECTURAL VIOLATION TEST
 *
 * This file contains multiple HIGH CONFIDENCE violations that Claude Code
 * should detect and comment on with specific recommendations.
 */

// 🚨 VIOLATION 1: Direct ClickHouse client import outside storage package
import { createClient } from '@clickhouse/client';

// 🚨 VIOLATION 2: Direct database interface usage
import type { ClickHouseClient } from '@clickhouse/client';

export class ArchitecturalTest {
  // 🚨 VIOLATION 3: Direct client instantiation bypassing service layer
  private clickhouseClient: ClickHouseClient = createClient({
    host: 'localhost:8123',
    username: 'otel',
    password: 'otel123',
    database: 'otel'
  });

  // 🚨 VIOLATION 4: Raw SQL string outside storage package
  private readonly DIRECT_SQL = `
    INSERT INTO otel.traces (trace_id, span_id, service_name, operation_name)
    VALUES (?, ?, ?, ?)
  `;

  // 🚨 VIOLATION 5: Direct database query bypassing StorageServiceTag
  async directDatabaseAccess(traceId: string, spanId: string) {
    // This should trigger HIGH confidence architectural violation
    const result = await this.clickhouseClient.query({
      query: this.DIRECT_SQL,
      query_params: [traceId, spanId, 'test-service', 'test-operation']
    });

    return result;
  }

  // 🚨 VIOLATION 6: Raw SELECT query outside storage service
  async queryTracesDirectly() {
    const selectQuery = 'SELECT * FROM otel.traces WHERE service_name = ? LIMIT 100';

    return await this.clickhouseClient.query({
      query: selectQuery,
      query_params: ['my-service']
    });
  }

  // 🚨 VIOLATION 7: TypeScript error for Slack notification testing
  invalidTypeMethod(input: number): string {
    return input; // Type error: number not assignable to string
  }
}

// 🚨 VIOLATION 8: Export of direct database utilities (anti-pattern)
export const directClickHouseUtils = {
  client: createClient({ host: 'localhost:8123' }),
  rawQuery: (sql: string) => sql // Direct SQL exposure
};