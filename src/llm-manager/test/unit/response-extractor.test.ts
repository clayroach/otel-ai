/**
 * Unit tests for Response Extractor
 */

import { describe, it, expect } from 'vitest'
import {
  getModelConfig,
  extractResponseContent,
  needsResponseWrapping
} from '../../response-extractor.js'
import type { ModelInfo } from '../../model-types.js'

describe('Response Extractor', () => {

  describe('getModelConfig', () => {
    it('should return GPT-4 configuration', () => {
      const modelInfo: ModelInfo = {
        id: 'gpt-4',
        name: 'GPT-4',
        provider: 'openai',
        capabilities: ['general', 'code'],
        metadata: {
          contextLength: 128000,
          maxTokens: 4096,
          temperature: 0.7
        }
      }
      const config = getModelConfig(modelInfo)
      expect(config).toMatchObject({
        contextLength: 128000,
        maxTokens: 4096,
        temperature: 0.7
      })
    })

    it('should return GPT-3.5 configuration', () => {
      const modelInfo: ModelInfo = {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        provider: 'openai',
        capabilities: ['general'],
        metadata: {
          contextLength: 16384,
          maxTokens: 4096,
          temperature: 0.7
        }
      }
      const config = getModelConfig(modelInfo)
      expect(config).toMatchObject({
        contextLength: 16384,
        maxTokens: 4096,
        temperature: 0.7
      })
    })

    it('should return Claude configuration', () => {
      const modelInfo: ModelInfo = {
        id: 'claude-3-haiku-20240307',
        name: 'Claude 3 Haiku',
        provider: 'anthropic',
        capabilities: ['general'],
        metadata: {
          contextLength: 200000,
          maxTokens: 4096,
          temperature: 0.7
        }
      }
      const config = getModelConfig(modelInfo)
      expect(config).toMatchObject({
        contextLength: 200000,
        maxTokens: 4096,
        temperature: 0.7
      })
    })

    it('should return SQL model configuration', () => {
      const modelInfo: ModelInfo = {
        id: 'sqlcoder-7b-2',
        name: 'SQLCoder 7B v2',
        provider: 'custom',
        capabilities: ['sql'],
        metadata: {
          contextLength: 8192,
          maxTokens: 2048,
          temperature: 0.3,
          requiresWrapping: true
        }
      }
      const config = getModelConfig(modelInfo)
      expect(config).toMatchObject({
        contextLength: 8192,
        maxTokens: 2048,
        temperature: 0.3
      })
    })

    it('should return default configuration for unknown models', () => {
      const config = getModelConfig(null)
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
      const modelInfo: ModelInfo = {
        id: 'codellama-7b-instruct',
        name: 'CodeLlama 7B Instruct',
        provider: 'custom',
        capabilities: ['code', 'sql'],
        metadata: {
          contextLength: 8192,
          maxTokens: 2048,
          temperature: 0.1,
          responseFormat: 'markdown',
          requiresWrapping: true
        }
      }
      const result = extractResponseContent(content, modelInfo)
      expect(result).toBe('SELECT * FROM users')
    })

    it('should extract JSON from markdown blocks', () => {
      const content = '```json\n{"key": "value"}\n```'
      const modelInfo: ModelInfo = {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        provider: 'openai',
        capabilities: ['general'],
        metadata: {
          contextLength: 16384,
          maxTokens: 4096,
          temperature: 0.7
        }
      }
      const result = extractResponseContent(content, modelInfo)
      expect(result).toBe('{"key": "value"}')
    })

    it('should remove thinking tags from deepseek models', () => {
      const content = '<think>Thinking about this...</think>The answer is 42'
      const modelInfo: ModelInfo = {
        id: 'deepseek/deepseek-r1-0528-qwen3-8b',
        name: 'DeepSeek R1',
        provider: 'custom',
        capabilities: ['general'],
        metadata: {
          contextLength: 8192,
          maxTokens: 2048,
          temperature: 0.7
        }
      }
      const result = extractResponseContent(content, modelInfo)
      expect(result).toBe('The answer is 42')
    })

    it('should return content as-is for models without special formatting', () => {
      const content = 'Plain text response'
      const modelInfo: ModelInfo = {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        provider: 'openai',
        capabilities: ['general'],
        metadata: {
          contextLength: 16384,
          maxTokens: 4096,
          temperature: 0.7
        }
      }
      const result = extractResponseContent(content, modelInfo)
      expect(result).toBe('Plain text response')
    })

    it('should handle empty content', () => {
      const result = extractResponseContent('', null)
      expect(result).toBe('')
    })
  })

  describe('needsResponseWrapping', () => {
    it('should determine if SQL responses need wrapping', () => {
      const sqlcoderModel: ModelInfo = {
        id: 'sqlcoder-7b-2',
        name: 'SQLCoder 7B v2',
        provider: 'custom',
        capabilities: ['sql'],
        metadata: {
          contextLength: 8192,
          maxTokens: 2048,
          temperature: 0.1,
          requiresWrapping: true
        }
      }
      const codelamaModel: ModelInfo = {
        id: 'codellama-7b-instruct',
        name: 'CodeLlama 7B Instruct',
        provider: 'custom',
        capabilities: ['code', 'sql'],
        metadata: {
          contextLength: 8192,
          maxTokens: 2048,
          temperature: 0.1,
          requiresWrapping: true
        }
      }
      const gptModel: ModelInfo = {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        provider: 'openai',
        capabilities: ['general'],
        metadata: {
          contextLength: 16384,
          maxTokens: 4096,
          temperature: 0.7,
          requiresWrapping: false
        }
      }
      expect(needsResponseWrapping('sql', sqlcoderModel)).toBe(true)
      expect(needsResponseWrapping('sql', codelamaModel)).toBe(true)
      expect(needsResponseWrapping('sql', gptModel)).toBe(false)
    })

    it('should determine if JSON responses need wrapping', () => {
      const gptModel: ModelInfo = {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        provider: 'openai',
        capabilities: ['general'],
        metadata: {
          contextLength: 16384,
          maxTokens: 4096,
          temperature: 0.7,
          requiresWrapping: false
        }
      }
      const codelamaModel: ModelInfo = {
        id: 'codellama-7b-instruct',
        name: 'CodeLlama 7B Instruct',
        provider: 'custom',
        capabilities: ['code', 'sql'],
        metadata: {
          contextLength: 8192,
          maxTokens: 2048,
          temperature: 0.1,
          requiresWrapping: true
        }
      }
      expect(needsResponseWrapping('json', gptModel)).toBe(false)
      // Codellama can't generate JSON directly, so it needs wrapping
      expect(needsResponseWrapping('json', codelamaModel)).toBe(true)
    })

    it('should handle unknown models', () => {
      expect(needsResponseWrapping('sql', null)).toBe(false)
      expect(needsResponseWrapping('json', null)).toBe(false)
    })
  })
})