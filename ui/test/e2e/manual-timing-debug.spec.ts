import { test, expect } from '@playwright/test'

test.describe('Manual Timing Debug', () => {
  test('should match exact manual user timing and capture state changes', async ({ page }) => {
    console.log('🕒 Debugging with manual timing patterns...')
    
    const allRequests = []
    const allResponses = []
    const domStateChanges = []
    
    // Capture all network activity
    page.on('request', request => {
      if (request.url().includes('/api/ai-analyzer/analyze')) {
        const payload = request.postData() ? JSON.parse(request.postData()) : null
        allRequests.push({
          timestamp: new Date().toISOString(),
          model: payload?.config?.llm?.model || 'statistical',
          payload: payload
        })
        console.log(`📤 REQUEST: ${payload?.config?.llm?.model || 'statistical'} at ${new Date().toISOString()}`)
      }
    })
    
    page.on('response', async response => {
      if (response.url().includes('/api/ai-analyzer/analyze') && response.status() === 200) {
        try {
          const responseText = await response.text()
          const responseData = JSON.parse(responseText)
          allResponses.push({
            timestamp: new Date().toISOString(),
            model: responseData.metadata?.selectedModel,
            contentLength: responseText.length,
            insights: responseData.insights?.map(i => i.title) || []
          })
          console.log(`📥 RESPONSE: ${responseData.metadata?.selectedModel}, ${responseText.length} bytes at ${new Date().toISOString()}`)
        } catch (e) {
          console.log(`📥 RESPONSE ERROR: ${e.message}`)
        }
      }
    })
    
    // Function to capture DOM state
    const captureDOMState = async (label: string) => {
      const insights = await page.locator('[data-testid="insight-title"]').allTextContents()
      const state = {
        timestamp: new Date().toISOString(),
        label: label,
        insights: insights
      }
      domStateChanges.push(state)
      console.log(`🖼️ DOM STATE [${label}]: [${insights.join(', ')}]`)
      return state
    }
    
    await page.goto('/insights')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000) // Match user's natural pause
    
    console.log('\n🎯 TESTING WITH MANUAL-LIKE TIMING...')
    
    // Test sequence: Statistical → Claude → GPT (matching HAR pattern)
    const testSequence = [
      { ui: '🔬 Statistical Analysis', expected: 'statistical' },
      { ui: '🧠 Claude', expected: 'claude' },
      { ui: '🤖 GPT-4', expected: 'gpt' }
    ]
    
    for (let i = 0; i < testSequence.length; i++) {
      const model = testSequence[i]
      console.log(`\n--- STEP ${i + 1}: Testing ${model.ui} ---`)
      
      // Clear counters for this iteration
      const requestCountBefore = allRequests.length
      const responseCountBefore = allResponses.length
      
      // Select model (with realistic timing)
      console.log(`🖱️ Selecting model: ${model.ui}`)
      await page.getByTestId('ai-model-selector').click()
      await page.waitForTimeout(800) // User think time
      await page.getByText(model.ui).click()
      await page.waitForTimeout(500) // UI update time
      
      // Capture DOM before analysis
      await captureDOMState(`Before ${model.ui} analysis`)
      
      // Click analyze (with realistic timing)
      console.log(`🖱️ Clicking analyze...`)
      await page.getByTestId('analyze-button').click()
      
      // Wait for request to start
      await page.waitForTimeout(200)
      console.log(`⏳ Waiting for ${model.ui} response...`)
      
      // Wait for response
      await page.waitForResponse(
        response => response.url().includes('/api/ai-analyzer/analyze') && response.status() === 200,
        { timeout: 60000 }
      )
      
      // Wait for UI processing (critical - this might be where the race condition happens)
      console.log(`⚙️ Waiting for UI processing...`)
      await page.waitForTimeout(2000) // UI state update time
      
      // Navigate to insights tab (with user-like timing)
      console.log(`📊 Opening insights tab...`)
      await page.getByRole('tab', { name: '💡 AI-Powered Insights' }).click()
      await page.waitForTimeout(1500) // Tab switch and render time
      
      // Capture DOM after analysis
      const finalState = await captureDOMState(`After ${model.ui} analysis`)
      
      // Analyze what happened in this iteration
      const newRequests = allRequests.slice(requestCountBefore)
      const newResponses = allResponses.slice(responseCountBefore)
      
      console.log(`📊 ITERATION ${i + 1} SUMMARY:`)
      console.log(`   Requests made: ${newRequests.length}`)
      console.log(`   Responses received: ${newResponses.length}`)
      console.log(`   Final DOM insights: [${finalState.insights.join(', ')}]`)
      
      if (newResponses.length > 0) {
        const lastResponse = newResponses[newResponses.length - 1]
        console.log(`   Last API response: [${lastResponse.insights.join(', ')}]`)
        
        const domMatchesApi = JSON.stringify(finalState.insights.sort()) === JSON.stringify(lastResponse.insights.sort())
        console.log(`   DOM matches last API: ${domMatchesApi ? '✅' : '❌'}`)
        
        if (!domMatchesApi) {
          console.log(`   ❌ MISMATCH DETECTED!`)
          console.log(`      API returned: [${lastResponse.insights.join(', ')}]`)
          console.log(`      DOM shows: [${finalState.insights.join(', ')}]`)
        }
      }
      
      // Take screenshot
      await page.screenshot({
        path: `ui/test/e2e/screenshots/manual-timing-${i + 1}-${model.expected}.png`,
        fullPage: true
      })
      
      // Realistic pause between tests (like a real user would)
      if (i < testSequence.length - 1) {
        console.log(`⏸️ User pause between tests...`)
        await page.waitForTimeout(2000)
      }
    }
    
    // Final comprehensive analysis
    console.log(`\n🔍 COMPREHENSIVE TIMING ANALYSIS:`)
    console.log(`=`.repeat(80))
    
    console.log(`📤 ALL REQUESTS (${allRequests.length}):`)
    allRequests.forEach((req, idx) => {
      console.log(`   ${idx + 1}. ${req.model} at ${req.timestamp}`)
    })
    
    console.log(`\n📥 ALL RESPONSES (${allResponses.length}):`)
    allResponses.forEach((res, idx) => {
      console.log(`   ${idx + 1}. ${res.model} (${res.contentLength} bytes) at ${res.timestamp}`)
    })
    
    console.log(`\n🖼️ ALL DOM STATES (${domStateChanges.length}):`)
    domStateChanges.forEach((state, idx) => {
      console.log(`   ${idx + 1}. [${state.label}] [${state.insights.join(', ')}] at ${state.timestamp}`)
    })
    
    // Check for timing issues
    if (allRequests.length !== allResponses.length) {
      console.log(`\n❌ TIMING ISSUE: ${allRequests.length} requests but ${allResponses.length} responses`)
    }
    
    // Check if DOM states are repeating (the user's issue)
    const finalStates = domStateChanges.filter(s => s.label.startsWith('After'))
    const uniqueStates = [...new Set(finalStates.map(s => JSON.stringify(s.insights.sort())))]
    
    if (uniqueStates.length < finalStates.length) {
      console.log(`\n❌ DOM REPETITION DETECTED: ${finalStates.length} tests but only ${uniqueStates.length} unique DOM states`)
      console.log(`This matches the user's reported issue!`)
    } else {
      console.log(`\n✅ DOM STATES ARE UNIQUE: Each test produced different DOM content`)
    }
  })
})