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
    await expect(page.getByTestId('time-range-picker')).toBeVisible()
    
    // Verify page title contains expected text
    await expect(page.locator('h2')).toContainText('AI-Powered Architecture Analysis')
    
    // Verify model selector has expected options
    await page.getByTestId('ai-model-selector').click()
    await expect(page.getByText('Statistical Analysis')).toBeVisible()
    await expect(page.getByText('Claude')).toBeVisible()
    await expect(page.getByText('GPT-4')).toBeVisible()
    await expect(page.getByText('Llama')).toBeVisible()
    
    console.log('✅ E2E framework setup validated successfully')
  })
})