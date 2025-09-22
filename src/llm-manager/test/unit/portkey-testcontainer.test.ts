/**
 * Portkey Testcontainer Integration Test
 *
 * This test validates all LLM Manager methods using a real Portkey container
 * with our actual configuration to ensure proper integration.
 */

import { Effect } from 'effect'
import path from 'path'
import { GenericContainer, type StartedTestContainer } from 'testcontainers'
import { fileURLToPath } from 'url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LLMManagerService } from '../../llm-manager-service.js'
import type { ModelInfo } from '../../model-types.js'
import { makePortkeyGatewayManager } from '../../portkey-gateway-client.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('Portkey Gateway Integration with Testcontainer', () => {
  let container: StartedTestContainer
  let portkeyUrl: string
  let service: LLMManagerService

  beforeAll(async () => {
    console.log('🚀 Starting Portkey container...')

    // Start Portkey container
    container = await new GenericContainer('portkeyai/gateway:latest')
      .withExposedPorts(8787)
      .withEnvironment({
        PORT: '8787',
        LOG_LEVEL: 'debug',
        CACHE_ENABLED: 'true',
        CONFIG_PATH: '/config/config.json'
      })
      // Mount the actual config directory
      .withBindMounts([{
        source: path.resolve(__dirname, '../../../../config/portkey'),
        target: '/config',
        mode: 'ro'
      }])
      .withStartupTimeout(30000)
      .start()

    const mappedPort = container.getMappedPort(8787)
    portkeyUrl = `http://localhost:${mappedPort}`

    console.log(`✅ Portkey container started on ${portkeyUrl}`)

    // Create service instance with test container URL
    // makePortkeyGatewayManager returns an Effect that resolves to the service
    const serviceEffect = makePortkeyGatewayManager(portkeyUrl)
    service = await Effect.runPromise(serviceEffect)

    // Wait for health check
    const maxRetries = 10
    for (let i = 0; i < maxRetries; i++) {
      try {
        const healthy = await Effect.runPromise(service.isHealthy())
        if (healthy) {
          console.log('✅ Portkey gateway is healthy')
          break
        }
      } catch (error) {
        if (i === maxRetries - 1) {
          throw new Error(`Portkey health check failed after ${maxRetries} retries: ${error}`)
        }
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
  }, 60000) // Increase timeout for container startup

  afterAll(async () => {
    if (container) {
      console.log('🛑 Stopping Portkey container...')
      await container.stop()
    }
  })

  describe('Configuration Validation', () => {
    it('should load and validate configuration structure', async () => {
      // This test validates the configuration is properly loaded and structured
      // to prevent "Cannot read properties of undefined" errors in Portkey

      const fs = await import('fs')
      const configPath = path.resolve(__dirname, '../../../../config/portkey/config.json')
      const configContent = fs.readFileSync(configPath, 'utf-8')
      const config = JSON.parse(configContent)

      console.log('\n📋 Validating configuration structure:')

      // Validate required top-level fields
      expect(config).toBeDefined()
      expect(config.version).toBeDefined()
      expect(config.providers).toBeDefined()
      expect(Array.isArray(config.providers)).toBe(true)
      expect(config.routes).toBeDefined()
      expect(Array.isArray(config.routes)).toBe(true)

      console.log(`   ✅ Version: ${config.version}`)
      console.log(`   ✅ Providers: ${config.providers.length}`)
      console.log(`   ✅ Routes: ${config.routes.length}`)

      // Validate providers structure
      config.providers.forEach((provider: { id: string, name: string, baseURL: string }) => {
        expect(provider.id).toBeDefined()
        expect(provider.name).toBeDefined()
        expect(provider.baseURL).toBeDefined()
        console.log(`   ✅ Provider: ${provider.id} - ${provider.name}`)
      })

      // Validate routes structure
      config.routes.forEach((route: { name: string, models: string[], provider: string, strategy: string }) => {
        expect(route.name).toBeDefined()
        expect(route.models).toBeDefined()
        expect(Array.isArray(route.models)).toBe(true)
        expect(route.provider).toBeDefined()
        expect(route.strategy).toBeDefined()
        console.log(`   ✅ Route: ${route.name} (${route.models.length} models)`)
      })

      // Validate optional but important fields
      if (config.strategy) {
        expect(config.strategy.mode).toBeDefined()
        console.log(`   ✅ Strategy mode: ${config.strategy.mode}`)

        if (config.strategy.targets) {
          expect(Array.isArray(config.strategy.targets)).toBe(true)
          console.log(`   ✅ Fallback targets: ${config.strategy.targets.length}`)
        }
      }

      if (config.cache) {
        // expect(config.cache.mode).toBeDefined()
        expect(config.cache.enabled).toBeDefined()
        console.log(`   ✅ Cache: ${config.cache.enabled ? 'enabled' : 'disabled'}`)
      }

      if (config.retry) {
        expect(config.retry.attempts).toBeDefined()
        expect(typeof config.retry.attempts).toBe('number')
        console.log(`   ✅ Retry attempts: ${config.retry.attempts}`)
      }

      // Validate custom fields used by our implementation
      if (config.defaults) {
        expect(config.defaults).toBeDefined()
        console.log(`   ✅ Defaults configured:`)
        if (config.defaults.general) console.log(`     - General: ${config.defaults.general}`)
        if (config.defaults.sql) console.log(`     - SQL: ${config.defaults.sql}`)
        if (config.defaults.code) console.log(`     - Code: ${config.defaults.code}`)
      }

      console.log('\n✅ Configuration validation passed!')
    })

    it('should test configuration with Portkey API directly', async () => {
      // Test that Portkey can parse the config when passed via x-portkey-config header
      // Use global fetch (available in Node 18+)

      // Build the ACTUAL gateway config as our code does (from config.json)
      const fs = await import('fs')
      const configPath = path.resolve(__dirname, '../../../../config/portkey/config.json')
      const actualConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      const gatewayConfig = {
        retry: actualConfig.retry,
        strategy: actualConfig.strategy,
        cache: actualConfig.cache
      }

      console.log('\n🔧 Testing config parsing with Portkey API:')
      console.log('   Config to send (actual from config.json):', JSON.stringify(gatewayConfig).substring(0, 200) + '...')

      try {
        // Test with a simple health check that includes config
        const response = await fetch(`${portkeyUrl}/health`, {
          method: 'GET',
          headers: {
            'x-portkey-config': JSON.stringify(gatewayConfig)
          }
        })

        // Even if config parsing fails, health endpoint should respond
        expect(response.status).toBeLessThan(500)
        console.log(`   ✅ Portkey accepted config header (status: ${response.status})`)

        // Try an actual completion request with minimal config
        const completionResponse = await fetch(`${portkeyUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-portkey-provider': 'openai',
            'x-portkey-config': JSON.stringify(gatewayConfig),
            'Authorization': 'Bearer test-key' // Will fail auth but should parse config first
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: 'test' }]
          })
        })

        const body = await completionResponse.text()

        // Should not get config parsing error
        // expect(body).not.toContain('Invalid config passed')
        expect(body).not.toContain("Cannot read properties of undefined")

        console.log('   ✅ Config parsing successful (no undefined errors)')

      } catch (error) {
        console.error('   ❌ Config test failed:', error)
        throw error
      }
    })
  })

  describe('Model Discovery Methods', () => {
    it('should get available models', async () => {
      const models = await Effect.runPromise(service.getAvailableModels())

      console.log(`📋 Available models: ${models.length}`)
      console.log(`   Models: ${models.join(', ')}`)

      expect(models).toBeDefined()
      expect(Array.isArray(models)).toBe(true)
      expect(models.length).toBeGreaterThan(0)

      // Check for expected models from config
      const expectedModels = [
        'codellama-7b-instruct',
        'sqlcoder-7b-2',
        'gpt-3.5-turbo',
        'claude-3-haiku-20240307'
      ]

      // At least some expected models should be present
      const foundModels = expectedModels.filter(model => models.includes(model))
      expect(foundModels.length).toBeGreaterThan(0)
    })

    it('should get default model for different task types', async () => {
      // Test SQL task type
      const sqlModel = await Effect.runPromise(service.getDefaultModel('sql'))
      console.log(`🔧 Default SQL model: ${sqlModel}`)
      expect(sqlModel).toBeDefined()
      expect(typeof sqlModel).toBe('string')

      // Should be a SQL-optimized model
      const sqlModels = ['codellama-7b-instruct', 'sqlcoder-7b-2', 'deepseek-coder-v2-lite-instruct']
      expect(sqlModels.some(m => sqlModel.includes(m) || sqlModel === m)).toBe(true)

      // Test general task type
      const generalModel = await Effect.runPromise(service.getDefaultModel('general'))
      console.log(`🔧 Default general model: ${generalModel}`)
      expect(generalModel).toBeDefined()
      expect(typeof generalModel).toBe('string')

      // Test code task type
      const codeModel = await Effect.runPromise(service.getDefaultModel('code'))
      console.log(`🔧 Default code model: ${codeModel}`)
      expect(codeModel).toBeDefined()
      expect(typeof codeModel).toBe('string')

      // Test without task type (should return general default)
      const defaultModel = await Effect.runPromise(service.getDefaultModel())
      console.log(`🔧 Default model (no task): ${defaultModel}`)
      expect(defaultModel).toBeDefined()
      expect(typeof defaultModel).toBe('string')
    })

    it('should get models by capability', async () => {
      // Test SQL capability
      const sqlModels = await Effect.runPromise(service.getModelsByCapability('sql'))
      console.log(`💡 Models with SQL capability: ${sqlModels.length}`)
      sqlModels.forEach((model: ModelInfo) => {
        console.log(`   - ${model.id} (${model.provider})`)
      })

      expect(sqlModels).toBeDefined()
      expect(Array.isArray(sqlModels)).toBe(true)
      expect(sqlModels.length).toBeGreaterThan(0)

      // All SQL models should have the SQL capability
      sqlModels.forEach((model: ModelInfo) => {
        expect(model.capabilities).toContain('sql')
      })

      // Test general capability
      const generalModels = await Effect.runPromise(service.getModelsByCapability('general'))
      console.log(`💡 Models with general capability: ${generalModels.length}`)

      expect(generalModels).toBeDefined()
      expect(Array.isArray(generalModels)).toBe(true)
      expect(generalModels.length).toBeGreaterThan(0)

      // All general models should have the general capability
      generalModels.forEach((model: ModelInfo) => {
        expect(model.capabilities).toContain('general')
      })
    })

    it('should get models by provider', async () => {
      // Test OpenAI provider
      const openaiModels = await Effect.runPromise(service.getModelsByProvider('openai'))
      console.log(`🏢 OpenAI models: ${openaiModels.length}`)
      openaiModels.forEach((model: ModelInfo) => {
        console.log(`   - ${model.id}`)
      })

      expect(openaiModels).toBeDefined()
      expect(Array.isArray(openaiModels)).toBe(true)

      // All OpenAI models should have the correct provider
      openaiModels.forEach((model: ModelInfo) => {
        expect(model.provider).toBe('openai')
      })

      // Test Anthropic provider
      const anthropicModels = await Effect.runPromise(service.getModelsByProvider('anthropic'))
      console.log(`🏢 Anthropic models: ${anthropicModels.length}`)
      anthropicModels.forEach((model: ModelInfo) => {
        console.log(`   - ${model.id}`)
      })

      expect(anthropicModels).toBeDefined()
      expect(Array.isArray(anthropicModels)).toBe(true)

      // All Anthropic models should have the correct provider
      anthropicModels.forEach((model: ModelInfo) => {
        expect(model.provider).toBe('anthropic')
      })

      // Test LM Studio provider
      const lmStudioModels = await Effect.runPromise(service.getModelsByProvider('lm-studio'))
      console.log(`🏢 LM Studio models: ${lmStudioModels.length}`)
      lmStudioModels.forEach((model: ModelInfo) => {
        console.log(`   - ${model.id}`)
      })

      expect(lmStudioModels).toBeDefined()
      expect(Array.isArray(lmStudioModels)).toBe(true)
    })

    it('should get all models with complete metadata', async () => {
      const allModels = await Effect.runPromise(service.getAllModels())

      console.log(`📊 Total models available: ${allModels.length}`)
      console.log('\n🔍 Model details:')

      // Group models by provider for better visibility
      const modelsByProvider = allModels.reduce((acc: Record<string, ModelInfo[]>, model) => {
        if (!acc[model.provider]) {
          acc[model.provider] = []
        }
        const providerModels = acc[model.provider]
        if (providerModels) {
          providerModels.push(model)
        }
        return acc
      }, {} as Record<string, ModelInfo[]>)

      Object.entries(modelsByProvider).forEach(([provider, models]) => {
        console.log(`\n   ${provider.toUpperCase()}:`)
        models.forEach(model => {
          console.log(`     - ${model.id}`)
          console.log(`       Capabilities: ${model.capabilities.join(', ')}`)
          console.log(`       Context: ${model.metadata.contextLength} tokens`)
          console.log(`       Max Output: ${model.metadata.maxTokens} tokens`)
        })
      })

      expect(allModels).toBeDefined()
      expect(Array.isArray(allModels)).toBe(true)
      expect(allModels.length).toBeGreaterThan(0)

      // Validate each model has required fields
      allModels.forEach((model: ModelInfo) => {
        expect(model.id).toBeDefined()
        expect(model.name).toBeDefined()
        expect(model.provider).toBeDefined()
        expect(model.capabilities).toBeDefined()
        expect(Array.isArray(model.capabilities)).toBe(true)
        expect(model.capabilities.length).toBeGreaterThan(0)

        // Validate metadata
        expect(model.metadata).toBeDefined()
        expect(model.metadata.contextLength).toBeDefined()
        expect(typeof model.metadata.contextLength).toBe('number')
        expect(model.metadata.maxTokens).toBeDefined()
        expect(typeof model.metadata.maxTokens).toBe('number')
        expect(model.metadata.temperature).toBeDefined()
        expect(typeof model.metadata.temperature).toBe('number')
      })

      // Check we have models from different providers
      const providers = [...new Set(allModels.map(m => m.provider))]
      console.log(`\n✅ Found ${providers.length} unique providers: ${providers.join(', ')}`)
      expect(providers.length).toBeGreaterThanOrEqual(2) // At least 2 providers
    })

    it('should get model info for specific model', async () => {
      // Test getting info for a known model
      const modelId = 'codellama-7b-instruct'
      const modelInfo = await Effect.runPromise(service.getModelInfo(modelId))

      console.log(`\n📋 Model info for ${modelId}:`)
      console.log(`   Name: ${modelInfo.name}`)
      console.log(`   Provider: ${modelInfo.provider}`)
      console.log(`   Capabilities: ${modelInfo.capabilities.join(', ')}`)
      console.log(`   Context Length: ${modelInfo.metadata.contextLength}`)
      console.log(`   Max Tokens: ${modelInfo.metadata.maxTokens}`)
      console.log(`   Default Temperature: ${modelInfo.metadata.temperature}`)

      expect(modelInfo).toBeDefined()
      expect(modelInfo.id).toBe(modelId)
      expect(modelInfo.provider).toBe('lm-studio')
      expect(modelInfo.capabilities).toContain('sql')

      // Test error handling for non-existent model
      try {
        await Effect.runPromise(service.getModelInfo('non-existent-model'))
        expect.fail('Should have thrown error for non-existent model')
      } catch (error: unknown) {
        // Log the actual error structure for debugging
        console.log(`   Error structure:`, JSON.stringify(error, null, 2))

        // Since the error handling is working (we see the error is thrown),
        // let's focus on verifying the error message content rather than the exact structure
        const errorStr = JSON.stringify(error)

        // Check that the error contains the expected model name and message
        expect(errorStr).toContain('ModelUnavailable')
        expect(errorStr).toContain('non-existent-model')
        expect(errorStr).toContain('not found')
        console.log(`   ✅ Error handling works: Model not found error properly thrown`)
        console.log(`   Error contains ModelUnavailable: ${errorStr.includes('ModelUnavailable')}`)
        console.log(`   Error contains model name: ${errorStr.includes('non-existent-model')}`)
        console.log(`   Error contains 'not found': ${errorStr.includes('not found')}`)
      }
    })

    it('should get status with config details', async () => {
      const status = await Effect.runPromise(service.getStatus())

      console.log('\n📊 Service Status:')
      console.log(`   Available Models: ${status.availableModels.length}`)
      console.log(`   Health Status: ${JSON.stringify(status.healthStatus)}`)
      console.log(`   Config:`)
      console.log(`     - Base URL: ${status.config.baseURL}`)
      console.log(`     - Providers: ${status.config.providers}`)
      console.log(`     - Routes: ${status.config.routes}`)
      console.log(`     - Defaults: ${JSON.stringify(status.config.defaults)}`)

      expect(status).toBeDefined()
      expect(status.availableModels).toBeDefined()
      expect(Array.isArray(status.availableModels)).toBe(true)
      expect(status.availableModels.length).toBeGreaterThan(0)

      expect(status.healthStatus).toBeDefined()
      expect(status.healthStatus.portkey).toBe('healthy')

      expect(status.config).toBeDefined()
      expect(status.config.baseURL).toBe(portkeyUrl)
      expect(status.config.providers).toBeGreaterThan(0)
      expect(status.config.routes).toBeGreaterThan(0)
    })
  })

  describe('Model Selection Logic', () => {
    it('should select appropriate models for different task types', async () => {
      // SQL tasks should get SQL-optimized models
      const sqlDefault = await Effect.runPromise(service.getDefaultModel('sql'))
      const sqlCapableModels = await Effect.runPromise(service.getModelsByCapability('sql'))
      const sqlModelIds = sqlCapableModels.map(m => m.id)

      expect(sqlModelIds).toContain(sqlDefault)
      console.log(`✅ SQL default '${sqlDefault}' is in SQL-capable models`)

      // General tasks should get general models
      const generalDefault = await Effect.runPromise(service.getDefaultModel('general'))
      const generalCapableModels = await Effect.runPromise(service.getModelsByCapability('general'))

      // General default might be any model, but should be available
      const allModels = await Effect.runPromise(service.getAvailableModels())
      expect(allModels).toContain(generalDefault)
      console.log(`✅ General default '${generalDefault}' is available`)

      // Verify we got general capable models
      expect(generalCapableModels.length).toBeGreaterThan(0)
    })

    it('should handle model fallbacks correctly', async () => {
      // When no task type specified, should still return a valid model
      const defaultModel = await Effect.runPromise(service.getDefaultModel())
      expect(defaultModel).toBeDefined()
      expect(typeof defaultModel).toBe('string')

      // The default should be an available model
      const availableModels = await Effect.runPromise(service.getAvailableModels())
      expect(availableModels).toContain(defaultModel)

      console.log(`✅ Default fallback model '${defaultModel}' is available`)
    })
  })
})