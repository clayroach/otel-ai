/**
 * OTLP Capture Package Router
 * Handles OTLP data capture, replay sessions, and stream management
 */

import { Context, Effect, Layer } from 'effect'
import express from 'express'
import { OtlpCaptureServiceTag, OtlpReplayServiceTag } from './index.js'

export interface OtlpCaptureRouter {
  readonly router: express.Router
}

export const OtlpCaptureRouterTag = Context.GenericTag<OtlpCaptureRouter>('OtlpCaptureRouter')

export const OtlpCaptureRouterLive = Layer.effect(
  OtlpCaptureRouterTag,
  Effect.gen(function* () {
    const captureService = yield* OtlpCaptureServiceTag
    const replayService = yield* OtlpReplayServiceTag

    const router = express.Router()

    // Get all capture sessions
    router.get('/api/capture/sessions', async (_req, res) => {
      try {
        const sessions = await Effect.runPromise(captureService.listCaptureSessions())

        res.json({
          sessions,
          total: sessions.length,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        console.error('❌ Error listing capture sessions:', error)
        res.status(500).json({
          error: 'Failed to list capture sessions',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Get specific capture session
    router.get('/api/capture/sessions/:sessionId', async (req, res) => {
      try {
        const { sessionId } = req.params

        const session = await Effect.runPromise(captureService.getCaptureStatus(sessionId))

        res.json({ session })
      } catch (error) {
        console.error('❌ Error getting capture session:', error)
        res.status(500).json({
          error: 'Failed to get capture session',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Create new capture session
    router.post('/api/capture/sessions', async (req, res) => {
      try {
        const { name, config } = req.body

        const session = await Effect.runPromise(
          captureService.startCapture({
            sessionId: name || `capture-${Date.now()}`,
            captureTraces: true,
            captureMetrics: true,
            captureLogs: true,
            compressionEnabled: true,
            ...config
          })
        )

        console.log(`📥 Started capture session: ${session.sessionId}`)

        res.json({
          session,
          message: 'Capture session started successfully'
        })
      } catch (error) {
        console.error('❌ Error starting capture session:', error)
        res.status(500).json({
          error: 'Failed to start capture session',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Delete capture session
    router.delete('/api/capture/sessions/:sessionId', async (req, res) => {
      try {
        const { sessionId } = req.params

        await Effect.runPromise(captureService.stopCapture(sessionId))

        console.log(`🛑 Stopped capture session: ${sessionId}`)

        res.json({
          message: 'Capture session stopped successfully',
          sessionId
        })
      } catch (error) {
        console.error('❌ Error stopping capture session:', error)
        res.status(500).json({
          error: 'Failed to stop capture session',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Get available sessions for replay
    router.get('/api/replay/available', async (_req, res) => {
      try {
        const availableSessions = await Effect.runPromise(replayService.listAvailableReplays())

        res.json({
          sessions: availableSessions,
          total: availableSessions.length,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        console.error('❌ Error getting available replay sessions:', error)
        res.status(500).json({
          error: 'Failed to get available replay sessions',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Start replay session
    router.post('/api/replay/start', async (req, res) => {
      try {
        const { sessionId, config, speed = 1.0 } = req.body

        if (!sessionId) {
          res.status(400).json({
            error: 'Bad Request',
            message: 'sessionId is required'
          })
          return
        }

        const replaySession = await Effect.runPromise(
          replayService.startReplay({
            sessionId,
            speedMultiplier: speed,
            replayTraces: true,
            replayMetrics: true,
            replayLogs: true,
            timestampAdjustment: 'current',
            ...config
          })
        )

        console.log(`▶️ Started replay session: ${sessionId} at ${speed}x speed`)

        res.json({
          session: replaySession,
          message: 'Replay session started successfully',
          config: {
            speed,
            ...config
          }
        })
      } catch (error) {
        console.error('❌ Error starting replay session:', error)
        res.status(500).json({
          error: 'Failed to start replay session',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Get replay session status
    router.get('/api/replay/status/:sessionId', async (req, res) => {
      try {
        const { sessionId } = req.params

        const status = await Effect.runPromise(replayService.getReplayStatus(sessionId))

        res.json(status)
      } catch (error) {
        console.error('❌ Error getting replay status:', error)
        res.status(500).json({
          error: 'Failed to get replay status',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Stream replay data by signal type
    router.get('/api/replay/stream/:sessionId/:signalType', async (req, res) => {
      try {
        const { sessionId, signalType } = req.params

        // Validate signal type
        if (!['traces', 'metrics', 'logs'].includes(signalType)) {
          res.status(400).json({
            error: 'Invalid signal type',
            message: 'signalType must be one of: traces, metrics, logs'
          })
          return
        }

        // Set up streaming response
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        })

        console.log(`🌊 Starting ${signalType} stream for session ${sessionId}`)

        const stream = await Effect.runPromise(replayService.getReplayStatus(sessionId))

        // Stream the data
        res.write(
          JSON.stringify({
            sessionId,
            signalType,
            stream,
            timestamp: new Date().toISOString()
          })
        )
        res.end()
      } catch (error) {
        console.error('❌ Error streaming replay data:', error)
        if (!res.headersSent) {
          res.status(500).json({
            error: 'Failed to stream replay data',
            message: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }
    })

    return OtlpCaptureRouterTag.of({ router })
  })
)
