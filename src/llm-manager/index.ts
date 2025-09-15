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
export { PortkeyGatewayLive, makePortkeyGatewayManager } from './portkey-gateway-client.js'

// Backward compatibility exports for refactored code
export { PortkeyGatewayLive as LLMManagerLive } from './portkey-gateway-client.js'
export { LLMManagerAPIClientLayer as LLMManagerEssentials } from './api-client-layer.js'

// API Client Layer for server integration
export {
  LLMManagerAPIClientTag,
  LLMManagerAPIClientLayer,
  type LLMManagerAPIClientService,
  type ModelInfo,
  getLoadedModels,
  getLLMManagerStatus,
  selectBestModel,
  generateLLMResponse
} from './api-client-layer.js'

// Mock implementation for testing
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

// Re-export Effect types for convenience
export { Effect, Stream, Layer } from 'effect'
