/**
 * Claude Code Verification Test
 *
 * This file contains intentional architectural violations to test:
 * ✅ Claude Code GitHub App integration
 * ✅ Architectural review workflow
 * ✅ Slack notification system
 */

// ARCHITECTURAL VIOLATION: Direct ClickHouse usage outside storage package
import { createClient } from '@clickhouse/client'

export class ClaudeVerificationTest {
  // This should trigger Claude Code architectural review
  private client = createClient({
    host: 'localhost:8123',
    username: 'otel',
    password: 'otel123'
  })

  // TypeScript error for comprehensive testing
  invalidTypeExample(x: number): string {
    return x // Error: number not assignable to string
  }

  async directDatabaseQuery() {
    // This violates our architectural pattern of using StorageServiceTag
    const result = await this.client.query({
      query: 'SELECT * FROM traces LIMIT 10'
    })
    return result
  }
}
