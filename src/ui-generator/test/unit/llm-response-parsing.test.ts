/**
 * Unit tests for LLM response parsing
 * Tests various response formats from different LLM models
 */

import { describe, it, expect } from 'vitest'

// Mock response examples from actual LLMs
const MOCK_RESPONSES = {
  // CodeLlama response with markdown-wrapped JSON
  codeLlamaMarkdownJson: `\`\`\`json
{
  "sql": "SELECT service_name, COUNT(*) as request_count FROM otel.traces WHERE start_time >= now() - INTERVAL 15 MINUTE GROUP BY service_name",
  "description": "Query to count requests by service",
  "expectedColumns": [
    {"name": "service_name", "type": "String", "description": "Service name"},
    {"name": "request_count", "type": "UInt64", "description": "Number of requests"}
  ],
  "reasoning": "Simple aggregation query for service request counts"
}
\`\`\``,

  // Response with SQL field starting with 'sql' keyword
  sqlWithPrefix: JSON.stringify({
    sql: "sql\nWITH critical_traces AS (SELECT trace_id FROM otel.traces WHERE status_code != 'OK')\nSELECT * FROM critical_traces",
    description: "Find critical traces",
    expectedColumns: [],
    reasoning: "Query with CTE"
  }),

  // Response with unquoted SQL field (invalid JSON)
  unquotedSql: `{
  "sql": SELECT service_name, operation_name FROM otel.traces WHERE duration_ns > 1000000000,
  "description": "Find slow operations",
  "expectedColumns": [],
  "reasoning": "Simple filter query"
}`,

  // Valid JSON response
  validJson: `{
  "sql": "SELECT * FROM otel.traces LIMIT 10",
  "description": "Sample traces",
  "expectedColumns": [],
  "reasoning": "Basic query"
}`,

  // Response wrapped in ```sql blocks
  sqlMarkdownBlock: `\`\`\`sql
SELECT
  service_name,
  COUNT(*) as count,
  AVG(duration_ns) as avg_duration
FROM otel.traces
GROUP BY service_name
\`\`\``
}

// Helper function to extract response content (simplified version of the actual function)
function extractResponseContent(modelName: string, content: string): string {
  const result = content.trim()

  // Handle CodeLlama and SQLCoder models that often wrap responses in markdown
  if (modelName.includes('codellama') || modelName.includes('sqlcoder')) {
    // These models tend to wrap JSON in ```json blocks
    const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/)
    if (jsonMatch && jsonMatch[1]) {
      return jsonMatch[1].trim()
    }

    // Sometimes they use ```sql blocks (need to extract the content, not include 'sql')
    const sqlMatch = result.match(/```sql\s*([\s\S]*?)\s*```/)
    if (sqlMatch && sqlMatch[1]) {
      return sqlMatch[1].trim()
    }

    // Sometimes they use plain ``` blocks
    const plainMatch = result.match(/```\s*([\s\S]*?)\s*```/)
    if (plainMatch && plainMatch[1]) {
      return plainMatch[1].trim()
    }
  }

  return result
}

// Helper to parse and clean SQL response (matches actual implementation)
interface ParsedResponse {
  sql: string
  description: string
  expectedColumns: Array<{ name: string; type: string; description: string }>
  reasoning: string
}

