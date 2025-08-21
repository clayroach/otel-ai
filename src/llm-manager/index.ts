/**
 * LLM Manager Package
 * 
 * Multi-model LLM orchestration for AI-native observability platform.
 * Provides unified API for GPT, Claude, and local Llama models with
 * intelligent routing, caching, and conversation management.
 */

// Core types and schemas
export * from './types.js'

// Service definitions
export * from './services.js'

// Main implementation
export { makeLLMManager, LLMManagerLayer } from './manager.js'

// Model router
export { makeModelRouter, ModelRouterLayer, getPerformanceMetrics } from './router.js'

// Configuration
export { 
  makeLLMConfigService, 
  LLMConfigLayer, 
  defaultLLMConfig,
  printConfigStatus,
  ENV_DOCS 
} from './config.js'

// Local model client
export { 
  makeLocalModelClient, 
  createDefaultLocalClient, 
  checkLocalModelHealth,
  defaultLocalConfig 
} from './clients/local-client.js'

// Simple manager (working foundation)
export { 
  createSimpleLLMManager, 
  createDefaultLLMManager 
} from './simple-manager.js'

// Service layers
export { LLMManagerContext, LLMManagerEssentials } from './layers.js'
export { CacheLayer } from './cache.js'
export { ConversationStorageLayer } from './conversation-storage.js'
export { MetricsLayer } from './metrics.js'
export { ModelClientLayer } from './model-clients.js'

// Re-export Effect types for convenience
export { Effect, Stream, Layer } from 'effect'