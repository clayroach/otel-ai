/**
 * FINAL CLAUDE CODE VALIDATION TEST
 *
 * This test validates that Claude Code can properly detect architectural violations
 * and send appropriate Slack notifications with warning status (not success).
 *
 * Expected: Claude Code should detect HIGH confidence violations and comment on PR.
 */

// 🚨 HIGH CONFIDENCE VIOLATION: Direct ClickHouse import outside storage package
import { createClient } from '@clickhouse/client';

export class FinalArchitecturalTest {
  // 🚨 HIGH CONFIDENCE VIOLATION: Direct client instantiation bypassing StorageServiceTag
  private dbClient = createClient({
    host: 'localhost:8123',
    username: 'otel',
    password: 'otel123'
  });

  // 🚨 HIGH CONFIDENCE VIOLATION: Raw SQL outside storage service
  async queryDatabase() {
    const rawSQL = 'SELECT * FROM otel.traces WHERE service_name = ? LIMIT 50';

    return await this.dbClient.query({
      query: rawSQL,
      query_params: ['my-service']
    });
  }
}

// 🚨 TypeScript error to test Slack notification content
export function typeError(x: number): string {
  return x; // Error: number not assignable to string
}