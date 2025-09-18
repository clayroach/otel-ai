/**
 * LLM Manager Package - Portkey Gateway Integration
 *
 * Uses Portkey gateway for multi-model LLM orchestration.
 * Provides unified API for GPT, Claude, and local models through
 * configuration-driven routing with automatic failover and caching.
 */

// Core types and schemas
export * from './types.js'

// Service interface
export { LLMManagerServiceTag } from './llm-manager-service.js'
export type { LLMManagerService, ManagerStatus } from './llm-manager-service.js'

// Portkey Gateway implementation
export { makePortkeyGatewayManager, PortkeyGatewayLive } from './portkey-gateway-client.js'

// Backward compatibility exports for refactored code
export { LLMManagerAPIClientLayer as LLMManagerEssentials } from './api-client-layer.js'
export { PortkeyGatewayLive as LLMManagerLive } from './portkey-gateway-client.js'

// API Client Layer for server integration
export {
  generateLLMResponse,
  getLLMManagerStatus,
  getLoadedModels,
  LLMManagerAPIClientLayer,
  LLMManagerAPIClientTag,
  selectBestModel,
  type LLMManagerAPIClientService,
  type ServerModelInfo
} from './api-client-layer.js'

// New rich model discovery APIs
export {
  getAllModels,
  getDefaultModel,
  getModelInfo,
  getModelsByCapability,
  getModelsByProvider
} from './api-client-layer.js'

// Model types from unified source
export type { ModelInfo, PortkeyConfig } from './model-types.js'

// Re-export Effect types for convenience
export { Effect, Layer, Stream } from 'effect'
