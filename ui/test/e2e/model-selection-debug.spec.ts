import { test, expect } from '@playwright/test'

// Focused test to debug model selection issue
test.describe('Model Selection Debug', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/insights')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await page.waitForSelector('h2:has-text("AI-Powered Architecture Analysis")', { timeout: 10000 })
  })

  test('should show different insights for different models', async ({ page }) => {
    console.log('🎭 Debugging model selection behavior...')
    
    const models = ['🧠 Claude', '🤖 GPT-4', '🦙 Llama']
    const results = new Map<string, string[]>()
    
    for (const model of models) {
      console.log(`🔍 Testing ${model}...`)
      
      // Select model
      await page.getByTestId('ai-model-selector').click()
      await page.waitForTimeout(1000)
      await page.getByText(model).click()
      console.log(`✅ Selected ${model}`)
      
      // Run analysis
      await page.getByTestId('analyze-button').click()
      console.log('🔄 Analysis started...')
      
      // Wait for results with longer timeout
      try {
        await page.waitForSelector('[data-testid="insights-results"]', { timeout: 45000 })
        console.log('📊 Results appeared!')
        
        // Capture insights
        const insights = await page.locator('[data-testid="insight-title"]').allTextContents()
        results.set(model, insights)
        
        console.log(`📋 ${model} insights:`, insights)
        
        // Take screenshot
        await page.screenshot({ 
          path: `ui/test/e2e/screenshots/${model.replace(/[^a-zA-Z0-9]/g, '-')}-debug.png`,
          fullPage: true 
        })
        
      } catch (error) {
        console.log(`❌ ${model} failed:`, error)
        await page.screenshot({ 
          path: `ui/test/e2e/screenshots/${model.replace(/[^a-zA-Z0-9]/g, '-')}-error.png`,
          fullPage: true 
        })
      }
      
      // Brief pause between tests
      await page.waitForTimeout(2000)
    }
    
    // Analyze results
    console.log('\n🧪 Results Analysis:')
    for (const [model, insights] of results.entries()) {
      console.log(`${model}: ${insights.length} insights - ${insights.join(', ')}`)
    }
    
    // Check if all results are identical (reproducing user issue)
    const insightArrays = Array.from(results.values())
    const allSame = insightArrays.every(insights => 
      JSON.stringify(insights) === JSON.stringify(insightArrays[0])
    )
    
    if (allSame) {
      console.log('❌ CONFIRMED: User issue reproduced - all models show identical insights')
    } else {
      console.log('✅ Model selection working correctly - different insights per model')
    }
    
    // Expect models to produce different results
    expect(results.get('🧠 Claude')).not.toEqual(results.get('🤖 GPT-4'))
    expect(results.get('🤖 GPT-4')).not.toEqual(results.get('🦙 Llama'))
  })
})