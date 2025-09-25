/**
 * FINAL TEST: Validate Claude Code review and Slack notifications
 *
 * Expected results with all fixes merged to main:
 * ✅ Claude Code architectural review triggers on PR open
 * ✅ Slack notifications show clean branch names
 * ✅ TypeScript errors clearly identified
 */

// ARCHITECTURAL VIOLATION: Direct ClickHouse usage
import { createClient } from '@clickhouse/client';

export class FinalTest {
  // Should be detected by Claude Code review
  client = createClient({ host: 'localhost:8123' });

  // TypeScript error for Slack notification testing
  wrongType(x: number): string {
    return x; // Error: number not assignable to string
  }
}