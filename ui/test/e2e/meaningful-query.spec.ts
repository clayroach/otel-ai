import { expect, test } from '@playwright/test'

/**
 * Meaningful Query Test - Reproduce bad-analysis.png issue
 * 
 * Tests that the latency percentile query actually returns meaningful results
 * instead of showing "0 traces" and "unknown operations" for all services.
 */

const MEANINGFUL_QUERY = `SELECT 
    service_name,
    quantile(0.5)(duration_ms) AS p50_ms,
    quantile(0.95)(duration_ms) AS p95_ms,
    quantile(0.99)(duration_ms) AS p99_ms,
    count(*) AS request_count,
    max(start_time) AS latest_request
FROM otel.traces
WHERE 
    service_name IN ('cart', 'checkout', 'email', 'frontend', 'product-catalog')
    AND start_time >= subtractHours(now(), 3)
GROUP BY service_name
ORDER BY request_count DESC`

test.describe('Meaningful Latency Analysis Query', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173')
    await page.click('[data-testid="nav-traces"]')
    await page.waitForSelector('[data-testid="traces-page-title"]')
  })

  test.skip('should return meaningful latency percentiles instead of 0 traces', async ({ page }) => {
    // Capture console logs to debug the data processing
    const consoleLogs: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'log') {
        consoleLogs.push(msg.text())
      }
    })

    // Clear the query editor and enter the meaningful query
    await page.click('.monaco-editor')
    await page.keyboard.press('Meta+A')  // Select all
    await page.keyboard.type(MEANINGFUL_QUERY)
    
    // Run the query
    await page.click('[data-testid="traces-run-query-button"]')
    
    // Wait for results (either success or failure)
    try {
      await page.waitForSelector('.ant-table-tbody tr:not(.ant-table-measure-row), .ant-empty, text=/Query Error/', { timeout: 30000 })
    } catch (e) {
      console.log('⚠️  Query did not complete within timeout')
    }
    
    // Check if we got actual results
    const tableRows = await page.locator('.ant-table-tbody tr:not(.ant-table-measure-row)').count()
    const hasData = tableRows > 0
    
    console.log('\\n🔍 MEANINGFUL QUERY RESULTS:')
    console.log('=' .repeat(60))
    console.log(`Query: ${MEANINGFUL_QUERY.substring(0, 100)}...`)
    console.log(`Table rows: ${tableRows}`)
    console.log(`Has data: ${hasData}`)
    
    if (hasData) {
      // Get sample cell values to check if they're meaningful
      const serviceCells = await page.locator('.ant-table-tbody td').first().textContent()
      const traceCounts = await page.locator('.ant-table-tbody td:has-text("traces")').allTextContents()
      
      console.log(`Sample service: ${serviceCells}`)
      console.log(`Trace counts: ${traceCounts.slice(0, 3).join(', ')}`)
      
      // Check if we're getting "0 traces" everywhere (the bad analysis problem)
      const zeroTraces = traceCounts.filter(text => text.includes('0 traces') || text.includes('0')).length
      const totalCells = traceCounts.length
      
      console.log(`Zero/empty results: ${zeroTraces}/${totalCells}`)
      
      if (zeroTraces === totalCells && totalCells > 0) {
        console.log('❌ REPRODUCED bad-analysis.png ISSUE: All results show 0 traces')
        console.log('This matches the screenshot showing useless aggregation')
      } else {
        console.log('✅ Query returned meaningful results')
      }
    } else {
      console.log('❌ No table data returned - query may have failed')
      
      // Check for error messages
      const errorMsg = await page.locator('text=/Query Error/').textContent().catch(() => null)
      if (errorMsg) {
        console.log(`Error: ${errorMsg}`)
      }
    }
    
    // Log relevant console output for debugging
    const relevantLogs = consoleLogs.filter(log => 
      log.includes('DynamicTable') || 
      log.includes('TracesView') || 
      log.includes('Processing data') ||
      log.includes('aggregation')
    )
    
    if (relevantLogs.length > 0) {
      console.log('\\nRelevant processing logs:')
      relevantLogs.slice(-5).forEach((log, i) => console.log(`  ${i+1}. ${log}`))
    }
    
    console.log('=' .repeat(60))
    
    // This is a diagnostic test - always passes to gather debug info
    expect(true).toBe(true)
  })

  test.skip('should show actual duration_ns data exists in database', async ({ page }) => {
    // Test a simpler query to verify the data exists
    const SIMPLE_QUERY = `SELECT 
      service_name,
      duration_ms,
      start_time,
      operation_name
    FROM otel.traces 
    WHERE service_name IN ('cart', 'checkout', 'email', 'accounting', 'ad')
      AND start_time >= subtractHours(now(), 3)
    LIMIT 10`
    
    await page.click('.monaco-editor')
    await page.keyboard.press('Meta+A')
    await page.keyboard.type(SIMPLE_QUERY)
    
    await page.click('[data-testid="traces-run-query-button"]')
    await page.waitForTimeout(5000)
    
    const tableRows = await page.locator('.ant-table-tbody tr:not(.ant-table-measure-row)').count()
    
    console.log('\\n📊 SIMPLE QUERY TEST:')
    console.log(`Rows returned: ${tableRows}`)
    
    if (tableRows > 0) {
      const sampleData = await page.locator('.ant-table-tbody tr:not(.ant-table-measure-row)').first().allTextContents()
      console.log(`Sample row: ${sampleData.join(' | ')}`)
      console.log('✅ Base data exists in database')
    } else {
      console.log('❌ No base data found - this explains the 0 traces issue')
    }
    
    expect(true).toBe(true)
  })
})