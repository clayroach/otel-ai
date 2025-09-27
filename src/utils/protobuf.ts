/**
 * Protobuf Utilities
 *
 * Centralized utilities for handling protobuf data manipulation,
 * extraction, and type conversion for OTLP telemetry data.
 */

import { KeyValue, ResourceSpans } from '../opentelemetry/index.js'

// TypeScript interfaces for protobuf value extraction
export interface ProtobufValue {
  case: 'stringValue' | 'intValue' | 'boolValue' | 'doubleValue' | 'arrayValue' | 'kvlistValue'
  value: unknown
}

export interface ProtobufObject {
  $typeName: string
  value: ProtobufValue
}

export interface ProtobufArrayValue {
  values: unknown[]
}

export interface ProtobufKvListValue {
  values: Array<{ key: string; value: unknown }>
}

// Type guards for protobuf value structures
export interface ProtobufStringValue {
  stringValue: string
}

export interface ProtobufIntValue {
  intValue: number | string
}

export interface ProtobufBoolValue {
  boolValue: boolean
}

export interface ProtobufDoubleValue {
  doubleValue: number
}

// Type guard functions
export function isProtobufStringValue(obj: unknown): obj is ProtobufStringValue {
  return obj != null && typeof obj === 'object' && 'stringValue' in obj
}

export function isProtobufIntValue(obj: unknown): obj is ProtobufIntValue {
  return obj != null && typeof obj === 'object' && 'intValue' in obj
}

export function isProtobufBoolValue(obj: unknown): obj is ProtobufBoolValue {
  return obj != null && typeof obj === 'object' && 'boolValue' in obj
}

export function isProtobufDoubleValue(obj: unknown): obj is ProtobufDoubleValue {
  return obj != null && typeof obj === 'object' && 'doubleValue' in obj
}

/**
 * Helper function to recursively extract values from protobuf objects
 */
export function extractProtobufValue(value: unknown): unknown {
  // If it's a protobuf object with $typeName
  if (
    value &&
    typeof value === 'object' &&
    '$typeName' in value &&
    typeof value.$typeName === 'string' &&
    'value' in value
  ) {
    const protoObj = value as ProtobufObject
    const protoValue = protoObj.value

    if (protoValue?.case === 'stringValue') {
      return protoValue.value
    } else if (protoValue?.case === 'intValue') {
      return protoValue.value
    } else if (protoValue?.case === 'boolValue') {
      return protoValue.value
    } else if (protoValue?.case === 'doubleValue') {
      return protoValue.value
    } else if (protoValue?.case === 'arrayValue') {
      // Recursively process array values
      const arrayValue = protoValue.value as ProtobufArrayValue
      if (arrayValue?.values && Array.isArray(arrayValue.values)) {
        return arrayValue.values.map((v: unknown) => extractProtobufValue(v))
      }
      return []
    } else if (protoValue?.case === 'kvlistValue') {
      // Recursively process key-value list
      const kvList = protoValue.value as ProtobufKvListValue
      if (kvList?.values && Array.isArray(kvList.values)) {
        const result: Record<string, unknown> = {}
        for (const kv of kvList.values) {
          if (kv.key) {
            result[kv.key] = extractProtobufValue(kv.value)
          }
        }
        return result
      }
      return {}
    }

    return null
  }

  // If it's an array, process each element
  if (Array.isArray(value)) {
    return value.map((v) => extractProtobufValue(v))
  }

  // If it's a regular object with potential nested protobuf values
  if (value && typeof value === 'object' && !Buffer.isBuffer(value)) {
    const obj = value as Record<string, unknown>

    // Check if it's a simple OTLP JSON value object (e.g., { stringValue: 'foo' })
    if ('stringValue' in obj && Object.keys(obj).length === 1) {
      return obj.stringValue
    }
    if ('intValue' in obj && Object.keys(obj).length === 1) {
      return obj.intValue
    }
    if ('boolValue' in obj && Object.keys(obj).length === 1) {
      return obj.boolValue
    }
    if ('doubleValue' in obj && Object.keys(obj).length === 1) {
      return obj.doubleValue
    }

    // Check if it has protobuf array structure
    if ('values' in obj && Array.isArray(obj.values)) {
      return obj.values.map((v: unknown) => extractProtobufValue(v))
    }
    // Otherwise process as regular object
    const result: Record<string, unknown> = {}
    for (const key in obj) {
      result[key] = extractProtobufValue(obj[key])
    }
    return result
  }

  // For primitive values, return as-is
  if (value === '' || value === null || value === undefined) {
    return null
  }

  return value
}

/**
 * Helper function to deeply clean attributes of any protobuf artifacts
 */
export function cleanAttributes(attributes: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(attributes)) {
    cleaned[key] = extractProtobufValue(value)
  }
  return cleaned
}

/**
 * Parse OTLP data from raw protobuf buffer by detecting patterns
 * This is a fallback when protobufjs is not available
 */
