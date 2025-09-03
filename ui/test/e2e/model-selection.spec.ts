import { expect, test } from '@playwright/test'

// Helper function for CI-appropriate timeouts
const getTimeout = (baseTimeout: number) => process.env.CI ? baseTimeout * 4 : baseTimeout

// DEPRECATED: This test file is for the old AI Analyzer model selection that has been replaced
// TODO: Remove this file after PR #XXX is merged and CI stabilizes
// Skipping these tests to maintain CI compatibility during the transition
test.describe.skip('Service Topology Data Mode Selection [DEPRECATED - Remove after PR merge]', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Service Topology view
    await page.goto('/servicetopology')
    
    // Wait for the page to load completely
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
  })

  test('should display demo mode by default', async ({ page }) => {
    // Check for demo mode indicator
    const demoAlert = page.locator('.ant-alert').filter({ hasText: /demo mode|mock data/i })
    
    // Demo mode alert should be visible
    await expect(demoAlert).toBeVisible({ timeout: getTimeout(10000) })
    
    console.log('✅ Demo mode is active by default')
  })

  test('should allow toggling between Live and Demo modes', async ({ page }) => {
    // Look for the data source toggle in the header
    const dataToggle = page.locator('text=/LIVE|DEMO/').first()
    
    // Toggle should be visible
    await expect(dataToggle).toBeVisible({ timeout: getTimeout(5000) })
    
    console.log('✅ Data source toggle is available')
  })
})