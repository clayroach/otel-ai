/**
 * CLAUDE CODE WORKING VALIDATION
 *
 * ALL fixes now on main branch - this should work!
 * No more workflow validation errors.
 */

// HIGH CONFIDENCE: Direct ClickHouse import
import { createClient } from '@clickhouse/client';

export class Validation {
  // HIGH CONFIDENCE: Bypassing service layer
  db = createClient({ host: 'localhost:8123' });

  // HIGH CONFIDENCE: Raw SQL outside storage
  query = 'SELECT COUNT(*) FROM otel.traces';
}

// TypeScript error for testing
export const err = (x: number): string => x;