export function parseOTLPFromRaw(buffer: Buffer): { resourceSpans: unknown[] } {
  try {
    // Convert buffer to string and look for patterns
    const data = buffer.toString('utf8', 0, Math.min(buffer.length, 10000))

    // Look for OTLP structure markers
    const resourceSpans: unknown[] = []

    // Find service name patterns
    const serviceMatches = [...data.matchAll(/service\.name[^a-zA-Z]*([a-zA-Z\-_]+)/g)]
    const operationMatches = [...data.matchAll(/\/([a-zA-Z.]+\/[a-zA-Z]+)/g)]

    // Find span IDs (16 hex chars)
    const spanIdMatches = [...data.matchAll(/([a-f0-9]{16})/gi)]

    // Find timestamps (16-19 digit numbers)
    const timestampMatches = [...data.matchAll(/\s(\d{16,19})\s/g)]

    console.log('🔍 Raw protobuf parsing found:')
    console.log('  - Service matches:', serviceMatches.length)
    console.log('  - Operation matches:', operationMatches.length)
    console.log('  - Span ID matches:', spanIdMatches.length)
    console.log('  - Timestamp matches:', timestampMatches.length)

    const serviceName = serviceMatches[0]?.[1] || 'unknown-service'

    if (serviceMatches.length === 0) {
      throw new Error('No service names found in protobuf data')
    }

    // Create basic spans structure
    const currentTimeNano = BigInt(Date.now()) * BigInt(1000000)
    const spans = []

    // Create spans based on operations found
    if (operationMatches.length > 0) {
      for (let i = 0; i < Math.min(operationMatches.length, 5); i++) {
        const spanId = spanIdMatches[i]?.[1] || Math.random().toString(16).substring(2, 18)
        const traceId =
          spanIdMatches[Math.min(i * 2, spanIdMatches.length - 1)]?.[1] ||
          Math.random().toString(16).substring(2) + Math.random().toString(16).substring(2)

        const timestampMatch = timestampMatches[i]?.[1]
        const timestamp = timestampMatch
          ? BigInt(timestampMatch)
          : currentTimeNano - BigInt(i * 1000000)

        spans.push({
          traceId: traceId.padEnd(32, '0').substring(0, 32),
          spanId: spanId.padEnd(16, '0').substring(0, 16),
          name: operationMatches[i]?.[1] || 'unknown-operation',
          startTimeUnixNano: timestamp.toString(),
          endTimeUnixNano: (timestamp + BigInt(50 * 1000000)).toString(),
          kind: 'SPAN_KIND_SERVER',
          status: { code: 'STATUS_CODE_OK' },
          attributes: [
            { key: 'extraction.method', value: { stringValue: 'raw-protobuf-parsing' } },
            { key: 'service.name', value: { stringValue: serviceName } }
          ]
        })
      }
    } else {
      // Fallback to basic span
      spans.push({
        traceId: Math.random().toString(16).substring(2) + Math.random().toString(16).substring(2),
        spanId: Math.random().toString(16).substring(2, 18),
        name: `${serviceName}-operation`,
        startTimeUnixNano: currentTimeNano.toString(),
        endTimeUnixNano: (currentTimeNano + BigInt(50 * 1000000)).toString(),
        kind: 'SPAN_KIND_SERVER',
        status: { code: 'STATUS_CODE_OK' },
        attributes: [
          { key: 'extraction.method', value: { stringValue: 'raw-protobuf-parsing' } },
          { key: 'service.name', value: { stringValue: serviceName } }
        ]
      })
    }

    resourceSpans.push({
      resource: {
        attributes: [{ key: 'service.name', value: { stringValue: serviceName } }]
      },
      scopeSpans: [
        {
          scope: { name: 'raw-protobuf-parser', version: '1.0.0' },
          spans: spans
        }
      ]
    })

    return { resourceSpans }
  } catch (error) {
    console.error('❌ Raw protobuf parsing failed:', error)
    throw error
  }
}

/**
 * Detect if content is protobuf format
 */
export function isProtobufContent(contentType: string | undefined, body: unknown): boolean {
  const ct = contentType || ''
  return (
    ct.includes('protobuf') ||
    ct.includes('x-protobuf') ||
    ct === 'application/octet-stream' ||
    (Buffer.isBuffer(body) && body.length > 0 && !ct.includes('json'))
  )
}

/**
 * Extract service name from resource attributes
 */
export function extractServiceName(resourceSpan: ResourceSpans): string | null {
  const serviceAttr = resourceSpan.resource?.attributes?.find(
    (attr: KeyValue) => attr.key === 'service.name'
  )

  if (serviceAttr && serviceAttr.value) {
    const value = extractProtobufValue(serviceAttr.value)
    if (typeof value === 'string') {
      return value
    }
  }

  return null
}

/**
 * Process attribute value with type guards
 */
export function processAttributeValue(value: unknown): unknown {
  // First try extraction
  let extracted = extractProtobufValue(value)

  // Enhanced fallback for simple JSON protobuf format using type guards
  if (extracted === null || extracted === undefined) {
    // Handle simple JSON protobuf format: {stringValue: "value"}
    if (isProtobufStringValue(value)) {
      extracted = value.stringValue
    } else if (isProtobufIntValue(value)) {
      extracted = value.intValue
    } else if (isProtobufBoolValue(value)) {
      extracted = value.boolValue
    } else if (isProtobufDoubleValue(value)) {
      extracted = value.doubleValue
    } else {
      // Direct value assignment for other cases
      extracted = value
    }
  }

  // Additional safety check - if we still have an object with stringValue, extract it
  if (isProtobufStringValue(extracted)) {
    extracted = extracted.stringValue
  }

  return extracted
}

export type AttributeValue = string | number | boolean | bigint | Uint8Array | undefined
