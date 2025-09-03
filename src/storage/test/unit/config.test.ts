/**
 * Unit tests for storage configuration
 */

import { describe, it, expect } from 'vitest'
import { StorageConfigSchema, defaultStorageConfig } from '../../config.js'
import { Schema } from '@effect/schema'

describe('Storage Configuration', () => {
  describe('StorageConfigSchema', () => {
    it('should validate a complete valid configuration', () => {
      const validConfig = {
        clickhouse: {
          host: 'localhost',
          port: 9000,
          database: 'otel',
          username: 'otel',
          password: 'password123',
          compression: true,
          connectTimeout: 30000,
          maxOpenConnections: 10
        },
        performance: {
          batchSize: 1000,
          flushInterval: 5000,
          maxConcurrentWrites: 5,
          compressionLevel: 6
        }
      }

      const result = Schema.decodeUnknownSync(StorageConfigSchema)(validConfig)
      expect(result).toBeDefined()
      expect(result.clickhouse.host).toBe('localhost')
      expect(result.clickhouse.port).toBe(9000)
    })

    it('should use default values for optional fields', () => {
      const minimalConfig = {
        clickhouse: {
          host: 'localhost',
          port: 8123,
          database: 'otel',
          username: 'otel',
          password: 'password'
        },
        performance: {
          batchSize: 100,
          flushInterval: 5000,
          maxConcurrentWrites: 5
        }
      }

      const result = Schema.decodeUnknownSync(StorageConfigSchema)(minimalConfig)
      expect(result).toBeDefined()
      expect(result.clickhouse.host).toBe('localhost')
    })

    it('should reject invalid configuration', () => {
      const invalidConfig = {
        clickhouse: {
          // Missing required fields
          host: 'localhost'
        }
      }

      expect(() => Schema.decodeUnknownSync(StorageConfigSchema)(invalidConfig)).toThrow()
    })
  })

  describe('Default Configuration', () => {
    it('should provide a complete default configuration', () => {
      expect(defaultStorageConfig).toBeDefined()
      expect(defaultStorageConfig.clickhouse).toBeDefined()
      expect(defaultStorageConfig.performance).toBeDefined()
      expect(defaultStorageConfig.features).toBeDefined()
    })

    it('should have valid default values', () => {
      expect(defaultStorageConfig.clickhouse.host).toBe('localhost')
      expect(defaultStorageConfig.clickhouse.port).toBe(8123)
      expect(defaultStorageConfig.clickhouse.database).toBe('otel')
      expect(defaultStorageConfig.performance.batchSize).toBe(100)
      expect(defaultStorageConfig.performance.flushInterval).toBe(5000)
      expect(defaultStorageConfig.features?.enableCompression).toBe(true)
    })
  })
})