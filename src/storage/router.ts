/**
 * Storage Package Router
 * Handles ClickHouse queries and retention management
 */

import { Context, Effect, Layer } from 'effect'
import express from 'express'
import { StorageAPIClientTag } from './index.js'
import { RetentionServiceTag, type RetentionPolicy } from '../otlp-capture/index.js'

export interface StorageRouter {
  readonly router: express.Router
}

export const StorageRouterTag = Context.GenericTag<StorageRouter>('StorageRouter')

export const StorageRouterLive = Layer.effect(
  StorageRouterTag,
  Effect.gen(function* () {
    const storageClient = yield* StorageAPIClientTag
    const retentionService = yield* RetentionServiceTag

    const router = express.Router()

    // Helper function for raw queries that returns data in legacy format
    const queryWithResults = async (sql: string): Promise<{ data: Record<string, unknown>[] }> => {
      const result = await Effect.runPromise(storageClient.queryRaw(sql))
      return { data: result as Record<string, unknown>[] }
    }

    // ClickHouse query endpoint
    router.post('/api/clickhouse/query', async (req, res) => {
      try {
        const { query } = req.body

        if (!query || typeof query !== 'string') {
          res.status(400).json({
            error: 'Bad Request',
            message: 'Query parameter is required and must be a string'
          })
          return
        }

        console.log('🔍 Executing ClickHouse query:', query.substring(0, 100) + '...')

        const result = await queryWithResults(query)

        res.json({
          data: result.data,
          rows: result.data.length,
          query: query,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        console.error('❌ Error executing ClickHouse query:', error)
        res.status(500).json({
          error: 'Query execution failed',
          message: error instanceof Error ? error.message : 'Unknown error',
          query: req.body?.query?.substring(0, 100) || 'unknown'
        })
      }
    })

    // Storage usage endpoint
    router.get('/api/retention/usage', async (req, res) => {
      try {
        const usage = await Effect.runPromise(retentionService.getStorageUsage())

        res.json(usage)
      } catch (error) {
        console.error('❌ Error getting storage usage:', error)
        res.status(500).json({
          error: 'Failed to get storage usage',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Cleanup continuous data (manual trigger)
    router.post('/api/retention/cleanup/continuous', async (req, res) => {
      try {
        const { olderThanDays = 7 } = req.body

        const result = await Effect.runPromise(
          retentionService.cleanupContinuousData(olderThanDays)
        )

        res.json({
          success: true,
          result
        })
      } catch (error) {
        console.error('❌ Error cleaning up continuous data:', error)
        res.status(500).json({
          error: 'Failed to cleanup continuous data',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Start retention jobs with policy
    router.post('/api/retention/jobs/start', async (req, res) => {
      try {
        const policy: RetentionPolicy = req.body

        await Effect.runPromise(retentionService.scheduleRetentionJobs(policy))

        res.json({
          success: true,
          message: 'Retention jobs started successfully'
        })
      } catch (error) {
        console.error('❌ Error starting retention jobs:', error)
        res.status(500).json({
          error: 'Failed to start retention jobs',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Archive old sessions
    router.post('/api/retention/archive', async (req, res) => {
      try {
        const { olderThanDays = 30 } = req.body

        const result = await Effect.runPromise(retentionService.archiveOldSessions(olderThanDays))

        res.json({
          success: true,
          result
        })
      } catch (error) {
        console.error('❌ Error archiving sessions:', error)
        res.status(500).json({
          error: 'Failed to archive sessions',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    return StorageRouterTag.of({ router })
  })
)
