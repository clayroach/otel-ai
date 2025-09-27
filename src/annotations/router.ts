/**
 * Annotations Package Router
 * Handles diagnostics sessions and training data capture (flags managed externally)
 */

import { Context, Effect, Layer } from 'effect'
import * as Schema from '@effect/schema/Schema'
import express from 'express'
import { AnnotationService, DiagnosticsSessionManager, type DiagnosticsSession } from './index.js'
import { AnnotationSchema } from './annotation.schema.js'
import { TrainingDataReaderTag } from '../otlp-capture/index.js'

export interface AnnotationsRouter {
  readonly router: express.Router
}

export const AnnotationsRouterTag = Context.GenericTag<AnnotationsRouter>('AnnotationsRouter')

// In-memory state for diagnostic sessions
interface DiagnosticState {
  activeSession: DiagnosticsSession | null
}

const diagnosticState: DiagnosticState = {
  activeSession: null
}

export const AnnotationsRouterLive = Layer.effect(
  AnnotationsRouterTag,
  Effect.gen(function* () {
    const annotationService = yield* AnnotationService
    const sessionManager = yield* DiagnosticsSessionManager
    const trainingDataReader = yield* TrainingDataReaderTag

    const router = express.Router()

    // Create annotation (for external orchestration)
    router.post('/api/annotations', async (req, res) => {
      try {
        const rawAnnotation = req.body

        // Use proper schema validation and decoding
        const annotationResult = await Effect.runPromise(
          Effect.gen(function* () {
            // Decode using schema (handles date conversion automatically)
            const annotation = yield* Schema.decodeUnknown(AnnotationSchema)(rawAnnotation)
            // Create annotation
            return yield* annotationService.annotate(annotation)
          })
        )

        res.json({
          success: true,
          annotationId: annotationResult,
          message: 'Annotation created successfully'
        })
      } catch (error) {
        console.error('❌ Error creating annotation:', error)
        res.status(500).json({
          error: 'Failed to create annotation',
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
