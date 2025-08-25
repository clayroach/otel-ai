import { test, expect } from '@playwright/test'

// Test to exactly mimic user's manual process
test.describe('Manual Process Debug', () => {
  test('should mimic exact user workflow and capture all state', async ({ page }) => {
    console.log('🔍 Mimicking exact user workflow...')
    
    // Enable request/response logging
    const requests = []
    const responses = []
    
    page.on('request', request => {
      if (request.url().includes('/api/ai-analyzer/analyze')) {
        requests.push({
          url: request.url(),
          method: request.method(),
          postData: request.postData(),
          headers: request.headers()
        })
        console.log(`📤 REQUEST: ${request.method()} ${request.url()}`)
        console.log(`📤 PAYLOAD: ${request.postData()}`)
      }
    })
    
    page.on('response', async response => {
      if (response.url().includes('/api/ai-analyzer/analyze') && response.status() === 200) {
        try {
          const data = await response.json()
          responses.push({
            model: data.metadata?.selectedModel,
            insights: data.insights?.map(i => i.title) || [],
            requestId: data.requestId,
            timestamp: new Date().toISOString()
          })
          console.log(`📥 RESPONSE: Model=${data.metadata?.selectedModel}, Insights=${data.insights?.length}, ID=${data.requestId}`)
        } catch (e) {
          console.log('📥 RESPONSE: Failed to parse', e.message)
        }
      }
    })
    
    // Step 1: Load page
    console.log('\n🚀 Step 1: Loading page...')
    await page.goto('/insights')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    
    // Step 2: Test each model exactly as user would
    const modelsToTest = ['🧠 Claude', '🤖 GPT-4', '🦙 Llama', '🔬 Statistical Analysis']
    const results = []
    
    for (let i = 0; i < modelsToTest.length; i++) {
      const modelName = modelsToTest[i]
      console.log(`\n🎯 Step ${i + 2}: Testing ${modelName}`)
      
      // Clear previous results first (simulate user expectation)
      console.log('  🧹 Clearing previous state...')
      
      // Select model
      console.log('  📋 Selecting model from dropdown...')
      await page.getByTestId('ai-model-selector').click()
      await page.waitForTimeout(500)
      await page.getByText(modelName).click()
      console.log(`  ✓ Selected: ${modelName}`)
      
      // Run analysis
      console.log('  ⚡ Running analysis...')
      const responsePromise = page.waitForResponse(
        response => response.url().includes('/api/ai-analyzer/analyze') && response.status() === 200,
        { timeout: 30000 }
      )
      
      await page.getByTestId('analyze-button').click()
      console.log('  ✓ Clicked analyze button')
      
      // Wait for response
      const response = await responsePromise
      const responseData = await response.json()
      console.log(`  ✓ Got API response: ${responseData.insights?.length} insights`)
      
      // Wait for UI update
      console.log('  ⏳ Waiting for UI to update...')
      await page.waitForTimeout(3000)
      
      // Go to insights tab
      console.log('  📊 Opening insights tab...')
      await page.getByRole('tab', { name: '💡 AI-Powered Insights' }).click()
      await page.waitForTimeout(2000)
      
      // Capture what UI shows
      const uiInsights = await page.locator('[data-testid="insight-title"]').allTextContents()
      console.log(`  👀 UI shows: [${uiInsights.join(', ')}]`)
      
      results.push({
        step: i + 2,
        model: modelName,
        apiInsights: responseData.insights?.map(i => i.title) || [],
        uiInsights: uiInsights,
        requestId: responseData.requestId,
        timestamp: new Date().toISOString()
      })
      
      // Take screenshot of current state
      await page.screenshot({ 
        path: `ui/test/e2e/screenshots/manual-debug-${i + 1}-${modelName.replace(/[^a-zA-Z0-9]/g, '-')}.png`,
        fullPage: true 
      })
      
      console.log(`  ✅ Step ${i + 2} complete`)
    }
    
    // Comprehensive analysis
    console.log('\n🧪 COMPREHENSIVE ANALYSIS:')
    console.log('=' .repeat(60))
    
    // Check for identical results (user's issue)
    const allUiInsights = results.map(r => r.uiInsights.sort().join('|'))
    const allApiInsights = results.map(r => r.apiInsights.sort().join('|'))
    
    const uiAllSame = allUiInsights.every(insights => insights === allUiInsights[0])
    const apiAllSame = allApiInsights.every(insights => insights === allApiInsights[0])
    
    console.log(`\n📊 RESULTS COMPARISON:`)
    console.log(`UI all identical: ${uiAllSame ? '❌ YES (USER\'S ISSUE CONFIRMED)' : '✅ NO'}`)
    console.log(`API all identical: ${apiAllSame ? '❌ YES (BACKEND ISSUE)' : '✅ NO'}`)
    
    // Detailed breakdown
    console.log(`\n📋 DETAILED BREAKDOWN:`)
    results.forEach((result, idx) => {
      console.log(`\n${idx + 1}. ${result.model}:`)
      console.log(`   API: [${result.apiInsights.join(', ')}]`)
      console.log(`   UI:  [${result.uiInsights.join(', ')}]`)
      console.log(`   ID:  ${result.requestId}`)
      console.log(`   Match: ${JSON.stringify(result.apiInsights.sort()) === JSON.stringify(result.uiInsights.sort()) ? '✅' : '❌'}`)
    })
    
    // Request analysis
    console.log(`\n📤 REQUEST ANALYSIS:`)
    console.log(`Total requests: ${requests.length}`)
    console.log(`Total responses: ${responses.length}`)
    
    // Final verdict
    if (uiAllSame && !apiAllSame) {
      console.log(`\n🚨 CONFIRMED: User's issue reproduced!`)
      console.log(`- API correctly returns different insights per model`)
      console.log(`- UI incorrectly shows same insights for all models`)
      console.log(`- This is a frontend state management or rendering issue`)
    } else if (!uiAllSame && !apiAllSame) {
      console.log(`\n✅ CANNOT REPRODUCE: Both API and UI work correctly`)
      console.log(`- This suggests an environment-specific or timing issue`)
      console.log(`- User might have browser cache, extension, or timing issue`)
    } else {
      console.log(`\n🤔 UNEXPECTED RESULT:`)
      console.log(`- UI all same: ${uiAllSame}`)
      console.log(`- API all same: ${apiAllSame}`)
    }
  })
})