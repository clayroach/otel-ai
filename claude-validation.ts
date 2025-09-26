/**
 * CLAUDE CODE VALIDATION - INLINE COMMENTS TEST
 *
 * Testing with --allowedTools mcp__github_inline_comment__create_inline_comment
 * Should now post inline comments on specific lines
 */

// HIGH CONFIDENCE: Direct ClickHouse import
import { createClient } from '@clickhouse/client'

export class Validation {
  // HIGH CONFIDENCE: Bypassing service layer
  db = createClient({ host: 'localhost:8123' })

  // HIGH CONFIDENCE: Raw SQL outside storage
  query = 'SELECT COUNT(*) FROM otel.traces'
}

// Fixed TypeScript compliance - still has architectural violations
export const err = (x: number): string => x.toString()
