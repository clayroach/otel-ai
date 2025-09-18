import { Effect, pipe } from 'effect'
import { describe, expect, it } from 'vitest'
import { LLMManagerLive } from '../../../llm-manager/index.js'
import { generateQueryWithLLM } from '../../query-generator/llm-query-generator.js'
import type { CriticalPath } from '../../query-generator/types.js'
import { shouldSkipLLMTests } from '../../../llm-manager/test/utils/llm-availability.js'

describe.skipIf(shouldSkipLLMTests())('Metadata Comments in Generated SQL', () => {
  it('should include comprehensive metadata in SQL comments', async () => {
    const testPath: CriticalPath = {
      id: 'test-metadata-path',
      name: 'Metadata Test Path',
      services: ['frontend', 'backend', 'database'],
      startService: 'frontend',
      endService: 'database'
    }

    const analysisGoal = 'Analyze service latency patterns and identify performance bottlenecks'

    const result = await Effect.runPromise(
      pipe(
        generateQueryWithLLM(testPath, analysisGoal, {
          // Force Claude model for this test to ensure cloud model is used
          model: 'claude-3-haiku-20240307'
        }),
        Effect.provide(LLMManagerLive)
      )
    )

    console.log('\n=== GENERATED SQL WITH METADATA ===')
    console.log(result.sql)
    console.log('=== END SQL ===\n')

    // Verify metadata is present in SQL comments
    const sqlLines = result.sql.split('\n')
    const commentLines = sqlLines.filter(line => line.startsWith('--'))

    // Check for required metadata fields
    expect(commentLines.some(line => line.includes('Model:'))).toBe(true)
    expect(commentLines.some(line => line.includes('Generated:'))).toBe(true)
    expect(commentLines.some(line => line.includes('Analysis Goal:'))).toBe(true)
    expect(commentLines.some(line => line.includes('Services:'))).toBe(true)

    // CRITICAL: Verify that Claude model was actually used (not a local model)
    const modelLine = commentLines.find(line => line.includes('Model:'))
    expect(modelLine).toBeDefined()
    expect(modelLine).toContain('claude')
    expect(modelLine).not.toContain('codellama')
    expect(modelLine).not.toContain('sqlcoder')
    console.log('✅ Verified Claude model was used:', modelLine)

    // These might not always be present depending on the model response
    const hasTokenInfo = commentLines.some(line => line.includes('Tokens:'))
    const hasGenerationTime = commentLines.some(line => line.includes('Generation Time:'))

    console.log('Metadata includes:')
    console.log('- Model: ✓ (claude-3-haiku-20240307)')
    console.log('- Generated timestamp: ✓')
    console.log('- Analysis goal: ✓')
    console.log('- Services: ✓')
    console.log(`- Token usage: ${hasTokenInfo ? '✓' : '✗ (not provided by model)'}`)
    console.log(`- Generation time: ${hasGenerationTime ? '✓' : '✗ (not provided by model)'}`)
  }, 30000)
})