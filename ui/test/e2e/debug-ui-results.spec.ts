import { test, expect } from '@playwright/test'

// Test to capture what the UI actually shows vs what API returns
test.describe('UI Results Debug', () => {
  test('should compare UI results with API responses', async ({ page }) => {
    console.log('🔍 Debugging UI vs API results...')
    
    const apiResponses = []
    const uiResults = []
    
    // Capture API responses
    page.on('response', async response => {
      if (response.url().includes('/api/ai-analyzer/analyze') && response.status() === 200) {
        try {
          const data = await response.json()
          apiResponses.push({
            model: data.metadata?.selectedModel || 'unknown',
            insights: data.insights?.map(i => i.title) || []
          })
          console.log(`[API RESPONSE] Model: ${data.metadata?.selectedModel}, Insights: ${data.insights?.length}`)
        } catch (e) {
          console.log('[API RESPONSE] Failed to parse:', e)
        }
      }
    })
    
    await page.goto('/insights')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    
    const models = ['🧠 Claude', '🤖 GPT-4', '🦙 Llama']
    
    for (const modelName of models) {
      console.log(`\n🔍 Testing ${modelName}...`)
      
      // Select model
      await page.getByTestId('ai-model-selector').click()
      await page.waitForTimeout(1000)
      await page.getByText(modelName).click()
      
      // Run analysis
      await page.getByTestId('analyze-button').click()
      
      // Wait for API response
      await page.waitForResponse(
        response => response.url().includes('/api/ai-analyzer/analyze') && response.status() === 200,
        { timeout: 30000 }
      )
      
      // Wait for UI to update
      await page.waitForTimeout(3000)
      
      // Click AI-Powered Insights tab to see results
      await page.getByRole('tab', { name: '💡 AI-Powered Insights' }).click()
      await page.waitForTimeout(2000)
      
      // Capture what UI actually shows
      const uiInsights = await page.locator('[data-testid="insight-title"]').allTextContents()
      uiResults.push({
        model: modelName,
        insights: uiInsights
      })
      
      console.log(`[UI DISPLAY] ${modelName}: ${uiInsights.length} insights`)
      console.log(`[UI TITLES] ${uiInsights.join(', ')}`)
      
      // Take screenshot
      await page.screenshot({ 
        path: `ui/test/e2e/screenshots/${modelName.replace(/[^a-zA-Z0-9]/g, '-')}-ui-results.png`,
        fullPage: true 
      })
    }
    
    // Compare API vs UI
    console.log('\n🧪 API vs UI Comparison:')
    
    for (let i = 0; i < Math.min(apiResponses.length, uiResults.length); i++) {
      const api = apiResponses[i]
      const ui = uiResults[i]
      
      console.log(`\n${ui.model}:`)
      console.log(`  API Insights: ${api.insights.join(', ')}`)
      console.log(`  UI Shows: ${ui.insights.join(', ')}`)
      console.log(`  Match: ${JSON.stringify(api.insights.sort()) === JSON.stringify(ui.insights.sort())}`)
    }
    
    // Check if all UI results are identical (the user's issue)
    const allUiSame = uiResults.every(result => 
      JSON.stringify(result.insights.sort()) === JSON.stringify(uiResults[0].insights.sort())
    )
    
    if (allUiSame) {
      console.log('\n❌ CONFIRMED: UI shows identical results for all models')
      console.log('This confirms the user\'s issue - despite API working, UI is not updating')
    } else {
      console.log('\n✅ UI shows different results for different models')
    }
    
    // Log insights for manual verification
    console.log('\n📋 All UI Results:')
    uiResults.forEach(result => {
      console.log(`${result.model}: [${result.insights.join(', ')}]`)
    })
  })
})