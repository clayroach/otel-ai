/**
 * Complete Service Layers
 *
 * Provides all service layer implementations for the LLM Manager.
 */

import { Layer } from 'effect'
import { LLMConfigLayer } from './config.js'
import { CacheLayer } from './cache.js'
import { ConversationStorageLayer } from './conversation-storage.js'
import { MetricsLayer } from './metrics.js'
import { ModelClientLayer } from './model-clients.js'
import { ModelRouterLayer } from './router.js'
// Removed old manager layer - using new unified manager instead
// import { InteractionLoggerLayer } from './interaction-logger.js' // TODO: Enable when interaction logging is needed

/**
 * Complete LLM Manager Context
 *
 * Provides all services needed for the LLM Manager to function.
 */
export const LLMManagerContext = Layer.mergeAll(
  LLMConfigLayer,
  CacheLayer,
  ConversationStorageLayer,
  MetricsLayer,
  ModelClientLayer,
  ModelRouterLayer
  // InteractionLoggerLayer // TODO: Enable when interaction logging is needed
)

/**
 * Essential Services Only
 *
 * Minimal service layer for basic functionality.
 */
export const LLMManagerEssentials = Layer.mergeAll(
  LLMConfigLayer,
  CacheLayer,
  MetricsLayer,
  ModelClientLayer
)
