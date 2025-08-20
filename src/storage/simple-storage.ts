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

export interface SimpleOTLPData {
  traces?: SimpleTraceData[]
  timestamp: number
}

export class SimpleStorage {
  private client: ClickHouseClient

  constructor(private config: SimpleStorageConfig) {
    this.client = createClient({
      host: `http://${config.clickhouse.host}:${config.clickhouse.port}`,
      database: config.clickhouse.database,
      username: config.clickhouse.username,
      password: config.clickhouse.password
    })
  }

  async writeOTLP(data: SimpleOTLPData): Promise<void> {
    if (data.traces && data.traces.length > 0) {
      await this.writeDirectTraces(data.traces)
    }
  }

  private async writeDirectTraces(traces: any[]): Promise<void> {
    const values = traces.map((trace) => ({
      trace_id: trace.traceId,
      span_id: trace.spanId,
      parent_span_id: trace.parentSpanId || '',
      operation_name: trace.operationName,
      start_time: trace.startTime, // Keep as nanoseconds for DateTime64(9)
      end_time: trace.endTime,
      duration: trace.endTime - trace.startTime,
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

  async queryWithResults(sql: string): Promise<{ data: any[] }> {
    const result = await this.client.query({
      query: sql,
      format: 'JSONEachRow'
    })
    
    const data = (await result.json()) as unknown[]
    return { data }
  }

  async close(): Promise<void> {
    await this.client.close()
  }
}
