/**
 * Example: Using Portkey Gateway with LLM Manager
 * 
 * This example demonstrates how to use the Portkey gateway
 * as an alternative to the existing LLM Manager implementation.
 */

import { Effect } from 'effect'
import { 
  LLMManagerServiceTag,
  PortkeyLLMManagerLive,
  LLMManagerLive,
  createPortkeyLLMManagerLive,
} from '../index.js'
import type { LLMRequest } from '../types.js'

// Example 1: Using Portkey as a drop-in replacement
async function usePortkeyAsReplacement() {
  console.log('\n=== Example 1: Portkey as Drop-in Replacement ===\n')
  
  const request: LLMRequest = {
    prompt: 'Generate a SQL query to find the top 5 services by error rate',
    taskType: 'analysis',
    preferences: {
      maxTokens: 200,
      temperature: 0.7,
    },
  }

  // Simply swap LLMManagerLive with PortkeyLLMManagerLive
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const service = yield* LLMManagerServiceTag
      
      // Check health
      const isHealthy = yield* service.isHealthy()
      console.log(`✓ Portkey Gateway Health: ${isHealthy ? 'OK' : 'ERROR'}`)
      
      // Get available models
      const models = yield* service.getAvailableModels()
      console.log(`✓ Available Models: ${models.join(', ')}`)
      
      // Generate response
      console.log('\nGenerating response...')
      const response = yield* service.generate(request)
      
      return response
    }).pipe(Effect.provide(PortkeyLLMManagerLive)) // Use Portkey instead of LLMManagerLive
  )

  console.log('\nResponse:')
  console.log('- Model:', result.model)
  console.log('- Tokens:', result.usage.totalTokens)
  console.log('- Latency:', result.metadata.latencyMs, 'ms')
  console.log('- Content:', result.content.substring(0, 200) + '...')
}

// Example 2: Custom Portkey configuration
async function useCustomPortkeyConfig() {
  console.log('\n=== Example 2: Custom Portkey Configuration ===\n')
  
  // Create a custom Portkey layer with specific configuration
  const customPortkeyLayer = createPortkeyLLMManagerLive({
    baseURL: process.env.PORTKEY_GATEWAY_URL || 'http://localhost:8787',
    configPath: '/config/routing.yaml',
  })

  const request: LLMRequest = {
    prompt: 'Explain distributed tracing in 2 sentences',
    taskType: 'general',
    preferences: {
      maxTokens: 100,
      temperature: 0.5,
      priority: 'high', // This will influence Portkey routing
    },
  }

  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const service = yield* LLMManagerServiceTag
      return yield* service.generate(request)
    }).pipe(Effect.provide(customPortkeyLayer))
  )

  console.log('Response with custom config:')
  console.log('- Model used:', result.model)
  console.log('- Response:', result.content)
}

// Example 3: Comparing Portkey vs Existing Implementation
async function compareImplementations() {
  console.log('\n=== Example 3: Comparing Implementations ===\n')
  
  const request: LLMRequest = {
    prompt: 'Write a simple SELECT query',
    taskType: 'analysis',
    preferences: {
      maxTokens: 50,
      temperature: 0.3,
    },
  }

  // Test with existing implementation
  console.log('Testing with existing LLM Manager...')
  const existingStart = Date.now()
  const existingResult = await Effect.runPromiseExit(
    Effect.gen(function* () {
      const service = yield* LLMManagerServiceTag
      return yield* service.generate(request)
    }).pipe(Effect.provide(LLMManagerLive))
  )
  const existingDuration = Date.now() - existingStart

  // Test with Portkey implementation
  console.log('Testing with Portkey Gateway...')
  const portkeyStart = Date.now()
  const portkeyResult = await Effect.runPromiseExit(
    Effect.gen(function* () {
      const service = yield* LLMManagerServiceTag
      return yield* service.generate(request)
    }).pipe(Effect.provide(PortkeyLLMManagerLive))
  )
  const portkeyDuration = Date.now() - portkeyStart

  console.log('\n📊 Comparison Results:')
  console.log('┌──────────────────┬──────────────────┬──────────────────┐')
  console.log('│ Implementation   │ Status           │ Duration (ms)    │')
  console.log('├──────────────────┼──────────────────┼──────────────────┤')
  console.log(`│ Existing         │ ${existingResult._tag === 'Success' ? '✅ Success' : '❌ Failed '}    │ ${existingDuration.toString().padEnd(16)} │`)
  console.log(`│ Portkey          │ ${portkeyResult._tag === 'Success' ? '✅ Success' : '❌ Failed '}    │ ${portkeyDuration.toString().padEnd(16)} │`)
  console.log('└──────────────────┴──────────────────┴──────────────────┘')

  if (existingResult._tag === 'Success' && portkeyResult._tag === 'Success') {
    console.log('\n📝 Response Comparison:')
    console.log('Existing model:', existingResult.value.model)
    console.log('Portkey model:', portkeyResult.value.model)
  }
}

// Example 4: Demonstrating Portkey Benefits
function demonstratePortkeyBenefits() {
  console.log('\n=== Example 4: Portkey Benefits ===\n')
  
  console.log('🎯 Key Benefits of Portkey Gateway:\n')
  
  console.log('1. Configuration-Driven Routing:')
  console.log('   - Define routing rules in YAML')
  console.log('   - No code changes needed for routing updates')
  console.log('   - Example: Route high-priority requests to fast models')
  
  console.log('\n2. Automatic Failover:')
  console.log('   - Define fallback chains in configuration')
  console.log('   - Automatic retry with exponential backoff')
  console.log('   - Circuit breaker for failing models')
  
  console.log('\n3. Semantic Caching:')
  console.log('   - Cache similar prompts automatically')
  console.log('   - Reduce costs and latency')
  console.log('   - Configurable similarity threshold')
  
  console.log('\n4. Native Observability:')
  console.log('   - Built-in OpenTelemetry integration')
  console.log('   - Metrics and tracing out of the box')
  console.log('   - No custom instrumentation needed')
  
  console.log('\n5. Multi-Provider Support:')
  console.log('   - 1,600+ models through unified API')
  console.log('   - Easy to add new providers')
  console.log('   - Consistent interface across all models')
}

// Main execution
async function main() {
  console.log('🚀 Portkey Gateway Integration Examples')
  console.log('=====================================')
  
  try {
    // Run examples that don't require actual gateway
    demonstratePortkeyBenefits()
    
    // These would work with actual Portkey gateway running
    if (process.env.PORTKEY_GATEWAY_URL) {
      await usePortkeyAsReplacement()
      await useCustomPortkeyConfig()
      await compareImplementations()
    } else {
      console.log('\n⚠️  Note: Set PORTKEY_GATEWAY_URL to run live examples')
      console.log('   Example: PORTKEY_GATEWAY_URL=http://localhost:8787 pnpm tsx src/llm-manager/examples/portkey-usage.ts')
    }
  } catch (error) {
    console.error('Error:', error)
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}

export { 
  usePortkeyAsReplacement,
  useCustomPortkeyConfig,
  compareImplementations,
  demonstratePortkeyBenefits,
}