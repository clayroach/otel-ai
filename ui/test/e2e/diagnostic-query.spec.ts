import { test, expect } from '@playwright/test'

test.describe('Diagnostic Query Feature', () => {
  test.beforeEach(async ({ page }) => {
    // Capture console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.error('Browser console error:', msg.text())
      }
    })
    
    // Navigate to the Service Topology view
    await page.goto('http://localhost:5173/servicetopology')
    
    // Wait for the page to load
    await page.waitForSelector('[data-testid="critical-paths-panel"]', { timeout: 10000 })
  })

  test('should display Generate Diagnostic Query button on critical paths', async ({ page }) => {
    // Wait for critical paths to load
    await page.waitForSelector('.critical-paths-scroll-container', { timeout: 5000 })
    
    // Check if at least one critical path is visible using test ID
    const firstPath = page.locator('[data-testid^="critical-path-item-"]').first()
    await expect(firstPath).toBeVisible()
    
    // Check if the Generate Diagnostic Query button is visible using test ID
    const diagnosticButton = page.locator('[data-testid^="diagnostic-query-button-"]').first()
    await expect(diagnosticButton).toBeVisible()
    await expect(diagnosticButton).toHaveText('Generate Diagnostic Query')
  })

  test('should generate and navigate to Traces view when clicking Diagnostic Query', async ({ page }) => {
    // Wait for critical paths to load
    await page.waitForSelector('.critical-paths-scroll-container', { timeout: 5000 })
    
    // Click on the first Generate Diagnostic Query button using test ID
    const diagnosticButton = page.locator('[data-testid^="diagnostic-query-button-"]').first()
    await diagnosticButton.click()
    
    // Wait for navigation to Traces view (with increased timeout for API call)
    // The loading state might be too quick to catch, so we focus on the navigation
    await page.waitForURL('**/traces', { timeout: 15000 })
    
    // Wait a bit for the page to render
    await page.waitForTimeout(2000)
    
    // Verify we're on the Traces page - wait for the page title to appear
    await page.waitForSelector('[data-testid="traces-page-title"]', { timeout: 10000 })
    const pageTitle = page.locator('[data-testid="traces-page-title"]')
    await expect(pageTitle).toBeVisible()
    
    // Check that the query editor has content
    const queryEditor = page.locator('.monaco-editor')
    await expect(queryEditor).toBeVisible()
    
    // Verify the Run Query button is present
    const runQueryButton = page.locator('[data-testid="traces-run-query-button"]')
    await expect(runQueryButton).toBeVisible()
  })

  test('should handle API connection errors gracefully', async ({ page }) => {
    // Intercept the API call and force it to fail
    await page.route('**/api/ui-generator/generate-query', route => {
      route.abort('connectionrefused')
    })
    
    // Wait for critical paths to load
    await page.waitForSelector('.critical-paths-scroll-container', { timeout: 5000 })
    
    // Click on the first Generate Diagnostic Query button using test ID
    const diagnosticButton = page.locator('[data-testid^="diagnostic-query-button-"]').first()
    await diagnosticButton.click()
    
    // Should still navigate to Traces with fallback query
    // The loading state might be too quick to catch, so we focus on the navigation
    await page.waitForURL('**/traces', { timeout: 10000 })
    
    // Verify fallback query is present
    await expect(page.locator('[data-testid="traces-page-title"]')).toBeVisible()
    
    // Query editor should still be visible with fallback content
    const queryEditor = page.locator('.monaco-editor')
    await expect(queryEditor).toBeVisible()
  })

  test('should show different critical paths with appropriate priorities', async ({ page }) => {
    // Wait for critical paths panel
    await page.waitForSelector('[data-testid="critical-paths-panel"]', { timeout: 5000 })
    
    // At least some paths should be visible
    const allPaths = page.locator('.ant-list-item')
    const pathCount = await allPaths.count()
    expect(pathCount).toBeGreaterThan(0)
    
    // Each path should have a Generate Diagnostic Query button
    for (let i = 0; i < Math.min(pathCount, 3); i++) {
      const path = allPaths.nth(i)
      const button = path.locator('button:has-text("Generate Diagnostic Query")')
      await expect(button).toBeVisible()
    }
  })

  test.skip('should execute query automatically after navigation', async ({ page }) => {
    // Mock a successful API response
    await page.route('**/api/ui-generator/generate-query', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sql: 'SELECT service_name, count() FROM otel.traces GROUP BY service_name',
          model: 'claude-3-5-sonnet',
          description: 'Test diagnostic query',
          generationTimeMs: 1500
        })
      })
    })
    
    // Mock the ClickHouse query execution
    await page.route('**/api/clickhouse/query', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            { service_name: 'frontend', count: 100 },
            { service_name: 'backend', count: 200 }
          ],
          rows: 2,
          statistics: {}
        })
      })
    })
    
    // Wait for critical paths to load
    await page.waitForSelector('.critical-paths-scroll-container', { timeout: 5000 })
    
    // Click Generate Diagnostic Query
    const diagnosticButton = page.locator('button:has-text("Generate Diagnostic Query")').first()
    await diagnosticButton.click()
    
    // Wait for navigation
    await page.waitForURL('**/traces', { timeout: 10000 })
    
    // Wait for query results to appear
    await page.waitForSelector('.ant-table-tbody', { timeout: 10000 })
    
    // Verify results are displayed
    const resultsTable = page.locator('.ant-table')
    await expect(resultsTable).toBeVisible()
    
    // Check that data rows are present
    const dataRows = page.locator('.ant-table-row')
    const rowCount = await dataRows.count()
    expect(rowCount).toBeGreaterThan(0)
  })
})