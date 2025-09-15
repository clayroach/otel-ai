/**
 * Unit tests for Model Registry
 */

import { describe, it, expect } from 'vitest'
import {
  ModelRegistry,
  getModelMetadata,
  isSQLSpecificModel,
  hasThinkingTags,
  getThinkingTagPattern,
  hasMarkdownBlocks,
  getMarkdownBlockType,
  getModelConfig,
  extractResponseContent,
  needsResponseWrapping
} from '../../model-registry.js'

describe('ModelRegistry', () => {
  describe('DEFAULT_MODELS', () => {
    it('should have default models for each provider', () => {
      expect(ModelRegistry.DEFAULT_MODELS.gpt).toBe('gpt-3.5-turbo')
      expect(ModelRegistry.DEFAULT_MODELS.claude).toBe('claude-3-haiku-20240307')
      expect(ModelRegistry.DEFAULT_MODELS.local).toBe('codellama-7b-instruct')
    })
  })

  describe('isValidModel', () => {
    it('should always return true for any model', () => {
      expect(ModelRegistry.isValidModel('gpt-3.5-turbo')).toBe(true)
      expect(ModelRegistry.isValidModel('claude-3-haiku-20240307')).toBe(true)
      expect(ModelRegistry.isValidModel('invalid-model')).toBe(true)
      expect(ModelRegistry.isValidModel('')).toBe(true)
      expect(ModelRegistry.isValidModel('any-string')).toBe(true)
    })
  })

  describe('getProvider', () => {
    it('should identify Anthropic models', () => {
      expect(ModelRegistry.getProvider('claude-3-haiku-20240307')).toBe('anthropic')
      expect(ModelRegistry.getProvider('claude-3-sonnet-20240229')).toBe('anthropic')
      expect(ModelRegistry.getProvider('claude-3-opus')).toBe('anthropic')
      expect(ModelRegistry.getProvider('anthropic-claude')).toBe('anthropic')
    })

    it('should identify OpenAI models', () => {
      expect(ModelRegistry.getProvider('gpt-3.5-turbo')).toBe('openai')
      expect(ModelRegistry.getProvider('gpt-4')).toBe('openai')
      expect(ModelRegistry.getProvider('gpt-4-turbo')).toBe('openai')
      expect(ModelRegistry.getProvider('gpt-4o')).toBe('openai')
    })

    it('should default to local for unrecognized models', () => {
      expect(ModelRegistry.getProvider('codellama-7b-instruct')).toBe('local')
      expect(ModelRegistry.getProvider('llama2-13b')).toBe('local')
      expect(ModelRegistry.getProvider('mistral-7b')).toBe('local')
      expect(ModelRegistry.getProvider('unknown-model')).toBe('local')
      expect(ModelRegistry.getProvider('')).toBe('local')
    })

    it('should be case-sensitive', () => {
      expect(ModelRegistry.getProvider('GPT-3.5-TURBO')).toBe('local')
      expect(ModelRegistry.getProvider('CLAUDE-3-HAIKU')).toBe('local')
    })
  })
})

describe('getModelMetadata', () => {
  it('should return metadata for GPT models', () => {
    const metadata = getModelMetadata('gpt-3.5-turbo')

    expect(metadata).toBeDefined()
    if (metadata) {
      expect(metadata.id).toBe('gpt-3.5-turbo')
      expect(metadata.provider).toBe('openai')
      expect(metadata.displayName).toBe('GPT-4.1 Latest')
      expect(metadata.type).toBe('general')
      expect(metadata.contextLength).toBe(128000)
      expect(metadata.maxTokens).toBe(4096)

      expect(metadata.capabilities).toMatchObject({
        json: true,
        sql: true,
        reasoning: true,
        functions: true,
        streaming: true
      })
    }
  })

  it('should return metadata for Claude models', () => {
    const metadata = getModelMetadata('claude-3-haiku-20240307')

    expect(metadata).toBeDefined()
    if (metadata) {
      expect(metadata.id).toBe('claude-3-haiku-20240307')
      expect(metadata.provider).toBe('anthropic')
      expect(metadata.displayName).toBe('Claude 3.7 Sonnet')
      expect(metadata.type).toBe('general')
      expect(metadata.contextLength).toBe(200000)
      expect(metadata.maxTokens).toBe(4096)
    }
  })

  it('should identify SQL-specific models', () => {
    const sqlModel = getModelMetadata('sqlcoder-7b-2')
    expect(sqlModel?.type).toBe('sql')

    const coderModel = getModelMetadata('codellama-7b-instruct')
    expect(coderModel?.type).toBe('code')

    const generalModel = getModelMetadata('gpt-3.5-turbo')
    expect(generalModel?.type).toBe('general')
  })

  it('should return undefined for unknown models', () => {
    const metadata = getModelMetadata('unknown-model')
    expect(metadata).toBeUndefined()
  })

  it('should return metadata for local models', () => {
    const metadata = getModelMetadata('codellama-7b-instruct')

    expect(metadata).toBeDefined()
    if (metadata) {
      expect(metadata.id).toBe('codellama-7b-instruct')
      expect(metadata.provider).toBe('meta')
      expect(metadata.type).toBe('code')
      expect(metadata.capabilities.sql).toBe(true)
      expect(metadata.responseFormat.hasMarkdownBlocks).toBe(true)
      expect(metadata.responseFormat.markdownBlockType).toBe('sql')
    }
  })
})

