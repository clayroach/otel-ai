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

// Removed old manager exports - using new unified manager instead

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

// Core unified manager (only types, no direct constructors)
export type { LLMManager, ModelClient } from './llm-manager.js'

// Service interface and tag
export { LLMManagerServiceTag } from './llm-manager-service.js'
export type { LLMManagerService, ManagerStatus } from './llm-manager-service.js'

// Live implementation layers (Layer-only, no factory functions)
export { LLMManagerLive, LLMManagerDev } from './llm-manager-live.js'

// Portkey Gateway implementation (Alternative to custom routing)
export { PortkeyGatewayLive } from './portkey-gateway-client.js'

// Mock implementation layers for testing
export {
  createMockLayer,
  LLMManagerMock,
  LLMManagerMockWithError,
  LLMManagerMockWithTimeout,
  LLMManagerMockWithLatency,
  LLMManagerMockWithCustomResponses,
  LLMManagerMockMultiModel,
  LLMManagerMockRateLimit,
  LLMManagerMockAuthError,
  DynamicMock
} from './llm-manager-mock.js'
export type { MockConfig } from './llm-manager-mock.js'

// Service layers
export { LLMManagerContext, LLMManagerEssentials } from './layers.js'
export { CacheLayer } from './cache.js'
export { ConversationStorageLayer } from './conversation-storage.js'
export { MetricsLayer } from './metrics.js'
export { ModelClientLayer } from './model-clients.js'

// API Client Layer for server integration
export {
  LLMManagerAPIClientTag,
  LLMManagerAPIClientLayer,
  type LLMManagerAPIClientService,
  getLoadedModels as getLoadedModelsEffect,
  getLLMManagerStatus as getLLMManagerStatusEffect,
  selectBestModel as selectBestModelEffect,
  generateLLMResponse
} from './api-client-layer.js'

// Re-export Effect types for convenience
export { Effect, Stream, Layer } from 'effect'
