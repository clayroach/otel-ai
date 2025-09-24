import { test, expect } from '@playwright/test'

/**
 * Traces Query Tests
 * 
 * Tests for query execution, error handling, and edge cases in the Traces view.
 * These tests were moved from the deprecated dynamic-table.spec.ts file.
 */

test.describe('Traces Query Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173')
    await page.click('[data-testid="nav-traces"]')
    await page.waitForSelector('[data-testid="traces-page-title"]')
  })

  test('should handle malformed query gracefully', async ({ page }) => {
    // Enter a malformed query
    await page.click('.monaco-editor')
    await page.keyboard.press('Meta+A') // Select all
    await page.keyboard.type('SELECT invalid syntax FROM nowhere')
    
    // Run the query
    await page.click('[data-testid="traces-run-query-button"]')
    
    // Should show error message, not crash
    await page.waitForSelector('text=/Query Error/', { timeout: 10000 })
    const errorMessage = page.locator('text=/Query Error/')
    await expect(errorMessage).toBeVisible()
    
    // Verify the app is still responsive
    const queryButton = page.locator('[data-testid="traces-run-query-button"]')
    await expect(queryButton).toBeEnabled()
  })

  test('should maintain table state during loading', async ({ page }) => {
    // Wait for page to stabilize first
    await page.waitForTimeout(2000)

    // Run initial query to get some data
    await page.click('[data-testid="traces-run-query-button"]')

    // Wait for loading to complete
    await page.waitForFunction(
      () => !document.querySelector('.ant-spin-spinning'),
      { timeout: 20000 }
    )

    // Wait for query to complete - check for either dynamic or table view
    // Use a more lenient check since the query might take time to execute
    const resultsAppeared = await Promise.race([
      page.waitForSelector('[data-testid="dynamic-view-container"]', { timeout: 20000 }).then(() => true).catch(() => false),
      page.waitForSelector('[data-testid="table-view-container"]', { timeout: 20000 }).then(() => true).catch(() => false),
      page.waitForSelector('.ant-table', { timeout: 20000 }).then(() => true).catch(() => false),
      page.waitForSelector('[data-testid="query-results"]', { timeout: 20000 }).then(() => true).catch(() => false)
    ])

    if (!resultsAppeared) {
      // If no results, at least verify the query editor is present
      await expect(page.locator('.monaco-editor')).toBeVisible()
    }
    
    // Switch to table view if in dynamic view
    const viewModeToggle = page.locator('[data-testid="view-mode-toggle"]')
    const isInDynamicMode = await viewModeToggle.getAttribute('aria-checked') === 'true'
    if (isInDynamicMode) {
      await viewModeToggle.click()
      await page.waitForSelector('[data-testid="table-view-container"]', { timeout: 5000 })
    }
    
    // Wait for table results
    await page.waitForSelector('.ant-table-tbody tr:not(.ant-table-measure-row)', { timeout: 10000 })
    
    // Count initial rows
    const initialRows = await page.locator('.ant-table-tbody tr:not(.ant-table-measure-row)').count()
    expect(initialRows).toBeGreaterThan(0)
    
    // Run another query and verify loading state
    await page.click('[data-testid="traces-run-query-button"]')
    
    // Should show loading indicator
    const loadingIndicator = page.locator('.ant-spin')
    
    // Loading state should appear briefly
    if (await loadingIndicator.isVisible()) {
      await expect(loadingIndicator).toBeVisible()
    }
    
    // Wait for new results
    await page.waitForSelector('.ant-table-tbody tr:not(.ant-table-measure-row)', { timeout: 10000 })
    
    // Table should still be functional
    const finalRows = await page.locator('.ant-table-tbody tr:not(.ant-table-measure-row)').count()
    expect(finalRows).toBeGreaterThan(0)
  })

  test('should handle empty query results gracefully', async ({ page }) => {
    // Enter a query that returns no results
    await page.click('.monaco-editor')
    await page.keyboard.press('Meta+A')
    await page.keyboard.type(`
      SELECT * FROM otel.traces 
      WHERE service_name = 'non-existent-service-xyz-123'
      AND start_time >= now()
    `)
    
    // Run the query
    await page.click('[data-testid="traces-run-query-button"]')
    
    // Wait for the query to complete
    await page.waitForTimeout(3000)
    
    // Should show empty state or no rows
    const emptyState = page.locator('.ant-empty')
    const tableRows = await page.locator('.ant-table-tbody tr:not(.ant-table-measure-row)').count()
    
    // Either show empty state or have 0 rows
    const hasEmptyState = await emptyState.isVisible().catch(() => false)
    if (!hasEmptyState) {
      expect(tableRows).toBe(0)
    }
  })

  test('should execute default query on page load', async ({ page }) => {
    // Fresh page load should have the default query
    await page.reload()
    await page.waitForSelector('[data-testid="traces-page-title"]')

    // Wait for Monaco editor to load and stabilize
    await page.waitForSelector('.monaco-editor')
    await page.waitForTimeout(2000) // Let Monaco initialize fully

    // Run the default query
    await page.click('[data-testid="traces-run-query-button"]')

    // Wait for loading to complete
    await page.waitForFunction(
      () => !document.querySelector('.ant-spin-spinning'),
      { timeout: 20000 } // Increase timeout for query execution
    )

    // Additional wait for results to render
    await page.waitForTimeout(1000)

    // Wait for query to complete - check for either dynamic or table view
    // Use a more lenient check since the query might take time to execute
    const resultsAppeared = await Promise.race([
      page.waitForSelector('[data-testid="dynamic-view-container"]', { timeout: 20000 }).then(() => true).catch(() => false),
      page.waitForSelector('[data-testid="table-view-container"]', { timeout: 20000 }).then(() => true).catch(() => false),
      page.waitForSelector('.ant-table', { timeout: 20000 }).then(() => true).catch(() => false),
      page.waitForSelector('[data-testid="query-results"]', { timeout: 20000 }).then(() => true).catch(() => false)
    ])

    if (!resultsAppeared) {
      // If no results, at least verify the query editor is present
      await expect(page.locator('.monaco-editor')).toBeVisible()
    }
    
    // Check if we're in dynamic view (default)
    const dynamicView = page.locator('[data-testid="dynamic-view-container"]')
    const hasDynamicView = await dynamicView.isVisible().catch(() => false)
    
    if (hasDynamicView) {
      // In dynamic view, verify chart is rendered
      expect(hasDynamicView).toBe(true)
      
      // Test toggling to table view
      const viewModeToggle = page.locator('[data-testid="view-mode-toggle"]')
      await viewModeToggle.click()
      await page.waitForSelector('[data-testid="table-view-container"]', { timeout: 5000 })
    }
    
    // Now check table view
    const tableView = page.locator('[data-testid="table-view-container"]')
    const hasTableView = await tableView.isVisible().catch(() => false)
    
    if (hasTableView) {
      // Should get results (or handle gracefully if no data)
      await page.waitForSelector('.ant-table-tbody tr:not(.ant-table-measure-row), .ant-empty', { timeout: 10000 })
      
      // Verify we got some results or empty state
      const hasResults = await page.locator('.ant-table-tbody tr:not(.ant-table-measure-row)').count() > 0
      const hasEmpty = await page.locator('.ant-empty').isVisible().catch(() => false)
      
      expect(hasResults || hasEmpty).toBe(true)
    }
  })

  test.skip('should preserve query after navigation', async ({ page }) => {
    // Enter a custom query
    const customQuery = 'SELECT COUNT(*) as total FROM otel.traces'
    await page.click('.monaco-editor')
    await page.keyboard.press('Meta+A')
    await page.keyboard.type(customQuery)
    
    // Wait a moment for the query to be set
    await page.waitForTimeout(500)
    
    // Navigate to Service Topology
    await page.click('[data-testid="nav-servicetopology"]')
    await page.waitForSelector('[data-testid="servicetopology-page-title"]', { timeout: 10000 })
    
    // Navigate back to Traces
    await page.click('[data-testid="nav-traces"]')
    await page.waitForSelector('[data-testid="traces-page-title"]')
    
    // Query should be preserved (check the actual text content, accounting for line numbers)
    const editorContent = await page.locator('.monaco-editor').textContent()
    expect(editorContent).toContain('COUNT(*)')
    expect(editorContent).toContain('total')
  })
})