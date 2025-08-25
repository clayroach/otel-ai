import { test, expect } from '@playwright/test'

// Test to check if caching is causing the UI issue
test.describe('Cache Debug', () => {
  test('should force browser refresh and validate different results', async ({ page }) => {
    console.log('🔍 Testing cache behavior with hard refresh...')
    
    await page.goto('/insights')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    
    const models = ['🧠 Claude', '🤖 GPT-4']
    const results = []
    
    for (let i = 0; i < models.length; i++) {
      const modelName = models[i]
      console.log(`\n🔍 Testing ${modelName} (iteration ${i + 1})...`)
      
      // Force hard refresh on second iteration to clear cache
      if (i > 0) {
        console.log('🔄 Performing hard refresh to clear cache...')
        await page.reload({ waitUntil: 'networkidle' })
        await page.waitForTimeout(3000)
      }
      
      // Select model
      await page.getByTestId('ai-model-selector').click()
      await page.waitForTimeout(1000)
      await page.getByText(modelName).click()
      
      // Capture network request
      const responsePromise = page.waitForResponse(
        response => response.url().includes('/api/ai-analyzer/analyze') && response.status() === 200
      )
      
      // Run analysis
      await page.getByTestId('analyze-button').click()
      
      const response = await responsePromise
      const responseData = await response.json()
      
      // Check cache headers
      const cacheControl = response.headers()['cache-control']
      console.log(`Cache-Control header: ${cacheControl}`)
      
      results.push({
        model: modelName,
        insights: responseData.insights?.map(i => i.title) || [],
        cacheHeaders: response.headers(),
        requestId: responseData.requestId
      })
      
      // Wait for UI to update and capture what's shown
      await page.waitForTimeout(3000)
      await page.getByRole('tab', { name: '💡 AI-Powered Insights' }).click()
      await page.waitForTimeout(2000)
      
      const uiInsights = await page.locator('[data-testid="insight-title"]').allTextContents()
      results[i].uiInsights = uiInsights
      
      console.log(`API insights: ${results[i].insights.join(', ')}`)
      console.log(`UI shows: ${uiInsights.join(', ')}`)
      console.log(`Request ID: ${results[i].requestId}`)
    }
    
    // Compare results
    console.log('\n🧪 Cache Analysis:')
    
    if (results.length >= 2) {
      const apiSame = JSON.stringify(results[0].insights) === JSON.stringify(results[1].insights)
      const uiSame = JSON.stringify(results[0].uiInsights) === JSON.stringify(results[1].uiInsights)
      const sameRequestId = results[0].requestId === results[1].requestId
      
      console.log(`API responses identical: ${apiSame}`)
      console.log(`UI displays identical: ${uiSame}`)
      console.log(`Same request ID: ${sameRequestId}`)
      
      if (sameRequestId) {
        console.log('❌ CACHE ISSUE: Same request ID indicates response caching')
      } else if (apiSame && !uiSame) {
        console.log('❌ API returns same results despite different models')
      } else if (!apiSame && uiSame) {
        console.log('❌ UI ISSUE: API returns different results but UI shows same')
      } else if (!apiSame && !uiSame) {
        console.log('✅ Both API and UI working correctly')
      }
    }
  })
})