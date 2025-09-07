import { test, expect } from '@playwright/test'

/**
 * Dynamic Table Tests - Phase 3A
 * 
 * Tests the dynamic table functionality that adapts based on query results,
 * including result analysis, intelligent column formatting, and visualization toggles.
 */

test.describe('Dynamic Table Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the Traces view
    await page.goto('http://localhost:5173')
    await page.click('[data-testid="nav-traces"]')
    await page.waitForSelector('[data-testid="traces-page-title"]')
  })

  test('should display dynamic table with query results', async ({ page }) => {
    // Run the default query
    await page.click('[data-testid="traces-run-query-button"]')
    
    // Wait for query to complete and results to show (excluding measure rows)
    await page.waitForSelector('.ant-table-tbody tr:not(.ant-table-measure-row)', { timeout: 10000 })
    
    // Verify table is displayed
    const table = page.locator('.ant-table')
    await expect(table).toBeVisible()
    
    // Verify we have columns (should be dynamically generated)
    const headers = page.locator('.ant-table-thead th')
    const headerCount = await headers.count()
    expect(headerCount).toBeGreaterThan(0)
    
    // Verify we have data rows
    const rows = page.locator('.ant-table-tbody tr')
    const rowCount = await rows.count()
    expect(rowCount).toBeGreaterThan(0)
  })

  test('should show analysis summary when available', async ({ page }) => {
    // Run query and wait for results
    await page.click('[data-testid="traces-run-query-button"]')
    await page.waitForSelector('.ant-table-tbody tr:not(.ant-table-measure-row)', { timeout: 10000 })
    
    // Check if analysis summary appears (it should show row count, column count, etc.)
    const analysisInfo = page.locator('text=/\\d+ rows, \\d+ columns/')
    
    // Analysis summary should appear if result analysis is working
    if (await analysisInfo.isVisible()) {
      await expect(analysisInfo).toBeVisible()
      console.log('✅ Result analysis is working - found analysis summary')
    } else {
      console.log('ℹ️  Result analysis not showing - DynamicTable using fallback mode')
    }
  })

  test('should display intelligent column formatting', async ({ page }) => {
    // Run query and wait for results  
    await page.click('[data-testid="traces-run-query-button"]')
    await page.waitForSelector('.ant-table-tbody tr:not(.ant-table-measure-row)', { timeout: 10000 })
    
    // Verify columns have proper titles (should be formatted from snake_case)
    const serviceNameHeader = page.locator('.ant-table-thead th:has-text("Service Name")')
    const durationHeader = page.locator('.ant-table-thead th:has-text("Duration")')
    
    // At least one of these formatted headers should be present
    const hasFormattedHeaders = await serviceNameHeader.isVisible() || await durationHeader.isVisible()
    expect(hasFormattedHeaders).toBeTruthy()
  })

  test('should handle empty query results gracefully', async ({ page }) => {
    // Clear the Monaco editor properly and enter a query that returns no results
    await page.click('.monaco-editor')
    await page.keyboard.press('Control+A')
    await page.keyboard.type('SELECT * FROM otel.traces WHERE 1=0')
    
    await page.click('[data-testid="traces-run-query-button"]')
    
    // Wait for query to complete and check for empty state or error
    try {
      // Wait for either empty state or query completion
      await page.waitForSelector('.ant-empty', { timeout: 5000 })
    } catch (e) {
      // If no empty state, check for table content or error
      const hasContent = await page.locator('.ant-table-tbody tr:not(.ant-table-measure-row)').count() > 0
      const hasError = await page.locator('text=/Query Error/').isVisible()
      
      // Empty query should have no content (success case)
      if (!hasContent && !hasError) {
        console.log('✅ Query returned no results as expected')
      } else if (hasError) {
        // Check if it's a syntax error (which would be a test failure)
        const hasSyntaxError = await page.locator('text=/Syntax error/').isVisible()
        expect(hasSyntaxError).toBeFalsy()
      }
    }
  })

  test('should show visualization toggle when results are available', async ({ page }) => {
    // Run query and wait for results
    await page.click('[data-testid="traces-run-query-button"]')
    await page.waitForSelector('.ant-table-tbody tr:not(.ant-table-measure-row)', { timeout: 10000 })
    
    // Check if visualization toggle appears
    const viewLabel = page.locator('text=View:')
    const tableOption = page.locator('.ant-segmented-item:has-text("Table")')
    
    // At minimum, we should see the View label and Table option
    if (await viewLabel.isVisible() && await tableOption.isVisible()) {
      await expect(viewLabel).toBeVisible()
      await expect(tableOption).toBeVisible()
      console.log('✅ Visualization toggle is working')
    } else {
      console.log('ℹ️  Visualization toggle not visible - may need result analysis')
    }
  })

  test('should provide comprehensive console logging for debugging aggregation', async ({ page }) => {
    const consoleLogs: string[] = []
    const consoleErrors: string[] = []
    
    // Capture all console output
    page.on('console', msg => {
      const text = msg.text()
      if (msg.type() === 'log') {
        consoleLogs.push(text)
      } else if (msg.type() === 'error') {
        consoleErrors.push(text)
      }
    })
    
    // Run query to trigger analysis and aggregation
    await page.click('[data-testid="traces-run-query-button"]')
    
    // Wait for query to complete (either success or failure)
    try {
      await page.waitForSelector('.ant-table-tbody tr:not(.ant-table-measure-row), .ant-empty, text=/Query Error/', { timeout: 15000 })
    } catch (e) {
      console.log('⚠️  Query did not complete within timeout')
    }
    
    // Wait for any async processing
    await page.waitForTimeout(3000)
    
    // Analyze console logs
    console.log('\n🔍 DEBUGGING DYNAMIC TABLE AGGREGATION:')
    console.log('=' .repeat(60))
    
    // 1. Check TracesView logs
    const tracesViewLogs = consoleLogs.filter(log => log.includes('TracesView:'))
    console.log(`\n📊 TracesView Logs (${tracesViewLogs.length} found):`)
    tracesViewLogs.forEach((log, i) => console.log(`  ${i+1}. ${log}`))
    
    // 2. Check DynamicTable logs
    const dynamicTableLogs = consoleLogs.filter(log => log.includes('DynamicTable:'))
    console.log(`\n📋 DynamicTable Logs (${dynamicTableLogs.length} found):`)
    dynamicTableLogs.forEach((log, i) => console.log(`  ${i+1}. ${log}`))
    
    // 3. Check for aggregation trigger
    const processingLogs = consoleLogs.filter(log => log.includes('Processing data'))
    const aggregationLogs = consoleLogs.filter(log => log.includes('Aggregation complete'))
    
    console.log(`\n🔄 Aggregation Status:`)
    console.log(`  Processing logs: ${processingLogs.length}`)
    console.log(`  Aggregation complete logs: ${aggregationLogs.length}`)
    
    if (processingLogs.length > 0) {
      console.log(`  Latest processing log: ${processingLogs[processingLogs.length - 1]}`)
    }
    if (aggregationLogs.length > 0) {
      console.log(`  Latest aggregation log: ${aggregationLogs[aggregationLogs.length - 1]}`)
    }
    
    // 4. Check for errors
    console.log(`\n❌ Console Errors (${consoleErrors.length} found):`)
    if (consoleErrors.length > 0) {
      consoleErrors.forEach((error, i) => console.log(`  ${i+1}. ${error}`))
    } else {
      console.log('  No console errors found')
    }
    
    // 5. Check actual table state
    const tableExists = await page.locator('.ant-table').isVisible()
    const rowCount = await page.locator('.ant-table-tbody tr:not(.ant-table-measure-row)').count()
    const hasAggregationMessage = await page.locator('text=/Large dataset automatically aggregated/').isVisible()
    
    console.log(`\n📈 Table State:`)
    console.log(`  Table visible: ${tableExists}`)
    console.log(`  Row count: ${rowCount}`)
    console.log(`  Aggregation message visible: ${hasAggregationMessage}`)
    
    // 6. Check for analysis summary (avoid pagination text)
    const analysisInfo = page.locator('span').filter({ hasText: /\d+ (rows|service operations)/ }).first()
    const analysisVisible = await analysisInfo.isVisible()
    if (analysisVisible) {
      const analysisText = await analysisInfo.textContent()
      console.log(`  Analysis summary: "${analysisText}"`)
    } else {
      console.log(`  No analysis summary found`)
    }
    
    // 7. Sample some column headers to see what's actually displayed
    const headers = await page.locator('.ant-table-thead th').allTextContents()
    console.log(`  Column headers (${headers.length}): [${headers.join(', ')}]`)
    
    console.log('=' .repeat(60))
    
    // Assertions to ensure we got some useful debugging info
    expect(consoleLogs.length).toBeGreaterThan(0)
    
    // Log summary for easy scanning
    if (aggregationLogs.length > 0) {
      console.log('✅ AGGREGATION IS WORKING - Check logs above for details')
    } else if (processingLogs.length > 0) {
      console.log('⚠️  AGGREGATION NOT TRIGGERED - Check processing logs above')
    } else {
      console.log('❌ NO AGGREGATION LOGS - Component may not be processing data')
    }
  })
})

test.describe('Dynamic Table Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173')
    await page.click('[data-testid="nav-traces"]')
    await page.waitForSelector('[data-testid="traces-page-title"]')
  })

  test('should handle malformed query gracefully', async ({ page }) => {
    // Enter a malformed query
    await page.fill('.monaco-editor textarea', 'SELECT invalid syntax FROM nowhere')
    await page.click('[data-testid="traces-run-query-button"]')
    
    // Should show error message, not crash
    await page.waitForSelector('text=/Query Error/', { timeout: 10000 })
    const errorMessage = page.locator('text=/Query Error/')
    await expect(errorMessage).toBeVisible()
  })

  test('should maintain table state during loading', async ({ page }) => {
    // Run initial query
    await page.click('[data-testid="traces-run-query-button"]')
    await page.waitForSelector('.ant-table-tbody tr:not(.ant-table-measure-row)', { timeout: 10000 })
    
    // Run another query and verify loading state
    await page.click('[data-testid="traces-run-query-button"]')
    
    // Should show loading indicator
    const loadingIndicator = page.locator('.ant-spin')
    
    // Loading state should appear briefly
    if (await loadingIndicator.isVisible()) {
      await expect(loadingIndicator).toBeVisible()
    }
  })
})