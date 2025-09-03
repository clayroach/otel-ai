/**
 * Model Registry
 *
 * Central registry for LLM model configurations and metadata.
 * Defines model-specific behaviors, capabilities, and response handling.
 */

// Model capability flags
export interface ModelCapabilities {
  /** Can generate structured JSON responses */
  json: boolean
  /** Can generate SQL queries */
  sql: boolean
  /** Can follow reasoning chains */
  reasoning: boolean
  /** Supports function calling */
  functions: boolean
  /** Supports streaming responses */
  streaming: boolean
}

// Model response format descriptor
export interface ResponseFormat {
  /** Type of response format */
  type: 'json' | 'sql' | 'markdown' | 'text' | 'mixed'
  /** Whether response includes wrapper markdown blocks */
  hasMarkdownBlocks: boolean
  /** Markdown block type if applicable (e.g., 'sql', 'json') */
  markdownBlockType?: string
  /** Whether model includes thinking/reasoning tags */
  hasThinkingTags: boolean
  /** Pattern for thinking tags if applicable */
  thinkingTagPattern?: RegExp
  /** Whether model responds with raw content for specific prompts */
  rawForSpecificPrompts?: boolean
}

// Model configuration and metadata
export interface ModelMetadata {
  /** Unique model identifier */
  id: string
  /** Display name for the model */
  displayName: string
  /** Model provider (e.g., 'openai', 'anthropic', 'meta', 'deepseek') */
  provider: string
  /** Model type/category */
  type: 'general' | 'code' | 'sql' | 'reasoning' | 'embedding'
  /** Model capabilities */
  capabilities: ModelCapabilities
  /** Response format descriptor */
  responseFormat: ResponseFormat
  /** Default context length */
  contextLength: number
  /** Maximum tokens the model can generate */
  maxTokens: number
  /** Optimal temperature for this model */
  defaultTemperature: number
  /** Cost per token (if applicable) */
  costPerToken?: number
  /** Additional notes about model behavior */
  notes?: string
}

// Model Registry
export const MODEL_REGISTRY: Record<string, ModelMetadata> = {
  'codellama-7b-instruct': {
    id: 'codellama-7b-instruct',
    displayName: 'Code Llama 7B Instruct',
    provider: 'meta',
    type: 'code',
    capabilities: {
      json: false,
      sql: true,
      reasoning: false,
      functions: false,
      streaming: true
    },
    responseFormat: {
      type: 'sql',
      hasMarkdownBlocks: true,
      markdownBlockType: 'sql',
      hasThinkingTags: false,
      rawForSpecificPrompts: true
    },
    contextLength: 32768,
    maxTokens: 4096,
    defaultTemperature: 0,
    notes:
      'Optimized for code generation. Returns SQL in markdown blocks. May not follow JSON instructions.'
  },

  'sqlcoder-7b-2': {
    id: 'sqlcoder-7b-2',
    displayName: 'SQLCoder 7B v2',
    provider: 'defog',
    type: 'sql',
    capabilities: {
      json: false,
      sql: true,
      reasoning: false,
      functions: false,
      streaming: true
    },
    responseFormat: {
      type: 'sql',
      hasMarkdownBlocks: true,
      markdownBlockType: 'sql',
      hasThinkingTags: false,
      rawForSpecificPrompts: true
    },
    contextLength: 8192,
    maxTokens: 2048,
    defaultTemperature: 0,
    notes: 'Specialized for SQL generation. Returns raw SQL or SQL in markdown blocks.'
  },

  'deepseek/deepseek-r1-0528-qwen3-8b': {
    id: 'deepseek/deepseek-r1-0528-qwen3-8b',
    displayName: 'DeepSeek R1 Qwen 8B',
    provider: 'deepseek',
    type: 'reasoning',
    capabilities: {
      json: true,
      sql: true,
      reasoning: true,
      functions: false,
      streaming: true
    },
    responseFormat: {
      type: 'mixed',
      hasMarkdownBlocks: true,
      markdownBlockType: 'json',
      hasThinkingTags: true,
      thinkingTagPattern: /<think>[\s\S]*?<\/think>/g,
      rawForSpecificPrompts: false
    },
    contextLength: 32768,
    maxTokens: 4096,
    defaultTemperature: 0.7,
    notes: 'Reasoning model with thinking tags. Good at following JSON instructions.'
  },

  'deepseek-r1-distill-qwen-7b': {
    id: 'deepseek-r1-distill-qwen-7b',
    displayName: 'DeepSeek R1 Distill Qwen 7B',
    provider: 'deepseek',
    type: 'reasoning',
    capabilities: {
      json: true,
      sql: true,
      reasoning: true,
      functions: false,
      streaming: true
    },
    responseFormat: {
      type: 'mixed',
      hasMarkdownBlocks: true,
      markdownBlockType: 'json',
      hasThinkingTags: true,
      thinkingTagPattern: /<think>[\s\S]*?<\/think>/g,
      rawForSpecificPrompts: false
    },
    contextLength: 32768,
    maxTokens: 4096,
    defaultTemperature: 0.7,
    notes: 'Distilled reasoning model. Follows instructions well.'
  },

  'deepseek-coder-v2-lite-instruct': {
    id: 'deepseek-coder-v2-lite-instruct',
    displayName: 'DeepSeek Coder V2 Lite',
    provider: 'deepseek',
    type: 'code',
    capabilities: {
      json: true,
      sql: true,
      reasoning: false,
      functions: false,
      streaming: true
    },
    responseFormat: {
      type: 'mixed',
      hasMarkdownBlocks: true,
      hasThinkingTags: false,
      rawForSpecificPrompts: false
    },
    contextLength: 16384,
    maxTokens: 4096,
    defaultTemperature: 0,
    notes: 'Code-focused model. Good at SQL and JSON generation.'
  },

  'openai/gpt-oss-20b': {
    id: 'openai/gpt-oss-20b',
    displayName: 'GPT OSS 20B',
    provider: 'openai',
    type: 'general',
    capabilities: {
      json: true,
      sql: true,
      reasoning: false,
      functions: true,
      streaming: true
    },
    responseFormat: {
      type: 'json',
      hasMarkdownBlocks: false,
      hasThinkingTags: false,
      rawForSpecificPrompts: false
    },
    contextLength: 8192,
    maxTokens: 4096,
    defaultTemperature: 0.7,
    notes: 'General purpose model. Reliable JSON generation.'
  },

  'gpt-oss-120b': {
    id: 'gpt-oss-120b',
    displayName: 'GPT OSS 120B',
    provider: 'openai',
    type: 'general',
    capabilities: {
      json: true,
      sql: true,
      reasoning: true,
      functions: true,
      streaming: true
    },
    responseFormat: {
      type: 'json',
      hasMarkdownBlocks: false,
      hasThinkingTags: false,
      rawForSpecificPrompts: false
    },
    contextLength: 32768,
    maxTokens: 8192,
    defaultTemperature: 0.7,
    notes: 'Large general purpose model. Excellent at complex tasks.'
  }
}

