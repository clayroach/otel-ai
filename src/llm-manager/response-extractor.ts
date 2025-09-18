/**
 * Response Extractor - Handles extraction and cleaning of LLM responses
 * Uses model metadata from Portkey configuration for intelligent response processing
 */

import type { ModelInfo } from './model-types.js'

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
 * Some models (like deepseek) use thinking tags that should be removed
 */
export function removeThinkingTags(content: string): string {
  // Remove <think>...</think> or <thinking>...</thinking> tags
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .trim()
}

/**
 * Extract response content based on model metadata
 * Uses model metadata to determine how to process the response
 */
export function extractResponseContent(content: string, modelInfo?: ModelInfo | null): string {
  if (!content) return ''

  let processed = content.trim()

  // Remove thinking tags if present (some models use these)
  // This is a safe operation for all models
  processed = removeThinkingTags(processed)

  // If we have model metadata, use it to guide extraction
  if (modelInfo?.metadata?.responseFormat === 'markdown') {
    // Try to extract from markdown blocks based on model capabilities
    if (modelInfo.capabilities.includes('sql')) {
      const extracted = extractFromMarkdownBlock(processed, 'sql')
      if (extracted) return extracted
    }
  }

  // Try to extract JSON content if present
  const jsonExtracted = extractFromMarkdownBlock(processed, 'json')
  if (jsonExtracted) return jsonExtracted

  // Try to extract SQL content if present
  const sqlExtracted = extractFromMarkdownBlock(processed, 'sql')
  if (sqlExtracted) return sqlExtracted

  // Return cleaned content as-is
  return processed
}

/**
 * Determine if a model's response needs wrapping based on metadata
 */
export function needsResponseWrapping(
  responseType: 'sql' | 'json',
  modelInfo?: ModelInfo | null
): boolean {
  if (!modelInfo) return false

  // Check if model requires wrapping based on metadata
  if (modelInfo.metadata?.requiresWrapping) {
    // Models that require wrapping usually can't generate structured output directly
    if (responseType === 'json') return true
    if (responseType === 'sql' && modelInfo.capabilities.includes('sql')) return true
  }

  return false
}

/**
 * Check if a model has a specific capability
 */
export function hasCapability(capability: string, modelInfo?: ModelInfo | null): boolean {
  if (!modelInfo) return false
  return modelInfo.capabilities.includes(capability as 'general' | 'sql' | 'code' | 'embedding')
}

/**
 * Get model configuration defaults from metadata
 */
export function getModelConfig(modelInfo?: ModelInfo | null): {
  contextLength: number
  maxTokens: number
  temperature: number
} {
  // Return defaults from model metadata or fallback to sensible defaults
  return {
    contextLength: modelInfo?.metadata?.contextLength || 4096,
    maxTokens: modelInfo?.metadata?.maxTokens || 2048,
    temperature: modelInfo?.metadata?.temperature || 0.7
  }
}
