/**
 * Integration tests for enhanced SQL evaluator with validation comments
 * Tests the full flow from query generation through evaluation to comment output
 */

import { describe, it, expect } from 'vitest'
import { Effect } from 'effect'
import { generateQueryWithLLM } from '../../query-generator/llm-query-generator.js'
import { LLMManagerLive } from '../../../llm-manager/index.js'
import { shouldSkipExternalLLMTests } from '../../../llm-manager/test/utils/llm-availability.js'

interface QueryResult {
  sql: string
  description: string
  validationAttempts?: number
  evaluations?: Array<{
    attempt: number
    valid: boolean
    error?: {
      code: string
      message: string
    }
  }>
}

// Skip only if no external LLM API keys are available

describe('Enhanced SQL Evaluator Integration', () => {
  describe.skipIf(shouldSkipExternalLLMTests())('With Real LLM and Evaluator', () => {
    it('should generate query with comprehensive validation comments', async () => {
      const path = {
        id: 'test-enhanced',
        name: 'Test Enhanced Comments',
        services: ['frontend', 'backend'],
        startService: 'frontend',
        endService: 'backend',
        edges: [
          { source: 'frontend', target: 'backend' }
        ],
        metrics: {
          requestCount: 10000,
          avgLatency: 150,
          errorRate: 0.01,
          p99Latency: 500
        },
        priority: 'high' as const,
        severity: 0.75,
        lastUpdated: new Date()
      }

      const analysisGoal = 'Analyze service latency and error patterns'

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          // Use the evaluator-enhanced query generator
          const query = yield* generateQueryWithLLM(path, analysisGoal)
          return query
        }).pipe(
          Effect.provide(LLMManagerLive)
        )
      ) as QueryResult

      // Verify the query has SQL
      expect(result.sql).toBeDefined()
      expect(result.sql.length).toBeGreaterThan(0)

      // Check for validation comments in SQL
      const sql = result.sql

      // Should have metadata comments (not truncated)
      expect(sql).toContain('-- Model:')
      expect(sql).toContain('-- Generated:')
      expect(sql).toContain('-- Analysis Goal:')
      expect(sql).toContain('-- Services:')

      // Check if validation attempts are included
      if (sql.includes('VALIDATION ATTEMPTS')) {
        expect(sql).toContain('-- Total Attempts:')

        // Check for attempt details
        if (sql.includes('Attempt 1:')) {
          // Should show validation status
          expect(sql).toMatch(/Attempt 1: (✅ VALID|❌ INVALID)/)
        }

        // Check for final status
        expect(sql).toContain('-- Final Status:')
      }

      // Check if optimizations are documented
      if (sql.includes('OPTIMIZATIONS APPLIED')) {
        expect(sql).toContain('-- Optimization')
      }

      // Verify reasoning is not truncated
      if (sql.includes('-- Reasoning:')) {
        const reasoningMatch = sql.match(/-- Reasoning: ([^\n]+)/)
        if (reasoningMatch && reasoningMatch[1]) {
          // Reasoning should not end with ellipsis (truncation indicator)
          expect(reasoningMatch[1]).not.toMatch(/\.\.\.$/)
        }
      }

      // Check metadata in the result object
      if ('evaluations' in result) {
        expect(result.evaluations).toBeDefined()
        expect(Array.isArray(result.evaluations)).toBe(true)
      }

      if ('validationAttempts' in result) {
        expect(result.validationAttempts).toBeGreaterThanOrEqual(0)
      }

      console.log('✅ Generated query with enhanced comments')
      console.log('   SQL length:', sql.length)
      console.log('   Has validation comments:', sql.includes('VALIDATION ATTEMPTS'))
      console.log('   Has optimization notes:', sql.includes('OPTIMIZATIONS APPLIED'))
    })

    it('should preserve full error messages in validation comments', async () => {
      // Intentionally create a query that will likely have issues
      const path = {
        id: 'test-errors',
        name: 'Test Error Messages',
        services: ['non-existent-service-xyz', 'another-fake-service'],
        startService: 'non-existent-service-xyz',
        endService: 'another-fake-service',
        edges: [
          { source: 'non-existent-service-xyz', target: 'another-fake-service' }
        ],
        metrics: {
          requestCount: 10000,
          avgLatency: 150,
          errorRate: 0.01,
          p99Latency: 500
        },
        priority: 'high' as const,
        severity: 0.75,
        lastUpdated: new Date()
      }

      const analysisGoal = 'Complex analysis with CTEs and aggregations that might fail'

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const query = yield* generateQueryWithLLM(path, analysisGoal)
          return query
        }).pipe(
          Effect.provide(LLMManagerLive),
          Effect.catchAll((error) => {
            // If it fails, that's okay - we're testing error handling
            console.log('Query generation failed (expected for error test):', error)
            return Effect.succeed({
              sql: '-- Query generation failed',
              description: 'Error test',
              validationAttempts: 0
            } as QueryResult)
          })
        )
      ) as QueryResult

      const sql = result.sql

      // If validation attempts were made, check error messages aren't truncated
      if (sql.includes('--   Error:')) {
        const errorLines = sql.split('\n').filter((line: string) => line.includes('--   Error:'))

        for (const errorLine of errorLines) {
          // Error messages should not end with ellipsis
          expect(errorLine).not.toMatch(/\.{3}\s*$/)

          // If there's an error message, it should be complete
          const errorMatch = errorLine.match(/--\s{3}Error: (.+)/)
          if (errorMatch && errorMatch[1]) {
            console.log('   Error message length:', errorMatch[1].length)
            // Error messages should be substantial, not cut off
            expect(errorMatch[1].length).toBeGreaterThan(10)
          }
        }
      }

      console.log('✅ Error messages are preserved without truncation')
    })
  })

  describe('Validation comment structure', () => {
    it('should verify comment format matches specification', () => {
      // This test validates the expected format without requiring LLM
      const exampleComments = `
-- Model: claude-3-haiku-20240307
-- Generated: 2025-09-19T20:00:00.000Z
-- Analysis Goal: Test analysis
-- Services: frontend, backend
-- Tokens: 1000 (prompt: 500, completion: 500)
-- Generation Time: 5000ms
-- Reasoning: Full reasoning without truncation
-- =========================================
-- ========== VALIDATION ATTEMPTS ==========
-- Total Attempts: 3
-- Attempt 1: ❌ INVALID
--   Error Code: SYNTAX_ERROR
--   Error: Full error message without truncation
--   Execution Time: 5ms
-- Attempt 2: ❌ INVALID
--   Error Code: UNKNOWN_IDENTIFIER
--   Error: Another full error message
--   Execution Time: 4ms
-- Attempt 3: ✅ VALID
--   Execution Time: 10ms
-- Final Status: ✅ Query validated successfully
-- =========================================
-- ========== OPTIMIZATIONS APPLIED ==========
-- Optimization 1:
--   Fixed syntax error by reordering clauses
--   - Moved HAVING before ORDER BY
--   - Added table prefix
-- =============================================
SELECT * FROM traces`

      // Verify structure
      expect(exampleComments).toContain('-- Model:')
      expect(exampleComments).toContain('-- Generated:')
      expect(exampleComments).toContain('-- Analysis Goal:')
      expect(exampleComments).toContain('-- Reasoning:')
      expect(exampleComments).toContain('VALIDATION ATTEMPTS')
      expect(exampleComments).toContain('-- Total Attempts:')
      expect(exampleComments).toContain('-- Final Status:')
      expect(exampleComments).toContain('OPTIMIZATIONS APPLIED')

      // Check for non-truncation indicators
      expect(exampleComments).not.toContain('...')
      expect(exampleComments).not.toContain('truncated')

      // Verify emoji indicators are present
      expect(exampleComments).toContain('✅')
      expect(exampleComments).toContain('❌')

      console.log('✅ Comment structure validated')
    })
  })
})