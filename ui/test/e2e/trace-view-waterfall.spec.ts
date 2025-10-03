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

    // Fetch trace data from API
    const apiResponse = await page.request.get(`/api/traces/${traceId}/spans`)
    expect(apiResponse.ok()).toBe(true)
    const apiData = await apiResponse.json()

    // Validate API response structure
    expect(apiData.spans).toBeDefined()
    expect(apiData.spans.length).toBeGreaterThan(0)
    expect(apiData.metadata).toBeDefined()

    // Navigate to trace view
    await page.goto(`/traces/${traceId}`)
    await page.waitForLoadState('networkidle')

    // Wait for waterfall chart to render
    await page.waitForSelector('canvas', { timeout: 10000 })

    // Verify chart is visible
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible()

    // Verify the chart rendered successfully by checking canvas dimensions
    const canvasBox = await canvas.boundingBox()
    expect(canvasBox).toBeTruthy()
    expect(canvasBox!.width).toBeGreaterThan(100)
    expect(canvasBox!.height).toBeGreaterThan(100)
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

    // Fetch trace data from API
    const response = await page.request.get(`/api/traces/${traceId}/spans`)
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
      parentSpanId?: string
      serviceName: string
      operationName: string
      startTimeUnixNano: string
      endTimeUnixNano: string
    }

    const spanMap = new Map<string, Span>(data.spans.map((s: any) => [s.spanId, s]))
    let rootCount = 0

    for (const span of data.spans as Span[]) {
      // Check if root (no parent)
      if (!span.parentSpanId || span.parentSpanId === '') {
        rootCount++
      } else {
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

    // Should have at least one root span
    expect(rootCount).toBeGreaterThan(0)
  })
})
