import { test, expect } from '@playwright/test'

// Quick validation test to ensure E2E framework works
test.describe('E2E Framework Validation', () => {
  test('should load AI Analyzer page and basic elements', async ({ page }) => {
    // Navigate to the page - /insights directly shows AI Analyzer
    await page.goto('/insights')
    await page.waitForLoadState('networkidle')
    
    // Wait a moment for the page to fully render
    await page.waitForTimeout(2000)
    
    // Check that essential elements are present
    await expect(page.getByTestId('ai-model-selector')).toBeVisible()
    await expect(page.getByTestId('analyze-button')).toBeVisible()
    await expect(page.getByTestId('time-range-picker').first()).toBeVisible()
    
    // Verify page title contains expected text
    await expect(page.locator('h2')).toContainText('AI-Powered Architecture Analysis')
    
    // Verify model selector has expected options
    await page.getByTestId('ai-model-selector').click()
    await expect(page.getByTestId('model-option-statistical')).toBeVisible()
    await expect(page.getByTestId('model-option-claude')).toBeVisible()
    await expect(page.getByTestId('model-option-gpt')).toBeVisible()
    await expect(page.getByTestId('model-option-llama')).toBeVisible()
    
    console.log('✅ AI Analyzer UI validated successfully')
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
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    
    // Navigate to insights using test ID  
    await page.getByTestId('nav-insights').click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    
    // Verify we're on insights page
    await expect(page.locator('h2')).toContainText('AI-Powered Architecture Analysis')
    
    // Navigate back to traces
    await page.getByTestId('nav-traces').click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    
    // Verify we're back on traces
    await expect(page.getByTestId('traces-page-title')).toContainText('Trace Analysis - Unified Processing')
    
    console.log('✅ Navigation between pages validated successfully')
  })
})