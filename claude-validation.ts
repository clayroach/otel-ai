/**
 * CLAUDE CODE VALIDATION - HAIKU WITH TOKEN LIMIT
 *
 * Using Haiku with max_tokens=4096 limit
 * Should post inline comments without API errors
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
