/**
 * Severity Classification
 *
 * Classifies severity of critical paths based on objective metrics
 * and business priority.
 */

import { CriticalPath } from '../types.js'

/**
 * Calculate severity score (0-1) based on metrics and priority
 *
 * Severity is a composite score of:
 * - Request volume (higher = more severe)
 * - Error rate (higher = more severe)
 * - Latency (higher = more severe)
 * - Business priority (critical > high > medium > low)
 */
export function classifySeverity(
  metrics: CriticalPath['metrics'],
  priority: CriticalPath['priority']
): number {
  // Base severity from priority
  const priorityScores = {
    critical: 0.9,
    high: 0.7,
    medium: 0.5,
    low: 0.3
  }

  let baseSeverity = priorityScores[priority]

  // Adjust based on error rate
  if (metrics.errorRate > 0.1) {
    // >10% errors
    baseSeverity = Math.min(1, baseSeverity + 0.1)
  } else if (metrics.errorRate > 0.05) {
    // >5% errors
    baseSeverity = Math.min(1, baseSeverity + 0.05)
  }

  // Adjust based on latency
  if (metrics.p99Latency > 5000) {
    // >5s P99
    baseSeverity = Math.min(1, baseSeverity + 0.1)
  } else if (metrics.p99Latency > 2000) {
    // >2s P99
    baseSeverity = Math.min(1, baseSeverity + 0.05)
  }

  // Adjust based on volume
  if (metrics.requestCount > 10000) {
    // >10k req/min
    baseSeverity = Math.min(1, baseSeverity + 0.05)
  }

  // Ensure severity is between 0 and 1
  return Math.max(0, Math.min(1, baseSeverity))
}

/**
 * Classify priority based on metrics (fallback when LLM doesn't provide)
 */
export function classifyPriority(metrics: CriticalPath['metrics']): CriticalPath['priority'] {
  // Critical: High volume + errors OR very high latency
  if ((metrics.requestCount > 10000 && metrics.errorRate > 0.05) || metrics.p99Latency > 5000) {
    return 'critical'
  }

  // High: Moderate volume with issues OR high latency
  if (metrics.requestCount > 5000 || metrics.errorRate > 0.05 || metrics.p99Latency > 2000) {
    return 'high'
  }

  // Medium: Some traffic or latency concerns
  if (metrics.requestCount > 1000 || metrics.avgLatency > 500) {
    return 'medium'
  }

  // Low: Everything else
  return 'low'
}
