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
  statusCode: number
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
      await this.writeTraces(data.traces)
    }
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
    const query = `
      SELECT 
        TraceId as traceId,
        SpanId as spanId,
        SpanName as operationName,
        toUnixTimestamp64Nano(Timestamp) as startTime,
        ServiceName as serviceName,
        StatusCode as statusCode,
        SpanAttributes as attributes
      FROM otel_traces
      WHERE Timestamp >= ${timeRange.start / 1000}
        AND Timestamp <= ${timeRange.end / 1000}
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
        statusCode: Number(rowData.statusCode),
        attributes: (rowData.attributes as Record<string, string>) || {}
      }
    })
  }

  async close(): Promise<void> {
    await this.client.close()
  }
}
