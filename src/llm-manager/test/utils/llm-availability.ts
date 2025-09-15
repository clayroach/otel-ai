/**
 * LLM Availability Test Utilities - Stub for backward compatibility
 * All models are now handled through Portkey gateway
 */

import { Effect } from 'effect'

export const checkLLMAvailability = () =>
  Effect.succeed({
    gpt: true,
    claude: true,
    local: true
  })

export const skipIfNoLLMs = () => {
  // No-op, all tests should run with Portkey gateway
}

export const skipIfNoGPT = () => {
  // No-op, Portkey handles GPT models
}

export const skipIfNoClaude = () => {
  // No-op, Portkey handles Claude models
}

export const skipIfNoLocal = () => {
  // No-op, Portkey handles local models
}

export const shouldSkipLLMTests = false

export const logAvailabilityStatus = () => {
  console.log('✅ All models available through Portkey gateway')
}

export const hasOpenAIKey = !!process.env.OPENAI_API_KEY
export const hasClaudeKey = !!process.env.CLAUDE_API_KEY || !!process.env.ANTHROPIC_API_KEY
export const isCI = process.env.CI === 'true'
