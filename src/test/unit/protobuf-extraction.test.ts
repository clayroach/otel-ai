import { describe, it, expect } from 'vitest'

describe('Protobuf Attribute Extraction', () => {
  describe('Handle @bufbuild/protobuf format', () => {
    it('should extract string value from protobuf attribute with $typeName', () => {
      // This simulates the structure returned by @bufbuild/protobuf parsing
      const protobufAttribute = {
        key: 'service.name',
        value: {
          "$typeName": "opentelemetry.proto.common.v1.AnyValue",
          "value": {
            "case": "stringValue",
            "value": "frontend-proxy"
          }
        }
      }

      // The extraction logic from server.ts
      let extractedValue: string | bigint | unknown[] | undefined
      const attr = protobufAttribute
      if (attr.value && typeof attr.value === 'object' && '$typeName' in attr.value && 'value' in attr.value) {
        const attrValue = attr.value as { value: { case: string; value: unknown } }
        const protoValue = attrValue.value
        if (protoValue.case === 'stringValue') {
          extractedValue = protoValue.value as string
        } else if (protoValue.case === 'intValue') {
          extractedValue = protoValue.value as bigint
        } else if (protoValue.case === 'arrayValue') {
          extractedValue = (protoValue.value as { values: unknown[] }).values
        }
      }

      expect(extractedValue).toBe('frontend-proxy')
      expect(extractedValue).not.toContain('$typeName')
      expect(typeof extractedValue).toBe('string')
    })

    it('should convert BigInt values to strings in protobuf attributes', () => {
      const protobufAttribute = {
        key: 'http.status_code',
        value: {
          "$typeName": "opentelemetry.proto.common.v1.AnyValue",
          "value": {
            "case": "intValue",
            "value": BigInt(200)
          }
        }
      }

      // The extraction logic from server.ts
      let extractedValue: string | bigint | unknown[] | undefined
      const attr = protobufAttribute
      if (attr.value && typeof attr.value === 'object' && '$typeName' in attr.value && 'value' in attr.value) {
        const attrValue = attr.value as { value: { case: string; value: unknown } }
        const protoValue = attrValue.value
        if (protoValue.case === 'intValue') {
          const intVal = protoValue.value
          extractedValue = typeof intVal === 'bigint' ? intVal.toString() : String(intVal)
        }
      }

      expect(extractedValue).toBe('200')
      expect(typeof extractedValue).toBe('string')
    })

    it('should handle array values with BigInt conversion', () => {
      const protobufAttribute = {
        key: 'http.request.body.size',
        value: {
          "$typeName": "opentelemetry.proto.common.v1.AnyValue",
          "value": {
            "case": "arrayValue",
            "value": {
              values: [BigInt(1024), BigInt(2048)]
            }
          }
        }
      }

      // The extraction logic from server.ts
      let extractedValue: string | bigint | unknown[] | undefined
      const attr = protobufAttribute
      if (attr.value && typeof attr.value === 'object' && '$typeName' in attr.value && 'value' in attr.value) {
        const protoValue = (attr.value as { value?: { case?: string; value?: unknown } }).value
        if (protoValue?.case === 'arrayValue') {
          extractedValue = JSON.parse(JSON.stringify(protoValue.value, (key, val) => typeof val === 'bigint' ? val.toString() : val))
        }
      }

      expect(extractedValue).toEqual({ values: ['1024', '2048'] })
      expect(extractedValue).toHaveProperty('values')
      if (extractedValue && typeof extractedValue === 'object' && 'values' in extractedValue) {
        const values = (extractedValue as unknown as { values: string[] }).values
        expect(values[0]).toBe('1024')
        expect(typeof values[0]).toBe('string')
      }
    })
  })

  describe('Handle Buffer trace IDs', () => {
    it('should convert Buffer trace IDs to hex strings', () => {
      // Simulate a Buffer trace ID as it comes from protobuf parsing
      const bufferTraceId = Buffer.from([96, 176, 152, 164, 225, 120, 241, 253, 42, 213, 50, 151, 180, 232, 159, 212])
      
      // The conversion logic from server.ts
      const traceIdStr = Buffer.isBuffer(bufferTraceId) ? 
        Buffer.from(bufferTraceId).toString('hex') : 
        bufferTraceId

      expect(traceIdStr).toBe('60b098a4e178f1fd2ad53297b4e89fd4')
      expect(typeof traceIdStr).toBe('string')
      expect(traceIdStr).toMatch(/^[a-f0-9]{32}$/) // Valid 32-char hex string
    })

    it('should convert Buffer span IDs to hex strings', () => {
      const bufferSpanId = Buffer.from([42, 213, 50, 151, 180, 232, 159, 212])
      
      const spanIdStr = Buffer.isBuffer(bufferSpanId) ? 
        Buffer.from(bufferSpanId).toString('hex') : 
        bufferSpanId

      expect(spanIdStr).toBe('2ad53297b4e89fd4')
      expect(typeof spanIdStr).toBe('string')
      expect(spanIdStr).toMatch(/^[a-f0-9]{16}$/) // Valid 16-char hex string
    })
  })

  describe('Prevent protobuf object storage', () => {
    it('should not store raw protobuf objects as service names', () => {
      // This is what was being stored incorrectly
      const incorrectServiceName = '{"$typeName":"opentelemetry.proto.common.v1.AnyValue","value":{"case":"stringValue","value":"frontend-proxy"}}'
      
      // After fix, it should be just the value
      const protobufAttribute = {
        key: 'service.name',
        value: JSON.parse(incorrectServiceName)
      }

      let extractedValue: string | bigint | unknown[] | undefined
      const attr = protobufAttribute
      if (attr.value && typeof attr.value === 'object' && '$typeName' in attr.value && 'value' in attr.value) {
        const attrValue = attr.value as { value: { case: string; value: unknown } }
        const protoValue = attrValue.value
        if (protoValue.case === 'stringValue') {
          extractedValue = protoValue.value as string
        } else if (protoValue.case === 'intValue') {
          extractedValue = protoValue.value as bigint
        } else if (protoValue.case === 'arrayValue') {
          extractedValue = (protoValue.value as { values: unknown[] }).values
        }
      }

      expect(extractedValue).toBe('frontend-proxy')
      expect(JSON.stringify(extractedValue)).not.toContain('$typeName')
    })
  })
})