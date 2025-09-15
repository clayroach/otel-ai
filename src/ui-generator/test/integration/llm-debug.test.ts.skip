/**
 * LLM Debug Integration Test
 * 
 * This test outputs raw request/response data from LLMs to help debug
 * why certain models (like GPT-3.5-turbo) are failing validation.
 */

import { describe, it } from 'vitest'
import { Effect } from 'effect'
import { makeClaudeClient } from '../../../llm-manager/clients/claude-client.js'
import { makeOpenAIClient } from '../../../llm-manager/clients/openai-client.js'
import { makeLocalModelClient } from '../../../llm-manager/clients/local-client.js'
import type { LLMRequest } from '../../../llm-manager/types.js'

describe('LLM Raw Response Debug', () => {
  // Test prompt that should generate valid SQL
  const testPrompt = `You are a ClickHouse SQL expert. Generate a SQL query to analyze service latency.

Return ONLY valid JSON in this exact format:
{
  "sql": "SELECT...",
  "description": "Description of what the query does",
  "expectedColumns": ["column1", "column2"],
  "reasoning": "Why this query solves the problem"
}

The query MUST:
- Use FROM traces table (exactly "FROM traces")
- Include service_name field somewhere in the query
- Include WHERE clause
- Be valid ClickHouse SQL

Generate a query that shows p95 latency for each service in the critical path.`

  const request: LLMRequest = {
    prompt: testPrompt,
    taskType: 'analysis',
    preferences: {
      maxTokens: 1000,
      temperature: 0,
      requireStructuredOutput: true
    }
  }

  it.skipIf(!process.env.CLAUDE_API_KEY)('should debug Claude response', async () => {

    console.log('\n🔍 Testing claude-3-haiku-20240307')
    console.log('━'.repeat(60))
    
    const client = makeClaudeClient({
      apiKey: process.env.CLAUDE_API_KEY || '',
      model: 'claude-3-haiku-20240307',
      maxTokens: 1000,
      temperature: 0,
      timeout: 30000,
      endpoint: 'https://api.anthropic.com'
    })

    const result = await Effect.runPromise(
      client.generate(request).pipe(
        Effect.tapError(error => 
          Effect.sync(() => console.log('❌ Claude Error:', error))
        )
      )
    )

    console.log('\n📥 Raw Claude Response:')
    console.log('Content length:', result.content.length)
    console.log('First 1500 chars:')
    console.log(result.content.substring(0, 1500))
    
    // Try to parse as JSON
    try {
      const parsed = JSON.parse(result.content)
      console.log('\n✅ Valid JSON!')
      console.log('Keys:', Object.keys(parsed))
      console.log('\nSQL (first 500 chars):')
      console.log(parsed.sql?.substring(0, 500))
      
      // Check validation requirements
      const sql = parsed.sql?.toUpperCase() || ''
      console.log('\n🔍 Validation checks:')
      console.log('  - Has SELECT:', sql.includes('SELECT'))
      console.log('  - Has FROM traces:', sql.includes('FROM TRACES'))
      console.log('  - Has WHERE:', sql.includes('WHERE'))
      console.log('  - Has service_name:', sql.toLowerCase().includes('service_name'))
    } catch (e) {
      console.log('\n❌ Failed to parse as JSON:', e)
    }
  })

  it.skipIf(!process.env.OPENAI_API_KEY)('should debug GPT-3.5-turbo response', async () => {

    console.log('\n🔍 Testing GPT-3.5-turbo')
    console.log('━'.repeat(60))
    
    const client = makeOpenAIClient({
      apiKey: process.env.OPENAI_API_KEY || '',
      model: 'gpt-3.5-turbo',
      maxTokens: 1000,
      temperature: 0,
      timeout: 30000,
      endpoint: 'https://api.openai.com/v1'
    })

    const result = await Effect.runPromise(
      client.generate(request).pipe(
        Effect.tapError(error => 
          Effect.sync(() => console.log('❌ GPT Error:', error))
        )
      )
    )

    console.log('\n📥 Raw GPT Response:')
    console.log('Content length:', result.content.length)
    console.log('First 1500 chars:')
    console.log(result.content.substring(0, 1500))
    
    // Try to parse as JSON
    try {
      const parsed = JSON.parse(result.content)
      console.log('\n✅ Valid JSON!')
      console.log('Keys:', Object.keys(parsed))
      console.log('\nSQL (first 500 chars):')
      console.log(parsed.sql?.substring(0, 500))
      
      // Check validation requirements
      const sql = parsed.sql?.toUpperCase() || ''
      console.log('\n🔍 Validation checks:')
      console.log('  - Has SELECT:', sql.includes('SELECT'))
      console.log('  - Has FROM traces:', sql.includes('FROM TRACES'))
      console.log('  - Has WHERE:', sql.includes('WHERE'))
      console.log('  - Has service_name:', sql.toLowerCase().includes('service_name'))
      
      // If validation fails, show what's wrong
      if (!sql.includes('FROM TRACES')) {
        console.log('\n⚠️  Missing "FROM traces" - GPT might be using:')
        const fromMatch = sql.match(/FROM\s+(\w+)/i)
        if (fromMatch) {
          console.log('  Found: FROM', fromMatch[1])
        }
      }
      
      if (!sql.toLowerCase().includes('service_name')) {
        console.log('\n⚠️  Missing "service_name" field')
        console.log('  SQL contains these fields:')
        const fields = sql.match(/\b\w+\.\w+\b|\b\w+(?=\s*,|\s+FROM|\s+WHERE)/gi)
        if (fields) {
          console.log('  ', [...new Set(fields)].slice(0, 10).join(', '))
        }
      }
    } catch (e) {
      console.log('\n❌ Failed to parse as JSON:', e)
      
      // Check if it's wrapped in markdown
      if (result.content.includes('```')) {
        console.log('\n⚠️  Response contains markdown blocks')
        const jsonMatch = result.content.match(/```json\s*([\s\S]*?)```/i)
        if (jsonMatch && jsonMatch[1]) {
          console.log('Found JSON in markdown block, trying to parse...')
          try {
            const parsed = JSON.parse(jsonMatch[1])
            console.log('✅ Extracted valid JSON from markdown!')
            console.log('SQL:', parsed.sql?.substring(0, 200))
          } catch (e2) {
            console.log('❌ Still failed to parse:', e2)
          }
        }
      }
    }
  })

  it('should debug local model response (sqlcoder)', async () => {
    console.log('\n🔍 Testing sqlcoder-7b-2 (local)')
    console.log('━'.repeat(60))
    
    const client = makeLocalModelClient({
      endpoint: 'http://localhost:1234/v1',
      modelPath: 'sqlcoder-7b-2',
      model: 'sqlcoder-7b-2',
      contextLength: 8192,
      maxTokens: 1000,
      temperature: 0,
      threads: 4
    })

    try {
      const result = await Effect.runPromise(
        client.generate(request).pipe(
          Effect.tapError(error => 
            Effect.sync(() => console.log('❌ Local Model Error:', error))
          )
        )
      )

      console.log('\n📥 Raw Local Model Response:')
      console.log('Content length:', result.content.length)
      console.log('First 1500 chars:')
      console.log(result.content.substring(0, 1500))
      
      // Local models often return raw SQL
      if (result.content.toUpperCase().includes('SELECT')) {
        console.log('\n⚠️  Response appears to be raw SQL (not JSON)')
        const sql = result.content.toUpperCase()
        console.log('\n🔍 Validation checks:')
        console.log('  - Has SELECT:', sql.includes('SELECT'))
        console.log('  - Has FROM traces:', sql.includes('FROM TRACES'))
        console.log('  - Has WHERE:', sql.includes('WHERE'))
        console.log('  - Has service_name:', sql.toLowerCase().includes('service_name'))
      }
    } catch (error) {
      console.log('❌ Local model not available:', error)
    }
  })

  it.skipIf(!process.env.OPENAI_API_KEY)('should compare prompts that work vs fail', async () => {

    console.log('\n🔬 Testing different prompt strategies with GPT-3.5-turbo')
    console.log('━'.repeat(60))
    
    const client = makeOpenAIClient({
      apiKey: process.env.OPENAI_API_KEY || '',
      model: 'gpt-3.5-turbo',
      maxTokens: 1000,
      temperature: 0,
      timeout: 30000,
      endpoint: 'https://api.openai.com/v1'
    })

    // Strategy 1: Explicit table name
    const prompt1 = `Generate a ClickHouse SQL query.
IMPORTANT: You MUST use exactly "FROM traces" as the table name.
The table is called "traces" (not "trace" or anything else).

Return JSON:
{
  "sql": "SELECT ... FROM traces WHERE service_name = ...",
  "description": "..."
}

Query requirement: Show p95 latency by service_name from the traces table.`

    console.log('\n📝 Strategy 1: Explicit table name emphasis')
    const result1 = await Effect.runPromise(
      client.generate({
        prompt: prompt1,
        taskType: 'analysis',
        preferences: { maxTokens: 500, temperature: 0 }
      })
    )
    
    try {
      const parsed = JSON.parse(result1.content)
      console.log('✅ Valid JSON')
      console.log('SQL includes "FROM traces"?', parsed.sql?.toUpperCase().includes('FROM TRACES'))
      console.log('SQL preview:', parsed.sql?.substring(0, 150))
    } catch (e) {
      console.log('❌ Invalid JSON:', e)
    }

    // Strategy 2: Example-driven
    const prompt2 = `Generate a ClickHouse SQL query following this exact pattern:

Example:
{
  "sql": "SELECT service_name, quantile(0.95)(duration_ns/1000000) as p95_ms FROM traces WHERE start_time >= now() - INTERVAL 1 HOUR GROUP BY service_name",
  "description": "Calculate p95 latency by service"
}

Now generate a similar query for p95 latency analysis. Use the traces table.`

    console.log('\n📝 Strategy 2: Example-driven')
    const result2 = await Effect.runPromise(
      client.generate({
        prompt: prompt2,
        taskType: 'analysis',
        preferences: { maxTokens: 500, temperature: 0 }
      })
    )
    
    try {
      const parsed = JSON.parse(result2.content)
      console.log('✅ Valid JSON')
      console.log('SQL includes "FROM traces"?', parsed.sql?.toUpperCase().includes('FROM TRACES'))
      console.log('SQL preview:', parsed.sql?.substring(0, 150))
    } catch (e) {
      console.log('❌ Invalid JSON:', e)
    }
  })
})