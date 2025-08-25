import { test, expect } from '@playwright/test'

test.describe('Complete Model Selection Debug', () => {
  test('should capture everything - API responses, DOM content, and validate differences', async ({ page }) => {
    console.log('🔍 Complete debugging test started...')
    
    const apiData = []
    const consoleMessages = []
    
    // Capture all console messages
    page.on('console', msg => {
      const text = msg.text()
      consoleMessages.push({
        type: msg.type(),
        text: text,
        timestamp: new Date().toISOString()
      })
      console.log(`[BROWSER CONSOLE] ${msg.type()}: ${text}`)
    })
    
    // Capture API responses with full content
    page.on('response', async response => {
      if (response.url().includes('/api/ai-analyzer/analyze') && response.status() === 200) {
        try {
          const responseText = await response.text()
          const responseData = JSON.parse(responseText)
          
          apiData.push({
            url: response.url(),
            status: response.status(),
            headers: response.headers(),
            contentLength: responseText.length,
            insights: responseData.insights?.map(i => ({
              title: i.title,
              description: i.description,
              severity: i.severity
            })) || [],
            metadata: responseData.metadata,
            fullResponse: responseData
          })
          
          console.log(`\n📥 API RESPONSE CAPTURED:`)
          console.log(`   Content Length: ${responseText.length} bytes`)
          console.log(`   Model: ${responseData.metadata?.selectedModel}`)
          console.log(`   Insights: ${responseData.insights?.length}`)
          console.log(`   Titles: ${responseData.insights?.map(i => i.title).join(', ')}`)
        } catch (e) {
          console.log(`[API RESPONSE ERROR] ${e.message}`)
        }
      }
    })
    
    await page.goto('/insights')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    
    const models = [
      { ui: '🧠 Claude', expected: 'claude' },
      { ui: '🤖 GPT-4', expected: 'gpt' }
    ]
    
    const results = []
    
    for (const model of models) {
      console.log(`\n🎯 TESTING: ${model.ui}`)
      
      // Clear previous API data for this iteration
      const apiCountBefore = apiData.length
      
      // Select model
      await page.getByTestId('ai-model-selector').click()
      await page.waitForTimeout(500)
      await page.getByText(model.ui).click()
      console.log(`   ✓ Selected: ${model.ui}`)
      
      // Run analysis
      await page.getByTestId('analyze-button').click()
      console.log(`   ✓ Clicked analyze button`)
      
      // Wait for API response
      await page.waitForResponse(
        response => response.url().includes('/api/ai-analyzer/analyze') && response.status() === 200,
        { timeout: 60000 }
      )
      console.log(`   ✓ API response received`)
      
      // Wait for UI to update
      await page.waitForTimeout(3000)
      
      // Navigate to insights tab
      await page.getByRole('tab', { name: '💡 AI-Powered Insights' }).click()
      await page.waitForTimeout(2000)
      console.log(`   ✓ Opened insights tab`)
      
      // Capture DOM content
      const uiInsights = await page.locator('[data-testid="insight-title"]').allTextContents()
      const insightCards = await page.locator('[data-testid="insights-results"] .ant-col').count()
      
      // Get the API data for this request
      const newApiData = apiData.slice(apiCountBefore)
      const currentApiData = newApiData[newApiData.length - 1] // Most recent
      
      results.push({
        model: model.ui,
        expectedModel: model.expected,
        api: currentApiData ? {
          model: currentApiData.metadata?.selectedModel,
          contentLength: currentApiData.contentLength,
          insightCount: currentApiData.insights.length,
          insights: currentApiData.insights.map(i => i.title)
        } : null,
        ui: {
          insightCount: uiInsights.length,
          insights: uiInsights,
          cardCount: insightCards
        }
      })
      
      console.log(`   📊 API Data: ${currentApiData?.insights.length} insights, ${currentApiData?.contentLength} bytes`)
      console.log(`   🖼️ UI Shows: ${uiInsights.length} insights`)
      console.log(`   📋 UI Titles: ${uiInsights.join(', ')}`)
      
      // Take screenshot
      await page.screenshot({
        path: `ui/test/e2e/screenshots/complete-debug-${model.expected}.png`,
        fullPage: true
      })
    }
    
    // COMPREHENSIVE ANALYSIS
    console.log(`\n🧪 COMPREHENSIVE ANALYSIS:`)
    console.log(`=`.repeat(80))
    
    // Check if we have both results
    if (results.length !== 2) {
      console.log(`❌ FAILED: Expected 2 results, got ${results.length}`)
      return
    }
    
    const [claudeResult, gptResult] = results
    
    // API Analysis
    console.log(`\n📡 API ANALYSIS:`)
    if (claudeResult.api && gptResult.api) {
      const apiDifferent = JSON.stringify(claudeResult.api.insights.sort()) !== JSON.stringify(gptResult.api.insights.sort())
      const sizeDifferent = Math.abs(claudeResult.api.contentLength - gptResult.api.contentLength) > 10
      
      console.log(`   Claude API: ${claudeResult.api.model}, ${claudeResult.api.contentLength} bytes, ${claudeResult.api.insightCount} insights`)
      console.log(`   GPT API: ${gptResult.api.model}, ${gptResult.api.contentLength} bytes, ${gptResult.api.insightCount} insights`)
      console.log(`   Models correct: ${claudeResult.api.model === 'claude' && gptResult.api.model === 'gpt' ? '✅' : '❌'}`)
      console.log(`   Content different: ${apiDifferent ? '✅' : '❌'}`)
      console.log(`   Size different: ${sizeDifferent ? '✅' : '❌'}`)
      
      if (apiDifferent) {
        console.log(`   Claude insights: [${claudeResult.api.insights.join(', ')}]`)
        console.log(`   GPT insights: [${gptResult.api.insights.join(', ')}]`)
      }
    } else {
      console.log(`   ❌ Missing API data`)
    }
    
    // UI Analysis
    console.log(`\n🖼️ UI ANALYSIS:`)
    const uiDifferent = JSON.stringify(claudeResult.ui.insights.sort()) !== JSON.stringify(gptResult.ui.insights.sort())
    
    console.log(`   Claude UI: ${claudeResult.ui.insightCount} insights`)
    console.log(`   GPT UI: ${gptResult.ui.insightCount} insights`)
    console.log(`   UI different: ${uiDifferent ? '✅' : '❌'}`)
    
    if (!uiDifferent) {
      console.log(`   ❌ PROBLEM: UI shows identical content for both models`)
      console.log(`   Claude UI: [${claudeResult.ui.insights.join(', ')}]`)
      console.log(`   GPT UI: [${gptResult.ui.insights.join(', ')}]`)
    } else {
      console.log(`   ✅ UI shows different content`)
      console.log(`   Claude UI: [${claudeResult.ui.insights.join(', ')}]`)
      console.log(`   GPT UI: [${gptResult.ui.insights.join(', ')}]`)
    }
    
    // Console Messages Analysis
    console.log(`\n📝 CONSOLE ANALYSIS:`)
    console.log(`   Total console messages: ${consoleMessages.length}`)
    
    const debugMessages = consoleMessages.filter(msg => 
      msg.text.includes('🚀') || msg.text.includes('🎯') || msg.text.includes('🔍') || 
      msg.text.includes('📊') || msg.text.includes('🎨') || msg.text.includes('🖼️')
    )
    console.log(`   Debug messages: ${debugMessages.length}`)
    
    if (debugMessages.length === 0) {
      console.log(`   ❌ No debug messages found - JavaScript may not be running correctly`)
    }
    
    // Final verdict
    console.log(`\n🎯 FINAL VERDICT:`)
    if (claudeResult.api && gptResult.api) {
      const apiWorking = claudeResult.api.model === 'claude' && gptResult.api.model === 'gpt' && 
                        JSON.stringify(claudeResult.api.insights.sort()) !== JSON.stringify(gptResult.api.insights.sort())
      const uiWorking = uiDifferent
      
      if (apiWorking && uiWorking) {
        console.log(`   ✅ BOTH API AND UI WORKING CORRECTLY`)
      } else if (apiWorking && !uiWorking) {
        console.log(`   ❌ API WORKS BUT UI BROKEN - React state/rendering issue`)
      } else if (!apiWorking && !uiWorking) {
        console.log(`   ❌ BOTH API AND UI BROKEN - Backend issue`)
      } else {
        console.log(`   🤔 UNEXPECTED RESULT - Needs investigation`)
      }
    } else {
      console.log(`   ❌ INSUFFICIENT DATA - API responses not captured`)
    }
  })
})