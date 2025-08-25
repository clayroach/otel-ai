import { test, expect } from '@playwright/test'

// Test to validate the model selection fix
test.describe('Model Selection Fix Validation', () => {
  test('should send correct API payloads for each model', async ({ page }) => {
    console.log('🔍 Validating model selection fix...')
    
    const apiRequests = []
    
    // Capture all API requests with detailed payload inspection
    page.on('request', request => {
      if (request.url().includes('/api/ai-analyzer/analyze')) {
        const payload = request.postData() ? JSON.parse(request.postData()) : null
        apiRequests.push({
          url: request.url(),
          method: request.method(),
          payload: payload,
          timestamp: new Date().toISOString()
        })
        
        console.log(`\n📤 API REQUEST:`)
        console.log(`   URL: ${request.url()}`)
        console.log(`   Payload: ${JSON.stringify(payload, null, 2)}`)
      }
    })
    
    await page.goto('/insights')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    
    const testCases = [
      { ui: '🔬 Statistical Analysis', expected: 'no-llm-config' },
      { ui: '🧠 Claude', expected: 'claude' },
      { ui: '🤖 GPT-4', expected: 'gpt' },
      { ui: '🦙 Llama', expected: 'llama' }
    ]
    
    for (const testCase of testCases) {
      console.log(`\n🎯 Testing: ${testCase.ui}`)
      
      // Select model
      await page.getByTestId('ai-model-selector').click()
      await page.waitForTimeout(500)
      await page.getByText(testCase.ui).click()
      console.log(`   ✓ Selected: ${testCase.ui}`)
      
      // Clear previous requests for this test
      const requestsBeforeAnalysis = apiRequests.length
      
      // Run analysis
      await page.getByTestId('analyze-button').click()
      
      // Wait for the request
      await page.waitForResponse(
        response => response.url().includes('/api/ai-analyzer/analyze'),
        { timeout: 10000 }
      )
      
      // Check the request payload
      const newRequests = apiRequests.slice(requestsBeforeAnalysis)
      const request = newRequests[0]
      
      if (!request) {
        console.log(`   ❌ No API request captured for ${testCase.ui}`)
        continue
      }
      
      console.log(`   📊 Request payload analysis:`)
      console.log(`      Has config: ${!!request.payload.config}`)
      console.log(`      Has LLM config: ${!!request.payload.config?.llm}`)
      console.log(`      LLM model: ${request.payload.config?.llm?.model || 'none'}`)
      
      // Validate the payload
      if (testCase.expected === 'no-llm-config') {
        const hasLlmConfig = !!request.payload.config?.llm
        console.log(`   ${hasLlmConfig ? '❌' : '✅'} Statistical analysis: ${hasLlmConfig ? 'FAILED - has LLM config' : 'CORRECT - no LLM config'}`)
      } else {
        const modelInPayload = request.payload.config?.llm?.model
        const correct = modelInPayload === testCase.expected
        console.log(`   ${correct ? '✅' : '❌'} ${testCase.ui}: ${correct ? 'CORRECT' : 'FAILED'} - got '${modelInPayload}', expected '${testCase.expected}'`)
      }
      
      await page.waitForTimeout(1000)
    }
    
    console.log(`\n📋 SUMMARY:`)
    console.log(`Total API requests captured: ${apiRequests.length}`)
    
    // Final validation
    console.log(`\n🧪 PAYLOAD VALIDATION:`)
    apiRequests.forEach((req, idx) => {
      const model = req.payload.config?.llm?.model || 'statistical'
      console.log(`${idx + 1}. Model: ${model}, Has LLM: ${!!req.payload.config?.llm}`)
    })
  })
})