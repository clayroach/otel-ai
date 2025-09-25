/**
 * Unit tests for OTLP capture and replay error constructors
 */

import { describe, it, expect } from 'vitest'
import {
  CaptureError,
  ReplayError,
  CaptureErrorConstructors,
  ReplayErrorConstructors
} from '../../errors.js'

describe('Error Constructors', () => {
  describe('CaptureErrorConstructors', () => {
    it('should create SessionNotFound error', () => {
      const error = CaptureErrorConstructors.SessionNotFound('test-session')

      expect(error).toBeInstanceOf(CaptureError)
      expect(error.reason).toBe('SessionNotFound')
      expect(error.message).toBe('Capture session not found: test-session')
      expect(error.sessionId).toBe('test-session')
    })

    it('should create SessionAlreadyActive error', () => {
      const error = CaptureErrorConstructors.SessionAlreadyActive('test-session')

      expect(error).toBeInstanceOf(CaptureError)
      expect(error.reason).toBe('SessionAlreadyActive')
      expect(error.message).toBe('Capture session already active: test-session')
      expect(error.sessionId).toBe('test-session')
    })

    it('should create StorageFailure error with sessionId', () => {
      const cause = new Error('S3 connection failed')
      const error = CaptureErrorConstructors.StorageFailure(
        'Failed to store data',
        'test-session',
        cause
      )

      expect(error).toBeInstanceOf(CaptureError)
      expect(error.reason).toBe('StorageFailure')
      expect(error.message).toBe('Storage operation failed: Failed to store data')
      expect(error.sessionId).toBe('test-session')
      expect(error.cause).toBe(cause)
    })

    it('should create StorageFailure error without sessionId', () => {
      const error = CaptureErrorConstructors.StorageFailure('Failed to list objects')

      expect(error).toBeInstanceOf(CaptureError)
      expect(error.reason).toBe('StorageFailure')
      expect(error.message).toBe('Storage operation failed: Failed to list objects')
      expect(error.sessionId).toBeUndefined()
      expect(error.cause).toBeUndefined()
    })

    it('should create CompressionFailure error', () => {
      const cause = new Error('Gzip failed')
      const error = CaptureErrorConstructors.CompressionFailure(
        'Failed to compress traces',
        cause
      )

      expect(error).toBeInstanceOf(CaptureError)
      expect(error.reason).toBe('CompressionFailure')
      expect(error.message).toBe('Compression failed: Failed to compress traces')
      expect(error.sessionId).toBeUndefined()
      expect(error.cause).toBe(cause)
    })
  })

  describe('ReplayErrorConstructors', () => {
    it('should create SessionNotFound error', () => {
      const error = ReplayErrorConstructors.SessionNotFound('test-session')

      expect(error).toBeInstanceOf(ReplayError)
      expect(error.reason).toBe('SessionNotFound')
      expect(error.message).toBe('Replay session not found: test-session')
      expect(error.sessionId).toBe('test-session')
    })

    it('should create DataCorrupted error', () => {
      const error = ReplayErrorConstructors.DataCorrupted(
        'test-session',
        'Invalid OTLP format'
      )

      expect(error).toBeInstanceOf(ReplayError)
      expect(error.reason).toBe('DataCorrupted')
      expect(error.message).toBe('Data corrupted for session test-session: Invalid OTLP format')
      expect(error.sessionId).toBe('test-session')
    })

    it('should create DecompressionFailure error', () => {
      const cause = new Error('Gunzip failed')
      const error = ReplayErrorConstructors.DecompressionFailure('test-session', cause)

      expect(error).toBeInstanceOf(ReplayError)
      expect(error.reason).toBe('DecompressionFailure')
      expect(error.message).toBe('Failed to decompress data for session test-session')
      expect(error.sessionId).toBe('test-session')
      expect(error.cause).toBe(cause)
    })

    it('should create IngestionFailure error', () => {
      const cause = new Error('HTTP 500 error')
      const error = ReplayErrorConstructors.IngestionFailure(
        'test-session',
        'Failed to POST to OTLP endpoint',
        cause
      )

      expect(error).toBeInstanceOf(ReplayError)
      expect(error.reason).toBe('IngestionFailure')
      expect(error.message).toBe('Failed to ingest replayed data for session test-session: Failed to POST to OTLP endpoint')
      expect(error.sessionId).toBe('test-session')
      expect(error.cause).toBe(cause)
    })
  })
})