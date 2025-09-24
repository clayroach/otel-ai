/**
 * LLM Manager Package - Portkey Gateway Integration
 *
 * Uses Portkey gateway for multi-model LLM orchestration.
 * Provides unified API for GPT, Claude, and local models through
 * configuration-driven routing with automatic failover and caching.
 */

// Core types - explicit exports only
export type {
  LLMConfig,
  LLMRequest,
  LLMResponse,
  LLMError,
  ConversationContext,
  ModelHealthStatus,
  ModelType,
  TaskType,
  RoutingStrategy,
  ModelClient
} from './types.js'

// Service Tags and Types
export { LLMManagerServiceTag } from './llm-manager-service.js'
export type { LLMManagerService, ManagerStatus } from './llm-manager-service.js'

// Layers ONLY - no factory functions
export { PortkeyGatewayLive } from './portkey-gateway-client.js'

// Backward compatibility Layer exports
export { LLMManagerAPIClientLayer as LLMManagerEssentials } from './api-client-layer.js'
export { PortkeyGatewayLive as LLMManagerLive } from './portkey-gateway-client.js'

// API Client Layer and Tag for server integration
export { LLMManagerAPIClientLayer, LLMManagerAPIClientTag } from './api-client-layer.js'

// Types only from api-client-layer
export type { LLMManagerAPIClientService, ServerModelInfo } from './api-client-layer.js'

// Model types from unified source
export type { ModelInfo, PortkeyConfig } from './model-types.js'

// Re-export Effect types for convenience
export { Effect, Layer, Stream } from 'effect'
