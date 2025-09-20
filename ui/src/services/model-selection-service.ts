/**
 * Model Selection Service - Client-side service for model selection persistence
 * This is a simplified version that only handles localStorage operations
 */

export interface ModelSelectionState {
  generalModelId: string | null
  sqlModelId: string | null
  timestamp: number
  sessionId: string
}

export class ModelSelectionService {
  private static SESSION_KEY = 'model-selection-session'
  private static TIMESTAMP_KEY = 'model-selection-timestamp'

  static persistSelection(taskType: 'general' | 'sql', modelId: string): void {
    try {
      localStorage.setItem(`model-selection-${taskType}`, modelId)
      localStorage.setItem(this.TIMESTAMP_KEY, String(Date.now()))
    } catch (error) {
      console.error('Failed to persist model selection:', error)
    }
  }

  static loadPersistedSelection(taskType: 'general' | 'sql'): string | null {
    try {
      return localStorage.getItem(`model-selection-${taskType}`)
    } catch (error) {
      console.error('Failed to load persisted selection:', error)
      return null
    }
  }

  static getSelectionState(): ModelSelectionState {
    try {
      const generalModelId = localStorage.getItem('model-selection-general')
      const sqlModelId = localStorage.getItem('model-selection-sql')
      let sessionId = localStorage.getItem(this.SESSION_KEY)

      if (!sessionId) {
        sessionId = `session-${Date.now()}`
        localStorage.setItem(this.SESSION_KEY, sessionId)
      }

      return {
        generalModelId,
        sqlModelId,
        timestamp: Date.now(),
        sessionId
      }
    } catch (error) {
      console.error('Failed to get selection state:', error)
      return {
        generalModelId: null,
        sqlModelId: null,
        timestamp: Date.now(),
        sessionId: `session-${Date.now()}`
      }
    }
  }

  static clearSelections(): void {
    try {
      localStorage.removeItem('model-selection-general')
      localStorage.removeItem('model-selection-sql')
      localStorage.removeItem(this.TIMESTAMP_KEY)
    } catch (error) {
      console.error('Failed to clear selections:', error)
    }
  }
}
