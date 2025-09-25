/**
 * Simplified Anti-contamination service to prevent test/training data from polluting production
 * Using temporary type assertions for compilation - Phase 1 approach
 */

import { Effect, Context, Layer } from 'effect'
import type { Annotation, ValidationResult } from './annotation.schema.js'

// Prohibited prefixes by environment
const PROHIBITED_PREFIXES: Record<string, string[]> = {
  production: ['test.', 'train.'],
  training: ['test.'],
  test: [] // All prefixes allowed in test environment
}

// Service interface - simplified
export interface AntiContaminationServiceImpl {
  readonly sanitizeForTraining: <T extends object>(
    data: readonly T[]
  ) => Effect.Effect<readonly T[], never, never>
  readonly validateNoContamination: (
    annotations: readonly Annotation[],
    environment?: 'production' | 'training' | 'test'
  ) => Effect.Effect<ValidationResult, never, never>
}

// Context.Tag definition
export class AntiContaminationService extends Context.Tag('AntiContaminationService')<
  AntiContaminationService,
  AntiContaminationServiceImpl
>() {}

// Service implementation
export const AntiContaminationServiceLive = Layer.succeed(AntiContaminationService, {
  sanitizeForTraining: <T extends object>(data: readonly T[]) =>
    Effect.succeed(
      (() => {
        // Remove any fields that contain test. or train. prefixes
        const prohibitedPrefixes = ['test.', 'train.']

        return data.map((item) => {
          const cleaned = { ...item }

          // Recursively clean object
          const cleanObject = (obj: unknown): unknown => {
            if (typeof obj !== 'object' || obj === null) {
              // Check if string contains prohibited prefixes
              if (typeof obj === 'string') {
                for (const prefix of prohibitedPrefixes) {
                  if (obj.includes(prefix)) {
                    return '[REDACTED]'
                  }
                }
              }
              return obj
            }

            if (Array.isArray(obj)) {
              return obj.map(cleanObject)
            }

            const result: Record<string, unknown> = {}
            for (const [key, value] of Object.entries(obj)) {
              // Check if key contains prohibited prefix
              let skipKey = false
              for (const prefix of prohibitedPrefixes) {
                if (key.startsWith(prefix) || key.includes(prefix)) {
                  skipKey = true
                  break
                }
              }

              if (!skipKey) {
                result[key] = cleanObject(value)
              }
            }
            return result
          }

          return cleanObject(cleaned) as T
        })
      })()
    ),

  validateNoContamination: (
    annotations: readonly Annotation[],
    environment: 'production' | 'training' | 'test' = 'production'
  ) =>
    Effect.succeed(
      (() => {
        const prohibited = PROHIBITED_PREFIXES[environment] || []
        const errors: Array<{ field: string; message: string; severity: 'error' | 'warning' }> = []
        const detectedPrefixes: Set<string> = new Set()

        for (const annotation of annotations) {
          for (const prefix of prohibited) {
            if (annotation.annotationKey.startsWith(prefix)) {
              detectedPrefixes.add(prefix)
              errors.push({
                field: 'annotationKey',
                message: `Prohibited prefix '${prefix}' detected in ${environment} environment: ${annotation.annotationKey}`,
                severity: 'error'
              })
            }
          }

          // Also check annotation type
          if (
            environment === 'production' &&
            (annotation.annotationType === 'test' || annotation.annotationType === 'train')
          ) {
            errors.push({
              field: 'annotationType',
              message: `Annotation type '${annotation.annotationType}' not allowed in production`,
              severity: 'error'
            })
          }
        }

        return {
          isValid: errors.length === 0,
          errors,
          prohibitedPrefixes: Array.from(detectedPrefixes)
        } satisfies ValidationResult
      })()
    )
})
