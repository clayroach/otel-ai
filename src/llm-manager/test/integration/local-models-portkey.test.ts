/**
 * Integration test for local models through Portkey gateway
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { Effect } from 'effect'
import { makePortkeyGatewayManager } from '../../portkey-gateway-client.js'
import type { LLMRequest } from '../../types.js'

// Skip in CI since LM Studio won't be available
const isCI = Boolean(process.env.CI || process.env.GITHUB_ACTIONS)

describe.skipIf(isCI)('Local Models via Portkey Gateway', () => {
  const portkeyUrl = process.env.PORTKEY_GATEWAY_URL || 'http://localhost:8787'
  const manager = makePortkeyGatewayManager(portkeyUrl)

  beforeAll(() => {
    console.log('🔧 Testing local models through Portkey gateway')
    console.log(`   Portkey URL: ${portkeyUrl}`)
    console.log(`   LM Studio expected at: http://localhost:1234`)
  })

  it('should generate SQL query using codellama-7b-instruct', async () => {
    const request: LLMRequest = {
      prompt: 'Generate a SQL query to select all records from a users table where age > 18',
      taskType: 'general' as const,
      preferences: {
        model: 'codellama-7b-instruct',
        maxTokens: 200,
        temperature: 0.1
      }
    }

    const result = await Effect.runPromiseExit(
      Effect.flatMap(manager, m => m.generate(request))
    )

    if (result._tag === 'Success') {
      console.log('✅ CodeLlama response:', result.value.content.substring(0, 100))
      expect(result.value.model).toBe('codellama-7b-instruct')
      expect(result.value.content).toBeTruthy()
      expect(result.value.content.toLowerCase()).toContain('select')
    } else {
      console.error('❌ CodeLlama failed:', result.cause)
      console.log('🔍 Failure details:', JSON.stringify(result.cause, null, 2))
      // Fail the test if LM Studio should be available
      expect.fail(`Local model codellama-7b-instruct should be available through Portkey but failed: ${JSON.stringify(result.cause)}`)
    }
  })

  it('should generate SQL query using sqlcoder-7b-2', async () => {
    const request: LLMRequest = {
      prompt: 'Generate a SQL query to count users grouped by country',
      taskType: 'general' as const,
      preferences: {
        model: 'sqlcoder-7b-2',
        maxTokens: 200,
        temperature: 0.1
      }
    }

    const result = await Effect.runPromiseExit(
      Effect.flatMap(manager, m => m.generate(request))
    )

    if (result._tag === 'Success') {
      console.log('✅ SQLCoder response:', result.value.content.substring(0, 100))
      expect(result.value.model).toBe('sqlcoder-7b-2')
      expect(result.value.content).toBeTruthy()
      expect(result.value.content.toLowerCase()).toContain('select')
    } else {
      console.error('❌ SQLCoder failed:', result.cause)
      console.log('🔍 Failure details:', JSON.stringify(result.cause, null, 2))
      // Fail the test if LM Studio should be available
      expect.fail(`Local model sqlcoder-7b-2 should be available through Portkey but failed: ${JSON.stringify(result.cause)}`)
    }
  })

  it('should list all available models including local ones', async () => {
    const result = await Effect.runPromise(
      Effect.flatMap(manager, m => m.getAvailableModels())
    )

    console.log('📋 Available models:', result)

    expect(result).toContain('codellama-7b-instruct')
    expect(result).toContain('sqlcoder-7b-2')
    expect(result).toContain('gpt-3.5-turbo')
    expect(result).toContain('claude-3-haiku-20240307')
  })

  it('should show health status for local models', async () => {
    const result = await Effect.runPromise(
      Effect.flatMap(manager, m => m.getStatus())
    )

    console.log('📊 Model health status:', result.healthStatus)

    // Check if healthStatus contains model status or fall back to checking overall Portkey health
    const healthStatus = result.healthStatus as Record<string, string>
    if (healthStatus['codellama-7b-instruct']) {
      expect(healthStatus['codellama-7b-instruct']).toBe('healthy')
    } else {
      expect(healthStatus.portkey).toBe('healthy')
    }
    if (healthStatus['sqlcoder-7b-2']) {
      expect(healthStatus['sqlcoder-7b-2']).toBe('healthy')
    } else {
      expect(healthStatus.portkey).toBe('healthy')
    }
  })
})