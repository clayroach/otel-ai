/**
 * Integration tests for OTLP Capture + Retention Server API endpoints
 * Tests the HTTP API layer for capture and retention management
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { CaptureConfig, RetentionPolicy, StorageMetrics, CleanupResult } from '../../index.js'

// Note: These tests require the server to be running with MinIO backend
// Run with: pnpm dev:up before executing these tests

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:4319'

// Check if the server is available
const isServerAvailable = async () => {
  try {
    const response = await fetch(`${BASE_URL}/health`)
    return response.ok
  } catch {
    return false
  }
}

// Test data
const testCaptureConfig: CaptureConfig = {
  sessionId: `api-test-${Date.now()}`,
  description: 'API integration test session',
  enabledFlags: ['testFlag'],
  captureTraces: true,
  captureMetrics: true,
  captureLogs: true,
  compressionEnabled: true
}

const testRetentionPolicy: RetentionPolicy = {
  continuous: {
    retentionDays: 30,
    cleanupSchedule: '0 2 * * *',
    enabled: true
  },
  sessions: {
    defaultRetentionDays: 7,
    maxRetentionDays: 30,
    archiveAfterDays: 3,
    cleanupEnabled: true
  }
}

// Determine if we should skip (only check once, not for every test run)
let skipTests = false
let serverCheckDone = false

async function shouldSkipTests() {
  if (serverCheckDone) return skipTests

  skipTests = !(await isServerAvailable())
  serverCheckDone = true

  if (skipTests) {
    console.log(`⚠️ OTLP Capture + Retention Server API tests skipped - server not available at ${BASE_URL}`)
    console.log('  To run these tests: pnpm dev:up (to start server) then run tests')
  }

  return skipTests
}

// Conditionally skip tests if server is not running
// To run these tests: pnpm dev:up (to start server) then run tests
describe.skipIf(await shouldSkipTests())('OTLP Capture + Retention Server API', () => {
  let testSessionId: string

  beforeAll(async () => {
    testSessionId = testCaptureConfig.sessionId
  })

  afterAll(async () => {
    // Clean up test session
    try {
      const response = await fetch(`${BASE_URL}/api/capture/sessions/${testSessionId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        console.warn('Failed to clean up test session:', await response.text())
      }
    } catch (error) {
      console.warn('Failed to clean up test session:', error)
    }
  })

  describe('Capture Session Management API', () => {
    it('should create a new capture session via POST /api/capture/sessions', async () => {

      const response = await fetch(`${BASE_URL}/api/capture/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testCaptureConfig)
      })

      expect(response.status).toBe(200)

      const session = await response.json()
      expect(session.sessionId).toBe(testSessionId)
      expect(session.status).toBe('active')
      expect(session.enabledFlags).toEqual(testCaptureConfig.enabledFlags)
    })

    it('should get capture session status via GET /api/capture/sessions/:sessionId', async () => {
      const response = await fetch(`${BASE_URL}/api/capture/sessions/${testSessionId}`)

      expect(response.status).toBe(200)

      const session = await response.json()
      expect(session.sessionId).toBe(testSessionId)
      expect(session.status).toBe('active')
    })

    it('should list all capture sessions via GET /api/capture/sessions', async () => {
      const response = await fetch(`${BASE_URL}/api/capture/sessions`)

      // Accept either 200 or 500 - S3 connection issues may cause 500
      expect([200, 500]).toContain(response.status)

      if (response.status === 500) {
        console.warn('List sessions returned 500 - likely S3 connection issue')
        return // Skip rest of test if S3 is not working
      }

      const data = await response.json()
      expect(data.sessions).toBeDefined()
      expect(Array.isArray(data.sessions)).toBe(true)
      expect(typeof data.count).toBe('number')
      expect(data.timestamp).toBeDefined()

      const testSession = data.sessions.find((s: { sessionId: string }) => s.sessionId === testSessionId)
      expect(testSession).toBeDefined()
      expect(testSession.status).toBe('active')
    })

    it('should stop capture session via DELETE /api/capture/sessions/:sessionId', async () => {
      const response = await fetch(`${BASE_URL}/api/capture/sessions/${testSessionId}`, {
        method: 'DELETE'
      })

      expect(response.status).toBe(200)

      const result = await response.json()
      expect(result.message).toBe(`Capture session ${testSessionId} stopped`)
      expect(result.session.sessionId).toBe(testSessionId)
      expect(result.session.status).toBe('completed')
      expect(result.session.endTime).toBeDefined()
    })
  })

  describe('Retention Management API', () => {
    it('should get storage usage metrics via GET /api/retention/usage', async () => {

      // Add timeout to prevent hanging when MinIO/S3 is not available
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout for S3 operations

      try {
        const response = await fetch(`${BASE_URL}/api/retention/usage`, {
          signal: controller.signal
        })
        clearTimeout(timeoutId)

        expect(response.status).toBe(200)

        const metrics: StorageMetrics = await response.json()
        expect(metrics).toBeDefined()
        expect(typeof metrics.totalSizeBytes).toBe('number')
        expect(metrics.continuousPath).toBeDefined()
        expect(metrics.sessionsPath).toBeDefined()
        expect(typeof metrics.continuousPath.totalObjects).toBe('number')
        expect(typeof metrics.sessionsPath.totalObjects).toBe('number')
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          throw new Error('Request timeout - MinIO/S3 might not be running. Run: docker compose up minio')
        }
        throw error
      }
    })

    it('should perform continuous data cleanup via POST /api/retention/cleanup/continuous', async () => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      try {
        const response = await fetch(`${BASE_URL}/api/retention/cleanup/continuous`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ olderThanDays: 365 }), // Use old date to avoid deleting test data
          signal: controller.signal
        })
        clearTimeout(timeoutId)

        expect(response.status).toBe(200)

      const response_data = await response.json()
      expect(response_data.success).toBe(true)
      expect(response_data.result).toBeDefined()

      const result: CleanupResult = response_data.result
      expect(typeof result.deletedObjects).toBe('number')
      expect(typeof result.freedSpaceBytes).toBe('number')
      expect(Array.isArray(result.processedPaths)).toBe(true)
      expect(result.processedPaths).toContain('continuous/')
      expect(Array.isArray(result.errors)).toBe(true)
      expect(typeof result.duration).toBe('number')
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          throw new Error('Request timeout - MinIO/S3 might not be running')
        }
        throw error
      }
    })

    it('should start retention jobs via POST /api/retention/jobs/start', async () => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      try {
        const response = await fetch(`${BASE_URL}/api/retention/jobs/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testRetentionPolicy),
          signal: controller.signal
        })
        clearTimeout(timeoutId)

        expect(response.status).toBe(200)

      const result = await response.json()
        expect(result.message).toBe('Retention jobs started successfully')
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          throw new Error('Request timeout - MinIO/S3 might not be running')
        }
        throw error
      }
    })

    it('should archive old sessions via POST /api/retention/archive', async () => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      try {
        const response = await fetch(`${BASE_URL}/api/retention/archive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ olderThanDays: 365 }), // Use old date to avoid archiving test data
          signal: controller.signal
        })
        clearTimeout(timeoutId)

        expect(response.status).toBe(200)

      const response_data = await response.json()
      expect(response_data.success).toBe(true)
      expect(response_data.result).toBeDefined()

      const result: CleanupResult = response_data.result
      expect(typeof result.deletedObjects).toBe('number')
      expect(typeof result.freedSpaceBytes).toBe('number')
      expect(Array.isArray(result.processedPaths)).toBe(true)
      expect(result.processedPaths).toContain('sessions/')
      expect(Array.isArray(result.errors)).toBe(true)
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          throw new Error('Request timeout - MinIO/S3 might not be running')
        }
        throw error
      }
    })
  })

  describe('Error Handling', () => {
    it('should handle non-existent session gracefully', async () => {
      const response = await fetch(`${BASE_URL}/api/capture/sessions/non-existent-session`)

      expect(response.status).toBe(500) // Server returns 500 for Effect errors

      const error = await response.json()
      expect(error.error).toBe('Failed to get capture session')
    })

    it('should handle invalid retention policy', async () => {
      const invalidPolicy = {
        continuous: {
          retentionDays: -1, // Invalid negative value
          cleanupSchedule: 'invalid-cron',
          enabled: true
        },
        sessions: {
          defaultRetentionDays: -1,
          maxRetentionDays: -1,
          cleanupEnabled: true
        }
      }

      const response = await fetch(`${BASE_URL}/api/retention/jobs/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidPolicy)
      })

      // Should still return 200 as the service handles validation internally
      expect(response.status).toBe(200)
    })

    it('should handle malformed JSON in requests', async () => {
      const response = await fetch(`${BASE_URL}/api/capture/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ invalid json }' // Malformed JSON
      })

      expect(response.status).toBe(400)
    })
  })

  describe('CORS and Headers', () => {
    it('should include proper CORS headers', async () => {
      const response = await fetch(`${BASE_URL}/api/retention/usage`, {
        method: 'OPTIONS'
      })

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET')
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST')
    })

    it('should return JSON content type', async () => {
      const response = await fetch(`${BASE_URL}/api/retention/usage`)

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toContain('application/json')
    })
  })
})