/**
 * Simplified storage implementation for initial validation and testing
 * This is a working version without complex Effect-TS patterns
 */

import { createClient, type ClickHouseClient } from '@clickhouse/client'

// Simple interfaces without Effect-TS for now
export interface SimpleStorageConfig {
  clickhouse: {
    host: string
    port: number
    database: string
    username: string
    password: string
  }
}

export interface SimpleTraceData {
  traceId: string
  spanId: string
  parentSpanId?: string
  operationName: string
  startTime: number
  endTime?: number
  serviceName: string
  statusCode: number | string
  statusMessage?: string
  spanKind?: string
  attributes?: Record<string, unknown>
  resourceAttributes?: Record<string, unknown>
}

// Legacy alias for backward compatibility
export type DetailedTraceData = SimpleTraceData

export interface DatabaseTraceRecord {
  trace_id: string
  span_id: string
  parent_span_id: string
  start_time: string
  end_time: string
  duration_ns: number
  service_name: string
  operation_name: string
  span_kind: string
  status_code: string
  status_message: string
  trace_state: string
  scope_name: string
  scope_version: string
  span_attributes: Record<string, unknown>
  resource_attributes: Record<string, unknown>
  events: string
  links: string
  encoding_type: string
}

export interface SimpleOTLPData {
  traces?: SimpleTraceData[]
  timestamp: number
}

export class SimpleStorage {
  private client: ClickHouseClient
  private config: SimpleStorageConfig

  constructor(config: SimpleStorageConfig) {
    this.config = config
    this.client = createClient({
      url: `http://${config.clickhouse.host}:${config.clickhouse.port}`,
      database: config.clickhouse.database,
      username: config.clickhouse.username,
      password: config.clickhouse.password
    })
  }

  async writeOTLP(data: SimpleOTLPData): Promise<void> {
    if (data.traces && data.traces.length > 0) {
      // Convert SimpleTraceData to DatabaseTraceRecord for unified schema
      const databaseRecords: DatabaseTraceRecord[] = data.traces.map((trace) => ({
        trace_id: trace.traceId,
        span_id: trace.spanId,
        parent_span_id: '',
        start_time: new Date(trace.startTime / 1000000)
          .toISOString()
          .replace('T', ' ')
          .replace(/\.\d{3}Z$/, '.000000000'), // Convert to ClickHouse DateTime64 format
        end_time: new Date((trace.startTime + 1000000000) / 1000000)
          .toISOString()
          .replace('T', ' ')
          .replace(/\.\d{3}Z$/, '.000000000'), // Assume 1 second duration
        duration_ns: 1000000000,
        service_name: trace.serviceName,
        operation_name: trace.operationName,
        span_kind: 'SPAN_KIND_INTERNAL',
        status_code: String(trace.statusCode),
        status_message: '',
        trace_state: '',
        scope_name: '',
        scope_version: '',
        span_attributes: trace.attributes || {},
        resource_attributes: {},
        events: '[]',
        links: '[]',
        encoding_type: 'json'
      }))
      await this.writeTracesToSimplifiedSchema(databaseRecords)
    }
  }

  // New method for simplified schema (single table)
  async writeTracesToSimplifiedSchema(traces: DatabaseTraceRecord[]): Promise<void> {
    const values = traces.map((trace) => ({
      trace_id: trace.trace_id,
      span_id: trace.span_id,
      parent_span_id: trace.parent_span_id || '',
      start_time: trace.start_time,
      end_time: trace.end_time,
      duration_ns: trace.duration_ns,
      service_name: trace.service_name,
      operation_name: trace.operation_name,
      span_kind: trace.span_kind,
      status_code: trace.status_code,
      status_message: trace.status_message || '',
      trace_state: trace.trace_state || '',
      scope_name: trace.scope_name || '',
      scope_version: trace.scope_version || '',
      span_attributes: trace.span_attributes || '{}',
      resource_attributes: trace.resource_attributes || '{}',
      events: trace.events || '[]',
      links: trace.links || '[]',
      encoding_type: trace.encoding_type || 'protobuf'
    }))

    await this.client.insert({
      table: 'traces',
      values,
      format: 'JSONEachRow'
    })
  }

