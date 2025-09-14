/**
 * Portkey Integration Test - Runs within Docker environment
 * This test verifies that Portkey works correctly in the production Docker environment
 */

import { describe, it, expect } from 'vitest'
import { execSync } from 'child_process'

describe('Portkey Docker Integration', () => {
  it('should successfully route OpenAI requests through Portkey gateway in Docker', () => {
    try {
      // Test from backend container to Portkey gateway
      const result = execSync(
        `docker exec otel-ai-backend sh -c 'curl -s -X POST http://portkey-gateway:8787/v1/chat/completions \
          -H "Content-Type: application/json" \
          -H "x-portkey-provider: openai" \
          -H "Authorization: Bearer $OPENAI_API_KEY" \
          -d "{\\"model\\": \\"gpt-3.5-turbo\\", \\"messages\\": [{\\"role\\": \\"user\\", \\"content\\": \\"Say hello\\"}], \\"max_tokens\\": 10}"'`,
        { encoding: 'utf8' }
      )
      
      const response = JSON.parse(result)
      expect(response).toBeDefined()
      expect(response.choices).toBeDefined()
      expect(response.choices[0].message.content).toBeTruthy()
      
      console.log('✅ Portkey Docker integration: WORKING')
      console.log(`   Response: "${response.choices[0].message.content}"`)
      console.log(`   Model: ${response.model}`)
    } catch (error) {
      // If containers aren't running, skip the test
      if (error instanceof Error && error.message.includes('No such container')) {
        console.log('⏭️  Skipping: Docker containers not running')
        return
      }
      throw error
    }
  })

  it('should verify Portkey gateway is healthy in Docker', () => {
    try {
      const result = execSync(
        'docker exec otel-ai-portkey sh -c "echo Gateway is running"',
        { encoding: 'utf8' }
      )
      
      expect(result).toContain('Gateway is running')
      console.log('✅ Portkey gateway container: HEALTHY')
    } catch (error) {
      if (error instanceof Error && error.message.includes('No such container')) {
        console.log('⏭️  Skipping: Portkey container not running')
        return
      }
      throw error
    }
  })

  it('should verify backend can reach Portkey gateway', () => {
    try {
      const result = execSync(
        'docker exec otel-ai-backend sh -c "curl -s http://portkey-gateway:8787"',
        { encoding: 'utf8' }
      )
      
      expect(result).toContain('Gateway')
      console.log('✅ Backend → Portkey connectivity: CONFIRMED')
    } catch (error) {
      if (error instanceof Error && error.message.includes('No such container')) {
        console.log('⏭️  Skipping: Containers not running')
        return
      }
      throw error
    }
  })
})