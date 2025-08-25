import { test, expect, Page } from '@playwright/test'

// Reproduction test for user's exact issue:
// "the only thing that changes is the span counts, same number (4) insights"
test.describe('User Issue Reproduction: Model Selection Not Working', () => {
  test.beforeEach(async ({ page }) => {
    // Start with clean state - /insights directly shows AI Analyzer
    await page.goto('/insights')
    await page.waitForLoadState('networkidle')
    
    // Wait for page to fully render
    await page.waitForTimeout(2000)
    
    // Verify we're on the AI Analyzer page
    await page.waitForSelector('h2:has-text("AI-Powered Architecture Analysis")', { timeout: 10000 })
  })

  test('should reproduce user issue with model selection', async ({ page }) => {
    console.log('🔍 Reproducing user issue: model selection not changing insights')
    
    // Capture network requests for debugging
    const apiRequests: any[] = []
    page.on('request', request => {
      if (request.url().includes('/api/ai-analyzer/analyze')) {
        apiRequests.push({
          url: request.url(),
          method: request.method(),
          postData: request.postData(),
          timestamp: new Date().toISOString()
        })
      }
    })
    
    const apiResponses: any[] = []
    page.on('response', async response => {
      if (response.url().includes('/api/ai-analyzer/analyze')) {
        try {
          const responseBody = await response.json()
          apiResponses.push({
            status: response.status(),
            body: responseBody,
            timestamp: new Date().toISOString()
          })
        } catch (e) {
          console.log('Failed to parse response:', e)
        }
      }
    })
    
    // Test Claude model first
    console.log('📡 Testing Claude model...')
    await page.getByTestId('ai-model-selector').click()
    await page.waitForTimeout(1000) // Wait for dropdown to open
    await page.getByText('🧠 Claude').click()
    
    // Skip time range selection - use default
    // Click analyze
    await page.getByTestId('analyze-button').click()
    
    // Wait for results
    await page.waitForSelector('[data-testid="insights-results"]', { timeout: 30000 })
    
    // Capture Claude results
    const claudeInsights = await page.locator('[data-testid="insight-title"]').allTextContents()
    const claudeSpanCount = await page.locator('[data-testid="analysis-summary"]').first().textContent()
    const claudeMetadata = await page.locator('[data-testid="analysis-metadata"]').first().textContent()
    
    console.log(`📊 Claude: ${claudeInsights.length} insights`)
    console.log(`📋 Claude insights: ${claudeInsights.join(', ')}`)
    console.log(`🔢 Claude span count: ${claudeSpanCount}`)
    console.log(`🎯 Claude metadata: ${claudeMetadata}`)
    
    // Screenshot for comparison
    await page.screenshot({ 
      path: 'src/ai-analyzer/test/e2e/screenshots/claude-reproduction.png',
      fullPage: true 
    })
    
    // Test GPT model
    console.log('📡 Testing GPT model...')
    await page.getByTestId('ai-model-selector').click()
    await page.waitForTimeout(1000)
    await page.getByText('🤖 GPT-4').click()
    
    // Click analyze again
    await page.getByTestId('analyze-button').click()
    
    // Wait for results
    await page.waitForSelector('[data-testid="insights-results"]', { timeout: 30000 })
    
    // Capture GPT results
    const gptInsights = await page.locator('[data-testid="insight-title"]').allTextContents()
    const gptSpanCount = await page.locator('[data-testid="analysis-summary"]').first().textContent()
    const gptMetadata = await page.locator('[data-testid="analysis-metadata"]').first().textContent()
    
    console.log(`📊 GPT: ${gptInsights.length} insights`)
    console.log(`📋 GPT insights: ${gptInsights.join(', ')}`)
    console.log(`🔢 GPT span count: ${gptSpanCount}`)
    console.log(`🎯 GPT metadata: ${gptMetadata}`)
    
    // Screenshot for comparison
    await page.screenshot({ 
      path: 'src/ai-analyzer/test/e2e/screenshots/gpt-reproduction.png',
      fullPage: true 
    })
    
    // Test Llama model
    console.log('📡 Testing Llama model...')
    await page.getByTestId('ai-model-selector').click()
    await page.waitForTimeout(1000)
    await page.getByText('🦙 Llama').click()
    
    // Click analyze again
    await page.getByTestId('analyze-button').click()
    
    // Wait for results
    await page.waitForSelector('[data-testid="insights-results"]', { timeout: 30000 })
    
    // Capture Llama results
    const llamaInsights = await page.locator('[data-testid="insight-title"]').allTextContents()
    const llamaSpanCount = await page.locator('[data-testid="analysis-summary"]').first().textContent()
    const llamaMetadata = await page.locator('[data-testid="analysis-metadata"]').first().textContent()
    
    console.log(`📊 Llama: ${llamaInsights.length} insights`)
    console.log(`📋 Llama insights: ${llamaInsights.join(', ')}`)
    console.log(`🔢 Llama span count: ${llamaSpanCount}`)
    console.log(`🎯 Llama metadata: ${llamaMetadata}`)
    
    // Screenshot for comparison
    await page.screenshot({ 
      path: 'src/ai-analyzer/test/e2e/screenshots/llama-reproduction.png',
      fullPage: true 
    })
    
    // Debug API requests
    console.log('\n🔍 API Debugging:')
    apiRequests.forEach((req, index) => {
      console.log(`Request ${index + 1}:`, {
        timestamp: req.timestamp,
        postData: req.postData ? JSON.parse(req.postData) : null
      })
    })
    
    apiResponses.forEach((res, index) => {
      console.log(`Response ${index + 1}:`, {
        timestamp: res.timestamp,
        status: res.status,
        insights: res.body.insights?.length,
        metadata: res.body.metadata
      })
    })
    
    // Validate the user's reported issue
    console.log('\n🧪 Validating User Issue:')
    
    // User reports: "same number (4) insights"
    console.log(`Claude insights count: ${claudeInsights.length}`)
    console.log(`GPT insights count: ${gptInsights.length}`)
    console.log(`Llama insights count: ${llamaInsights.length}`)
    
    // User reports: "only thing that changes is the span counts"
    const spanCountRegex = /(\d+) spans/
    const claudeSpanCountNum = claudeSpanCount?.match(spanCountRegex)?.[1]
    const gptSpanCountNum = gptSpanCount?.match(spanCountRegex)?.[1]
    const llamaSpanCountNum = llamaSpanCount?.match(spanCountRegex)?.[1]
    
    console.log(`Claude span count: ${claudeSpanCountNum}`)
    console.log(`GPT span count: ${gptSpanCountNum}`)
    console.log(`Llama span count: ${llamaSpanCountNum}`)
    
    // Check if insights are actually different
    const insightsAreSame = 
      JSON.stringify(claudeInsights) === JSON.stringify(gptInsights) &&
      JSON.stringify(gptInsights) === JSON.stringify(llamaInsights)
    
    console.log(`Insights are identical: ${insightsAreSame}`)
    
    // Expected behavior based on our backend tests
    if (insightsAreSame) {
      console.log('❌ CONFIRMED: User issue reproduced - insights are identical across models')
      console.log('🔍 This indicates a UI state management or API request issue')
      
      // Log the actual insight titles to debug
      console.log('Actual insight titles:', {
        claude: claudeInsights,
        gpt: gptInsights,
        llama: llamaInsights
      })
      
      // Check if API requests are actually different
      const uniqueConfigs = new Set(
        apiRequests.map(req => 
          req.postData ? JSON.stringify(JSON.parse(req.postData).config) : 'no-config'
        )
      )
      console.log(`Unique API configurations sent: ${uniqueConfigs.size}`)
      console.log('API configs:', [...uniqueConfigs])
      
      // This test should fail to highlight the issue
      expect.soft(insightsAreSame).toBe(false)
    } else {
      console.log('✅ Model selection working correctly - different insights per model')
      
      // Verify expected model-specific insights
      const claudeInsightsText = claudeInsights.join(' ')
      const gptInsightsText = gptInsights.join(' ')
      const llamaInsightsText = llamaInsights.join(' ')
      
      expect.soft(claudeInsightsText).toContain('Architectural Pattern')
      expect.soft(gptInsightsText).toContain('Performance Optimization')
      expect.soft(llamaInsightsText).toContain('Resource Utilization')
    }
  })
  
  test('should validate UI state updates when changing models', async ({ page }) => {
    console.log('🔍 Testing UI state management for model selection')
    
    // Test that the UI actually reflects model changes
    const models = [
      { value: 'claude', label: 'Claude' },
      { value: 'gpt', label: 'GPT' },
      { value: 'llama', label: 'Llama' }
    ]
    
    for (const model of models) {
      console.log(`🔄 Switching to ${model.value}...`)
      
      // Select model
      await page.getByTestId('ai-model-selector').click()
      await page.getByRole('option', { name: new RegExp(model.label, 'i') }).click()
      
      // Verify the selector shows the correct value
      const selectedValue = await page.getByTestId('ai-model-selector').textContent()
      console.log(`Selected value in UI: ${selectedValue}`)
      
      // Brief analysis to check state propagation
      await page.getByTestId('analyze-button').click()
      await page.waitForSelector('[data-testid="insights-results"]', { timeout: 30000 })
      
      // Check metadata shows correct model
      const metadataText = await page.locator('[data-testid="analysis-metadata"]').first().textContent()
      console.log(`Metadata shows: ${metadataText}`)
      
      // The metadata should contain the selected model
      expect.soft(metadataText).toContain(model.value)
    }
  })
})