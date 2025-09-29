/**
 * Unit tests for OTLP capture schemas
 */

import { describe, it, expect } from 'vitest'
import { Schema } from '@effect/schema'
import { Effect } from 'effect'
import {
  CaptureConfigSchema,
  ReplayConfigSchema,
  CaptureSessionMetadataSchema,
  CapturedDataReferenceSchema,
  ReplayStatusSchema
} from '../../schemas.js'
import {
  mockCaptureConfig,
  mockReplayConfig,
  mockSessionMetadataJson
} from '../fixtures/test-data.js'

describe('OTLP Capture Schemas', () => {
  describe('CaptureConfigSchema', () => {
    it('should validate valid capture config', async () => {
      const result = await Effect.runPromise(
        Schema.decodeUnknown(CaptureConfigSchema)(mockCaptureConfig)
      )

      expect(result.sessionId).toBe('test-session-001')
      expect(result.captureTraces).toBe(true)
      expect(result.enabledFlags).toEqual(['paymentServiceFailure', 'slowDatabase'])
    })

    it('should reject invalid capture config', async () => {
      const invalidConfig = {
        sessionId: '', // Empty string should be invalid
        captureTraces: 'yes' // Should be boolean
      }

      await expect(
        Effect.runPromise(
          Schema.decodeUnknown(CaptureConfigSchema)(invalidConfig)
        )
      ).rejects.toThrow()
    })

    it('should handle optional fields', async () => {
      const minimalConfig = {
        sessionId: 'test-minimal',
        enabledFlags: [],
        captureTraces: true,
        captureMetrics: false,
        captureLogs: false,
        compressionEnabled: true
      }

      const result = await Effect.runPromise(
        Schema.decodeUnknown(CaptureConfigSchema)(minimalConfig)
      )

      expect(result.sessionId).toBe('test-minimal')
      expect(result.diagnosticSessionId).toBeUndefined()
      expect(result.description).toBeUndefined()
      expect(result.maxSizeMB).toBeUndefined()
    })
  })

  describe('ReplayConfigSchema', () => {
    it('should validate valid replay config', async () => {
      const result = await Effect.runPromise(
        Schema.decodeUnknown(ReplayConfigSchema)(mockReplayConfig)
      )

      expect(result.sessionId).toBe('test-session-001')
      expect(result.timestampAdjustment).toBe('current')
      expect(result.replayTraces).toBe(true)
    })

    it('should reject invalid timestamp adjustment', async () => {
      const invalidConfig = {
        ...mockReplayConfig,
        timestampAdjustment: 'invalid-value' // Should be 'none' | 'relative' | 'current'
      }

      await expect(
        Effect.runPromise(
          Schema.decodeUnknown(ReplayConfigSchema)(invalidConfig)
        )
      ).rejects.toThrow()
    })

    it('should handle optional speed multiplier', async () => {
      const configWithSpeed = {
        ...mockReplayConfig,
        speedMultiplier: 2.5
      }

      const result = await Effect.runPromise(
        Schema.decodeUnknown(ReplayConfigSchema)(configWithSpeed)
      )

      expect(result.speedMultiplier).toBe(2.5)
    })
  })

  describe('CaptureSessionMetadataSchema', () => {
    it('should validate valid session metadata', async () => {
      const result = await Effect.runPromise(
        Schema.decodeUnknown(CaptureSessionMetadataSchema)(mockSessionMetadataJson)
      )

      expect(result.sessionId).toBe('test-session-001')
      expect(result.status).toBe('completed')
      expect(result.capturedTraces).toBe(150)
      expect(result.startTime).toBeInstanceOf(Date)
      expect(result.endTime).toBeInstanceOf(Date)
    })

    it('should validate active session without endTime', async () => {
      const activeSession = {
        ...mockSessionMetadataJson,
        status: 'active',
        endTime: undefined
      }

      const result = await Effect.runPromise(
        Schema.decodeUnknown(CaptureSessionMetadataSchema)(activeSession)
      )

      expect(result.status).toBe('active')
      expect(result.endTime).toBeUndefined()
    })

    it('should reject invalid status', async () => {
      const invalidSession = {
        ...mockSessionMetadataJson,
        status: 'invalid-status'
      }

      await expect(
        Effect.runPromise(
          Schema.decodeUnknown(CaptureSessionMetadataSchema)(invalidSession)
        )
      ).rejects.toThrow()
    })
  })

  describe('CapturedDataReferenceSchema', () => {
    it('should validate valid data reference', async () => {
      const reference = {
        key: 'sessions/test-session/raw/2024-01-01/10/traces-123456-uuid.otlp.gz',
        signalType: 'traces',
        timestamp: '2024-01-01T10:00:00.000Z',
        sizeBytes: 2048,
        recordCount: 5,
        compressed: true
      }

      const result = await Effect.runPromise(
        Schema.decodeUnknown(CapturedDataReferenceSchema)(reference)
      )

      expect(result.signalType).toBe('traces')
      expect(result.compressed).toBe(true)
      expect(result.sizeBytes).toBe(2048)
    })

    it('should reject invalid signal type', async () => {
      const invalidReference = {
        key: 'test-key',
        signalType: 'invalid-type',
        timestamp: '2024-01-01T10:00:00.000Z',
        sizeBytes: 1024,
        recordCount: 1,
        compressed: false
      }

      await expect(
        Effect.runPromise(
          Schema.decodeUnknown(CapturedDataReferenceSchema)(invalidReference)
        )
      ).rejects.toThrow()
    })
  })

  describe('ReplayStatusSchema', () => {
    it('should validate valid replay status', async () => {
      const status = {
        sessionId: 'test-session-001',
        status: 'running',
        startedAt: '2024-01-01T10:00:00.000Z',
        totalRecords: 100,
        processedRecords: 50,
        failedRecords: 2,
        currentFile: 'traces-123456-uuid.otlp.gz'
      }

      const result = await Effect.runPromise(
        Schema.decodeUnknown(ReplayStatusSchema)(status)
      )

      expect(result.status).toBe('running')
      expect(result.processedRecords).toBe(50)
      expect(result.currentFile).toBe('traces-123456-uuid.otlp.gz')
    })

    it('should validate minimal replay status', async () => {
      const minimalStatus = {
        sessionId: 'test-session',
        status: 'pending',
        totalRecords: 0,
        processedRecords: 0,
        failedRecords: 0
      }

      const result = await Effect.runPromise(
        Schema.decodeUnknown(ReplayStatusSchema)(minimalStatus)
      )

      expect(result.status).toBe('pending')
      expect(result.startedAt).toBeUndefined()
      expect(result.currentFile).toBeUndefined()
    })

    it('should reject invalid replay status', async () => {
      const invalidStatus = {
        sessionId: 'test-session',
        status: 'unknown-status',
        totalRecords: 0,
        processedRecords: 0,
        failedRecords: 0
      }

      await expect(
        Effect.runPromise(
          Schema.decodeUnknown(ReplayStatusSchema)(invalidStatus)
        )
      ).rejects.toThrow()
    })
  })
})