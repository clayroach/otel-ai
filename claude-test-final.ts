/**
 * CLAUDE CODE FINAL WORKING TEST
 *
 * All workflow fixes are now on main branch:
 * ✅ Timeout option removed
 * ✅ Slack notifications fixed (warning status)
 * ✅ Enhanced prompt with code-review-agent
 *
 * This should be the working test!
 */

// 🚨 HIGH CONFIDENCE: Direct ClickHouse import outside storage package
import { createClient } from '@clickhouse/client'

export class ClaudeTestFinal {
  // 🚨 HIGH CONFIDENCE: Direct client bypassing StorageServiceTag
  client = createClient({ host: 'localhost:8123' })

  // 🚨 HIGH CONFIDENCE: Raw SQL outside storage service
  async directQuery() {
    return this.client.query({
      query: 'SELECT * FROM otel.traces LIMIT 10'
    })
  }
}

// 🚨 TypeScript error for Slack testing
export const typeErr = (n: number): string => n
