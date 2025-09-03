/**
 * Effect-native S3 client wrapper
 * 
 * Wraps the AWS S3 client at the boundary, providing pure Effect functions
 * for all S3 operations. Following ADR-007 principles.
 */

import { Effect, Layer, Context, Stream, Chunk } from 'effect'
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  type S3ClientConfig
} from '@aws-sdk/client-s3'
import { StorageErrorConstructors } from './errors.js'

// ============================================================================
// Effect-Native S3 Client Interface
// ============================================================================

export interface S3Object {
  readonly key: string
  readonly size?: number
  readonly lastModified?: Date
  readonly etag?: string
}

export interface EffectS3Client {
  readonly putObject: (params: {
    bucket: string
    key: string
    body: string | Buffer | Uint8Array
    contentType?: string
    metadata?: Record<string, string>
  }) => Effect.Effect<void, StorageErrorConstructors['WriteError']>
  
  readonly getObject: (params: {
    bucket: string
    key: string
  }) => Effect.Effect<Buffer, StorageErrorConstructors['ReadError']>
  
  readonly deleteObject: (params: {
    bucket: string
    key: string
  }) => Effect.Effect<void, StorageErrorConstructors['WriteError']>
  
  readonly listObjects: (params: {
    bucket: string
    prefix?: string
    maxKeys?: number
  }) => Effect.Effect<S3Object[], StorageErrorConstructors['ReadError']>
  
  readonly headObject: (params: {
    bucket: string
    key: string
  }) => Effect.Effect<S3Object, StorageErrorConstructors['ReadError']>
  
  readonly streamObject: (params: {
    bucket: string
    key: string
    chunkSize?: number
  }) => Stream.Stream<Uint8Array, StorageErrorConstructors['ReadError']>
}

export class EffectS3ClientTag extends Context.Tag('EffectS3Client')<
  EffectS3ClientTag,
  EffectS3Client
>() {}

// ============================================================================
// Implementation
// ============================================================================

class EffectS3ClientImpl implements EffectS3Client {
  constructor(private readonly client: S3Client) {}

  putObject(params: {
    bucket: string
    key: string
    body: string | Buffer | Uint8Array
    contentType?: string
    metadata?: Record<string, string>
  }): Effect.Effect<void, StorageErrorConstructors['WriteError']> {
    return Effect.gen(function* (_) {
      const command = new PutObjectCommand({
        Bucket: params.bucket,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
        Metadata: params.metadata
      })

      try {
        yield* _(Effect.promise(() => this.client.send(command)))
      } catch (error) {
        return yield* _(Effect.fail(
          new StorageErrorConstructors['WriteError']({
            message: `Failed to put object ${params.key} to bucket ${params.bucket}`,
            operation: 's3:putObject',
            cause: error
          })
        ))
      }
    }.bind(this))
  }

  getObject(params: {
    bucket: string
    key: string
  }): Effect.Effect<Buffer, StorageErrorConstructors['ReadError']> {
    return Effect.gen(function* (_) {
      const command = new GetObjectCommand({
        Bucket: params.bucket,
        Key: params.key
      })

      try {
        const response = yield* _(Effect.promise(() => this.client.send(command)))
        
        if (!response.Body) {
          return yield* _(Effect.fail(
            new StorageErrorConstructors['ReadError']({
              message: `Object ${params.key} has no body`,
              operation: 's3:getObject'
            })
          ))
        }

        const bytes = yield* _(Effect.promise(() => response.Body!.transformToByteArray()))
        return Buffer.from(bytes)
      } catch (error) {
        return yield* _(Effect.fail(
          new StorageErrorConstructors['ReadError']({
            message: `Failed to get object ${params.key} from bucket ${params.bucket}`,
            operation: 's3:getObject',
            cause: error
          })
        ))
      }
    }.bind(this))
  }

  deleteObject(params: {
    bucket: string
    key: string
  }): Effect.Effect<void, StorageErrorConstructors['WriteError']> {
    return Effect.gen(function* (_) {
      const command = new DeleteObjectCommand({
        Bucket: params.bucket,
        Key: params.key
      })

      try {
        yield* _(Effect.promise(() => this.client.send(command)))
      } catch (error) {
        return yield* _(Effect.fail(
          new StorageErrorConstructors['WriteError']({
            message: `Failed to delete object ${params.key} from bucket ${params.bucket}`,
            operation: 's3:deleteObject',
            cause: error
          })
        ))
      }
    }.bind(this))
  }

