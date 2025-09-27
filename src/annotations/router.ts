/**
 * Annotations Package Router
 * Handles diagnostics sessions, feature flags, and training data capture
 */

import { Context, Effect, Layer } from 'effect'
import express from 'express'
import {
  AnnotationService,
  DiagnosticsSessionManager,
  FeatureFlagController,
  type DiagnosticsSession
} from './index.js'
import { TrainingDataReaderTag } from '../otlp-capture/index.js'

export interface AnnotationsRouter {
  readonly router: express.Router
}

export const AnnotationsRouterTag = Context.GenericTag<AnnotationsRouter>('AnnotationsRouter')

// In-memory state for diagnostic sessions and feature flags
interface DiagnosticState {
  activeSession: DiagnosticsSession | null
  enabledFlags: Set<string>
  flagStates: Map<string, boolean>
}

const diagnosticState: DiagnosticState = {
  activeSession: null,
  enabledFlags: new Set(),
  flagStates: new Map()
}

export const AnnotationsRouterLive = Layer.effect(
  AnnotationsRouterTag,
  Effect.gen(function* () {
    yield* AnnotationService // Ensure service is available
    const sessionManager = yield* DiagnosticsSessionManager
    const flagController = yield* FeatureFlagController
    const trainingDataReader = yield* TrainingDataReaderTag

    const router = express.Router()

    // Get feature flags
    router.get('/api/diagnostics/flags', async (_req, res) => {
      try {
        const flags = await Effect.runPromise(flagController.listFlags())

        res.json({
          flags,
          enabled: Array.from(diagnosticState.enabledFlags),
          states: Object.fromEntries(diagnosticState.flagStates)
        })
      } catch (error) {
        console.error('❌ Error listing feature flags:', error)
        res.status(500).json({
          error: 'Failed to list feature flags',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Toggle feature flag
    router.post('/api/diagnostics/flags/:flagName', async (req, res) => {
      try {
        const { flagName } = req.params
        const { enabled } = req.body

        await Effect.runPromise(
          Effect.gen(function* () {
            if (enabled) {
              yield* flagController.enableFlag(flagName)
            } else {
              yield* flagController.disableFlag(flagName)
            }

            // Update local state
            if (enabled) {
              diagnosticState.enabledFlags.add(flagName)
            } else {
              diagnosticState.enabledFlags.delete(flagName)
            }
            diagnosticState.flagStates.set(flagName, enabled)
          })
        )

        console.log(`🎯 Feature flag ${flagName} ${enabled ? 'enabled' : 'disabled'}`)

        res.json({
          flag: flagName,
          enabled,
          message: `Feature flag ${flagName} ${enabled ? 'enabled' : 'disabled'}`,
          timestamp: new Date().toISOString()
        })
      } catch (error) {
        console.error('❌ Error setting feature flag:', error)
        res.status(500).json({
          error: 'Failed to set feature flag',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Create diagnostics session
    router.post('/api/diagnostics/sessions', async (req, res) => {
      try {
        const { name, metadata } = req.body

        const session = await Effect.runPromise(
          sessionManager.createSession({
            flagName: 'default',
            name: name || `Session-${Date.now()}`,
            metadata: metadata || {}
          })
        )

        diagnosticState.activeSession = session

        console.log(`📋 Created diagnostics session: ${session.id}`)

        res.json({
          session,
          message: 'Diagnostics session created successfully'
        })
      } catch (error) {
        console.error('❌ Error creating diagnostics session:', error)
        res.status(500).json({
          error: 'Failed to create diagnostics session',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // List diagnostics sessions
    router.get('/api/diagnostics/sessions', async (_req, res) => {
      try {
        const sessions = await Effect.runPromise(sessionManager.listSessions())

        res.json({
          sessions,
          total: sessions.length,
          activeSession: diagnosticState.activeSession
        })
      } catch (error) {
        console.error('❌ Error listing diagnostics sessions:', error)
        res.status(500).json({
          error: 'Failed to list diagnostics sessions',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Get specific diagnostics session
    router.get('/api/diagnostics/sessions/:sessionId', async (req, res) => {
      try {
        const { sessionId } = req.params

        const session = await Effect.runPromise(sessionManager.getSession(sessionId))

        res.json({ session })
      } catch (error) {
        console.error('❌ Error getting diagnostics session:', error)
        res.status(500).json({
          error: 'Failed to get diagnostics session',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Delete diagnostics session
    router.delete('/api/diagnostics/sessions/:sessionId', async (req, res) => {
      try {
        const { sessionId } = req.params

        await Effect.runPromise(sessionManager.stopSession(sessionId))

        // Clear active session if it was deleted
        if (diagnosticState.activeSession?.id === sessionId) {
          diagnosticState.activeSession = null
        }

        console.log(`🗑️ Deleted diagnostics session: ${sessionId}`)

        res.json({
          message: 'Diagnostics session deleted successfully',
          sessionId
        })
      } catch (error) {
        console.error('❌ Error deleting diagnostics session:', error)
        res.status(500).json({
          error: 'Failed to delete diagnostics session',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Get session annotations
    router.get('/api/diagnostics/sessions/:sessionId/annotations', async (req, res) => {
      try {
        const { sessionId } = req.params

        const annotations = await Effect.runPromise(sessionManager.getSessionAnnotations(sessionId))

        res.json({
          annotations,
          total: annotations.length,
          sessionId
        })
      } catch (error) {
        console.error('❌ Error getting session annotations:', error)
        res.status(500).json({
          error: 'Failed to get session annotations',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Start training data capture
    router.post('/api/diagnostics/training/capture', async (req, res) => {
      try {
        const { flagName, flagValues, phaseDurations } = req.body

        // Validate request body
        if (!flagName || !flagValues || !phaseDurations) {
          res.status(400).json({
            error: 'Invalid request',
            message: 'flagName, flagValues, and phaseDurations are required'
          })
          return
        }

        const result = await Effect.runPromise(
          sessionManager.runTrainingSession({
            flagName,
            flagValues,
            phaseDurations
          })
        )

        res.json({
          success: true,
          result,
          message: 'Training data capture started'
        })
      } catch (error) {
        console.error('❌ Error starting training data capture:', error)
        res.status(500).json({
          error: 'Failed to start training data capture',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Get training session data
    router.get('/api/diagnostics/training/sessions/:sessionId', async (req, res) => {
      try {
        const { sessionId } = req.params

        const trainingData = await Effect.runPromise(trainingDataReader.getTrainingData(sessionId))

        res.json(trainingData)
      } catch (error) {
        console.error('❌ Error getting training session:', error)
        res.status(500).json({
          error: 'Failed to get training session',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Stream training session data by phase
    router.get('/api/diagnostics/training/sessions/:sessionId/stream/:phase', async (req, res) => {
      try {
        const { sessionId } = req.params

        // Set up streaming response
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive'
        })

        const trainingStream = await Effect.runPromise(
          trainingDataReader.getTrainingData(sessionId)
        )

        // Stream the data
        res.write(JSON.stringify(trainingStream))
        res.end()
      } catch (error) {
        console.error('❌ Error streaming training data:', error)
        if (!res.headersSent) {
          res.status(500).json({
            error: 'Failed to stream training data',
            message: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }
    })

    return AnnotationsRouterTag.of({ router })
  })
)