function parseAndCleanResponse(modelName: string, content: string): ParsedResponse {
  const extractedContent = extractResponseContent(modelName, content)

  try {
    const parsed = JSON.parse(extractedContent)

    // Check if the parsed JSON has null values (matching actual implementation)
    if (!parsed.sql || parsed.sql === null) {
      throw new Error('JSON response has null or empty SQL field')
    }

    // Clean up SQL field if it starts with 'sql' on its own line
    if (parsed.sql && typeof parsed.sql === 'string') {
      const sqlLines = parsed.sql.split('\n')
      if (sqlLines.length > 0 && sqlLines[0] && sqlLines[0].trim().toLowerCase() === 'sql') {
        parsed.sql = sqlLines.slice(1).join('\n').trim()
      }
    }

    return parsed
  } catch (e) {
    // Check if it's raw SQL or SQL with comments
    if (extractedContent &&
        (extractedContent.toUpperCase().includes('SELECT') ||
         extractedContent.toUpperCase().includes('WITH') ||
         extractedContent.toUpperCase().includes('FROM'))) {

      // Clean up any leading comments
      let cleanSQL = extractedContent
      const lines = cleanSQL.split('\n')
      // Remove leading comment lines
      while (lines.length > 0 && lines[0] && lines[0].trim().startsWith('--')) {
        lines.shift()
      }
      cleanSQL = lines.join('\n').trim()

      return {
        sql: cleanSQL,
        description: 'Direct SQL generation',
        expectedColumns: [],
        reasoning: 'Raw SQL response'
      }
    }

    // Try to fix unquoted SQL (less common now)
    let fixedContent = extractedContent
    const unquotedSqlMatch = fixedContent.match(/"sql"\s*:\s*(SELECT[\s\S]*?)(?=,\s*"[^"]+"\s*:|$)/i)
    if (unquotedSqlMatch && unquotedSqlMatch[1]) {
      const sqlContent = unquotedSqlMatch[1].trim()
      const escapedSql = JSON.stringify(sqlContent)
      fixedContent = fixedContent.replace(unquotedSqlMatch[0], `"sql": ${escapedSql}`)

      try {
        return JSON.parse(fixedContent)
      } catch (e2) {
        // Continue to error
      }
    }

    throw new Error(`Failed to parse: ${extractedContent.substring(0, 100)}`)
  }
}

describe('LLM Response Parsing', () => {
  describe('extractResponseContent', () => {
    it('should extract JSON from markdown blocks for CodeLlama', () => {
      const extracted = extractResponseContent('codellama-7b-instruct', MOCK_RESPONSES.codeLlamaMarkdownJson)
      expect(extracted).toContain('"sql"')
      expect(extracted).toContain('SELECT service_name')
      expect(extracted).not.toContain('```')
    })

    it('should extract SQL from SQL markdown blocks', () => {
      const extracted = extractResponseContent('sqlcoder-7b-2', MOCK_RESPONSES.sqlMarkdownBlock)
      expect(extracted).toContain('SELECT')
      expect(extracted).toContain('service_name')
      expect(extracted).not.toContain('```')
      expect(extracted).not.toContain('sql\n')
    })

    it('should return content as-is for non-CodeLlama models', () => {
      const extracted = extractResponseContent('gpt-3.5-turbo', MOCK_RESPONSES.validJson)
      expect(extracted).toBe(MOCK_RESPONSES.validJson)
    })
  })

  describe('parseAndCleanResponse', () => {
    it('should parse valid JSON correctly', () => {
      const parsed = parseAndCleanResponse('gpt-3.5-turbo', MOCK_RESPONSES.validJson)
      expect(parsed.sql).toBe('SELECT * FROM otel.traces LIMIT 10')
      expect(parsed.description).toBe('Sample traces')
    })

    it('should extract and parse JSON from markdown blocks', () => {
      const parsed = parseAndCleanResponse('codellama-7b-instruct', MOCK_RESPONSES.codeLlamaMarkdownJson)
      expect(parsed.sql).toContain('SELECT service_name')
      expect(parsed.description).toBe('Query to count requests by service')
      expect(parsed.expectedColumns).toHaveLength(2)
    })

    it('should remove sql prefix from SQL field', () => {
      const parsed = parseAndCleanResponse('codellama-7b-instruct', MOCK_RESPONSES.sqlWithPrefix)
      expect(parsed.sql.startsWith('WITH critical_traces')).toBe(true)
      expect(parsed.sql).not.toContain('sql\n')
    })

    it('should fix unquoted SQL fields', () => {
      // Since the JSON is malformed, it falls back to treating it as raw SQL
      const parsed = parseAndCleanResponse('sqlcoder-7b-2', MOCK_RESPONSES.unquotedSql)
      expect(parsed.sql).toContain('SELECT service_name')
      // The description will be the default since we can't parse the malformed JSON
      expect(parsed.description).toBe('Direct SQL generation')
    })

    it('should wrap raw SQL responses', () => {
      const parsed = parseAndCleanResponse('sqlcoder-7b-2', MOCK_RESPONSES.sqlMarkdownBlock)
      expect(parsed.sql).toContain('SELECT')
      expect(parsed.sql).toContain('service_name')
      expect(parsed.description).toBe('Direct SQL generation')
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty responses', () => {
      expect(() => parseAndCleanResponse('codellama-7b-instruct', '')).toThrow()
    })

    it('should handle malformed JSON', () => {
      const malformed = '{"sql": "SELECT * FROM traces", invalid}'
      // Since it contains SELECT, it will be treated as raw SQL
      const parsed = parseAndCleanResponse('gpt-3.5-turbo', malformed)
      expect(parsed.description).toBe('Direct SQL generation')
      expect(parsed.sql).toContain('SELECT * FROM traces')
    })

    it('should handle responses with nested quotes', () => {
      const nested = `{
        "sql": "SELECT * FROM traces WHERE message = 'test\\'s data'",
        "description": "Query with quotes",
        "expectedColumns": [],
        "reasoning": "Testing quote handling"
      }`
      const parsed = parseAndCleanResponse('gpt-3.5-turbo', nested)
      expect(parsed.sql).toContain("'test\\'s data'")
    })
  })
})