describe('Model utility functions', () => {
  describe('isSQLSpecificModel', () => {
    it('should identify SQL-specific models', () => {
      expect(isSQLSpecificModel('sqlcoder-7b-2')).toBe(true)
      expect(isSQLSpecificModel('codellama-7b-instruct')).toBe(true)
      expect(isSQLSpecificModel('gpt-3.5-turbo')).toBe(false)
      expect(isSQLSpecificModel('claude-3-haiku-20240307')).toBe(false)
    })
  })

  describe('hasThinkingTags', () => {
    it('should identify models with thinking tags', () => {
      expect(hasThinkingTags('deepseek/deepseek-r1-0528-qwen3-8b')).toBe(true)
      expect(hasThinkingTags('deepseek-r1-distill-qwen-7b')).toBe(true)
      expect(hasThinkingTags('gpt-3.5-turbo')).toBe(false)
      expect(hasThinkingTags('codellama-7b-instruct')).toBe(false)
    })
  })

  describe('getThinkingTagPattern', () => {
    it('should return pattern for models with thinking tags', () => {
      const pattern = getThinkingTagPattern('deepseek/deepseek-r1-0528-qwen3-8b')
      expect(pattern).toBeInstanceOf(RegExp)
      expect(pattern?.test('<think>test</think>')).toBe(true)
    })

    it('should return undefined for models without thinking tags', () => {
      expect(getThinkingTagPattern('gpt-3.5-turbo')).toBeUndefined()
    })
  })

  describe('hasMarkdownBlocks', () => {
    it('should identify models that use markdown blocks', () => {
      expect(hasMarkdownBlocks('codellama-7b-instruct')).toBe(true)
      expect(hasMarkdownBlocks('sqlcoder-7b-2')).toBe(true)
      expect(hasMarkdownBlocks('gpt-3.5-turbo')).toBe(false)
    })
  })

  describe('getMarkdownBlockType', () => {
    it('should return block type for models with markdown blocks', () => {
      expect(getMarkdownBlockType('codellama-7b-instruct')).toBe('sql')
      expect(getMarkdownBlockType('sqlcoder-7b-2')).toBe('sql')
      expect(getMarkdownBlockType('deepseek/deepseek-r1-0528-qwen3-8b')).toBe('json')
    })

    it('should return undefined for models without markdown blocks', () => {
      expect(getMarkdownBlockType('gpt-3.5-turbo')).toBeUndefined()
    })
  })

  describe('getModelConfig', () => {
    it('should return model configuration', () => {
      const config = getModelConfig('gpt-3.5-turbo')
      expect(config).toMatchObject({
        contextLength: 128000,
        maxTokens: 4096,
        temperature: 0.7
      })
    })

    it('should return empty object for unknown models', () => {
      const config = getModelConfig('unknown-model')
      expect(config).toEqual({})
    })
  })

  describe('extractResponseContent', () => {
    it('should extract content from markdown blocks', () => {
      const content = '```sql\nSELECT * FROM users\n```'
      const result = extractResponseContent('codellama-7b-instruct', content)
      expect(result).toBe('SELECT * FROM users')
    })

    it('should remove thinking tags', () => {
      const content = '<think>Thinking about this...</think>The answer is 42'
      const result = extractResponseContent('deepseek/deepseek-r1-0528-qwen3-8b', content)
      expect(result).toBe('The answer is 42')
    })

    it('should return content as-is for models without special formatting', () => {
      const content = 'Plain text response'
      const result = extractResponseContent('gpt-3.5-turbo', content)
      expect(result).toBe('Plain text response')
    })

    it('should handle unknown models', () => {
      const content = 'Some content'
      const result = extractResponseContent('unknown-model', content)
      expect(result).toBe('Some content')
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