/**
 * Unit tests for annotation schemas
 */

import { describe, it, expect } from 'vitest'
import { Schema } from '@effect/schema'
import {
  AnnotationSchema,
  AnnotationFilterSchema,
  SignalTypeSchema,
  AnnotationTypeSchema
} from '../../annotation.schema.js'

describe('AnnotationSchema', () => {
  describe('SignalType validation', () => {
    it('should accept valid signal types', () => {
      const validTypes = ['trace', 'metric', 'log', 'any']

      validTypes.forEach(type => {
        const result = Schema.decodeSync(SignalTypeSchema)(type as "trace" | "metric" | "log" | "any")
        expect(result).toBe(type)
      })
    })

    it('should reject invalid signal types', () => {
      const invalidTypes = ['invalid', 'span', 'event', '']

      invalidTypes.forEach(type => {
        expect(() => Schema.decodeSync(SignalTypeSchema)(type as "trace" | "metric" | "log" | "any")).toThrow()
      })
    })
  })

  describe('AnnotationType validation', () => {
    it('should accept valid annotation types', () => {
      const validTypes = ['test', 'diag', 'human', 'llm', 'meta', 'train']

      validTypes.forEach(type => {
        const result = Schema.decodeSync(AnnotationTypeSchema)(type as "test" | "diag" | "human" | "llm" | "meta" | "train")
        expect(result).toBe(type)
      })
    })

    it('should reject invalid annotation types', () => {
      expect(() => Schema.decodeSync(AnnotationTypeSchema)('invalid' as "test" | "diag" | "human" | "llm" | "meta" | "train")).toThrow()
      expect(() => Schema.decodeSync(AnnotationTypeSchema)('production' as "test" | "diag" | "human" | "llm" | "meta" | "train")).toThrow()
    })
  })

  describe('Annotation validation', () => {
    it('should accept valid trace annotation', () => {
      const annotation = {
        signalType: 'trace' as const,
        traceId: 'abc123',
        spanId: 'span456',
        timeRangeStart: new Date().toISOString(),
        annotationType: 'diag' as const,
        annotationKey: 'diag.performance.slow',
        annotationValue: JSON.stringify({ severity: 'high' }),
        createdBy: 'system'
      }

      const result = Schema.decodeSync(AnnotationSchema)(annotation)
      expect(result.signalType).toBe('trace')
      expect(result.traceId).toBe('abc123')
      expect(result.annotationKey).toBe('diag.performance.slow')
    })

    it('should accept valid metric annotation', () => {
      const annotation = {
        signalType: 'metric' as const,
        metricName: 'http.request.duration',
        metricLabels: { service: 'frontend', method: 'GET' },
        timeRangeStart: new Date().toISOString(),
        annotationType: 'llm' as const,
        annotationKey: 'llm.anomaly.detected',
        annotationValue: JSON.stringify({ confidence: 0.95 }),
        createdBy: 'ai-analyzer'
      }

      const result = Schema.decodeSync(AnnotationSchema)(annotation)
      expect(result.signalType).toBe('metric')
      expect(result.metricName).toBe('http.request.duration')
      expect(result.metricLabels).toEqual({ service: 'frontend', method: 'GET' })
    })

    it('should accept valid log annotation', () => {
      const annotation = {
        signalType: 'log' as const,
        logTimestamp: new Date().toISOString(),
        logBodyHash: 'hash123',
        timeRangeStart: new Date().toISOString(),
        annotationType: 'human' as const,
        annotationKey: 'human.review.approved',
        annotationValue: JSON.stringify({ reviewer: 'john.doe' }),
        createdBy: 'john.doe'
      }

      const result = Schema.decodeSync(AnnotationSchema)(annotation)
      expect(result.signalType).toBe('log')
      expect(result.logBodyHash).toBe('hash123')
    })

    it('should accept annotation with optional fields', () => {
      const annotation = {
        signalType: 'any' as const,
        timeRangeStart: new Date().toISOString(),
        timeRangeEnd: new Date(Date.now() + 3600000).toISOString(),
        annotationType: 'meta' as const,
        annotationKey: 'meta.system.maintenance',
        annotationValue: JSON.stringify({ scheduled: true }),
        createdBy: 'ops-team',
        confidence: 0.8,
        sessionId: 'session123',
        expiresAt: new Date(Date.now() + 86400000).toISOString()
      }

      const result = Schema.decodeSync(AnnotationSchema)(annotation)
      expect(result.confidence).toBe(0.8)
      expect(result.sessionId).toBe('session123')
      expect(result.expiresAt).toBeDefined()
    })

    it('should reject annotation with invalid key prefix', () => {
      const annotation = {
        signalType: 'trace' as const,
        timeRangeStart: new Date().toISOString(),
        annotationType: 'diag' as const,
        annotationKey: 'invalid.prefix.key', // Wrong prefix
        annotationValue: '{}',
        createdBy: 'system'
      }

      expect(() => Schema.decodeSync(AnnotationSchema)(annotation)).toThrow(/must start with valid prefix/)
    })

    it('should reject annotation without required prefix', () => {
      const annotation = {
        signalType: 'trace' as const,
        timeRangeStart: new Date().toISOString(),
        annotationType: 'diag' as const,
        annotationKey: 'no_prefix_key', // No prefix
        annotationValue: '{}',
        createdBy: 'system'
      }

      expect(() => Schema.decodeSync(AnnotationSchema)(annotation)).toThrow(/must start with valid prefix/)
    })

    it('should enforce confidence score bounds', () => {
      const annotation = {
        signalType: 'trace' as const,
        timeRangeStart: new Date().toISOString(),
        annotationType: 'llm' as const,
        annotationKey: 'llm.prediction',
        annotationValue: '{}',
        createdBy: 'ai',
        confidence: 1.5 // Out of bounds
      }

      expect(() => Schema.decodeSync(AnnotationSchema)(annotation)).toThrow()
    })

    it('should accept all valid prefixes', () => {
      const prefixes = ['test.', 'diag.', 'human.', 'llm.', 'meta.', 'train.']

      prefixes.forEach((prefix) => {
        const annotation = {
          signalType: 'trace' as const,
          timeRangeStart: new Date().toISOString(),
          annotationType: prefix.slice(0, -1) as "test" | "diag" | "human" | "llm" | "meta" | "train", // Remove trailing dot
          annotationKey: `${prefix}valid.key`,
          annotationValue: '{}',
          createdBy: 'test'
        }

        const result = Schema.decodeSync(AnnotationSchema)(annotation)
        expect(result.annotationKey).toBe(`${prefix}valid.key`)
      })
    })
  })

  describe('AnnotationFilter validation', () => {
    it('should accept empty filter', () => {
      const filter = {}
      const result = Schema.decodeSync(AnnotationFilterSchema)(filter)
      expect(result).toEqual({})
    })

    it('should accept filter with all fields', () => {
      const filter = {
        signalType: 'trace' as const,
        traceId: 'abc123',
        metricName: 'http.requests',
        serviceName: 'frontend',
        annotationType: 'diag' as const,
        sessionId: 'session123',
        limit: 50
      }

      const result = Schema.decodeSync(AnnotationFilterSchema)(filter)
      expect(result.signalType).toBe('trace')
      expect(result.limit).toBe(50)
    })

    it('should accept filter with time range', () => {
      const filter = {
        timeRange: {
          start: new Date().toISOString(),
          end: new Date(Date.now() + 3600000).toISOString()
        }
      }

      const result = Schema.decodeSync(AnnotationFilterSchema)(filter)
      expect(result.timeRange?.start).toBeDefined()
      expect(result.timeRange?.end).toBeDefined()
    })
  })
})