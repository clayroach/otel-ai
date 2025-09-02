// Browser-compatible event bus implementation
class AnalysisEventBus {
  private listeners: Set<() => void> = new Set()

  public triggerAnalysis() {
    this.listeners.forEach((callback) => callback())
  }

  public onAnalyze(callback: () => void) {
    this.listeners.add(callback)
    // Return unsubscribe function
    return () => {
      this.listeners.delete(callback)
    }
  }
}

export const analysisEventBus = new AnalysisEventBus()
