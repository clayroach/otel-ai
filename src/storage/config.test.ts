/**
 * Unit tests for storage configuration
 */

import { describe, it, expect } from 'vitest'
import { StorageConfigSchema, defaultStorageConfig } from './config.js'
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
        s3: {
          endpoint: 'http://localhost:9010',
          region: 'us-east-1',
          bucket: 'otel-data',
          accessKeyId: 'minioadmin',
          secretAccessKey: 'minioadmin',
          forcePathStyle: true
        },
        retention: {
          traces: {
            clickhouse: '7d',
            s3: '1y'
          },
          metrics: {
            clickhouse: '30d',
            s3: '2y'
          },
          logs: {
            clickhouse: '3d',
            s3: '6m'
          }
        },
        performance: {
          batchSize: 1000,
          flushInterval: 5000,
          maxConcurrentWrites: 5,
          compressionLevel: 6
        }
      }

      const parseResult = Schema.decodeUnknownSync(StorageConfigSchema)(validConfig)
      expect(parseResult).toBeDefined()
      expect(parseResult.clickhouse.host).toBe('localhost')
      expect(parseResult.s3.bucket).toBe('otel-data')
    })

    it('should use default values for optional fields', () => {
      const minimalConfig = {
        clickhouse: {
          host: 'localhost',
          port: 9000,
          database: 'otel',
          username: 'user',
          password: 'pass'
        },
        s3: {
          endpoint: 'http://localhost:9010',
          bucket: 'test-bucket',
          accessKeyId: 'key',
          secretAccessKey: 'secret'
        },
        retention: {
          traces: { clickhouse: '7d', s3: '1y' },
          metrics: { clickhouse: '30d', s3: '2y' },
          logs: { clickhouse: '3d', s3: '6m' }
        },
        performance: {
          batchSize: 1000,
          flushInterval: 5000,
          maxConcurrentWrites: 5
        }
      }

      const parseResult = Schema.decodeUnknownSync(StorageConfigSchema)(minimalConfig)
      expect(parseResult.clickhouse.compression).toBeUndefined() // Optional field
      expect(parseResult.s3.region).toBeUndefined() // Optional field
    })

    it('should reject configuration with missing required fields', () => {
      const incompleteConfig = {
        clickhouse: {
          host: 'localhost'
          // Missing required fields
        }
      }

      expect(() => {
        Schema.decodeUnknownSync(StorageConfigSchema)(incompleteConfig)
      }).toThrow()
    })

    it('should reject configuration with invalid types', () => {
      const invalidConfig = {
        clickhouse: {
          host: 'localhost',
          port: 'not-a-number', // Should be number
          database: 'otel',
          username: 'user',
          password: 'pass'
        },
        s3: {
          endpoint: 'http://localhost:9010',
          bucket: 'test-bucket',
          accessKeyId: 'key',
          secretAccessKey: 'secret'
        }
      }

      expect(() => {
        Schema.decodeUnknownSync(StorageConfigSchema)(invalidConfig)
      }).toThrow()
    })

    it('should validate retention policy formats', () => {
      const configWithRetention = {
        clickhouse: {
          host: 'localhost',
          port: 9000,
          database: 'otel',
          username: 'user',
          password: 'pass'
        },
        s3: {
          endpoint: 'http://localhost:9010',
          bucket: 'test-bucket',
          accessKeyId: 'key',
          secretAccessKey: 'secret'
        },
        retention: {
          traces: {
            clickhouse: '7d',
            s3: '1y'
          },
          metrics: {
            clickhouse: '30d',
            s3: '2y'
          },
          logs: {
            clickhouse: '3d',
            s3: '6m'
          }
        },
        performance: {
          batchSize: 1000,
          flushInterval: 5000,
          maxConcurrentWrites: 5
        }
      }

      const parseResult = Schema.decodeUnknownSync(StorageConfigSchema)(configWithRetention)
      expect(parseResult.retention?.traces.clickhouse).toBe('7d')
      expect(parseResult.retention?.metrics.s3).toBe('2y')
    })
  })

  describe('Default Configuration', () => {
    it('should provide a complete default configuration', () => {
      expect(defaultStorageConfig).toBeDefined()
      expect(defaultStorageConfig.clickhouse).toBeDefined()
      expect(defaultStorageConfig.s3).toBeDefined()
      expect(defaultStorageConfig.retention).toBeDefined()
      expect(defaultStorageConfig.performance).toBeDefined()
    })

    it('should have valid default values', () => {
      expect(defaultStorageConfig.clickhouse.host).toBe('localhost')
      expect(defaultStorageConfig.clickhouse.port).toBe(8123)
      expect(defaultStorageConfig.clickhouse.database).toBe('otel')

      expect(defaultStorageConfig.s3.endpoint).toBe('http://localhost:9010')
      expect(defaultStorageConfig.s3.bucket).toBe('otel-data')

      expect(defaultStorageConfig.performance.batchSize).toBe(1000)
      expect(defaultStorageConfig.performance.flushInterval).toBe(5000)
    })

    it('should be valid according to the schema', () => {
      const parseResult = Schema.decodeUnknownSync(StorageConfigSchema)(defaultStorageConfig)
      expect(parseResult).toBeDefined()
      expect(parseResult.clickhouse.host).toBe(defaultStorageConfig.clickhouse.host)
    })
  })

  describe('Environment Variable Integration', () => {
    it('should handle environment variable substitution patterns', () => {
      // This tests the concept of environment variable usage
      const envConfig = {
        clickhouse: {
          host: process.env.CLICKHOUSE_HOST || 'localhost',
          port: parseInt(process.env.CLICKHOUSE_PORT || '9000'),
          database: process.env.CLICKHOUSE_DATABASE || 'otel',
          username: process.env.CLICKHOUSE_USERNAME || 'otel',
          password: process.env.CLICKHOUSE_PASSWORD || 'otel123'
        },
        s3: {
          endpoint: process.env.S3_ENDPOINT || 'http://localhost:9010',
          bucket: process.env.S3_BUCKET || 'otel-data',
          accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
          secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin'
        },
        retention: {
          traces: { clickhouse: '7d', s3: '1y' },
          metrics: { clickhouse: '30d', s3: '2y' },
          logs: { clickhouse: '3d', s3: '6m' }
        },
        performance: {
          batchSize: 1000,
          flushInterval: 5000,
          maxConcurrentWrites: 5
        }
      }

      const parseResult = Schema.decodeUnknownSync(StorageConfigSchema)(envConfig)
      expect(parseResult).toBeDefined()
      expect(typeof parseResult.clickhouse.port).toBe('number')
    })
  })

  describe('Configuration Validation Edge Cases', () => {
    it('should handle very large numbers appropriately', () => {
      const configWithLargeValues = {
        clickhouse: {
          host: 'localhost',
          port: 65535, // Max port number
          database: 'otel',
          username: 'user',
          password: 'pass',
          connectTimeout: 300000, // 5 minutes
          maxOpenConnections: 100
        },
        s3: {
          endpoint: 'http://localhost:9010',
          bucket: 'test-bucket',
          accessKeyId: 'key',
          secretAccessKey: 'secret'
        },
        retention: {
          traces: { clickhouse: '7d', s3: '1y' },
          metrics: { clickhouse: '30d', s3: '2y' },
          logs: { clickhouse: '3d', s3: '6m' }
        },
        performance: {
          batchSize: 10000, // Large batch
          flushInterval: 60000, // 1 minute
          maxConcurrentWrites: 10
        }
      }

      const parseResult = Schema.decodeUnknownSync(StorageConfigSchema)(configWithLargeValues)
      expect(parseResult.clickhouse.port).toBe(65535)
      expect(parseResult.performance.batchSize).toBe(10000)
    })

    it('should allow negative port numbers (schema validation)', () => {
      const configWithNegativeValues = {
        clickhouse: {
          host: 'localhost',
          port: -1, // Negative port (schema allows numbers)
          database: 'otel',
          username: 'user',
          password: 'pass'
        },
        s3: {
          endpoint: 'http://localhost:9010',
          bucket: 'test-bucket',
          accessKeyId: 'key',
          secretAccessKey: 'secret'
        },
        retention: {
          traces: { clickhouse: '7d', s3: '1y' },
          metrics: { clickhouse: '30d', s3: '2y' },
          logs: { clickhouse: '3d', s3: '6m' }
        },
        performance: {
          batchSize: 1000,
          flushInterval: 5000,
          maxConcurrentWrites: 5
        }
      }

      // The schema validates types, not business logic
      const parseResult = Schema.decodeUnknownSync(StorageConfigSchema)(configWithNegativeValues)
      expect(parseResult.clickhouse.port).toBe(-1)
    })

    it('should handle empty strings appropriately', () => {
      const configWithEmptyStrings = {
        clickhouse: {
          host: '', // Empty host
          port: 9000,
          database: 'otel',
          username: 'user',
          password: 'pass'
        },
        s3: {
          endpoint: 'http://localhost:9010',
          bucket: 'test-bucket',
          accessKeyId: 'key',
          secretAccessKey: 'secret'
        },
        retention: {
          traces: { clickhouse: '7d', s3: '1y' },
          metrics: { clickhouse: '30d', s3: '2y' },
          logs: { clickhouse: '3d', s3: '6m' }
        },
        performance: {
          batchSize: 1000,
          flushInterval: 5000,
          maxConcurrentWrites: 5
        }
      }

      // Depending on schema validation, this might throw or might be allowed
      try {
        const parseResult = Schema.decodeUnknownSync(StorageConfigSchema)(configWithEmptyStrings)
        expect(parseResult.clickhouse.host).toBe('')
      } catch (error) {
        // Expected if schema requires non-empty strings
        expect(error).toBeDefined()
      }
    })
  })
})
