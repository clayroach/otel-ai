/**
 * Response Extractor - Handles extraction and cleaning of LLM responses
 * Separated from model registry for cleaner architecture
 */

/**
 * Extract content from markdown code blocks
 */
export function extractFromMarkdownBlock(
  content: string,
  blockType: 'sql' | 'json'
): string | null {
  const patterns = {
    sql: /```(?:sql|SQL)\n([\s\S]*?)```/,
    json: /```(?:json|JSON)\n([\s\S]*?)```/
  }

  const match = content.match(patterns[blockType])
  return match && match[1] ? match[1].trim() : null
}

/**
 * Remove thinking tags from content
 */
export function removeThinkingTags(content: string): string {
  // Remove <think>...</think> or <thinking>...</thinking> tags
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .trim()
}

/**
 * Extract response content based on model characteristics
 * This handles model-specific response formats and cleaning
 */
export function extractResponseContent(
  modelName: string,
  content: string
): string {
  if (!content) return ''

  let processed = content.trim()

  // Handle models that use thinking tags (deepseek models)
  if (modelName.toLowerCase().includes('deepseek')) {
    processed = removeThinkingTags(processed)
  }

  // Handle SQL-specific models that return SQL in markdown blocks
  const isSQLModel =
    modelName.toLowerCase().includes('sqlcoder') ||
    modelName.toLowerCase().includes('codellama') ||
    modelName.toLowerCase().includes('starcoder')

  if (isSQLModel) {
    const extracted = extractFromMarkdownBlock(processed, 'sql')
    if (extracted) return extracted
  }

  // Handle models that return JSON in markdown blocks
  const extracted = extractFromMarkdownBlock(processed, 'json')
  if (extracted) return extracted

  // Return cleaned content as-is
  return processed
}

/**
 * Determine if a model's response needs wrapping for a specific type
 */
export function needsResponseWrapping(
  modelName: string,
  responseType: 'sql' | 'json'
): boolean {
  const modelLower = modelName.toLowerCase()

  // SQL-specific models that return raw SQL
  const sqlModels = ['sqlcoder', 'codellama', 'starcoder']
  const isSQLModel = sqlModels.some(m => modelLower.includes(m))

  if (responseType === 'sql' && isSQLModel) {
    return true // These models return raw SQL that needs JSON wrapping
  }

  if (responseType === 'json' && isSQLModel) {
    return true // These models can't generate JSON directly
  }

  return false
}

/**
 * Check if a model is SQL-specific
 */
export function isSQLSpecificModel(modelName: string): boolean {
  const modelLower = modelName.toLowerCase()
  const sqlModels = ['sqlcoder', 'codellama', 'starcoder']
  return sqlModels.some(m => modelLower.includes(m))
}

/**
 * Get model configuration defaults
 */
export function getModelConfig(modelName: string): {
  contextLength?: number
  maxTokens?: number
  temperature?: number
} {
  const modelLower = modelName.toLowerCase()

  // GPT models
  if (modelLower.includes('gpt-4')) {
    return {
      contextLength: 128000,
      maxTokens: 4096,
      temperature: 0.7
    }
  }

  if (modelLower.includes('gpt-3.5')) {
    return {
      contextLength: 16384,
      maxTokens: 4096,
      temperature: 0.7
    }
  }

  // Claude models
  if (modelLower.includes('claude')) {
    return {
      contextLength: 200000,
      maxTokens: 4096,
      temperature: 0.7
    }
  }

  // Local models (generally smaller context)
  if (isSQLSpecificModel(modelName)) {
    return {
      contextLength: 8192,
      maxTokens: 2048,
      temperature: 0.3 // Lower temperature for SQL generation
    }
  }

  // Default for unknown models
  return {
    contextLength: 4096,
    maxTokens: 2048,
    temperature: 0.7
  }
}