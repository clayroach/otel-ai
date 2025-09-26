/**
 * VIOLATION: Test file outside test/ subdirectory
 * This should be in src/test-violations/test/unit/ or test/integration/
 */

import { describe, it, expect } from 'vitest'
import { ViolationService } from './violation-examples'

describe('ViolationService', () => {
  it('should detect this test is in wrong location', () => {
    const service = new ViolationService()
    expect(service).toBeDefined()
  })

  it('contains more violations', async () => {
    // VIOLATION: Creating ClickHouse client in test
    const { createClient } = await import('@clickhouse/client')
    const client = createClient({ host: 'localhost' })

    // VIOLATION: Raw SQL in test
    const query = 'SELECT * FROM traces LIMIT 1'
    expect(query).toBeDefined()
  })
})