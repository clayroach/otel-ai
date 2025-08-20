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
  operationName: string
  startTime: number
  serviceName: string
  statusCode: number | string
  attributes: Record<string, string>
}

export interface DetailedTraceData {
  traceId: string
  spanId: string
  parentSpanId?: string
  operationName: string
  startTime: number | bigint
  endTime: number | bigint
  serviceName: string
  statusCode: string
  statusMessage?: string
  spanKind?: string
  attributes?: Record<string, unknown>
  resourceAttributes?: Record<string, unknown>
}

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
      host: `http://${config.clickhouse.host}:${config.clickhouse.port}`,
      database: config.clickhouse.database,
      username: config.clickhouse.username,
      password: config.clickhouse.password
    })
  }

  async writeOTLP(data: SimpleOTLPData): Promise<void> {
    if (data.traces && data.traces.length > 0) {
      await this.writeTraces(data.traces)
    }
  }

  private async writeDirectTraces(traces: DetailedTraceData[]): Promise<void> {
    const values = traces.map((trace) => ({
      trace_id: trace.traceId,
      span_id: trace.spanId,
      parent_span_id: trace.parentSpanId || '',
      operation_name: trace.operationName,
      start_time: trace.startTime, // Keep as nanoseconds for DateTime64(9)
      end_time: trace.endTime,
      duration: Number(trace.endTime) - Number(trace.startTime),
      service_name: trace.serviceName,
      service_version: '1.0.0',
      status_code: trace.statusCode,
      status_message: trace.statusMessage || '',
      span_kind: trace.spanKind || 'SPAN_KIND_INTERNAL',
      attributes: trace.attributes || {},
      resource_attributes: trace.resourceAttributes || {}
    }))

    await this.client.insert({
      table: 'ai_traces_direct',
      values,
      format: 'JSONEachRow'
    })
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
      StatusCode: trace.statusCode,
      SpanAttributes: trace.attributes
    }))

    await this.client.insert({
      table: 'otel_traces',
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
        attributes as attributes
      FROM ai_traces_direct
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
    return { data }
  }

  async close(): Promise<void> {
    await this.client.close()
  }
}