/**
 * Get model metadata by ID
 */
export const getModelMetadata = (modelId: string): ModelMetadata | undefined => {
  return MODEL_REGISTRY[modelId]
}

/**
 * Check if model is SQL-specific
 */
export const isSQLSpecificModel = (modelId: string): boolean => {
  const metadata = getModelMetadata(modelId)
  return (
    metadata?.type === 'sql' ||
    (metadata?.type === 'code' &&
      metadata?.capabilities.sql === true &&
      metadata?.responseFormat.type === 'sql')
  )
}

/**
 * Check if model uses thinking tags
 */
export const hasThinkingTags = (modelId: string): boolean => {
  const metadata = getModelMetadata(modelId)
  return metadata?.responseFormat.hasThinkingTags === true
}

/**
 * Get thinking tag pattern for model
 */
export const getThinkingTagPattern = (modelId: string): RegExp | undefined => {
  const metadata = getModelMetadata(modelId)
  return metadata?.responseFormat.thinkingTagPattern
}

/**
 * Check if model returns responses in markdown blocks
 */
export const hasMarkdownBlocks = (modelId: string): boolean => {
  const metadata = getModelMetadata(modelId)
  return metadata?.responseFormat.hasMarkdownBlocks === true
}

/**
 * Get markdown block type for model
 */
export const getMarkdownBlockType = (modelId: string): string | undefined => {
  const metadata = getModelMetadata(modelId)
  return metadata?.responseFormat.markdownBlockType
}

/**
 * Get optimal configuration for model
 */
export const getModelConfig = (
  modelId: string
): Partial<{
  contextLength: number
  maxTokens: number
  temperature: number
}> => {
  const metadata = getModelMetadata(modelId)
  if (!metadata) return {}

  return {
    contextLength: metadata.contextLength,
    maxTokens: metadata.maxTokens,
    temperature: metadata.defaultTemperature
  }
}

/**
 * Extract response content based on model metadata
 */
export const extractResponseContent = (modelId: string, rawContent: string): string => {
  const metadata = getModelMetadata(modelId)
  if (!metadata) return rawContent

  let content = rawContent.trim()

  // Remove thinking tags if present
  if (metadata.responseFormat.hasThinkingTags && metadata.responseFormat.thinkingTagPattern) {
    content = content.replace(metadata.responseFormat.thinkingTagPattern, '').trim()
  }

  // Handle markdown blocks
  if (metadata.responseFormat.hasMarkdownBlocks && metadata.responseFormat.markdownBlockType) {
    const blockType = metadata.responseFormat.markdownBlockType
    const blockStart = `\`\`\`${blockType}`
    const blockEnd = '```'

    if (content.startsWith(blockStart)) {
      content = content.substring(blockStart.length)
      if (content.endsWith(blockEnd)) {
        content = content.substring(0, content.length - blockEnd.length)
      }
      content = content.trim()
    }
  }

  return content
}

/**
 * Determine if response needs wrapping based on model
 */
export const needsResponseWrapping = (
  modelId: string,
  taskType: 'sql' | 'json' | 'general'
): boolean => {
  const metadata = getModelMetadata(modelId)
  if (!metadata) return false

  // SQL-specific models returning SQL for SQL tasks don't need wrapping
  if (taskType === 'sql' && metadata.responseFormat.type === 'sql') {
    return true // Needs wrapping into JSON structure
  }

  // Models that can generate JSON directly don't need wrapping for JSON tasks
  if (taskType === 'json' && metadata.capabilities.json) {
    return false
  }

  return metadata.responseFormat.rawForSpecificPrompts === true
}
