/**
 * Utility functions for checking LLM availability in tests
 */

import { Effect } from 'effect'

// Check if running in CI environment
export const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true'

/**
 * Check if required LLM API keys are available for testing
 */
export const checkLLMAvailability = () => {
  const hasOpenAI = !!process.env.OPENAI_API_KEY
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY

  return {
    hasOpenAI,
    hasAnthropic,
    hasAnyLLM: hasOpenAI || hasAnthropic,
    missingKeys: [!hasOpenAI && 'OPENAI_API_KEY', !hasAnthropic && 'ANTHROPIC_API_KEY'].filter(
      Boolean
    ) as string[]
  }
}

/**
 * Skip test if LLM is not available
 */
export const skipIfNoLLM = (testFn: () => void | Promise<void>) => {
  const availability = checkLLMAvailability()

  if (!availability.hasAnyLLM) {
    console.log(
      `⚠️ Skipping test: No LLM API keys found. Set ${availability.missingKeys.join(' or ')} to run this test.`
    )
    return
  }

  return testFn()
}

/**
 * Skip test if specific LLM provider is not available
 */
export const skipIfNoProvider = (
  provider: 'openai' | 'anthropic',
  testFn: () => void | Promise<void>
) => {
  const availability = checkLLMAvailability()

  if (provider === 'openai' && !availability.hasOpenAI) {
    console.log('⚠️ Skipping test: OPENAI_API_KEY not found')
    return
  }

  if (provider === 'anthropic' && !availability.hasAnthropic) {
    console.log('⚠️ Skipping test: ANTHROPIC_API_KEY not found')
    return
  }

  return testFn()
}

/**
 * Get test API keys (returns dummy keys if not available)
 */
export const getTestApiKeys = () => ({
  openai: process.env.OPENAI_API_KEY || 'test-openai-key',
  anthropic: process.env.ANTHROPIC_API_KEY || 'test-anthropic-key'
})

/**
 * Effect-based LLM availability check
 */
export const checkLLMAvailabilityEffect = Effect.sync(() => {
  const availability = checkLLMAvailability()

  if (!availability.hasAnyLLM) {
    return Effect.fail({
      _tag: 'NoLLMAvailable' as const,
      message: `No LLM API keys found. Set ${availability.missingKeys.join(' or ')} to run tests.`,
      missingKeys: availability.missingKeys
    })
  }

  return Effect.succeed(availability)
})

/**
 * Check if tests should be skipped due to missing LLM keys
 */
export const shouldSkipLLMTests = () => {
  const availability = checkLLMAvailability()
  return !availability.hasAnyLLM
}

/**
 * Log availability status for debugging
 */
export const logAvailabilityStatus = () => {
  const availability = checkLLMAvailability()

  if (!availability.hasAnyLLM) {
    console.log('⚠️ LLM Tests: No API keys found')
    console.log(`   Missing: ${availability.missingKeys.join(', ')}`)
  } else {
    console.log('✅ LLM Tests: API keys available')
    if (availability.hasOpenAI) console.log('   - OpenAI: Available')
    if (availability.hasAnthropic) console.log('   - Anthropic: Available')
  }
}

/**
 * Check for specific provider keys
 */
export const hasOpenAIKey = () => !!process.env.OPENAI_API_KEY
export const hasClaudeKey = () => !!process.env.ANTHROPIC_API_KEY

export default {
  checkLLMAvailability,
  skipIfNoLLM,
  skipIfNoProvider,
  getTestApiKeys,
  checkLLMAvailabilityEffect,
  shouldSkipLLMTests,
  logAvailabilityStatus,
  hasOpenAIKey,
  hasClaudeKey,
  isCI
}
