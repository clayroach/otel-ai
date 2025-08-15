/**
 * Integration test suite for S3Storage with MinIO TestContainer
 * These tests require Docker and take longer to run
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { GenericContainer, type StartedTestContainer } from 'testcontainers'
import { S3Client, CreateBucketCommand } from '@aws-sdk/client-s3'
import { Effect } from 'effect'
import { makeS3Storage, type S3Storage } from './s3.js'
import { type S3Config, type RetentionConfig } from './config.js'
import { type OTLPData } from './schemas.js'

describe('S3Storage Integration Tests', () => {
  let s3Storage: S3Storage
  let config: S3Config
  let minioContainer: StartedTestContainer

  beforeAll(async () => {
    console.log('🧪 Starting MinIO TestContainer...')
    
    // Start MinIO container using generic container
    minioContainer = await new GenericContainer('minio/minio:latest')
      .withEnvironment({ 
        'MINIO_ROOT_USER': 'testuser',
        'MINIO_ROOT_PASSWORD': 'testpass123'
      })
      .withCommand(['server', '/data'])
      .withExposedPorts(9000)
      .start()

    console.log('✅ MinIO TestContainer started')
    
    // Wait a moment for MinIO to be fully ready
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Configure S3 storage to use the test container
    config = {
      endpoint: `http://${minioContainer.getHost()}:${minioContainer.getMappedPort(9000)}`,
      region: 'us-east-1',
      bucket: 'test-otel-bucket',
      accessKeyId: 'testuser',
      secretAccessKey: 'testpass123',
      forcePathStyle: true,
      enableEncryption: false // Disable encryption for MinIO testing
    }

    // Create the bucket first using direct S3 client
    console.log('🪣 Creating test bucket...')
    const s3Client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      },
      forcePathStyle: true
    })

    try {
      await s3Client.send(new CreateBucketCommand({ Bucket: config.bucket }))
      console.log('✅ Test bucket created')
    } catch (error) {
      console.warn('Bucket creation failed (may already exist):', error.message)
    }

    // Create S3 storage instance
    const createS3 = makeS3Storage(config)
    const result = await Effect.runPromise(createS3)
    s3Storage = result
    
    console.log('✅ S3 storage initialized')
  }, 120000) // 2 minute timeout for container startup

  afterAll(async () => {
    if (minioContainer) {
      console.log('🧹 Stopping MinIO TestContainer...')
      await minioContainer.stop()
      console.log('✅ MinIO TestContainer stopped')
    }
  }, 60000)

  describe('Health Check Integration', () => {
    it('should perform health check successfully with real MinIO', async () => {
      const healthEffect = s3Storage.healthCheck()
      const isHealthy = await Effect.runPromise(healthEffect)
      expect(isHealthy).toBe(true)
    })
  })

  describe('Raw Data Operations Integration', () => {
    const testKey = 'test/integration/data.bin'
    const testData = new TextEncoder().encode('Hello, MinIO integration test!')

    it('should store and retrieve raw data end-to-end', async () => {
      // Store data
      const storeEffect = s3Storage.storeRawData(testData, testKey)
      await Effect.runPromise(storeEffect)
      
      // Retrieve data
      const retrieveEffect = s3Storage.retrieveRawData(testKey)
      const retrievedData = await Effect.runPromise(retrieveEffect)
      
      expect(retrievedData).toEqual(testData)
      expect(new TextDecoder().decode(retrievedData)).toBe('Hello, MinIO integration test!')
    })

    it('should list objects after storage', async () => {
      const listEffect = s3Storage.listObjects('test/')
      const objects = await Effect.runPromise(listEffect)
      
      expect(Array.isArray(objects)).toBe(true)
      expect(objects).toContain(testKey)
    })

    it('should delete raw data', async () => {
      const deleteEffect = s3Storage.deleteRawData(testKey)
      await Effect.runPromise(deleteEffect)
      
      // Verify deletion
      const listEffect = s3Storage.listObjects('test/')
      const objects = await Effect.runPromise(listEffect)
      expect(objects).not.toContain(testKey)
    })
  })

  describe('OTLP Data Archival Integration', () => {
    const testOTLPData: OTLPData = {
      traces: [
        {
          traceId: 's3-integration-trace-123',
          spanId: 's3-integration-span-123',
          operationName: 's3-integration-operation',
          startTime: Date.now() * 1000000,
          endTime: (Date.now() + 1000) * 1000000,
          duration: 1000000000,
          serviceName: 's3-integration-service',
          statusCode: 1,
          spanKind: 'SERVER',
          attributes: { 'test.s3': 'integration' },
          resourceAttributes: { 'service.name': 's3-integration-service' },
          events: [],
          links: []
        }
      ],
      timestamp: Date.now()
    }

    it('should archive OTLP data successfully', async () => {
      const archiveEffect = s3Storage.archiveOTLPData(testOTLPData, testOTLPData.timestamp)
      await Effect.runPromise(archiveEffect)
      
      // Verify the archived data exists
      const listEffect = s3Storage.listObjects('otel-data/')
      const objects = await Effect.runPromise(listEffect)
      
      expect(objects.length).toBeGreaterThan(0)
      expect(objects.some(key => key.includes('otel-data/'))).toBe(true)
    })
  })

  describe('Retention Policy Integration', () => {
    it('should apply retention policies without errors', async () => {
      const retentionConfig: RetentionConfig = {
        traces: {
          clickhouse: '7d',
          s3: '30d'
        },
        metrics: {
          clickhouse: '14d', 
          s3: '60d'
        },
        logs: {
          clickhouse: '7d',
          s3: '30d'
        }
      }

      const retentionEffect = s3Storage.applyRetentionPolicy(retentionConfig)
      await Effect.runPromise(retentionEffect)
      
      // Retention policy application should succeed
      // (specific cleanup behavior would depend on data age)
    })
  })

  describe('Error Handling Integration', () => {
    it('should handle missing objects gracefully', async () => {
      const retrieveEffect = s3Storage.retrieveRawData('nonexistent/key.bin')
      
      await expect(Effect.runPromise(retrieveEffect)).rejects.toThrow()
    })

    it('should handle invalid bucket operations', async () => {
      // Try to delete a non-existent key
      const deleteEffect = s3Storage.deleteRawData('definitely/does/not/exist.bin')
      
      // Should not throw for non-existent key deletion
      await Effect.runPromise(deleteEffect)
    })
  })
})