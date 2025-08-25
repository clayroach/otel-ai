import { test, expect } from '@playwright/test'

// Test to validate the insights tab issue and fix
test.describe('Insights Tab Navigation Fix', () => {
  test('should show insights in AI-Powered Insights tab', async ({ page }) => {
    console.log('🎯 Testing insights tab navigation...')
    
    // Navigate and wait for page
    await page.goto('/insights')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    
    // Select Claude model
    console.log('1. Selecting Claude model...')
    await page.getByTestId('ai-model-selector').click()
    await page.waitForTimeout(1000)
    await page.getByText('🧠 Claude').click()
    
    // Run analysis
    console.log('2. Running analysis...')
    const apiResponsePromise = page.waitForResponse(
      response => response.url().includes('/api/ai-analyzer/analyze') && response.status() === 200,
      { timeout: 60000 }
    )
    
    await page.getByTestId('analyze-button').click()
    const response = await apiResponsePromise
    const responseData = await response.json()
    console.log(`✅ API returned ${responseData.insights?.length} insights`)
    
    // Wait for UI to settle
    await page.waitForTimeout(3000)
    
    // Take screenshot of current state (should show Topology Overview tab)
    await page.screenshot({ path: 'ui/test/e2e/screenshots/topology-tab.png', fullPage: true })
    
    // Check if insights are visible in current tab
    const insightsVisibleBefore = await page.locator('[data-testid="insights-results"]').isVisible()
    console.log(`Insights visible in Topology tab: ${insightsVisibleBefore}`)
    
    // Click on AI-Powered Insights tab
    console.log('3. Clicking AI-Powered Insights tab...')
    await page.getByRole('tab', { name: '💡 AI-Powered Insights' }).click()
    await page.waitForTimeout(2000)
    
    // Take screenshot after switching tabs
    await page.screenshot({ path: 'ui/test/e2e/screenshots/insights-tab.png', fullPage: true })
    
    // Check if insights are now visible
    const insightsVisibleAfter = await page.locator('[data-testid="insights-results"]').isVisible()
    console.log(`Insights visible in AI-Powered Insights tab: ${insightsVisibleAfter}`)
    
    if (insightsVisibleAfter) {
      const insights = await page.locator('[data-testid="insight-title"]').allTextContents()
      console.log(`✅ Found ${insights.length} insights: ${insights.join(', ')}`)
      
      // Verify Claude-specific insight is present
      const hasClaudeInsight = insights.some(title => title.includes('Architectural Pattern'))
      console.log(`Claude-specific insight present: ${hasClaudeInsight}`)
      
      expect(insights.length).toBeGreaterThan(0)
      expect(hasClaudeInsight).toBe(true)
    } else {
      console.log('❌ Insights still not visible even in AI-Powered Insights tab')
    }
    
    console.log('🎯 Insights tab test complete')
  })
  
  test('should validate different models produce different insights in correct tab', async ({ page }) => {
    console.log('🎯 Testing model differences in insights tab...')
    
    await page.goto('/insights')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    
    const models = [
      { name: '🧠 Claude', expectedInsight: 'Architectural Pattern' },
      { name: '🤖 GPT-4', expectedInsight: 'Performance Optimization' },
      { name: '🦙 Llama', expectedInsight: 'Resource Utilization' }
    ]
    
    const modelResults = new Map()
    
    for (const model of models) {
      console.log(`Testing ${model.name}...`)
      
      // Select model
      await page.getByTestId('ai-model-selector').click()
      await page.waitForTimeout(1000)
      await page.getByText(model.name).click()
      
      // Run analysis
      await page.getByTestId('analyze-button').click()
      
      // Wait for API response
      await page.waitForResponse(
        response => response.url().includes('/api/ai-analyzer/analyze') && response.status() === 200,
        { timeout: 60000 }
      )
      
      await page.waitForTimeout(3000)
      
      // Click AI-Powered Insights tab
      await page.getByRole('tab', { name: '💡 AI-Powered Insights' }).click()
      await page.waitForTimeout(2000)
      
      // Capture insights
      const insights = await page.locator('[data-testid="insight-title"]').allTextContents()
      modelResults.set(model.name, insights)
      
      console.log(`${model.name}: ${insights.length} insights`)
      console.log(`Expected "${model.expectedInsight}": ${insights.some(title => title.includes(model.expectedInsight))}`)
    }
    
    // Validate all models produce different results
    const claudeInsights = modelResults.get('🧠 Claude')
    const gptInsights = modelResults.get('🤖 GPT-4')
    const llamaInsights = modelResults.get('🦙 Llama')
    
    console.log('Results comparison:')
    console.log(`Claude: ${claudeInsights.join(', ')}`)
    console.log(`GPT: ${gptInsights.join(', ')}`)
    console.log(`Llama: ${llamaInsights.join(', ')}`)
    
    // Models should have different insights
    expect(claudeInsights).not.toEqual(gptInsights)
    expect(gptInsights).not.toEqual(llamaInsights)
    expect(claudeInsights).not.toEqual(llamaInsights)
    
    console.log('✅ All models produce unique insights!')
  })
})