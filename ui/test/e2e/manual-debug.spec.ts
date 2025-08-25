import { test, expect } from '@playwright/test'

// Manual debug test to see what's happening step by step
test.describe('Manual Debug', () => {
  test('manual step-by-step debugging', async ({ page }) => {
    console.log('🔍 Starting manual debug...')
    
    // Enable verbose logging
    page.on('console', msg => console.log(`[PAGE] ${msg.text()}`))
    page.on('request', req => console.log(`[REQ] ${req.method()} ${req.url()}`))
    page.on('response', res => console.log(`[RES] ${res.status()} ${res.url()}`))
    
    // Navigate to page
    console.log('1. Navigating to page...')
    await page.goto('/insights')
    await page.waitForLoadState('networkidle')
    
    // Take screenshot of initial state
    await page.screenshot({ path: 'ui/test/e2e/screenshots/1-initial.png', fullPage: true })
    console.log('✅ Page loaded, screenshot taken')
    
    // Wait for and check model selector
    console.log('2. Checking model selector...')
    const modelSelector = page.getByTestId('ai-model-selector')
    await expect(modelSelector).toBeVisible({ timeout: 10000 })
    
    const currentModel = await modelSelector.textContent()
    console.log(`✅ Model selector found, current: ${currentModel}`)
    
    // Check analyze button
    console.log('3. Checking analyze button...')
    const analyzeButton = page.getByTestId('analyze-button')
    await expect(analyzeButton).toBeVisible()
    const buttonText = await analyzeButton.textContent()
    console.log(`✅ Analyze button found: ${buttonText}`)
    
    // Select Claude and take screenshot
    console.log('4. Selecting Claude model...')
    await modelSelector.click()
    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'ui/test/e2e/screenshots/2-dropdown-open.png', fullPage: true })
    
    await page.getByText('🧠 Claude').click()
    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'ui/test/e2e/screenshots/3-claude-selected.png', fullPage: true })
    
    const newModel = await modelSelector.textContent()
    console.log(`✅ Model changed to: ${newModel}`)
    
    // Click analyze and monitor network
    console.log('5. Starting analysis...')
    const apiResponsePromise = page.waitForResponse(
      response => response.url().includes('/api/ai-analyzer/analyze') && response.status() === 200,
      { timeout: 60000 }
    )
    
    await analyzeButton.click()
    console.log('✅ Analyze button clicked')
    
    // Take screenshot right after click
    await page.screenshot({ path: 'ui/test/e2e/screenshots/4-analysis-started.png', fullPage: true })
    
    try {
      console.log('6. Waiting for API response...')
      const response = await apiResponsePromise
      const responseData = await response.json()
      console.log(`✅ API responded: ${responseData.insights?.length} insights`)
      
      // Wait a bit more for UI to update
      await page.waitForTimeout(5000)
      await page.screenshot({ path: 'ui/test/e2e/screenshots/5-after-api-response.png', fullPage: true })
      
      // Check if results appeared
      const resultsVisible = await page.locator('[data-testid="insights-results"]').isVisible()
      console.log(`Results visible: ${resultsVisible}`)
      
      if (resultsVisible) {
        const insights = await page.locator('[data-testid="insight-title"]').allTextContents()
        console.log(`✅ Found ${insights.length} insights: ${insights.join(', ')}`)
      } else {
        console.log('❌ Results not visible in UI despite API success')
      }
      
    } catch (error) {
      console.log(`❌ API call failed: ${error}`)
      await page.screenshot({ path: 'ui/test/e2e/screenshots/5-api-failed.png', fullPage: true })
    }
    
    console.log('🎯 Manual debug complete')
  })
})