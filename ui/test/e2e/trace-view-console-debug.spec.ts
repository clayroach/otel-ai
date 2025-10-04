/**
 * E2E Test: Trace View Browser Console Debug Output
 *
 * Validates that trace debug output appears in browser console
 * when viewing a trace with debug.traces.console = 'browser' or 'both'
 */

import { expect, test } from '@playwright/test'

test.describe('Trace View Console Debug', () => {
  test('should log formatted trace to browser console when viewing trace', async ({ page }) => {
    // Capture all console messages
    const consoleLogs: string[] = []
    page.on('console', (msg) => {
      const text = msg.text()
      consoleLogs.push(text)
      console.log(`[BROWSER ${msg.type()}]: ${text}`)
    })

    // Capture page errors
    page.on('pageerror', (err) => {
      console.error(`[BROWSER ERROR]: ${err.message}`)
    })

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
    console.log(`📋 Testing with trace ID: ${traceId}`)
    expect(traceId).toBeDefined()

    // First, check what the API returns
    const apiResponse = await page.request.get('/api/traces', {
      params: { traceId }
    })

    console.log(`📊 API Response status: ${apiResponse.status()}`)
    const apiData = await apiResponse.json()

    if (!apiResponse.ok()) {
      console.log('❌ API Error:', JSON.stringify(apiData, null, 2))
    }

    expect(apiResponse.ok()).toBe(true)

    console.log(`📊 API Response keys: ${Object.keys(apiData).join(', ')}`)
    console.log(`📊 Has debugTrace: ${apiData.debugTrace ? 'YES' : 'NO'}`)

    if (apiData.debugTrace) {
      console.log('📊 Debug trace length:', apiData.debugTrace.length)
      console.log('📊 Debug trace preview:', apiData.debugTrace.substring(0, 200))
    } else {
      console.log('⚠️  API response does not include debugTrace field')
    }

    // Validate API response structure
    expect(apiData.spans).toBeDefined()
    expect(apiData.spans.length).toBeGreaterThan(0)
    expect(apiData.metadata).toBeDefined()

    // Navigate to trace view
    console.log(`🌐 Navigating to /traces/${traceId}`)
    await page.goto(`/traces/${traceId}`)
    await page.waitForLoadState('networkidle')

    // Wait for trace data to load
    await page.waitForTimeout(2000)

    // Take screenshot for debugging
    await page.screenshot({ path: 'target/screenshots/trace-view-console-debug.png', fullPage: true })

    // Check if debugTrace was logged to console
    console.log(`📝 Total console messages captured: ${consoleLogs.length}`)

    const traceLogFound = consoleLogs.some((log) => log.includes('[TRACE] Trace'))

    if (!traceLogFound) {
      console.log('❌ No trace log found in console. All captured logs:')
      consoleLogs.forEach((log, i) => {
        console.log(`  ${i + 1}. ${log.substring(0, 100)}`)
      })
    }

    // Assertion: Should have at least one [TRACE] log
    expect(
      traceLogFound,
      'Expected to find [TRACE] Trace message in browser console'
    ).toBe(true)

    // Verify trace log contains expected elements
    const traceLogs = consoleLogs.filter((log) => log.includes('[TRACE] Trace'))
    expect(traceLogs.length).toBeGreaterThan(0)

    const traceLog = traceLogs[0]
    expect(traceLog).toContain('total')
    expect(traceLog).toContain('spans')
    expect(traceLog).toMatch(/\d+ms total/)
  })

  test('should not log trace when debug is disabled', async () => {
    // This test would require changing config dynamically
    // For now, just document the expected behavior
    test.skip(true, 'Requires dynamic config changes - manual test only')
  })
})
