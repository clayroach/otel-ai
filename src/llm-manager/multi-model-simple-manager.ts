/**
 * Multi-Model Simple LLM Manager
 *
 * A simplified LLM manager that supports Claude, GPT, and local models
 * without requiring the full service layer infrastructure.
 */

import { Effect } from 'effect'
import { LLMRequest, LLMResponse, LLMError, LLMConfig } from './types.js'
import { makeLocalModelClient } from './clients/local-client.js'

/**
 * Create a multi-model simple LLM manager
 */
export const createMultiModelSimpleLLMManager = (config?: Partial<LLMConfig>) => {
  // Determine which models are available
  const hasClaudeAPI = !!process.env.CLAUDE_API_KEY
  const hasOpenAIAPI = !!process.env.OPENAI_API_KEY

  // For now, we'll create a local client and route based on environment
  const localConfig = config?.models?.llama || {
    endpoint: process.env.LLM_ENDPOINT || 'http://localhost:1234/v1',
    modelPath: 'sqlcoder-7b-2',
    contextLength: 32768,
    threads: 4
  }

  const localClient = makeLocalModelClient(localConfig)

  // Create Claude client if available
  const claudeGenerate = (request: LLMRequest): Effect.Effect<LLMResponse, LLMError, never> => {
    if (!hasClaudeAPI) {
      return Effect.fail({
        _tag: 'ModelUnavailable' as const,
        model: 'claude',
        message: 'Claude API key not configured'
      })
    }

    // For Claude, we make a direct API call
    const claudeModel = process.env.LLM_GENERAL_MODEL_1?.includes('claude')
      ? process.env.LLM_GENERAL_MODEL_1
      : 'claude-3-5-sonnet-20241022'

    return Effect.tryPromise({
      try: async () => {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.CLAUDE_API_KEY || '',
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: claudeModel,
            max_tokens: request.preferences?.maxTokens || 4096,
            temperature: request.preferences?.temperature || 0,
            messages: [
              {
                role: 'user',
                content: request.prompt
              }
            ]
          })
        })

        if (!response.ok) {
          throw new Error(`Claude API error: ${response.status}`)
        }

        const data = await response.json()

        const llmResponse: LLMResponse = {
          content: data.content[0].text,
          model: `claude-${claudeModel}`,
          usage: {
            promptTokens: data.usage?.input_tokens || 0,
            completionTokens: data.usage?.output_tokens || 0,
            totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
            cost: 0
          },
          metadata: {
            latencyMs: 0,
            retryCount: 0,
            cached: false,
            confidence: 0.9
          }
        }
        return llmResponse
      },
      catch: (error) => ({
        _tag: 'NetworkError' as const,
        model: claudeModel,
        message: `Claude API request failed: ${error}`
      })
    })
  }

  // Create GPT client if available
  const gptGenerate = (request: LLMRequest): Effect.Effect<LLMResponse, LLMError, never> => {
    if (!hasOpenAIAPI) {
      return Effect.fail({
        _tag: 'ModelUnavailable' as const,
        model: 'gpt',
        message: 'OpenAI API key not configured'
      })
    }

    const gptModel =
      process.env.LLM_GENERAL_MODEL_1?.includes('gpt') &&
      !process.env.LLM_GENERAL_MODEL_1?.includes('gpt-oss')
        ? process.env.LLM_GENERAL_MODEL_1
        : 'gpt-4-turbo-preview'

    return Effect.tryPromise({
      try: async () => {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: gptModel,
            messages: [
              {
                role: 'user',
                content: request.prompt
              }
            ],
            max_tokens: request.preferences?.maxTokens || 4096,
            temperature: request.preferences?.temperature || 0
          })
        })

        if (!response.ok) {
          throw new Error(`OpenAI API error: ${response.status}`)
        }

        const data = await response.json()

        const llmResponse: LLMResponse = {
          content: data.choices[0].message.content,
          model: `gpt-${gptModel}`,
          usage: {
            promptTokens: data.usage?.prompt_tokens || 0,
            completionTokens: data.usage?.completion_tokens || 0,
            totalTokens: data.usage?.total_tokens || 0,
            cost: 0
          },
          metadata: {
            latencyMs: 0,
            retryCount: 0,
            cached: false,
            confidence: 0.9
          }
        }
        return llmResponse
      },
      catch: (error) => ({
        _tag: 'NetworkError' as const,
        model: gptModel,
        message: `OpenAI API request failed: ${error}`
      })
    })
  }

  return {
    /**
     * Generate text using the best available model
     */
    generate: (request: LLMRequest): Effect.Effect<LLMResponse, LLMError, never> => {
      // Route based on availability - prefer external APIs
      if (hasClaudeAPI) {
        console.log('   Using Claude API for generation')
        return claudeGenerate(request)
      } else if (hasOpenAIAPI) {
        console.log('   Using OpenAI API for generation')
        return gptGenerate(request)
      } else {
        console.log('   Using local model for generation')
        return localClient.generate(request)
      }
    },

    /**
     * Check if any model is healthy
     */
    isHealthy: (): Effect.Effect<boolean, LLMError, never> => {
      if (hasClaudeAPI || hasOpenAIAPI) {
        return Effect.succeed(true)
      }
      return localClient.isHealthy()
    },

    /**
     * Get available models
     */
    getAvailableModels: () => {
      const models: string[] = []
      if (hasClaudeAPI) models.push('claude')
      if (hasOpenAIAPI) models.push('gpt')
      models.push('llama') // Always have local as fallback
      return Effect.succeed(models)
    }
  }
}
