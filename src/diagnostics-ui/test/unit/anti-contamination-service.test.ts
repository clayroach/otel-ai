/**
 * Unit tests for anti-contamination service
 */

import { describe, it, expect } from 'vitest'
import { Effect } from 'effect'
import {
  AntiContaminationService,
  AntiContaminationServiceLive
} from '../../anti-contamination-service.js'
import type { Annotation } from '../../annotation.schema.js'

describe('AntiContaminationService', () => {
  const runEffect = <A, E>(effect: Effect.Effect<A, E, AntiContaminationService>) =>
    Effect.runPromise(Effect.provide(effect, AntiContaminationServiceLive))

  describe('validateNoContamination', () => {
    it('should allow all prefixes in test environment', async () => {
      const annotations: Annotation[] = [
        {
          signalType: 'trace',
          timeRangeStart: new Date(),
          annotationType: 'test',
          annotationKey: 'test.unit.test',
          annotationValue: '{}',
          createdBy: 'test'
        },
        {
          signalType: 'trace',
          timeRangeStart: new Date(),
          annotationType: 'train',
          annotationKey: 'train.model.data',
          annotationValue: '{}',
          createdBy: 'test'
        }
      ]

      const result = await runEffect(
        Effect.gen(function* () {
          const service = yield* AntiContaminationService
          return yield* service.validateNoContamination(annotations, 'test')
        })
      )

      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(result.prohibitedPrefixes).toHaveLength(0)
    })

    it('should block test prefix in training environment', async () => {
      const annotations: Annotation[] = [
        {
          signalType: 'trace',
          timeRangeStart: new Date(),
          annotationType: 'test',
          annotationKey: 'test.integration.test',
          annotationValue: '{}',
          createdBy: 'test'
        }
      ]

      const result = await runEffect(
        Effect.gen(function* () {
          const service = yield* AntiContaminationService
          return yield* service.validateNoContamination(annotations, 'training')
        })
      )

      expect(result.isValid).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]?.message).toContain('Prohibited prefix')
      expect(result.prohibitedPrefixes).toContain('test.')
    })

    it('should block test and train prefixes in production', async () => {
      const annotations: Annotation[] = [
        {
          signalType: 'trace',
          timeRangeStart: new Date(),
          annotationType: 'test',
          annotationKey: 'test.e2e.test',
          annotationValue: '{}',
          createdBy: 'test'
        },
        {
          signalType: 'metric',
          timeRangeStart: new Date(),
          annotationType: 'train',
          annotationKey: 'train.dataset.v1',
          annotationValue: '{}',
          createdBy: 'ml-pipeline'
        }
      ]

      const result = await runEffect(
        Effect.gen(function* () {
          const service = yield* AntiContaminationService
          return yield* service.validateNoContamination(annotations, 'production')
        })
      )

      expect(result.isValid).toBe(false)
      expect(result.errors).toHaveLength(4) // 2 prefix errors + 2 type errors
      expect(result.prohibitedPrefixes).toEqual(['test.', 'train.'])
    })

    it('should block test and train annotation types in production', async () => {
      const annotations: Annotation[] = [
        {
          signalType: 'trace',
          timeRangeStart: new Date(),
          annotationType: 'test', // Wrong type for production
          annotationKey: 'diag.valid.key', // Valid prefix but wrong type
          annotationValue: '{}',
          createdBy: 'test'
        },
        {
          signalType: 'metric',
          timeRangeStart: new Date(),
          annotationType: 'train', // Wrong type for production
          annotationKey: 'meta.valid.key', // Valid prefix but wrong type
          annotationValue: '{}',
          createdBy: 'ml-pipeline'
        }
      ]

      const result = await runEffect(
        Effect.gen(function* () {
          const service = yield* AntiContaminationService
          return yield* service.validateNoContamination(annotations, 'production')
        })
      )

      expect(result.isValid).toBe(false)
      expect(result.errors).toHaveLength(2) // Only type errors
      expect(result.errors[0]?.field).toBe('annotationType')
      expect(result.errors[1]?.field).toBe('annotationType')
    })

    it('should allow valid annotations in production', async () => {
      const annotations: Annotation[] = [
        {
          signalType: 'trace',
          timeRangeStart: new Date(),
          annotationType: 'diag',
          annotationKey: 'diag.performance.slow',
          annotationValue: '{}',
          createdBy: 'monitoring'
        },
        {
          signalType: 'metric',
          timeRangeStart: new Date(),
          annotationType: 'llm',
          annotationKey: 'llm.anomaly.detected',
          annotationValue: '{}',
          createdBy: 'ai-analyzer'
        },
        {
          signalType: 'log',
          timeRangeStart: new Date(),
          annotationType: 'human',
          annotationKey: 'human.review.approved',
          annotationValue: '{}',
          createdBy: 'reviewer'
        }
      ]

      const result = await runEffect(
        Effect.gen(function* () {
          const service = yield* AntiContaminationService
          return yield* service.validateNoContamination(annotations, 'production')
        })
      )

      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })
  })

  describe('sanitizeForTraining', () => {
    it('should remove test and train prefixed keys', async () => {
      const data = [
        {
          id: '1',
          'test.field': 'should be removed',
          'train.data': 'should be removed',
          'valid.field': 'should remain',
          nested: {
            'test.nested': 'removed',
            'valid.nested': 'kept'
          }
        }
      ]

      const result = await runEffect(
        Effect.gen(function* () {
          const service = yield* AntiContaminationService
          return yield* service.sanitizeForTraining(data)
        })
      )

      expect(result[0]?.id).toBe('1')
      expect(result[0]?.['test.field']).toBeUndefined()
      expect(result[0]?.['train.data']).toBeUndefined()
      expect(result[0]?.['valid.field']).toBe('should remain')
      expect((result[0]?.nested as Record<string, unknown>)?.['test.nested']).toBeUndefined()
      expect((result[0]?.nested as Record<string, unknown>)?.['valid.nested']).toBe('kept')
    })

    it('should redact string values containing prohibited prefixes', async () => {
      const data = [
        {
          id: '1',
          description: 'This contains test.data in the text',
          config: 'train.model.path=/path/to/model',
          normal: 'This is normal text'
        }
      ]

      const result = await runEffect(
        Effect.gen(function* () {
          const service = yield* AntiContaminationService
          return yield* service.sanitizeForTraining(data)
        })
      )

      expect(result[0]?.description).toBe('[REDACTED]')
      expect(result[0]?.config).toBe('[REDACTED]')
      expect(result[0]?.normal).toBe('This is normal text')
    })

    it('should handle arrays within objects', async () => {
      const data = [
        {
          id: '1',
          tags: ['normal', 'test.tag', 'another'],
          values: [
            { key: 'test.key', value: 'data' },
            { key: 'valid.key', value: 'data' }
          ]
        }
      ]

      const result = await runEffect(
        Effect.gen(function* () {
          const service = yield* AntiContaminationService
          return yield* service.sanitizeForTraining(data)
        })
      )

      expect(result[0]?.tags).toEqual(['normal', '[REDACTED]', 'another'])
      // The key contains 'test.' so it gets redacted
      expect((result[0]?.values as Array<{ key: string; value: string }>)?.[0]).toEqual({ key: '[REDACTED]', value: 'data' })
      expect((result[0]?.values as Array<{ key: string; value: string }>)?.[1]).toEqual({ key: 'valid.key', value: 'data' })
    })

    it('should handle deeply nested structures', async () => {
      const data = [
        {
          level1: {
            level2: {
              level3: {
                'test.deep': 'removed',
                'valid.deep': 'kept',
                array: ['test.item', 'valid.item']
              }
            }
          }
        }
      ]

      const result = await runEffect(
        Effect.gen(function* () {
          const service = yield* AntiContaminationService
          return yield* service.sanitizeForTraining(data)
        })
      )

      const level3 = (result[0]?.level1 as Record<string, Record<string, Record<string, unknown>>>)?.level2?.level3
      expect(level3?.['test.deep']).toBeUndefined()
      expect(level3?.['valid.deep']).toBe('kept')
      expect(level3?.array).toEqual(['[REDACTED]', 'valid.item'])
    })

    it('should preserve null and undefined values', async () => {
      const data = [
        {
          id: '1',
          nullValue: null,
          undefinedValue: undefined,
          'test.null': null,
          'train.undefined': undefined
        }
      ]

      const result = await runEffect(
        Effect.gen(function* () {
          const service = yield* AntiContaminationService
          return yield* service.sanitizeForTraining(data)
        })
      )

      expect(result[0]?.nullValue).toBeNull()
      expect(result[0]?.undefinedValue).toBeUndefined()
      expect(result[0]?.['test.null']).toBeUndefined()
      expect(result[0]?.['train.undefined']).toBeUndefined()
    })
  })
})