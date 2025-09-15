/**
 * Model Registry - Stub for backward compatibility
 * All model information is now handled through Portkey gateway
 */

export const ModelRegistry = {
  DEFAULT_MODELS: {
    gpt: 'gpt-3.5-turbo',
    claude: 'claude-3-haiku-20240307',
    local: 'codellama-7b-instruct'
  },

  isValidModel: (_model: string) => true,

  getProvider: (model: string) => {
    if (model.includes('claude')) return 'anthropic'
    if (model.includes('gpt')) return 'openai'
    return 'local'
  }
}

export const getModelMetadata = (model: string) => ({
  id: model,
  provider: ModelRegistry.getProvider(model),
  name: model,
  displayName: model,
  type: model.includes('sql') || model.includes('coder') ? 'sql' : 'general',
  contextWindow: 4096,
  maxTokens: 2048,
  supportsStreaming: true,
  supportsJSON: true,
  supportsSQL: true,
  capabilities: {
    supportsStreaming: true,
    supportsJSON: true,
    supportsSQL: true,
    contextLength: 4096,
    maxTokens: 2048,
    sql: true,
    json: true,
    reasoning: true
  }
})
