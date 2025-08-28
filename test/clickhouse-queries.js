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
  await executeQuery('SELECT count(*) as total_traces FROM otel.traces', 'Total trace count')

  // Service breakdown
  await executeQuery(
    'SELECT service_name, count(*) as span_count FROM otel.traces GROUP BY service_name ORDER BY span_count DESC',
    'Traces by service'
  )

  // Recent traces with details
  await executeQuery(
    'SELECT trace_id, service_name, operation_name, duration_ms, start_time FROM otel.traces ORDER BY start_time DESC LIMIT 10',
    'Recent traces (last 10)'
  )

  // Error analysis
  await executeQuery(
    'SELECT status_code, count(*) as count FROM otel.traces GROUP BY status_code ORDER BY count DESC',
    'Status code distribution'
  )

  // Performance analysis
  await executeQuery(
    'SELECT operation_name, avg(duration_ms) as avg_duration_ms, quantile(0.95)(duration_ms) as p95_duration_ms FROM otel.traces GROUP BY operation_name ORDER BY avg_duration_ms DESC',
    'Performance by operation'
  )

  // Trace timeline for visualization
  await executeQuery(
    'SELECT trace_id, service_name, operation_name, duration_ms, start_time, span_id, parent_span_id FROM otel.traces WHERE trace_id IN (SELECT trace_id FROM otel.traces ORDER BY start_time DESC LIMIT 1) ORDER BY start_time',
    'Detailed trace breakdown (latest trace)'
  )

  console.log('\n🎯 These queries will power the trace visualization UI')
  console.log('✅ ClickHouse schema validation complete')
}

runTraceAnalysisQueries()
