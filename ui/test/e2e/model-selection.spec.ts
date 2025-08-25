import { test, expect, Page } from '@playwright/test'

// Test the exact UI behavior the user is experiencing
test.describe('AI Analyzer Model Selection E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to AI Analyzer view
    await page.goto('/insights')
    
    // Wait for the page to load completely
    await page.waitForLoadState('networkidle')
    
    // Ensure the AI Analyzer tab is selected
    await page.getByRole('button', { name: 'AI Analyzer' }).click()
    await page.waitForTimeout(1000) // Allow UI to settle
  })

  test('should show different insights for different models', async ({ page }) => {
    console.log('🎭 Starting model selection UI test...')
    
    // Test each model and capture results
    const models = ['claude', 'gpt', 'llama', 'local-statistical-analyzer']
    const modelResults = new Map<string, { insights: string[], spanCount: string }>()
    
    for (const model of models) {
      console.log(`🔍 Testing model: ${model}`)
      
      // Select the model from dropdown
      await page.getByRole('combobox', { name: /AI Model/i }).click()
      await page.getByRole('option', { name: new RegExp(model, 'i') }).click()
      
      // Set a consistent time range (Last Hour)
      await page.getByRole('combobox', { name: /Quick Select/i }).click()
      await page.getByRole('option', { name: 'Last Hour' }).click()
      
      // Click Analyze button
      await page.getByRole('button', { name: /Analyze/i }).click()
      
      // Wait for analysis to complete
      await page.waitForSelector('[data-testid="insights-results"]', { timeout: 30000 })
      
      // Capture insights titles
      const insightElements = await page.locator('[data-testid="insight-title"]').all()
      const insights = await Promise.all(insightElements.map(el => el.textContent()))
      
      // Capture span count from results header
      const spanCountElement = await page.locator('[data-testid="analysis-summary"]').first()
      const spanCountText = await spanCountElement.textContent() || ''
      const spanCount = spanCountText.match(/(\d+)\s+spans/)?.[1] || '0'
      
      modelResults.set(model, {
        insights: insights.filter(Boolean) as string[],
        spanCount
      })
      
      console.log(`📊 ${model}: ${insights.length} insights, ${spanCount} spans`)
      console.log(`📋 Insights: ${insights.join(', ')}`)
      
      // Take screenshot for debugging
      await page.screenshot({ 
        path: `src/ai-analyzer/test/e2e/screenshots/${model}-results.png`,
        fullPage: true 
      })
    }
    
    // Validate that results are actually different
    const claudeResults = modelResults.get('claude')!
    const gptResults = modelResults.get('gpt')!
    const llamaResults = modelResults.get('llama')!
    const statisticalResults = modelResults.get('local-statistical-analyzer')!
    
    // Statistical should have fewer insights
    expect(statisticalResults.insights.length).toBeLessThan(claudeResults.insights.length)
    
    // Enhanced models should have same count but different content
    expect(claudeResults.insights.length).toBe(gptResults.insights.length)
    expect(gptResults.insights.length).toBe(llamaResults.insights.length)
    
    // Check for model-specific insights
    const claudeTitles = claudeResults.insights.join(' ')
    const gptTitles = gptResults.insights.join(' ')
    const llamaTitles = llamaResults.insights.join(' ')
    const statisticalTitles = statisticalResults.insights.join(' ')
    
    // Statistical should not have enhanced insights
    expect(statisticalTitles).not.toContain('Architectural Pattern')
    expect(statisticalTitles).not.toContain('Performance Optimization')
    expect(statisticalTitles).not.toContain('Resource Utilization')
    
    // Each enhanced model should have its unique insight
    expect(claudeTitles).toContain('Architectural Pattern')
    expect(gptTitles).toContain('Performance Optimization')
    expect(llamaTitles).toContain('Resource Utilization')
    
    // Enhanced models should NOT have each other's unique insights
    expect(gptTitles).not.toContain('Architectural Pattern')
    expect(llamaTitles).not.toContain('Performance Optimization')
    expect(claudeTitles).not.toContain('Resource Utilization')
  })
  
  test('should update model selection indicator in results', async ({ page }) => {
    // Test that the UI shows which model was used
    const testModel = 'claude'
    
    // Select model
    await page.getByRole('combobox', { name: /AI Model/i }).click()
    await page.getByRole('option', { name: new RegExp(testModel, 'i') }).click()
    
    // Run analysis
    await page.getByRole('button', { name: /Analyze/i }).click()
    await page.waitForSelector('[data-testid="insights-results"]')
    
    // Verify model indicator is shown
    const metadataSection = await page.locator('[data-testid="analysis-metadata"]')
    await expect(metadataSection).toContainText(testModel)
  })
  
  test('should handle rapid model switching', async ({ page }) => {
    // Test switching between models quickly (simulating user behavior)
    const switchSequence = ['claude', 'gpt', 'llama']
    
    for (const model of switchSequence) {
      // Quick switch
      await page.getByRole('combobox', { name: /AI Model/i }).click()
      await page.getByRole('option', { name: new RegExp(model, 'i') }).click()
      
      // Brief pause to let UI update
      await page.waitForTimeout(500)
    }
    
    // Run analysis with final selection
    await page.getByRole('button', { name: /Analyze/i }).click()
    await page.waitForSelector('[data-testid="insights-results"]')
    
    // Verify the last selected model is used
    const metadataSection = await page.locator('[data-testid="analysis-metadata"]')
    await expect(metadataSection).toContainText('llama')
  })
  
  test('should debug network requests for model selection', async ({ page }) => {
    // Capture network requests to debug API calls
    const requests: any[] = []
    
    page.on('request', request => {
      if (request.url().includes('/api/ai-analyzer/analyze')) {
        requests.push({
          url: request.url(),
          method: request.method(),
          postData: request.postData(),
          headers: request.headers()
        })
      }
    })
    
    // Test model selection
    await page.getByRole('combobox', { name: /AI Model/i }).click()
    await page.getByRole('option', { name: /claude/i }).click()
    
    await page.getByRole('button', { name: /Analyze/i }).click()
    await page.waitForSelector('[data-testid="insights-results"]')
    
    // Validate request was made with correct model
    expect(requests).toHaveLength(1)
    const requestBody = JSON.parse(requests[0].postData)
    expect(requestBody.config?.llm?.model).toBe('claude')
  })
})