  listObjects(params: {
    bucket: string
    prefix?: string
    maxKeys?: number
  }): Effect.Effect<S3Object[], StorageErrorConstructors['ReadError']> {
    return Effect.gen(function* (_) {
      const command = new ListObjectsV2Command({
        Bucket: params.bucket,
        Prefix: params.prefix,
        MaxKeys: params.maxKeys || 1000
      })

      try {
        const response = yield* _(Effect.promise(() => this.client.send(command)))
        
        return (response.Contents || []).map(obj => ({
          key: obj.Key!,
          size: obj.Size,
          lastModified: obj.LastModified,
          etag: obj.ETag
        }))
      } catch (error) {
        return yield* _(Effect.fail(
          new StorageErrorConstructors['ReadError']({
            message: `Failed to list objects in bucket ${params.bucket}`,
            operation: 's3:listObjects',
            cause: error
          })
        ))
      }
    }.bind(this))
  }

  headObject(params: {
    bucket: string
    key: string
  }): Effect.Effect<S3Object, StorageErrorConstructors['ReadError']> {
    return Effect.gen(function* (_) {
      const command = new HeadObjectCommand({
        Bucket: params.bucket,
        Key: params.key
      })

      try {
        const response = yield* _(Effect.promise(() => this.client.send(command)))
        
        return {
          key: params.key,
          size: response.ContentLength,
          lastModified: response.LastModified,
          etag: response.ETag
        }
      } catch (error) {
        return yield* _(Effect.fail(
          new StorageErrorConstructors['ReadError']({
            message: `Failed to head object ${params.key} in bucket ${params.bucket}`,
            operation: 's3:headObject',
            cause: error
          })
        ))
      }
    }.bind(this))
  }

  streamObject(params: {
    bucket: string
    key: string
    chunkSize?: number
  }): Stream.Stream<Uint8Array, StorageErrorConstructors['ReadError']> {
    return Stream.fromAsyncIterable(
      (async function* (this: EffectS3ClientImpl) {
        const command = new GetObjectCommand({
          Bucket: params.bucket,
          Key: params.key
        })

        try {
          const response = await this.client.send(command)
          
          if (!response.Body) {
            throw new Error(`Object ${params.key} has no body`)
          }

          // Stream the body in chunks
          const stream = response.Body as any
          for await (const chunk of stream) {
            yield new Uint8Array(chunk)
          }
        } catch (error) {
          throw new StorageErrorConstructors['ReadError']({
            message: `Failed to stream object ${params.key}`,
            operation: 's3:streamObject',
            cause: error
          })
        }
      }).bind(this)(),
      (error) => new StorageErrorConstructors['ReadError']({
        message: `Stream error`,
        operation: 's3:streamObject',
        cause: error
      })
    )
  }
}

// ============================================================================
// Layer Construction
// ============================================================================

export interface S3Config {
  readonly region: string
  readonly endpoint?: string
  readonly accessKeyId?: string
  readonly secretAccessKey?: string
  readonly forcePathStyle?: boolean
}

export const makeEffectS3ClientLayer = (
  config: S3Config
): Layer.Layer<EffectS3ClientTag, never, never> =>
  Layer.succeed(
    EffectS3ClientTag,
    new EffectS3ClientImpl(
      new S3Client({
        region: config.region,
        endpoint: config.endpoint,
        credentials: config.accessKeyId && config.secretAccessKey ? {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey
        } : undefined,
        forcePathStyle: config.forcePathStyle
      })
    )
  )

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create an Effect-native S3 client from config
 */
export const createEffectS3Client = (
  config: S3Config
): Effect.Effect<EffectS3Client, never, never> =>
  Effect.gen(function* (_) {
    const layer = makeEffectS3ClientLayer(config)
    return yield* _(Effect.service(EffectS3ClientTag).pipe(
      Effect.provide(layer)
    ))
  })