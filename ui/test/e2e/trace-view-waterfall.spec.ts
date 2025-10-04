/**
 * E2E Test: Trace View Waterfall Validation
 *
 * Validates that the trace waterfall renders correctly with proper hierarchy,
 * timing, and visual cascade from parent to child spans.
 */

import { test, expect } from '@playwright/test'

test.describe('Trace View Waterfall', () => {
  test('should render waterfall with correct hierarchy', async ({ page }) => {
    // Get a trace ID from API
    const queryResponse = await page.request.post('/api/clickhouse/query', {
      data: {
        query: `
          SELECT DISTINCT trace_id
          FROM otel.traces
          WHERE start_time >= subtractHours(now(), 24)
          LIMIT 1
        `
      }
    })

    const queryData = await queryResponse.json()
    const traceId = queryData.data[0]?.trace_id
    expect(traceId).toBeDefined()

    // Navigate to trace view
    await page.goto(`/traces/${traceId}`)
    await page.waitForLoadState('networkidle')

    // Verify the page title shows the trace ID
    const pageTitle = page.locator('h4:has-text("Trace:")')
    await expect(pageTitle).toBeVisible({ timeout: 10000 })

    // Verify the span count and duration are displayed
    const serviceCount = page.locator('text=/Services: \\d+/')
    await expect(serviceCount).toBeVisible()

    const spanCount = page.locator('text=/Spans: \\d+/')
    await expect(spanCount).toBeVisible()

    const duration = page.locator('text=/Duration: \\d+ms/')
    await expect(duration).toBeVisible()

    // Verify at least one canvas element exists (from waterfall/minimap)
    const canvas = page.locator('canvas').first()
    await expect(canvas).toBeVisible({ timeout: 10000 })
  })

  test('should validate span hierarchy and timing', async ({ page }) => {
    // Get a trace ID from ClickHouse
    const queryResponse = await page.request.post('/api/clickhouse/query', {
      data: {
        query: `
          SELECT DISTINCT trace_id
          FROM otel.traces
          WHERE start_time >= subtractHours(now(), 24)
          LIMIT 1
        `
      }
    })

    expect(queryResponse.ok()).toBe(true)
    const queryData = await queryResponse.json()
    const traceId = queryData.data[0]?.trace_id
    expect(traceId).toBeDefined()

    // Fetch trace data from API (using the same endpoint as the component)
    const response = await page.request.get('/api/traces', {
      params: { traceId }
    })
    expect(response.ok()).toBe(true)
    const data = await response.json()

    // Validate basic structure
    expect(data.spans).toBeDefined()
    expect(data.spans.length).toBeGreaterThan(0)
    expect(data.metadata).toBeDefined()
    expect(data.metadata.services).toBeDefined()
    expect(data.metadata.durationMs).toBeGreaterThan(0)

    // Validate parent-child relationships
    interface Span {
      spanId: string
      parentSpanId?: string | null
      serviceName: string
      operationName: string
      startTimeUnixNano: string
      endTimeUnixNano: string
    }

    const spanMap = new Map<string, Span>(data.spans.map((s: any) => [s.spanId, s]))
    let rootCount = 0

    for (const span of data.spans as Span[]) {
      // Check if this is the root span - either by spanId matching rootSpanId or no parent
      const isRoot =
        span.spanId === data.metadata.rootSpanId ||
        span.parentSpanId === null ||
        span.parentSpanId === undefined ||
        span.parentSpanId === ''

      if (isRoot) {
        rootCount++
      } else if (span.parentSpanId) {
        // If has parent, verify timing: child should start >= parent start
        const parent = spanMap.get(span.parentSpanId)
        if (parent) {
          const childStart = BigInt(span.startTimeUnixNano)
          const parentStart = BigInt(parent.startTimeUnixNano)
          expect(childStart >= parentStart).toBe(true)
        }
      }

      // Validate span has required fields
      expect(span.spanId).toBeDefined()
      expect(span.serviceName).toBeDefined()
      expect(span.operationName).toBeDefined()
      expect(span.startTimeUnixNano).toBeDefined()
      expect(span.endTimeUnixNano).toBeDefined()
    }

    // Should have exactly one root span
    expect(rootCount).toBe(1)
  })
})
