/**
 * TEST FILE: Final validation of Claude Code review and Slack notifications
 * This file should trigger:
 * 1. Claude Code architectural review on PR open
 * 2. Clean branch names in Slack (no refs/heads/)
 * 3. TypeScript compilation errors
 */

// VIOLATION: Direct ClickHouse usage outside storage package
import { createClient } from '@clickhouse/client';

export class TestViolation {
  private client = createClient({
    host: 'http://localhost:8123'
  });

  // VIOLATION: Raw SQL query
  async query() {
    return this.client.query({
      query: 'SELECT * FROM traces'
    });
  }
}

// TypeScript Error: Wrong types
export function badTypes(x: number): string {
  return x; // Error: number is not string
}