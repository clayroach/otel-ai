import { CriticalPath, QueryPattern, GeneratedQuery } from "./types"

// Helper to escape service names for SQL
function escapeServiceName(name: string): string {
  // Escape single quotes by doubling them
  return name.replace(/'/g, "''")
}

// Service latency analysis query
export function generateServiceLatencyQuery(path: CriticalPath, timeRangeMinutes = 60): GeneratedQuery {
  const services = path.services.map(s => `'${escapeServiceName(s)}'`).join(", ")
  
  return {
    id: `${path.id}_latency`,
    name: `Service Latency Analysis - ${path.name}`,
    description: "Analyzes p50, p95, p99 latencies for services in the critical path",
    pattern: QueryPattern.SERVICE_LATENCY,
    sql: `
      SELECT 
        service_name,
        toStartOfMinute(start_time) as minute,
        quantile(0.5)(duration_ns/1000000) as p50_ms,
        quantile(0.95)(duration_ns/1000000) as p95_ms,
        quantile(0.99)(duration_ns/1000000) as p99_ms,
        count() as request_count
      FROM traces
      WHERE 
        service_name IN (${services})
        AND start_time >= now() - INTERVAL ${timeRangeMinutes} MINUTE
      GROUP BY service_name, minute
      ORDER BY minute DESC, service_name
      LIMIT 1000
    `.trim(),
    expectedSchema: {
      service_name: "String",
      minute: "DateTime",
      p50_ms: "Float64",
      p95_ms: "Float64", 
      p99_ms: "Float64",
      request_count: "UInt64"
    }
  }
}

// Error distribution query
export function generateErrorDistributionQuery(path: CriticalPath, timeRangeMinutes = 60): GeneratedQuery {
  const services = path.services.map(s => `'${escapeServiceName(s)}'`).join(", ")
  
  return {
    id: `${path.id}_errors`,
    name: `Error Distribution - ${path.name}`,
    description: "Analyzes error distribution across services in the critical path",
    pattern: QueryPattern.ERROR_DISTRIBUTION,
    sql: `
      SELECT 
        service_name,
        status_code,
        status_message,
        count() as error_count,
        round(count() * 100.0 / sum(count()) OVER (), 2) as error_percentage
      FROM traces
      WHERE 
        service_name IN (${services})
        AND status_code != 'OK'
        AND start_time >= now() - INTERVAL ${timeRangeMinutes} MINUTE
      GROUP BY service_name, status_code, status_message
      ORDER BY error_count DESC
      LIMIT 100
    `.trim(),
    expectedSchema: {
      service_name: "String",
      status_code: "String",
      status_message: "String",
      error_count: "UInt64",
      error_percentage: "Float64"
    }
  }
}

// Bottleneck detection query
export function generateBottleneckQuery(path: CriticalPath, timeRangeMinutes = 60): GeneratedQuery {
  const services = path.services.map(s => `'${escapeServiceName(s)}'`).join(", ")
  
  return {
    id: `${path.id}_bottleneck`,
    name: `Bottleneck Detection - ${path.name}`,
    description: "Identifies the slowest operations in the critical path",
    pattern: QueryPattern.BOTTLENECK_DETECTION,
    sql: `
      SELECT 
        service_name,
        operation_name,
        quantile(0.95)(duration_ns/1000000) as p95_ms,
        quantile(0.99)(duration_ns/1000000) as p99_ms,
        max(duration_ns/1000000) as max_ms,
        count() as operation_count,
        sum(duration_ns/1000000) as total_time_ms
      FROM traces
      WHERE 
        service_name IN (${services})
        AND start_time >= now() - INTERVAL ${timeRangeMinutes} MINUTE
      GROUP BY service_name, operation_name
      HAVING p95_ms > 100
      ORDER BY p95_ms DESC
      LIMIT 50
    `.trim(),
    expectedSchema: {
      service_name: "String",
      operation_name: "String",
      p95_ms: "Float64",
      p99_ms: "Float64",
      max_ms: "Float64",
      operation_count: "UInt64",
      total_time_ms: "Float64"
    }
  }
}

// Volume/throughput query
export function generateVolumeThroughputQuery(path: CriticalPath, timeRangeMinutes = 60): GeneratedQuery {
  const services = path.services.map(s => `'${escapeServiceName(s)}'`).join(", ")
  
  return {
    id: `${path.id}_volume`,
    name: `Volume & Throughput - ${path.name}`,
    description: "Analyzes request rates and throughput for services",
    pattern: QueryPattern.VOLUME_THROUGHPUT,
    sql: `
      SELECT 
        service_name,
        toStartOfMinute(start_time) as minute,
        count() as requests_per_minute,
        count() / 60.0 as requests_per_second,
        sum(CASE WHEN status_code = 'OK' THEN 1 ELSE 0 END) as successful_requests,
        round(sum(CASE WHEN status_code = 'OK' THEN 1 ELSE 0 END) * 100.0 / count(), 2) as success_rate
      FROM traces
      WHERE 
        service_name IN (${services})
        AND start_time >= now() - INTERVAL ${timeRangeMinutes} MINUTE
      GROUP BY service_name, minute
      ORDER BY minute DESC, service_name
      LIMIT 500
    `.trim(),
    expectedSchema: {
      service_name: "String",
      minute: "DateTime",
      requests_per_minute: "UInt64",
      requests_per_second: "Float64",
      successful_requests: "UInt64",
      success_rate: "Float64"
    }
  }
}

// Time-based comparison query
export function generateTimeComparisonQuery(path: CriticalPath, timeRangeMinutes = 60): GeneratedQuery {
  const services = path.services.map(s => `'${escapeServiceName(s)}'`).join(", ")
  
  return {
    id: `${path.id}_comparison`,
    name: `Time Comparison - ${path.name}`,
    description: "Compares performance metrics over time periods",
    pattern: QueryPattern.TIME_COMPARISON,
    sql: `
      WITH current_period AS (
        SELECT 
          service_name,
          quantile(0.95)(duration_ns/1000000) as p95_ms,
          count() as request_count
        FROM traces
        WHERE 
          service_name IN (${services})
          AND start_time >= now() - INTERVAL ${timeRangeMinutes} MINUTE
        GROUP BY service_name
      ),
      previous_period AS (
        SELECT 
          service_name,
          quantile(0.95)(duration_ns/1000000) as p95_ms,
          count() as request_count
        FROM traces
        WHERE 
          service_name IN (${services})
          AND start_time >= now() - INTERVAL ${timeRangeMinutes * 2} MINUTE
          AND start_time < now() - INTERVAL ${timeRangeMinutes} MINUTE
        GROUP BY service_name
      )
      SELECT 
        c.service_name,
        c.p95_ms as current_p95_ms,
        p.p95_ms as previous_p95_ms,
        round((c.p95_ms - p.p95_ms) / p.p95_ms * 100, 2) as p95_change_percent,
        c.request_count as current_requests,
        p.request_count as previous_requests,
        round((c.request_count - p.request_count) * 100.0 / p.request_count, 2) as request_change_percent
      FROM current_period c
      LEFT JOIN previous_period p ON c.service_name = p.service_name
      ORDER BY abs(p95_change_percent) DESC
    `.trim(),
    expectedSchema: {
      service_name: "String",
      current_p95_ms: "Float64",
      previous_p95_ms: "Float64",
      p95_change_percent: "Float64",
      current_requests: "UInt64",
      previous_requests: "UInt64",
      request_change_percent: "Float64"
    }
  }
}

// Helper to generate all queries for a critical path
export function generateAllPatternQueries(path: CriticalPath, timeRangeMinutes = 60): GeneratedQuery[] {
  return [
    generateServiceLatencyQuery(path, timeRangeMinutes),
    generateErrorDistributionQuery(path, timeRangeMinutes),
    generateBottleneckQuery(path, timeRangeMinutes),
    generateVolumeThroughputQuery(path, timeRangeMinutes),
    generateTimeComparisonQuery(path, timeRangeMinutes)
  ]
}