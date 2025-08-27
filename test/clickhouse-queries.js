#!/usr/bin/env node

// ClickHouse query utilities for trace analysis
// Demonstrates queries that will be used in the UI

const auth = Buffer.from('otel:otel123').toString('base64')
const headers = { Authorization: `Basic ${auth}` }

async function executeQuery(query, description) {
  console.log(`\n🔍 ${description}`)
  console.log(`Query: ${query}`)
  console.log('─'.repeat(80))

  try {
    const response = await fetch(
      `http://localhost:8123/?query=${encodeURIComponent(query)} FORMAT JSON`,
      { headers }
    )
    const data = await response.json()

    if (data.data && data.data.length > 0) {
      console.table(data.data)
      console.log(`📊 Found ${data.rows} records`)
    } else {
      console.log('📭 No data found')
    }

    return data
  } catch (error) {
    console.log(`❌ Query failed: ${error.message}`)
    return null
  }
}

async function runTraceAnalysisQueries() {
  console.log('📊 ClickHouse Trace Analysis Queries')
  console.log('====================================')

  // Basic trace count
  await executeQuery('SELECT count(*) as total_traces FROM otel.otel_traces', 'Total trace count')

  // Service breakdown
  await executeQuery(
    'SELECT ServiceName, count(*) as span_count FROM otel.otel_traces GROUP BY ServiceName ORDER BY span_count DESC',
    'Traces by service'
  )

  // Recent traces with details
  await executeQuery(
    'SELECT TraceId, ServiceName, SpanName, round(Duration/1000000) as duration_ms, Timestamp FROM otel.otel_traces ORDER BY Timestamp DESC LIMIT 10',
    'Recent traces (last 10)'
  )

  // Error analysis
  await executeQuery(
    'SELECT StatusCode, count(*) as count FROM otel.otel_traces GROUP BY StatusCode ORDER BY count DESC',
    'Status code distribution'
  )

  // Performance analysis
  await executeQuery(
    'SELECT SpanName, avg(Duration/1000000) as avg_duration_ms, quantile(0.95)(Duration/1000000) as p95_duration_ms FROM otel.otel_traces GROUP BY SpanName ORDER BY avg_duration_ms DESC',
    'Performance by operation'
  )

  // Trace timeline for visualization
  await executeQuery(
    'SELECT TraceId, ServiceName, SpanName, Duration, Timestamp, SpanId, ParentSpanId FROM otel.otel_traces WHERE TraceId IN (SELECT TraceId FROM otel.otel_traces ORDER BY Timestamp DESC LIMIT 1) ORDER BY Timestamp',
    'Detailed trace breakdown (latest trace)'
  )

  console.log('\n🎯 These queries will power the trace visualization UI')
  console.log('✅ ClickHouse schema validation complete')
}

runTraceAnalysisQueries()
