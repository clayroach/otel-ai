/**
 * Critical Path Overlay Component
 *
 * Visually highlights critical spans in the trace waterfall view.
 * Uses distinct visual treatment (color, thickness, glow) to make
 * critical paths immediately identifiable.
 */

import React from 'react'
import type { CriticalPath } from '../../api/critical-paths'

export interface CriticalPathOverlayProps {
  /** Critical paths to highlight */
  paths: CriticalPath[]
  /** Whether overlay is visible */
  visible: boolean
  /** Current trace ID being viewed */
  traceId?: string
  /** Services in the current trace */
  services?: string[]
  /** Callback when a critical span is clicked */
  onSpanClick?: (pathId: string, service: string) => void
}

/**
 * Overlay component that highlights critical paths in trace view
 *
 * This component renders visual indicators for critical paths,
 * making them stand out in the trace waterfall.
 *
 * @example
 * ```tsx
 * <CriticalPathOverlay
 *   paths={criticalPaths}
 *   visible={showCriticalPaths}
 *   traceId={currentTraceId}
 *   services={traceServices}
 * />
 * ```
 */
export const CriticalPathOverlay: React.FC<CriticalPathOverlayProps> = ({
  paths,
  visible,
  traceId: _traceId, // Reserved for future filtering by trace
  services = [],
  onSpanClick
}) => {
  if (!visible || paths.length === 0) {
    return null
  }

  // Find paths that include services from the current trace
  const relevantPaths = paths.filter((path) =>
    path.services.some((service) => services.includes(service))
  )

  if (relevantPaths.length === 0) {
    return null
  }

  /**
   * Get color for severity level
   */
  const getSeverityColor = (severity: number): string => {
    if (severity >= 0.8) return '#ff4d4f' // critical (red)
    if (severity >= 0.6) return '#ff7a45' // high (orange)
    if (severity >= 0.4) return '#ffa940' // medium (amber)
    return '#fadb14' // low (yellow)
  }

  /**
   * Get glow effect for critical paths
   */
  const getGlowStyle = (severity: number): React.CSSProperties => {
    const color = getSeverityColor(severity)
    return {
      boxShadow: `0 0 10px ${color}, 0 0 20px ${color}40`,
      border: `2px solid ${color}`,
      borderRadius: '4px'
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        zIndex: 10
      }}
      data-testid="critical-path-overlay"
    >
      {relevantPaths.map((path) => (
        <div
          key={path.id}
          style={{
            position: 'relative',
            marginBottom: '8px'
          }}
        >
          {/* Path indicator - positioned based on service order */}
          {path.services.map((service, index) => {
            if (!services.includes(service)) return null

            return (
              <div
                key={`${path.id}-${service}`}
                style={{
                  ...getGlowStyle(path.severity),
                  backgroundColor: `${getSeverityColor(path.severity)}20`,
                  padding: '4px 8px',
                  margin: '2px 0',
                  display: 'inline-block',
                  pointerEvents: 'auto',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onClick={() => onSpanClick?.(path.id, service)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.02)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)'
                }}
                title={`Critical Path: ${path.name} (${(path.severity * 100).toFixed(0)}% critical)`}
              >
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: getSeverityColor(path.severity)
                  }}
                >
                  {service}
                  {index < path.services.length - 1 && <span style={{ margin: '0 4px' }}>→</span>}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
