import { test, expect } from '@playwright/test'

// Quick validation test to ensure E2E framework works
test.describe('E2E Framework Validation', () => {
  test('should load Service Topology page and basic elements', async ({ page }) => {
    // Navigate to the service topology page
    await page.goto('/servicetopology')

    // Wait for main container instead of networkidle (API calls can be slow)
    await expect(page.getByTestId('service-topology-container')).toBeVisible({ timeout: 15000 })

    // Check that essential elements are present using test IDs
    await expect(page.getByTestId('critical-paths-panel')).toBeVisible()
    await expect(page.getByTestId('ai-analysis-panel')).toBeVisible()
    await expect(page.getByTestId('topology-graph-column')).toBeVisible()

    console.log('✅ Service Topology UI validated successfully')
  })

  test('should load Traces UI and basic elements', async ({ page }) => {
    // Navigate to the traces page
    await page.goto('/traces')
    await page.waitForLoadState('networkidle')
    
    // Wait for the page to render
    await page.waitForTimeout(2000)
    
    // Verify page title
    await expect(page.getByTestId('traces-page-title')).toContainText('Trace Analysis - Unified Processing')
    
    // Verify run query button exists
    await expect(page.getByTestId('traces-run-query-button')).toBeVisible()
    
    console.log('✅ Traces UI validated successfully')
  })

  test('should navigate between pages using proper test IDs', async ({ page }) => {
    // Start at traces
    await page.goto('/traces')
    await expect(page.getByTestId('traces-page-title')).toBeVisible({ timeout: 10000 })

    // Navigate to service topology using test ID
    await page.getByTestId('nav-servicetopology').click()

    // Verify we're on service topology page by checking for service topology container
    await expect(page.getByTestId('service-topology-container')).toBeVisible({ timeout: 15000 })

    // Navigate back to traces
    await page.getByTestId('nav-traces').click()

    // Verify we're back on traces
    await expect(page.getByTestId('traces-page-title')).toContainText('Trace Analysis - Unified Processing', { timeout: 10000 })

    console.log('✅ Navigation between pages validated successfully')
  })
})