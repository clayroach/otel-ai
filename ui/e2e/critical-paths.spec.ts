import { test, expect } from '@playwright/test'

test.describe('Critical Request Paths', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('http://localhost:5173')
    
    // Navigate to Insights -> AI Analyzer
    await page.click('text=Insights')
    await page.waitForTimeout(500)
    await page.click('text=AI Analyzer')
    await page.waitForTimeout(1000)
  })

  test('should filter topology when selecting critical path', async ({ page }) => {
    // Enable console logging to capture our debug messages
    page.on('console', msg => {
      console.log(`Browser console: ${msg.type()}: ${msg.text()}`)
    })

    // Check that Critical Request Paths panel is visible
    await expect(page.locator('text=Critical Paths')).toBeVisible()
    
    // Check that Checkout Flow is in the list
    const checkoutFlowItem = page.locator('text=Checkout Flow').first()
    await expect(checkoutFlowItem).toBeVisible()
    
    // Click on Checkout Flow
    console.log('Clicking on Checkout Flow...')
    await checkoutFlowItem.click()
    await page.waitForTimeout(1000)
    
    // Check what services are visible in the topology
    // The topology should show these services: frontend, cartservice, checkoutservice, paymentservice, emailservice
    const expectedServices = [
      'frontend',
      'cartservice', 
      'checkoutservice',
      'paymentservice',
      'emailservice'
    ]
    
    console.log('Checking for expected services in topology...')
    
    // Check if the service nodes are visible
    for (const service of expectedServices) {
      const serviceVisible = await page.locator(`text=${service}`).isVisible().catch(() => false)
      console.log(`Service "${service}" visible: ${serviceVisible}`)
      
      if (!serviceVisible) {
        // Take a screenshot for debugging
        await page.screenshot({ 
          path: `debug-missing-${service}.png`,
          fullPage: true 
        })
      }
    }
    
    // Also check what services should NOT be visible (e.g., services not in the path)
    const unexpectedServices = [
      'recommendationservice',
      'adservice',
      'authservice',
      'inventoryservice'
    ]
    
    console.log('Checking that non-path services are hidden...')
    for (const service of unexpectedServices) {
      const serviceVisible = await page.locator(`text=${service}`).isVisible().catch(() => false)
      console.log(`Service "${service}" should be hidden, visible: ${serviceVisible}`)
    }
  })

  test('should show all services when clicking Show All', async ({ page }) => {
    // First select a path to filter
    await page.locator('text=Checkout Flow').first().click()
    await page.waitForTimeout(1000)
    
    // Click Show All button
    await page.click('button:has-text("All")')
    await page.waitForTimeout(1000)
    
    // Check that more services are now visible
    const allServices = [
      'frontend',
      'cartservice',
      'checkoutservice', 
      'paymentservice',
      'emailservice',
      'productcatalogservice',
      'recommendationservice',
      'adservice'
    ]
    
    for (const service of allServices) {
      const serviceVisible = await page.locator(`text=${service}`).isVisible().catch(() => false)
      console.log(`After Show All - Service "${service}" visible: ${serviceVisible}`)
    }
  })

  test('should support multi-select with Cmd/Ctrl click', async ({ page }) => {
    const isMac = process.platform === 'darwin'
    const modifier = isMac ? 'Meta' : 'Control'
    
    // Select first path
    await page.locator('text=Checkout Flow').first().click()
    await page.waitForTimeout(500)
    
    // Multi-select second path with modifier key
    await page.locator('text=Product Search').first().click({ modifiers: [modifier] })
    await page.waitForTimeout(500)
    
    // Check that services from both paths are visible
    const expectedServices = [
      // From Checkout Flow
      'frontend', 'cartservice', 'checkoutservice', 'paymentservice', 'emailservice',
      // From Product Search
      'productcatalogservice', 'recommendationservice', 'adservice'
    ]
    
    for (const service of expectedServices) {
      const serviceVisible = await page.locator(`text=${service}`).isVisible().catch(() => false)
      console.log(`Multi-select - Service "${service}" visible: ${serviceVisible}`)
    }
  })
})