  private async writeTraces(traces: SimpleTraceData[]): Promise<void> {
    const values = traces.map((trace) => ({
      TraceId: trace.traceId,
      SpanId: trace.spanId,
      SpanName: trace.operationName,
      Timestamp: (trace.startTime / 1000000000).toString(), // Convert nanoseconds to seconds
      ServiceName: trace.serviceName,
      StatusCode: String(trace.statusCode), // Ensure statusCode is always a string
      SpanAttributes: trace.attributes
    }))

    await this.client.insert({
      table: 'traces',
      values,
      format: 'JSONEachRow'
    })
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.query({ query: 'SELECT 1' })
      return true
    } catch {
      return false
    }
  }

  async queryTraces(timeRange: { start: number; end: number }): Promise<SimpleTraceData[]> {
    // Convert milliseconds to nanoseconds for the query
    const startNano = timeRange.start * 1000000
    const endNano = timeRange.end * 1000000

    const query = `
      SELECT 
        trace_id as traceId,
        span_id as spanId,
        operation_name as operationName,
        toUnixTimestamp64Nano(start_time) as startTime,
        service_name as serviceName,
        status_code as statusCode,
        span_attributes as attributes
      FROM traces
      WHERE toUnixTimestamp64Nano(start_time) >= ${startNano}
        AND toUnixTimestamp64Nano(start_time) <= ${endNano}
      LIMIT 100
    `

    const result = await this.client.query({
      query,
      format: 'JSONEachRow'
    })

    const resultSet = (await result.json()) as unknown[]
    return resultSet.map((row: unknown) => {
      const rowData = row as Record<string, unknown>
      return {
        traceId: String(rowData.traceId),
        spanId: String(rowData.spanId),
        operationName: String(rowData.operationName),
        startTime: parseInt(String(rowData.startTime)),
        serviceName: String(rowData.serviceName),
        statusCode: String(rowData.statusCode),
        attributes: (rowData.attributes as Record<string, string>) || {}
      }
    })
  }

  async query(sql: string): Promise<void> {
    await this.client.query({ query: sql })
  }

  async queryWithResults(sql: string): Promise<{ data: Record<string, unknown>[] }> {
    const result = await this.client.query({
      query: sql,
      format: 'JSONEachRow'
    })

    const data = (await result.json()) as Record<string, unknown>[]

    // First clean protobuf JSON strings, then convert BigInt values
    const cleanedData = data.map((row) => this.cleanProtobufStrings(row))
    const convertedData = cleanedData.map(
      (row) => this.convertBigIntToNumber(row) as Record<string, unknown>
    )

    return { data: convertedData }
  }

  /**
   * Clean protobuf JSON strings in query results
   */
  private cleanProtobufStrings(obj: unknown): unknown {
    if (typeof obj === 'string') {
      // Handle protobuf JSON strings for service names
      if (obj.includes('$typeName') && obj.includes('opentelemetry.proto.common.v1.AnyValue')) {
        console.log('🧹 Cleaning protobuf service name:', obj.substring(0, 50) + '...')
        try {
          const parsed = JSON.parse(obj)
          if (parsed.value?.case === 'stringValue' && parsed.value?.value) {
            console.log('✅ Extracted clean service name:', parsed.value.value)
            return parsed.value.value
          }
        } catch (e) {
          console.log('❌ Failed to parse protobuf JSON:', e)
        }
      }

      // Handle Buffer JSON strings for trace IDs
      if (obj.includes('"type":"Buffer"') && obj.includes('"data"')) {
        console.log('🧹 Cleaning Buffer trace ID:', obj.substring(0, 30) + '...')
        try {
          const parsed = JSON.parse(obj)
          if (parsed.type === 'Buffer' && Array.isArray(parsed.data)) {
            const hexId = parsed.data.map((b: number) => b.toString(16).padStart(2, '0')).join('')
            console.log('✅ Extracted clean trace ID:', hexId.substring(0, 16) + '...')
            return hexId
          }
        } catch (e) {
          console.log('❌ Failed to parse Buffer JSON:', e)
        }
      }
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.cleanProtobufStrings(item))
    }

    if (obj !== null && typeof obj === 'object') {
      const cleaned: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        cleaned[key] = this.cleanProtobufStrings(value)
      }
      return cleaned
    }

    return obj
  }

  /**
   * Recursively convert BigInt values to numbers and clean up protobuf JSON strings
   * This handles BigInt conversion and protobuf service name extraction
   */
  private convertBigIntToNumber(obj: unknown): unknown {
    if (typeof obj === 'bigint') {
      // Convert BigInt to number, handling potential precision loss for very large numbers
      return obj > Number.MAX_SAFE_INTEGER ? parseInt(obj.toString()) : Number(obj)
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.convertBigIntToNumber(item))
    }

    if (obj !== null && typeof obj === 'object') {
      const converted: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        converted[key] = this.convertBigIntToNumber(value)
      }
      return converted
    }

    return obj
  }

  async close(): Promise<void> {
    await this.client.close()
  }
}
