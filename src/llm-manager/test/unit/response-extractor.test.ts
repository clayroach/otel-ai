/**
 * Unit tests for Response Extractor
 */

import { describe, it, expect } from 'vitest'
import {
  isSQLSpecificModel,
  getModelConfig,
  extractResponseContent,
  needsResponseWrapping
} from '../../response-extractor.js'

describe('Response Extractor', () => {
  describe('isSQLSpecificModel', () => {
    it('should identify SQL-specific models', () => {
      expect(isSQLSpecificModel('sqlcoder-7b-2')).toBe(true)
      expect(isSQLSpecificModel('codellama-7b-instruct')).toBe(true)
      expect(isSQLSpecificModel('starcoder2-3b')).toBe(true)
      expect(isSQLSpecificModel('gpt-3.5-turbo')).toBe(false)
      expect(isSQLSpecificModel('claude-3-haiku-20240307')).toBe(false)
    })
  })

  describe('getModelConfig', () => {
    it('should return GPT-4 configuration', () => {
      const config = getModelConfig('gpt-4')
      expect(config).toMatchObject({
        contextLength: 128000,
        maxTokens: 4096,
        temperature: 0.7
      })
    })

    it('should return GPT-3.5 configuration', () => {
      const config = getModelConfig('gpt-3.5-turbo')
      expect(config).toMatchObject({
        contextLength: 16384,
        maxTokens: 4096,
        temperature: 0.7
      })
    })

    it('should return Claude configuration', () => {
      const config = getModelConfig('claude-3-haiku-20240307')
      expect(config).toMatchObject({
        contextLength: 200000,
        maxTokens: 4096,
        temperature: 0.7
      })
    })

    it('should return SQL model configuration', () => {
      const config = getModelConfig('sqlcoder-7b-2')
      expect(config).toMatchObject({
        contextLength: 8192,
        maxTokens: 2048,
        temperature: 0.3
      })
    })

    it('should return default configuration for unknown models', () => {
      const config = getModelConfig('unknown-model')
      expect(config).toMatchObject({
        contextLength: 4096,
        maxTokens: 2048,
        temperature: 0.7
      })
    })
  })

  describe('extractResponseContent', () => {
    it('should extract SQL from markdown blocks', () => {
      const content = '```sql\nSELECT * FROM users\n```'
      const result = extractResponseContent('codellama-7b-instruct', content)
      expect(result).toBe('SELECT * FROM users')
    })

    it('should extract JSON from markdown blocks', () => {
      const content = '```json\n{"key": "value"}\n```'
      const result = extractResponseContent('gpt-3.5-turbo', content)
      expect(result).toBe('{"key": "value"}')
    })

    it('should remove thinking tags from deepseek models', () => {
      const content = '<think>Thinking about this...</think>The answer is 42'
      const result = extractResponseContent('deepseek/deepseek-r1-0528-qwen3-8b', content)
      expect(result).toBe('The answer is 42')
    })

    it('should return content as-is for models without special formatting', () => {
      const content = 'Plain text response'
      const result = extractResponseContent('gpt-3.5-turbo', content)
      expect(result).toBe('Plain text response')
    })

    it('should handle empty content', () => {
      const result = extractResponseContent('any-model', '')
      expect(result).toBe('')
    })
  })

  describe('needsResponseWrapping', () => {
    it('should determine if SQL responses need wrapping', () => {
      expect(needsResponseWrapping('sqlcoder-7b-2', 'sql')).toBe(true)
      expect(needsResponseWrapping('codellama-7b-instruct', 'sql')).toBe(true)
      expect(needsResponseWrapping('gpt-3.5-turbo', 'sql')).toBe(false)
    })

    it('should determine if JSON responses need wrapping', () => {
      expect(needsResponseWrapping('gpt-3.5-turbo', 'json')).toBe(false)
      // Codellama can't generate JSON directly, so it needs wrapping
      expect(needsResponseWrapping('codellama-7b-instruct', 'json')).toBe(true)
    })

    it('should handle unknown models', () => {
      expect(needsResponseWrapping('unknown-model', 'sql')).toBe(false)
      expect(needsResponseWrapping('unknown-model', 'json')).toBe(false)
    })
  })
})