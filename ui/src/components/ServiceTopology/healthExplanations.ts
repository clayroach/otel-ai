import type { ServiceMetricsDetail } from './ServiceTopologyGraph'

export interface HealthExplanation {
  status: 'healthy' | 'warning' | 'critical' | 'unknown'
  summary: string
  details: string[]
  recommendations: string[]
  impactedMetrics: Array<{
    metric: string
    status: 'healthy' | 'warning' | 'critical'
    value: string
    threshold: string
    explanation: string
  }>
}

/**
 * Generate intelligent health explanations based on service metrics
 */
export function generateHealthExplanation(
  serviceName: string,
  metrics?: ServiceMetricsDetail
): HealthExplanation {
  if (!metrics) {
    return {
      status: 'unknown',
      summary: `Unable to determine health status for ${serviceName}. No metrics available.`,
      details: ['Service metrics are not currently being collected or are unavailable.'],
      recommendations: [
        'Verify the service is instrumented with OpenTelemetry',
        'Check network connectivity to the telemetry collector',
        'Ensure the service is actively processing requests'
      ],
      impactedMetrics: []
    }
  }

  const impactedMetrics: HealthExplanation['impactedMetrics'] = []
  const details: string[] = []
  const recommendations: string[] = []

  // Analyze Rate metric
  if (metrics.rateStatus === 2) {
    impactedMetrics.push({
      metric: 'Request Rate',
      status: 'critical',
      value: `${metrics.rate.toFixed(2)} req/s`,
      threshold: 'Baseline ±50%',
      explanation:
        'Traffic has deviated significantly from normal patterns, indicating potential issues or unusual load.'
    })
    details.push(
      `Request rate of ${metrics.rate.toFixed(2)} req/s is critically abnormal, deviating more than 50% from baseline.`
    )
    recommendations.push(
      'Investigate traffic sources and check for DDoS attacks or service degradation'
    )
  } else if (metrics.rateStatus === 1) {
    impactedMetrics.push({
      metric: 'Request Rate',
      status: 'warning',
      value: `${metrics.rate.toFixed(2)} req/s`,
      threshold: 'Baseline ±20-50%',
      explanation: 'Traffic is moderately different from expected patterns.'
    })
    details.push(
      `Request rate shows moderate deviation (${metrics.rate.toFixed(2)} req/s) from expected baseline.`
    )
    recommendations.push('Monitor for trending issues and prepare to scale if needed')
  } else {
    impactedMetrics.push({
      metric: 'Request Rate',
      status: 'healthy',
      value: `${metrics.rate.toFixed(2)} req/s`,
      threshold: 'Baseline ±20%',
      explanation: 'Traffic is within normal expected ranges.'
    })
  }

  // Analyze Error Rate metric
  if (metrics.errorStatus === 2) {
    impactedMetrics.push({
      metric: 'Error Rate',
      status: 'critical',
      value: `${metrics.errorRate.toFixed(2)}%`,
      threshold: '>5%',
      explanation:
        'High error rate indicates significant service reliability issues affecting user experience.'
    })
    details.push(
      `Critical error rate of ${metrics.errorRate.toFixed(2)}% is causing failed requests and poor user experience.`
    )
    recommendations.push('Check application logs for error patterns')
    recommendations.push('Review recent deployments for potential bugs')
    recommendations.push('Verify database connections and external dependencies')
  } else if (metrics.errorStatus === 1) {
    impactedMetrics.push({
      metric: 'Error Rate',
      status: 'warning',
      value: `${metrics.errorRate.toFixed(2)}%`,
      threshold: '1-5%',
      explanation: 'Elevated errors may impact some users but service remains mostly functional.'
    })
    details.push(
      `Error rate of ${metrics.errorRate.toFixed(2)}% is elevated and should be investigated.`
    )
    recommendations.push('Review error logs to identify patterns')
    recommendations.push('Consider implementing retry logic for transient failures')
  } else {
    impactedMetrics.push({
      metric: 'Error Rate',
      status: 'healthy',
      value: `${metrics.errorRate.toFixed(2)}%`,
      threshold: '<1%',
      explanation: 'Error rate is within acceptable limits.'
    })
  }

  // Analyze Duration metric
  if (metrics.durationStatus === 2) {
    impactedMetrics.push({
      metric: 'P95 Duration',
      status: 'critical',
      value: `${metrics.duration.toFixed(0)}ms`,
      threshold: '>500ms',
      explanation:
        'Response times are critically slow, severely impacting user experience and potentially causing timeouts.'
    })
    details.push(
      `P95 latency of ${metrics.duration.toFixed(0)}ms is critically high, causing slow user experiences.`
    )
    recommendations.push('Profile the application to identify performance bottlenecks')
    recommendations.push('Check database query performance and add indexes if needed')
    recommendations.push('Consider implementing caching for frequently accessed data')
  } else if (metrics.durationStatus === 1) {
    impactedMetrics.push({
      metric: 'P95 Duration',
      status: 'warning',
      value: `${metrics.duration.toFixed(0)}ms`,
      threshold: '100-500ms',
      explanation:
        'Response times are slower than optimal but still acceptable for most operations.'
    })
    details.push(
      `P95 latency of ${metrics.duration.toFixed(0)}ms is higher than optimal, may impact user satisfaction.`
    )
    recommendations.push('Optimize database queries and API calls')
    recommendations.push('Consider implementing response caching')
  } else {
    impactedMetrics.push({
      metric: 'P95 Duration',
      status: 'healthy',
      value: `${metrics.duration.toFixed(0)}ms`,
      threshold: '<100ms',
      explanation: 'Response times are fast and providing good user experience.'
    })
  }

  // Analyze OTel Health (span count as proxy)
  if (metrics.otelStatus === 2) {
    impactedMetrics.push({
      metric: 'Telemetry Health',
      status: 'critical',
      value: `${metrics.spanCount} spans`,
      threshold: 'Critically low',
      explanation:
        'Telemetry collection is severely impaired, limiting observability into service behavior.'
    })
    details.push('OpenTelemetry instrumentation is critically impaired or missing spans.')
    recommendations.push('Verify OpenTelemetry SDK initialization and configuration')
    recommendations.push('Check collector connectivity and processing pipeline')
  } else if (metrics.otelStatus === 1) {
    impactedMetrics.push({
      metric: 'Telemetry Health',
      status: 'warning',
      value: `${metrics.spanCount} spans`,
      threshold: 'Below expected',
      explanation:
        'Telemetry collection is partially degraded, some observability data may be missing.'
    })
    details.push('OpenTelemetry span collection is below expected levels.')
    recommendations.push('Review sampling configuration and adjust if needed')
  } else {
    impactedMetrics.push({
      metric: 'Telemetry Health',
      status: 'healthy',
      value: `${metrics.spanCount} spans`,
      threshold: 'Normal',
      explanation: 'Telemetry is being collected properly with good coverage.'
    })
  }

  // Determine overall status
  const statuses = [
    metrics.rateStatus,
    metrics.errorStatus,
    metrics.durationStatus,
    metrics.otelStatus
  ]
  const maxStatus = Math.max(...statuses)

  let status: HealthExplanation['status'] = 'healthy'
  let summary = ''

  if (maxStatus === 2) {
    status = 'critical'
    const criticalMetrics = impactedMetrics
      .filter((m) => m.status === 'critical')
      .map((m) => m.metric)
    summary = `${serviceName} is experiencing critical issues with ${criticalMetrics.join(', ')}. Immediate action required.`

    // Add urgent recommendations for critical status
    if (metrics.errorRate > 10) {
      recommendations.unshift(
        'URGENT: Consider circuit breaker activation to prevent cascade failures'
      )
    }
    if (metrics.duration > 1000) {
      recommendations.unshift('URGENT: Implement request timeouts to prevent resource exhaustion')
    }
  } else if (maxStatus === 1) {
    status = 'warning'
    const warningMetrics = impactedMetrics
      .filter((m) => m.status === 'warning')
      .map((m) => m.metric)
    summary = `${serviceName} is showing degraded performance in ${warningMetrics.join(', ')}. Monitoring recommended.`
  } else {
    status = 'healthy'
    summary = `${serviceName} is operating normally with all metrics within acceptable thresholds.`
    details.push('All RED metrics (Rate, Errors, Duration) are within healthy ranges.')
    recommendations.push('Continue monitoring for any changes in patterns')
  }

  // Add contextual recommendations based on combinations
  if (metrics.errorStatus >= 1 && metrics.durationStatus >= 1) {
    recommendations.push(
      'Combined high errors and latency suggest infrastructure or dependency issues'
    )
  }

  if (metrics.rateStatus === 2 && metrics.errorStatus === 0) {
    recommendations.push(
      'High traffic with low errors indicates successful scaling - monitor resource usage'
    )
  }

  return {
    status,
    summary,
    details,
    recommendations: [...new Set(recommendations)], // Remove duplicates
    impactedMetrics
  }
}

/**
 * Generate a concise health summary for tooltips
 */
export function getHealthTooltipSummary(
  serviceName: string,
  metrics?: ServiceMetricsDetail
): string {
  const explanation = generateHealthExplanation(serviceName, metrics)

  if (explanation.status === 'unknown') {
    return 'No metrics available'
  }

  const criticalMetrics = explanation.impactedMetrics.filter((m) => m.status === 'critical')
  const warningMetrics = explanation.impactedMetrics.filter((m) => m.status === 'warning')

  if (criticalMetrics.length > 0) {
    return `⚠️ CRITICAL: ${criticalMetrics.map((m) => `${m.metric} (${m.value})`).join(', ')}`
  }

  if (warningMetrics.length > 0) {
    return `⚡ WARNING: ${warningMetrics.map((m) => `${m.metric} (${m.value})`).join(', ')}`
  }

  return '✅ All metrics healthy'
}
