/**
 * LLM Debug View
 * 
 * Real-time debugging interface for LLM interactions with streaming logs,
 * model comparisons, and query analysis.
 */

import React, { useState, useEffect, useRef } from 'react'
import './LLMDebugView.css'

interface LLMInteraction {
  id: string
  timestamp: number
  model: string
  request: {
    prompt: string
    taskType: string
    preferences?: Record<string, any>
  }
  response?: {
    content: string
    model: string
    usage: {
      promptTokens: number
      completionTokens: number
      totalTokens: number
      cost?: number
    }
    metadata?: Record<string, any>
  }
  error?: {
    _tag: string
    message?: string
  }
  latencyMs?: number
  status: 'pending' | 'success' | 'error'
  debugInfo?: {
    routingReason: string
    cacheHit: boolean
    retryCount: number
    fallbackUsed?: string
  }
}

interface LiveEvent {
  type: 'connected' | 'request_start' | 'request_complete' | 'request_error' | 'stream_chunk'
  entry?: LLMInteraction
  streamChunk?: string
  timestamp: number
  message?: string
}

interface ModelComparison {
  model: string
  interactions: LLMInteraction[]
  avgLatency: number
  successRate: number
  avgCost: number
}

export const LLMDebugView: React.FC = () => {
  const [interactions, setInteractions] = useState<LLMInteraction[]>([])
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([])
  const [modelComparison, setModelComparison] = useState<ModelComparison[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [autoScroll, setAutoScroll] = useState(true)
  const [isLiveFeedConnected, setIsLiveFeedConnected] = useState(false)

  const liveFeedRef = useRef<EventSource | null>(null)
  const interactionsRef = useRef<HTMLDivElement>(null)

  // Fetch recent interactions
  const fetchInteractions = async () => {
    try {
      const params = new URLSearchParams()
      if (selectedModel) params.set('model', selectedModel)
      params.set('limit', '50')

      const response = await fetch(`/api/llm/interactions?${params}`)
      const data = await response.json()
      setInteractions(data.interactions || [])
    } catch (error) {
      console.error('Failed to fetch LLM interactions:', error)
    }
  }

  // Fetch model comparison
  const fetchModelComparison = async () => {
    try {
      const response = await fetch('/api/llm/comparison')
      const data = await response.json()
      setModelComparison(data.comparison || [])
    } catch (error) {
      console.error('Failed to fetch model comparison:', error)
    }
  }

  // Connect to live feed
  const connectLiveFeed = () => {
    if (liveFeedRef.current) {
      liveFeedRef.current.close()
    }

    const eventSource = new EventSource('/api/llm/live')
    liveFeedRef.current = eventSource

    eventSource.onopen = () => {
      setIsLiveFeedConnected(true)
      console.log('🔗 Connected to LLM live feed')
    }

    eventSource.onmessage = (event) => {
      try {
        const liveEvent: LiveEvent = JSON.parse(event.data)
        setLiveEvents(prev => [...prev.slice(-49), liveEvent])

        // Update interactions if it's a complete event
        if (liveEvent.type === 'request_complete' || liveEvent.type === 'request_error') {
          if (liveEvent.entry) {
            setInteractions(prev => {
              const filtered = prev.filter(i => i.id !== liveEvent.entry!.id)
              return [liveEvent.entry!, ...filtered].slice(0, 50)
            })
          }
        } else if (liveEvent.type === 'request_start') {
          if (liveEvent.entry) {
            setInteractions(prev => [liveEvent.entry!, ...prev].slice(0, 50))
          }
        }
      } catch (error) {
        console.error('Failed to parse live event:', error)
      }
    }

    eventSource.onerror = () => {
      setIsLiveFeedConnected(false)
      console.log('❌ Lost connection to LLM live feed')
      
      // Try to reconnect after 5 seconds
      setTimeout(connectLiveFeed, 5000)
    }
  }

  // Clear all logs
  const clearLogs = async () => {
    try {
      await fetch('/api/llm/interactions', { method: 'DELETE' })
      setInteractions([])
      setLiveEvents([])
    } catch (error) {
      console.error('Failed to clear logs:', error)
    }
  }

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && interactionsRef.current) {
      interactionsRef.current.scrollTop = interactionsRef.current.scrollHeight
    }
  }, [interactions, autoScroll])

  // Initialize
  useEffect(() => {
    fetchInteractions()
    fetchModelComparison()
    connectLiveFeed()

    const interval = setInterval(() => {
      fetchModelComparison()
    }, 30000) // Update comparison every 30 seconds

    return () => {
      clearInterval(interval)
      if (liveFeedRef.current) {
        liveFeedRef.current.close()
      }
    }
  }, [])

  // Refresh interactions when model filter changes
  useEffect(() => {
    fetchInteractions()
  }, [selectedModel])

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString()
  }

  const formatLatency = (ms?: number) => {
    if (!ms) return 'N/A'
    return `${ms}ms`
  }

  const formatCost = (cost?: number) => {
    if (!cost) return '$0.0000'
    return `$${cost.toFixed(4)}`
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return '✅'
      case 'error': return '❌'
      case 'pending': return '⏳'
      default: return '❓'
    }
  }

  return (
    <div className="llm-debug-view">
      <div className="debug-header">
        <h2>🤖 LLM Interaction Debug Console</h2>
        <div className="header-controls">
          <div className="connection-status">
            <span className={`status-indicator ${isLiveFeedConnected ? 'connected' : 'disconnected'}`}>
              {isLiveFeedConnected ? '🟢 Live' : '🔴 Offline'}
            </span>
          </div>
          <select 
            value={selectedModel} 
            onChange={(e) => setSelectedModel(e.target.value)}
            className="model-filter"
          >
            <option value="">All Models</option>
            <option value="gpt">GPT</option>
            <option value="claude">Claude</option>
            <option value="llama">Llama</option>
          </select>
          <label className="auto-scroll">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            Auto-scroll
          </label>
          <button onClick={clearLogs} className="clear-logs-btn">
            🧹 Clear Logs
          </button>
        </div>
      </div>

      <div className="debug-content">
        {/* Model Comparison Panel */}
        <div className="model-comparison">
          <h3>📊 Model Performance Comparison</h3>
          <div className="comparison-grid">
            {modelComparison.map((model) => (
              <div key={model.model} className="model-card">
                <div className="model-name">{model.model.toUpperCase()}</div>
                <div className="model-stats">
                  <div className="stat">
                    <span className="stat-label">Avg Latency</span>
                    <span className="stat-value">{model.avgLatency}ms</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Success Rate</span>
                    <span className="stat-value">{(model.successRate * 100).toFixed(1)}%</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Avg Cost</span>
                    <span className="stat-value">{formatCost(model.avgCost)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Live Interactions */}
        <div className="interactions-panel">
          <h3>🔄 Live Interactions ({interactions.length})</h3>
          <div className="interactions-list" ref={interactionsRef}>
            {interactions.map((interaction) => (
              <div key={interaction.id} className={`interaction ${interaction.status}`}>
                <div className="interaction-header">
                  <span className="status-icon">{getStatusIcon(interaction.status)}</span>
                  <span className="interaction-id">[{interaction.id}]</span>
                  <span className="model-name">{interaction.model.toUpperCase()}</span>
                  <span className="timestamp">{formatTimestamp(interaction.timestamp)}</span>
                  <span className="latency">{formatLatency(interaction.latencyMs)}</span>
                </div>
                
                <div className="interaction-details">
                  <div className="request-section">
                    <strong>📤 Request ({interaction.request.taskType}):</strong>
                    <div className="prompt-text">"{interaction.request.prompt}"</div>
                    {interaction.debugInfo && (
                      <div className="debug-info">
                        <span>Routing: {interaction.debugInfo.routingReason}</span>
                        {interaction.debugInfo.cacheHit && <span className="cache-hit">💰 Cache Hit</span>}
                        {interaction.debugInfo.retryCount > 0 && (
                          <span className="retry-count">🔄 Retries: {interaction.debugInfo.retryCount}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {interaction.response && (
                    <div className="response-section">
                      <strong>📥 Response:</strong>
                      <div className="response-text">"{interaction.response.content}"</div>
                      <div className="usage-info">
                        <span>Tokens: {interaction.response.usage.totalTokens}</span>
                        <span>Cost: {formatCost(interaction.response.usage.cost)}</span>
                      </div>
                    </div>
                  )}

                  {interaction.error && (
                    <div className="error-section">
                      <strong>❌ Error:</strong>
                      <div className="error-text">{interaction.error._tag}: {interaction.error.message}</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {interactions.length === 0 && (
              <div className="no-interactions">
                <p>No LLM interactions yet. Start using AI features to see debug information.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default LLMDebugView