import { test, expect } from '@playwright/test'

// Debug with console logs to see state changes
test.describe('Debug with Console Logs', () => {
  test('should show debug logs for model selection', async ({ page }) => {
    console.log('🔍 Starting debug with console logs...')
    
    // Capture all console logs
    page.on('console', msg => {
      if (msg.text().includes('DEBUG:')) {
        console.log(`[CONSOLE] ${msg.text()}`)
      }
    })
    
    // Capture API requests
    const apiRequests = []
    page.on('request', request => {
      if (request.url().includes('/api/ai-analyzer/analyze')) {
        const payload = request.postData()
        apiRequests.push({
          payload: payload ? JSON.parse(payload) : null
        })
        console.log(`[API] Model in request: ${JSON.parse(payload || '{}').config?.llm?.model}`)
      }
    })
    
    await page.goto('/insights')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    
    // Test GPT model specifically
    console.log('\n1. Testing GPT-4 selection...')
    await page.getByTestId('ai-model-selector').click()
    await page.waitForTimeout(1000)
    await page.getByText('🤖 GPT-4').click()
    await page.waitForTimeout(1000)
    
    console.log('\n2. Running analysis...')
    await page.getByTestId('analyze-button').click()
    
    await page.waitForResponse(
      response => response.url().includes('/api/ai-analyzer/analyze'),
      { timeout: 30000 }
    )
    
    await page.waitForTimeout(2000)
    
    // Check the actual API request
    if (apiRequests.length > 0) {
      const sentModel = apiRequests[0].payload?.config?.llm?.model
      console.log(`\n📊 Final Analysis:`)
      console.log(`Model sent in API: ${sentModel}`)
      console.log(`Expected: gpt`)
      console.log(`Match: ${sentModel === 'gpt'}`)
    }
  })
})