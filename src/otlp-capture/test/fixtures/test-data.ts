/**
 * Test fixtures for OTLP capture and replay tests
 */

import { CaptureConfig, ReplayConfig, CaptureSessionMetadata } from '../../schemas.js'

export const mockCaptureConfig: CaptureConfig = {
  sessionId: 'test-session-001',
  diagnosticSessionId: 'diagnostic-001',
  description: 'Test capture session',
  enabledFlags: ['paymentServiceFailure', 'slowDatabase'],
  captureTraces: true,
  captureMetrics: false,
  captureLogs: false,
  compressionEnabled: true,
  maxSizeMB: 100,
  maxDurationMinutes: 30
}

export const mockReplayConfig: ReplayConfig = {
  sessionId: 'test-session-001',
  targetEndpoint: 'http://localhost:4318/v1/traces',
  timestampAdjustment: 'current',
  speedMultiplier: 1.0,
  replayTraces: true,
  replayMetrics: false,
  replayLogs: false
}

export const mockSessionMetadata: CaptureSessionMetadata = {
  sessionId: 'test-session-001',
  diagnosticSessionId: 'diagnostic-001',
  startTime: new Date('2024-01-01T10:00:00Z'),
  endTime: new Date('2024-01-01T10:30:00Z'),
  status: 'completed',
  enabledFlags: ['paymentServiceFailure', 'slowDatabase'],
  capturedTraces: 150,
  capturedMetrics: 0,
  capturedLogs: 0,
  totalSizeBytes: 2048576, // 2MB
  s3Prefix: 'sessions/test-session-001',
  createdBy: 'system:otlp-capture',
  description: 'Test capture session'
}

// JSON representation for schema tests (as strings)
export const mockSessionMetadataJson = {
  sessionId: 'test-session-001',
  diagnosticSessionId: 'diagnostic-001',
  startTime: '2024-01-01T10:00:00.000Z',
  endTime: '2024-01-01T10:30:00.000Z',
  status: 'completed',
  enabledFlags: ['paymentServiceFailure', 'slowDatabase'],
  capturedTraces: 150,
  capturedMetrics: 0,
  capturedLogs: 0,
  totalSizeBytes: 2048576,
  s3Prefix: 'sessions/test-session-001',
  createdBy: 'system:otlp-capture',
  description: 'Test capture session'
}

export const mockOtlpTraceData = new Uint8Array([
  // Mock OTLP protobuf data - would be actual encoded trace data in real usage
  0x08, 0x01, 0x12, 0x10, 0x74, 0x65, 0x73, 0x74, 0x2d, 0x73, 0x65, 0x72, 0x76, 0x69, 0x63, 0x65,
  0x1a, 0x08, 0x74, 0x65, 0x73, 0x74, 0x2d, 0x73, 0x70, 0x61, 0x6e
])

export const mockOtlpJsonData = {
  resourceSpans: [
    {
      resource: {
        attributes: [
          {
            key: 'service.name',
            value: { stringValue: 'test-service' }
          }
        ]
      },
      scopeSpans: [
        {
          scope: {
            name: 'test-tracer',
            version: '1.0.0'
          },
          spans: [
            {
              traceId: '0102030405060708090a0b0c0d0e0f10',
              spanId: '0102030405060708',
              parentSpanId: '',
              name: 'test-operation',
              kind: 1, // SPAN_KIND_INTERNAL
              startTimeUnixNano: '1704110400000000000', // 2024-01-01T10:00:00Z
              endTimeUnixNano: '1704110401000000000', // 2024-01-01T10:00:01Z
              attributes: [
                {
                  key: 'test.attribute',
                  value: { stringValue: 'test-value' }
                }
              ],
              events: [
                {
                  timeUnixNano: '1704110400500000000',
                  name: 'test-event',
                  attributes: []
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
