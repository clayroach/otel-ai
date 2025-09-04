/**
 * Shared utility for checking LLM availability in integration tests
 * Handles API key detection and CI environment detection
 */

/**
 * Check if OpenAI API key is available
 */
export const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY)

/**
 * Check if Claude API key is available
 */
export const hasClaudeKey = Boolean(process.env.CLAUDE_API_KEY)

/**
 * Check if running in CI environment
 * Checks for common CI environment variables
 */
export const isCI = Boolean(
  process.env.CI ||
    process.env.GITHUB_ACTIONS ||
    process.env.CIRCLECI ||
    process.env.GITLAB_CI ||
    process.env.TRAVIS ||
    process.env.JENKINS_URL ||
    process.env.BUILDKITE
)

/**
 * Determine if LLM tests should be skipped
 * Tests are skipped when:
 * - Running in CI environment (to avoid API costs and rate limits)
 * - No API keys are available in any environment
 *
 * Note: We always skip in CI to avoid costs, even if keys are present
 */
export const shouldSkipLLMTests = isCI || (!hasOpenAIKey && !hasClaudeKey)

/**
 * Get a descriptive reason for why tests are being skipped
 */
export const getSkipReason = (): string => {
  if (isCI) {
    return 'Skipping LLM tests in CI environment'
  }
  if (!hasOpenAIKey && !hasClaudeKey) {
    return 'Skipping LLM tests: No API keys available (OPENAI_API_KEY or CLAUDE_API_KEY)'
  }
  return ''
}

/**
 * Log the current LLM availability status
 * Useful for beforeAll hooks to provide visibility into test configuration
 */
export const logAvailabilityStatus = (): void => {
  console.log('LLM Test Configuration:')
  console.log(`  Environment: ${isCI ? 'CI' : 'Local'}`)
  console.log(`  OpenAI API Key: ${hasOpenAIKey ? '✓ Available' : '✗ Not found'}`)
  console.log(`  Claude API Key: ${hasClaudeKey ? '✓ Available' : '✗ Not found'}`)
  console.log(`  Skip LLM Tests: ${shouldSkipLLMTests ? 'Yes' : 'No'}`)

  if (shouldSkipLLMTests) {
    console.log(`  Skip Reason: ${getSkipReason()}`)
  }
}

/**
 * Helper to create a consistent skip message for test descriptions
 * Usage: describe.skipIf(shouldSkipLLMTests)(`${getTestDescription("My Test Suite")}`, ...)
 */
export const getTestDescription = (baseDescription: string): string => {
  if (shouldSkipLLMTests) {
    return `${baseDescription} (${getSkipReason()})`
  }
  return baseDescription
}

/**
 * Check if at least one LLM API key is available
 */
export const hasAnyLLMKey = hasOpenAIKey || hasClaudeKey

/**
 * Get list of available LLM providers
 */
export const getAvailableProviders = (): string[] => {
  const providers: string[] = []
  if (hasOpenAIKey) providers.push('OpenAI')
  if (hasClaudeKey) providers.push('Claude')
  return providers
}
