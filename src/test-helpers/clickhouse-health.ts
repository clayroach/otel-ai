/**
 * Shared ClickHouse Health Check Utilities for Integration Tests
 *
 * Use these helpers in beforeAll hooks to detect ClickHouse crashes early
 * and fail fast with clear error messages instead of cascading test failures.
 */

/**
 * Check if ClickHouse is running and accessible through the storage API
 * Returns detailed error information if connection fails
 *
 * @param backendUrl - Backend API URL (default: http://localhost:4319)
 * @returns Health status with error details if unhealthy
 */
export async function checkClickHouseHealth(
  backendUrl: string = 'http://localhost:4319'
): Promise<{ healthy: true } | { healthy: false; error: string }> {
  try {
    const response = await fetch(`${backendUrl}/api/storage/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    })

    if (response.ok) {
      const health = (await response.json()) as { clickhouse: boolean; s3: boolean; error?: string }

      if (!health.clickhouse) {
        return {
          healthy: false,
          error: health.error || 'ClickHouse reported as unhealthy'
        }
      }

      return { healthy: true }
    }

    // If we get 500, ClickHouse is likely down
    if (response.status === 500) {
      const errorBody = await response.text()
      return {
        healthy: false,
        error: `Storage health check failed: ${errorBody.substring(0, 200)}`
      }
    }

    // Other errors
    return {
      healthy: false,
      error: `Health check returned status ${response.status}`
    }
  } catch (error) {
    return {
      healthy: false,
      error: `Failed to connect to backend at ${backendUrl}: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

/**
 * Fail fast if ClickHouse is not available
 * Use in beforeAll hooks to prevent cascading test failures
 *
 * @param backendUrl - Backend API URL (default: http://localhost:4319)
 * @throws Error with diagnostic information if ClickHouse is not accessible
 *
 * @example
 * ```typescript
 * beforeAll(async () => {
 *   await ensureClickHouseRunning()
 *   // Rest of setup...
 * })
 * ```
 */
export async function ensureClickHouseRunning(backendUrl?: string): Promise<void> {
  const health = await checkClickHouseHealth(backendUrl)

  if (!health.healthy) {
    throw new Error(
      `❌ ClickHouse Health Check Failed!\n\n` +
        `   Error: ${health.error}\n\n` +
        `   This will cause all subsequent tests to fail.\n\n` +
        `   Diagnostic steps:\n` +
        `   1. Check if container is running: docker ps | grep clickhouse\n` +
        `   2. Check if it crashed: docker ps -a | grep clickhouse\n` +
        `   3. View crash logs: docker logs otel-ai-clickhouse | tail -50\n` +
        `   4. Restart container: docker start otel-ai-clickhouse\n\n` +
        `   Common causes:\n` +
        `   - OOM kill (exit code 137) from memory-intensive queries\n` +
        `   - Manual stop/restart during development\n` +
        `   - Docker resource limits exceeded\n`
    )
  }

  console.log('✅ ClickHouse health check passed')
}

/**
 * Wait for ClickHouse to be ready after restart
 * Useful after detecting a crash during test runs
 *
 * @param maxAttempts - Maximum number of health check attempts (default: 10)
 * @param delayMs - Delay between attempts in milliseconds (default: 1000)
 * @param backendUrl - Backend API URL (default: http://localhost:4319)
 */
export async function waitForClickHouse(
  maxAttempts: number = 10,
  delayMs: number = 1000,
  backendUrl?: string
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const health = await checkClickHouseHealth(backendUrl)
    if (health.healthy) {
      console.log(`✅ ClickHouse ready after ${i + 1} attempts`)
      return
    }

    console.log(`⏳ Waiting for ClickHouse... attempt ${i + 1}/${maxAttempts}`)
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }

  throw new Error(`❌ ClickHouse did not become healthy after ${maxAttempts} attempts`)
}
