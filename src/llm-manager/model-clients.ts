/**
 * Model Client Service Implementation
 * 
 * Provides access to configured model clients.
 */

import { Effect, Layer, Stream } from 'effect'
import { ModelClientService, LLMConfigService } from './services.js'
import { makeLocalModelClient, defaultLocalConfig } from './clients/local-client.js'

/**
 * Model Client Service Implementation
 */
export const makeModelClientService = () =>
  Effect.gen(function* (_) {
    const configService = yield* _(LLMConfigService)
    const config = yield* _(configService.getConfig())

    // Create local client if configured
    const llamaClient = config.models.llama 
      ? (() => {
          const client = makeLocalModelClient({
            ...defaultLocalConfig,
            ...config.models.llama,
            endpoint: config.models.llama.endpoint || defaultLocalConfig.endpoint
          })
          
          // Ensure generateStream is always available
          return {
            ...client,
            generateStream: client.generateStream || (() => 
              Stream.fail({
                _tag: 'ConfigurationError' as const,
                message: 'Streaming not supported by this model'
              })
            )
          }
        })()
      : undefined

    // GPT and Claude clients would be created here when implemented
    const gptClient = undefined
    const claudeClient = undefined

    return {
      gpt: gptClient,
      claude: claudeClient,
      llama: llamaClient
    }
  })

/**
 * Model Client Service Layer
 */
export const ModelClientLayer = Layer.effect(
  ModelClientService,
  makeModelClientService()
)