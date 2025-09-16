/**
 * LLM Interaction Logger
 * Captures and stores real Portkey gateway interactions for the debug console
 */

import { EventEmitter } from 'events'

export interface LLMInteraction {
  id: string
  timestamp: number
  model: string
  provider: string
  request: {
    prompt: string
    taskType: string
    preferences?: Record<string, unknown>
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
    metadata?: Record<string, unknown>
  }
  error?: {
    _tag: string
    message?: string
  }
  latencyMs?: number
  status: 'pending' | 'success' | 'error'
  debugInfo?: {
    routingReason: string
    provider: string
    baseUrl?: string
    retryCount: number
    fallbackUsed?: string
  }
}

class InteractionLogger extends EventEmitter {
  private interactions: LLMInteraction[] = []
  private maxInteractions = 100

  /**
   * Start logging a new interaction
   */
  startInteraction(
    model: string,
    provider: string,
    prompt: string,
    taskType: string = 'generation',
    preferences?: Record<string, unknown>
  ): string {
    const id = `portkey_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`

    const interaction: LLMInteraction = {
      id,
      timestamp: Date.now(),
      model,
      provider,
      request: {
        prompt,
        taskType,
        ...(preferences && { preferences })
      },
      status: 'pending',
      debugInfo: {
        routingReason: `Routed to ${provider} for model ${model}`,
        provider,
        retryCount: 0
      }
    }

    this.interactions.unshift(interaction)
    if (this.interactions.length > this.maxInteractions) {
      this.interactions = this.interactions.slice(0, this.maxInteractions)
    }

    // Emit event for live feed
    this.emit('interaction:start', interaction)

    return id
  }

  /**
   * Complete a successful interaction
   */
  completeInteraction(
    id: string,
    response: {
      content: string
      model: string
      usage: {
        promptTokens: number
        completionTokens: number
        totalTokens: number
      }
      metadata?: Record<string, unknown>
    },
    latencyMs: number
  ) {
    const interaction = this.interactions.find((i) => i.id === id)
    if (!interaction) return

    // Calculate cost based on model
    const cost = this.calculateCost(response.model, response.usage)

    interaction.response = {
      ...response,
      usage: {
        ...response.usage,
        cost
      }
    }
    interaction.latencyMs = latencyMs
    interaction.status = 'success'

    // Emit event for live feed
    this.emit('interaction:complete', interaction)
  }

  /**
   * Mark an interaction as failed
   */
  failInteraction(id: string, error: { _tag: string; message?: string }, latencyMs: number) {
    const interaction = this.interactions.find((i) => i.id === id)
    if (!interaction) return

    interaction.error = error
    interaction.latencyMs = latencyMs
    interaction.status = 'error'

    // Emit event for live feed
    this.emit('interaction:error', interaction)
  }

  /**
   * Get recent interactions with optional filtering
   */
  getInteractions(limit: number = 50, model?: string): LLMInteraction[] {
    let filtered = this.interactions

    if (model) {
      // Filter by model or provider
      filtered = filtered.filter(
        (i) =>
          i.model.toLowerCase().includes(model.toLowerCase()) ||
          i.provider.toLowerCase().includes(model.toLowerCase())
      )
    }

    return filtered.slice(0, limit)
  }

  /**
   * Clear all interactions
   */
  clearInteractions() {
    this.interactions = []
    this.emit('interactions:cleared')
  }

  /**
   * Calculate cost based on model and token usage
   */
  private calculateCost(
    model: string,
    usage: { promptTokens: number; completionTokens: number }
  ): number {
    // Rough cost estimates per 1k tokens (in USD)
    const costs: Record<string, { prompt: number; completion: number }> = {
      'gpt-3.5-turbo': { prompt: 0.0005, completion: 0.0015 },
      'gpt-4': { prompt: 0.03, completion: 0.06 },
      'gpt-4-turbo': { prompt: 0.01, completion: 0.03 },
      'claude-3-haiku': { prompt: 0.00025, completion: 0.00125 },
      'claude-3-sonnet': { prompt: 0.003, completion: 0.015 },
      'claude-3-opus': { prompt: 0.015, completion: 0.075 },
      // Local models have no cost
      codellama: { prompt: 0, completion: 0 },
      sqlcoder: { prompt: 0, completion: 0 },
      deepseek: { prompt: 0, completion: 0 },
      llama: { prompt: 0, completion: 0 },
      mistral: { prompt: 0, completion: 0 }
    }

    // Find matching cost or use default
    const modelKey = Object.keys(costs).find((key) =>
      model.toLowerCase().includes(key.toLowerCase())
    )
    const modelCost = modelKey ? costs[modelKey] : null
    const finalCost = modelCost || { prompt: 0.001, completion: 0.002 }

    return (
      (usage.promptTokens * finalCost.prompt) / 1000 +
      (usage.completionTokens * finalCost.completion) / 1000
    )
  }

  /**
   * Get model comparison stats
   */
  getModelComparison(timeWindowMs: number = 24 * 60 * 60 * 1000) {
    const cutoff = Date.now() - timeWindowMs
    const recentInteractions = this.interactions.filter((i) => i.timestamp > cutoff)

    const modelStats = new Map<
      string,
      {
        interactions: LLMInteraction[]
        totalLatency: number
        successCount: number
        totalCost: number
      }
    >()

    for (const interaction of recentInteractions) {
      const key = interaction.model
      if (!modelStats.has(key)) {
        modelStats.set(key, {
          interactions: [],
          totalLatency: 0,
          successCount: 0,
          totalCost: 0
        })
      }

      const stats = modelStats.get(key)
      if (stats) {
        stats.interactions.push(interaction)

        if (interaction.status === 'success') {
          stats.successCount++
          stats.totalLatency += interaction.latencyMs || 0
          stats.totalCost += interaction.response?.usage?.cost || 0
        }
      }
    }

    return Array.from(modelStats.entries()).map(([model, stats]) => ({
      model,
      interactions: stats.interactions,
      avgLatency: stats.successCount > 0 ? stats.totalLatency / stats.successCount : 0,
      successRate:
        stats.interactions.length > 0 ? stats.successCount / stats.interactions.length : 0,
      avgCost: stats.successCount > 0 ? stats.totalCost / stats.successCount : 0,
      totalCost: stats.totalCost
    }))
  }
}

// Export singleton instance
export const interactionLogger = new InteractionLogger()
