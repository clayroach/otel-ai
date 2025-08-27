import { expect, test } from '@playwright/test'

// Types for network request tracking
interface NetworkRequest {
  url: string;
  method: string;
  postData: string | null;
  headers: Record<string, string>;
}

// Test the exact UI behavior the user is experiencing
test.describe('AI Analyzer Model Selection E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to AI Analyzer view (insights page loads AI analyzer directly)
    await page.goto('/insights')
    
    // Wait for the page to load completely
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000) // Allow UI to settle
  })

  test('should show different insights for different models', async ({ page }) => {
    console.log('🎭 Starting model selection UI test...')
    
    // Test each model and capture results
    const models = ['claude', 'gpt', 'llama', 'local-statistical-analyzer']
    const modelResults = new Map<string, { insights: string[], spanCount: string }>()
    
    for (const model of models) {
      console.log(`🔍 Testing model: ${model}`)
      
      // Select the model from dropdown using proper test IDs
      await page.getByTestId('ai-model-selector').click()
      await page.waitForTimeout(500)
      
      // Use proper test IDs instead of role-based selectors
      const testIdMap: Record<string, string> = {
        'claude': 'model-option-claude',
        'gpt': 'model-option-gpt', 
        'llama': 'model-option-llama',
        'local-statistical-analyzer': 'model-option-statistical'
      }
      await page.getByTestId(testIdMap[model] || `model-option-${model}`).click()
      await page.waitForTimeout(500)
      
      // Click Analyze button  
      await page.getByTestId('analyze-button').click()
      
      // Wait for analysis to complete
      await page.waitForSelector('[data-testid="insights-results"]', { timeout: 30000 })
      
      // Click on the AI-Powered Insights tab to see the actual insights
      await page.getByTestId('insights-tab-button').click()
      await page.waitForTimeout(1000)
      
      // Capture insights titles
      const insightElements = await page.locator('[data-testid="insight-title"]').all()
      const insights = await Promise.all(insightElements.map(el => el.textContent()))
      
      // Capture span count from results header - look inside the Alert description
      let spanCount = '0'
      try {
        const summaryElement = await page.locator('[data-testid="analysis-summary"]').first()
        await summaryElement.waitFor({ timeout: 10000 })
        const spanCountText = await summaryElement.textContent() || ''
        const spanMatch = spanCountText.match(/(\d+(?:,\d+)*)\s+spans/)
        spanCount = spanMatch?.[1]?.replace(/,/g, '') || '0'
      } catch (error) {
        console.log(`⚠️ Could not find analysis summary for ${model}, using default span count`)
      }
      
      modelResults.set(model, {
        insights: insights.filter(Boolean) as string[],
        spanCount
      })
      
      console.log(`📊 ${model}: ${insights.length} insights, ${spanCount} spans`)
      console.log(`📋 Insights: ${insights.join(', ')}`)
      
      // Take screenshot focusing on results area and model selector
      // First, ensure the model selector and results are visible
      await page.locator('[data-testid="ai-model-selector"]').first().scrollIntoViewIfNeeded()
      await page.waitForTimeout(1000) // Allow UI to settle
      
      await page.screenshot({ 
        path: `target/screenshots/${model}-results.png`,
        fullPage: false,  // Focus on viewport
        clip: {
          x: 0,
          y: 0, 
          width: 1200,
          height: 800
        }
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
    
    // Select model using proper test ID
    await page.getByTestId('ai-model-selector').click()
    await page.getByTestId('model-option-claude').click()
    
    // Run analysis
    await page.getByTestId('analyze-button').click()
    await page.waitForSelector('[data-testid="insights-results"]')
    
    // Verify model indicator is shown
    const metadataSection = await page.locator('[data-testid="analysis-metadata"]')
    await expect(metadataSection).toContainText(testModel)
  })
  
  test('should handle rapid model switching', async ({ page }) => {
    // Test switching between models quickly (simulating user behavior)
    const switchSequence = ['claude', 'gpt', 'llama']
    
    const testIdMap: Record<string, string> = {
      'claude': 'model-option-claude',
      'gpt': 'model-option-gpt', 
      'llama': 'model-option-llama'
    }
    
    for (const model of switchSequence) {
      // Quick switch using proper test IDs
      const testId = testIdMap[model]
      if (!testId) {
        throw new Error(`Unknown model in test: ${model}`)
      }
      await page.getByTestId('ai-model-selector').click()
      await page.getByTestId(testId).click()
      
      // Brief pause to let UI update
      await page.waitForTimeout(500)
    }
    
    // Run analysis with final selection
    await page.getByTestId('analyze-button').click()
    await page.waitForSelector('[data-testid="insights-results"]')
    
    // Verify the last selected model is used
    const metadataSection = await page.locator('[data-testid="analysis-metadata"]')
    await expect(metadataSection).toContainText('llama')
  })
  
  test('should debug network requests for model selection', async ({ page }) => {
    // Capture network requests to debug API calls
    const requests: NetworkRequest[] = []
    
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
    
    // Test model selection using proper test IDs
    await page.getByTestId('ai-model-selector').click()
    await page.getByTestId('model-option-claude').click()
    
    await page.getByTestId('analyze-button').click()
    await page.waitForSelector('[data-testid="insights-results"]')
    
    // Validate request was made with correct model
    expect(requests).toHaveLength(1)
    const postData = requests[0]?.postData
    if (postData) {
      const requestBody = JSON.parse(postData)
      expect(requestBody.config?.llm?.model).toBe('claude')
    }
  })
})