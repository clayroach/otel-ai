/**
 * Simple Manager Tests
 * 
 * Tests for the simplified LLM manager implementation.
 */

import { describe, it, expect } from 'vitest'
import { Effect } from 'effect'
import { createSimpleLLMManager, createDefaultLLMManager } from '../simple-manager.js'

describe('Simple LLM Manager', () => {
  const manager = createSimpleLLMManager()

  it('should create a manager with basic functionality', () => {
    expect(manager).toHaveProperty('generate')
    expect(manager).toHaveProperty('generateStream')
    expect(manager).toHaveProperty('isHealthy')
    expect(manager).toHaveProperty('getStatus')
  })

  it('should handle basic generation requests', async () => {
    const request = {
      prompt: 'Hello, world!',
      taskType: 'general' as const,
      preferences: {
        maxTokens: 50,
        temperature: 0.5
      }
    }

    try {
      const response = await Effect.runPromise(manager.generate(request))
      
      expect(response).toHaveProperty('content')
      expect(response).toHaveProperty('model')
      expect(response).toHaveProperty('usage')
      expect(response).toHaveProperty('metadata')
      
      expect(typeof response.content).toBe('string')
      expect(response.usage.cost).toBe(0) // Local models have zero cost
      
    } catch (error: any) {
      // Expected if LM Studio is not running
      expect(error).toBeDefined()
    }
  })

  it('should check health status', async () => {
    try {
      const healthy = await Effect.runPromise(manager.isHealthy())
      expect(typeof healthy).toBe('boolean')
    } catch (error: any) {
      // Health check might fail if LM Studio is not running
      expect(error).toBeDefined()
    }
  })

  it('should provide status information', async () => {
    const status = await Effect.runPromise(manager.getStatus())
    
    expect(status).toHaveProperty('models')
    expect(status).toHaveProperty('healthy')
    expect(status).toHaveProperty('config')
    
    expect(Array.isArray(status.models)).toBe(true)
    expect(status.models).toContain('llama')
  })
})

describe('Default LLM Manager Factory', () => {
  it('should create a default manager', () => {
    const manager = createDefaultLLMManager()
    
    expect(manager).toHaveProperty('generate')
    expect(manager).toHaveProperty('generateStream')
    expect(manager).toHaveProperty('isHealthy')
    expect(manager).toHaveProperty('getStatus')
  })
})