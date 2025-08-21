/**
 * Model Client Service Implementation
 * 
 * Provides access to configured model clients.
 */

import { Effect, Layer, Stream } from 'effect'
import { ModelClientService, LLMConfigService } from './services.js'
import { makeLocalModelClient, defaultLocalConfig } from './clients/local-client.js'
import { makeOpenAIClient, defaultOpenAIConfig } from './clients/openai-client.js'
import { LLMConfigLayer } from './config.js'

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

    // Create OpenAI GPT client if configured
    const gptClient = config.models.gpt 
      ? (() => {
          const client = makeOpenAIClient({
            ...defaultOpenAIConfig,
            ...config.models.gpt
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

    // Claude client would be created here when implemented
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
).pipe(
  Layer.provide(LLMConfigLayer)
)