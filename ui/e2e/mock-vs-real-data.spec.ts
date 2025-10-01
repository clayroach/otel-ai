import { test, expect } from '@playwright/test'

test.describe('Mock vs Real Data E2E Validation', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the insights page
    await page.goto('http://localhost:5173/insights')
    await page.waitForLoadState('networkidle')
  })

  test('should display mock data with "m" prefix when LIVE is OFF', async ({ page }) => {
    // Ensure LIVE toggle is OFF (default state)
    const liveToggle = page.locator('[data-testid="live-toggle"]').or(page.locator('text=LIVE').locator('..').locator('button'))
    
    // Check if toggle exists and is OFF
    const toggleState = await liveToggle.getAttribute('aria-checked')
    if (toggleState === 'true') {
      await liveToggle.click()
      await page.waitForTimeout(500)
    }

    // Wait for topology to load
    await page.waitForSelector('canvas', { timeout: 10000 })
    
    // Check for mock service names in the DOM
    const pageContent = await page.content()
    
    // Mock services should have 'm' prefix
    const mockServicePatterns = [
      'mfrontend',
      'mcartservice',
      'mcheckoutservice',
      'mpaymentservice',
      'mpostgres',
      'mredis'
    ]
    
    // At least one mock service should be visible
    let foundMockService = false
    for (const service of mockServicePatterns) {
      if (pageContent.includes(service)) {
        foundMockService = true
        break
      }
    }
    
    expect(foundMockService).toBeTruthy()
    
    // Real service names should NOT be present
    const realServicePatterns = [
      '"frontend"',
      '"cartservice"',
      '"checkoutservice"',
      '"paymentservice"'
    ]
    
    for (const service of realServicePatterns) {
      expect(pageContent).not.toContain(service)
    }
  })

  test('should attempt to fetch real data when LIVE is ON', async ({ page }) => {
    // Enable LIVE mode
    const liveToggle = page.locator('[data-testid="live-toggle"]').or(page.locator('text=LIVE').locator('..').locator('button'))
    
    // Click to enable LIVE mode if not already enabled
    const toggleState = await liveToggle.getAttribute('aria-checked')
    if (toggleState !== 'true') {
      await liveToggle.click()
      await page.waitForTimeout(500)
    }

    // Set up network interceptor to monitor API calls
    const apiCalls: string[] = []
    page.on('request', request => {
      if (request.url().includes('/api/topology') || request.url().includes('4319')) {
        apiCalls.push(request.url())
      }
    })

    // Trigger a refresh or wait for auto-refresh
    await page.reload()
    await page.waitForTimeout(2000)

    // Should have made API calls when in LIVE mode
    expect(apiCalls.length).toBeGreaterThan(0)
    
    // Check that mock service names are NOT displayed
    const pageContent = await page.content()
    const mockServices = ['mfrontend', 'mcartservice', 'mcheckoutservice']
    
    // If API fails, should show error, not mock data
    if (pageContent.includes('Error')) {
      // Error message is expected if backend is not running
      expect(pageContent).toContain('Error')
      
      // But mock services should NOT be shown
      for (const service of mockServices) {
        expect(pageContent).not.toContain(service)
      }
    }
  })

  test('should toggle between mock and real data correctly', async ({ page }) => {
    const liveToggle = page.locator('[data-testid="live-toggle"]').or(page.locator('text=LIVE').locator('..').locator('button'))
    
    // Start with LIVE OFF (mock data)
    const initialState = await liveToggle.getAttribute('aria-checked')
    if (initialState === 'true') {
      await liveToggle.click()
      await page.waitForTimeout(1000)
    }
    
    // Verify mock data is shown
    await page.waitForSelector('canvas', { timeout: 10000 })
    const content = await page.content()
    
    // Should contain mock service indicators
    expect(content.includes('mfrontend') || content.includes('mcart') || content.includes('mock')).toBeTruthy()
    
    // Toggle to LIVE mode
    await liveToggle.click()
    await page.waitForTimeout(1000)
    
    // Set up network listener
    let apiCallMade = false
    page.on('request', request => {
      if (request.url().includes('/api/topology') || request.url().includes('4319')) {
        apiCallMade = true
      }
    })
    
    // Trigger analysis or wait for update
    const analyzeButton = page.locator('button:has-text("Analyze")')
    if (await analyzeButton.isVisible()) {
      await analyzeButton.click()
    }
    
    await page.waitForTimeout(2000)
    
    // Should have attempted to fetch real data
    expect(apiCallMade).toBeTruthy()
  })

  test('should never mix mock and real data', async ({ page }) => {
    // This test ensures data sources are never mixed
    const liveToggle = page.locator('[data-testid="live-toggle"]').or(page.locator('text=LIVE').locator('..').locator('button'))
    
    // Test with LIVE OFF
    const toggleState = await liveToggle.getAttribute('aria-checked')
    if (toggleState === 'true') {
      await liveToggle.click()
      await page.waitForTimeout(500)
    }
    
    await page.waitForSelector('canvas', { timeout: 10000 })
    const mockContent = await page.content()
    
    // Count mock services
    const mockServiceCount = (mockContent.match(/m[a-z]+service/g) || []).length
    
    // Count real services (without 'm' prefix)
    const realServiceCount = (mockContent.match(/(?<!m)(frontend|cartservice|checkoutservice|paymentservice)/g) || []).length
    
    // Should have either mock OR real, never both
    if (mockServiceCount > 0) {
      expect(realServiceCount).toBe(0)
    }
    
    // Toggle to LIVE mode
    await liveToggle.click()
    await page.waitForTimeout(2000)
    
    const liveContent = await page.content()
    
    // Re-count services
    const liveMockCount = (liveContent.match(/m[a-z]+service/g) || []).length
    
    // In LIVE mode, should never show mock services
    if (!liveContent.includes('Error')) {
      expect(liveMockCount).toBe(0)
    }
  })

  test('should show appropriate messages for each mode', async ({ page }) => {
    // Test mock mode messaging
    const liveToggle = page.locator('[data-testid="live-toggle"]').or(page.locator('text=LIVE').locator('..').locator('button'))
    
    // Ensure LIVE is OFF
    const toggleState = await liveToggle.getAttribute('aria-checked')
    if (toggleState === 'true') {
      await liveToggle.click()
      await page.waitForTimeout(500)
    }
    
    // Look for mock mode indicators
    await page.waitForTimeout(2000)
    const toastMessages = page.locator('.ant-message-notice')
    const notifications = page.locator('.ant-notification-notice')
    
    // Check for any mock-related messages
    const allMessages = await Promise.all([
      toastMessages.allTextContents(),
      notifications.allTextContents()
    ])
    
    const messageText = allMessages.flat().join(' ').toLowerCase()
    
    // In mock mode, should mention "mock" or "demonstration"
    if (messageText) {
      expect(messageText.includes('mock') || messageText.includes('demo')).toBeTruthy()
    }
    
    // Switch to LIVE mode
    await liveToggle.click()
    await page.waitForTimeout(2000)
    
    // In LIVE mode, messages should be about real data or connection
    const liveMessages = await Promise.all([
      toastMessages.allTextContents(),
      notifications.allTextContents()
    ])
    
    const liveMessageText = liveMessages.flat().join(' ').toLowerCase()
    
    if (liveMessageText) {
      // Should mention connection, service, or error (not mock)
      expect(
        liveMessageText.includes('service') || 
        liveMessageText.includes('connection') || 
        liveMessageText.includes('error') ||
        liveMessageText.includes('failed')
      ).toBeTruthy()
    }
  })

  test('should maintain data consistency during rapid toggles', async ({ page }) => {
    const liveToggle = page.locator('[data-testid="live-toggle"]').or(page.locator('text=LIVE').locator('..').locator('button'))
    
    // Perform rapid toggles
    for (let i = 0; i < 5; i++) {
      await liveToggle.click()
      await page.waitForTimeout(200)
    }
    
    // Final state check
    await page.waitForTimeout(1000)
    const finalToggleState = await liveToggle.getAttribute('aria-checked')
    const finalContent = await page.content()
    
    // Data should match the final toggle state
    if (finalToggleState === 'true') {
      // LIVE mode - should not have mock services
      expect(finalContent).not.toContain('mfrontend')
      expect(finalContent).not.toContain('mcartservice')
    } else {
      // Mock mode - should have mock services or be loading them
      const hasMockIndicator = 
        finalContent.includes('mock') || 
        finalContent.includes('mfrontend') ||
        finalContent.includes('demo')
      expect(hasMockIndicator).toBeTruthy()
    }
  })
})