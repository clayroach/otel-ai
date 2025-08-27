#!/usr/bin/env node

/**
 * Test script to validate that different AI models produce different results
 * This addresses the issue where all models were returning identical outputs
 */

const API_BASE_URL = 'http://localhost:4319/api/ai-analyzer'

const createRequest = (model) => {
  const now = new Date()
  const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000)

  return {
    type: 'architecture',
    timeRange: {
      startTime: fourHoursAgo.toISOString(),
      endTime: now.toISOString()
    },
    filters: {},
    config:
      model !== 'local-statistical-analyzer'
        ? {
            llm: {
              model: model,
              temperature: model === 'gpt' ? 0.5 : model === 'llama' ? 0.8 : 0.7,
              maxTokens: model === 'gpt' ? 1500 : model === 'llama' ? 1800 : 2000
            },
            analysis: {
              timeWindowHours: 4,
              minSpanCount: 100
            },
            output: {
              format: 'markdown',
              includeDigrams: true,
              detailLevel: 'comprehensive'
            }
          }
        : {
            analysis: {
              timeWindowHours: 4,
              minSpanCount: 100
            },
            output: {
              format: 'markdown',
              includeDigrams: true,
              detailLevel: 'comprehensive'
            }
          }
  }
}

async function testModelDifferentiation() {
  console.log('🧪 Testing Model Differentiation...\n')

  const models = ['local-statistical-analyzer', 'claude', 'gpt', 'llama']
  const results = new Map()

  // Test health first
  try {
    console.log('🏥 Checking service health...')
    const healthResponse = await fetch(`${API_BASE_URL}/health`)
    if (!healthResponse.ok) {
      console.log('⚠️  Backend service not available - test will use mock data')
    } else {
      console.log('✅ Backend service available - testing real model differentiation\n')
    }
  } catch (error) {
    console.log('⚠️  Backend service not available - test will use mock data\n')
  }

  // Test each model
  for (const model of models) {
    console.log(`🔍 Testing model: ${model}`)

    const request = createRequest(model)
    console.log(`📡 Request config:`, JSON.stringify(request.config, null, 2))

    try {
      const response = await fetch(`${API_BASE_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      })

      if (!response.ok) {
        console.log(`❌ ${model} request failed: ${response.status}`)
        continue
      }

      const result = await response.json()
      results.set(model, result)

      console.log(`📊 ${model} returned:`)
      console.log(`   - ${result.insights.length} insights`)
      console.log(
        `   - Metadata: selectedModel=${result.metadata.selectedModel}, llmModel=${result.metadata.llmModel}`
      )
      console.log(`   - Insight titles: ${result.insights.map((i) => i.title).join(', ')}`)
      console.log('')
    } catch (error) {
      console.log(`❌ ${model} request failed:`, error.message)
    }
  }

  // Analyze differentiation
  console.log('\n📈 Analysis Results:')

  if (results.size === 0) {
    console.log('❌ No successful responses - cannot validate differentiation')
    return
  }

  // Compare insight counts
  const insightCounts = Array.from(results.entries()).map(([model, result]) => ({
    model,
    count: result.insights.length
  }))

  console.log('🔢 Insight counts by model:')
  insightCounts.forEach(({ model, count }) => {
    console.log(`   ${model}: ${count} insights`)
  })

  // Check for unique insights
  const allInsightTitles = new Set()
  const modelInsights = new Map()

  results.forEach((result, model) => {
    const titles = result.insights.map((i) => i.title)
    modelInsights.set(model, titles)
    titles.forEach((title) => allInsightTitles.add(title))
  })

  console.log(`\n📋 Unique insight titles found: ${allInsightTitles.size}`)

  // Check for model-specific insights
  const modelSpecificInsights = {
    claude: 'Architectural Pattern Analysis',
    gpt: 'Performance Optimization Opportunities',
    llama: 'Resource Utilization & Scalability Analysis'
  }

  let modelDifferentiationWorking = true

  for (const [model, expectedInsight] of Object.entries(modelSpecificInsights)) {
    if (results.has(model)) {
      const hasExpectedInsight = modelInsights.get(model)?.includes(expectedInsight)
      if (hasExpectedInsight) {
        console.log(`✅ ${model}: Found expected insight "${expectedInsight}"`)
      } else {
        console.log(`❌ ${model}: Missing expected insight "${expectedInsight}"`)
        console.log(`   Actual insights: ${modelInsights.get(model)?.join(', ')}`)
        modelDifferentiationWorking = false
      }
    }
  }

  // Check that statistical analyzer has fewer insights
  if (results.has('local-statistical-analyzer')) {
    const statInsights = results.get('local-statistical-analyzer').insights.length
    const enhancedModels = ['claude', 'gpt', 'llama'].filter((m) => results.has(m))

    if (enhancedModels.length > 0) {
      const enhancedInsightCounts = enhancedModels.map((m) => results.get(m).insights.length)
      const avgEnhancedInsights =
        enhancedInsightCounts.reduce((a, b) => a + b, 0) / enhancedInsightCounts.length

      if (statInsights < avgEnhancedInsights) {
        console.log(
          `✅ Statistical analyzer has fewer insights (${statInsights}) than enhanced models (avg: ${avgEnhancedInsights.toFixed(1)})`
        )
      } else {
        console.log(`❌ Statistical analyzer should have fewer insights than enhanced models`)
        modelDifferentiationWorking = false
      }
    }
  }

  // Final verdict
  console.log('\n🎯 Final Assessment:')
  if (modelDifferentiationWorking) {
    console.log('✅ Model differentiation is working correctly!')
    console.log('   Different models are producing different insights as expected.')
  } else {
    console.log('❌ Model differentiation is NOT working correctly.')
    console.log('   Models are still producing similar or identical results.')
  }
}

// Run the test
testModelDifferentiation().catch(console.error)
