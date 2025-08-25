import { test, expect } from '@playwright/test'

// Debug what's actually being sent in API requests
test.describe('API Payload Debug', () => {
  test('should capture API request payloads for different models', async ({ page }) => {
    console.log('🔍 Debugging API request payloads...')
    
    const apiRequests = []
    
    // Capture all API requests
    page.on('request', request => {
      if (request.url().includes('/api/ai-analyzer/analyze')) {
        const payload = request.postData()
        apiRequests.push({
          url: request.url(),
          method: request.method(),
          payload: payload ? JSON.parse(payload) : null,
          timestamp: new Date().toISOString()
        })
        console.log(`[API REQUEST] ${request.method()} ${request.url()}`)
        console.log(`[PAYLOAD] ${payload}`)
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
      console.log(`✅ Selected ${modelName}`)
      
      // Verify model is selected in UI
      const selectedModel = await page.getByTestId('ai-model-selector').textContent()
      console.log(`UI shows selected model: ${selectedModel}`)
      
      // Run analysis
      await page.getByTestId('analyze-button').click()
      
      // Wait for API call
      await page.waitForResponse(
        response => response.url().includes('/api/ai-analyzer/analyze') && response.status() === 200,
        { timeout: 60000 }
      )
      
      await page.waitForTimeout(2000)
    }
    
    // Analyze captured requests
    console.log('\n🧪 API Request Analysis:')
    apiRequests.forEach((req, index) => {
      console.log(`\nRequest ${index + 1}:`)
      console.log(`Timestamp: ${req.timestamp}`)
      console.log(`Config:`, req.payload?.config)
      console.log(`Model in config:`, req.payload?.config?.llm?.model)
      console.log(`Full payload:`, JSON.stringify(req.payload, null, 2))
    })
    
    // Validate that different models send different payloads
    if (apiRequests.length >= 3) {
      const model1 = apiRequests[0]?.payload?.config?.llm?.model
      const model2 = apiRequests[1]?.payload?.config?.llm?.model  
      const model3 = apiRequests[2]?.payload?.config?.llm?.model
      
      console.log(`\n📊 Model comparison:`)
      console.log(`Request 1 model: ${model1}`)
      console.log(`Request 2 model: ${model2}`)
      console.log(`Request 3 model: ${model3}`)
      
      const allSameModel = model1 === model2 && model2 === model3
      if (allSameModel) {
        console.log('❌ ISSUE FOUND: All requests use the same model!')
        console.log('This explains why user sees same results')
      } else {
        console.log('✅ Requests use different models - issue is elsewhere')
      }
    }
    
    expect(apiRequests.length).toBeGreaterThanOrEqual(3)
  })
})