import { useState, useCallback } from 'react'

interface ComponentProps {
  config?: unknown
  data?: unknown[]
  analysis?: {
    patterns: string[]
    columns: unknown[]
    confidence: number
  }
}

interface UIGenerationResponse {
  component: {
    id: string
    type: string
    title: string
    description?: string
    component: string
    props: ComponentProps
    metadata?: {
      generatedAt: number
      dataSource: string
      rowCount: number
      confidence: number
    }
  }
  query: {
    sql: string
    model: string
    generationTime: number
    explanation?: string
  }
  results: {
    data: unknown[]
    rowCount: number
    executionTime: number
  }
  metadata: {
    totalTime: number
    steps: Array<{
      name: string
      duration: number
      status: 'success' | 'error' | 'skipped'
    }>
  }
}

export const useUIGeneration = () => {
  const [data, setData] = useState<UIGenerationResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generateUI = useCallback(
    async (
      naturalLanguageQuery: string,
      options?: {
        context?: {
          criticalPath?: string
          timeRange?: string
          services?: string[]
        }
      }
    ) => {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/ui-generator/pipeline', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            naturalLanguageQuery,
            context: options?.context
          })
        })

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const result = await response.json()
        setData(result)
        return result
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        setError(errorMessage)
        console.error('UI generation failed:', err)
        throw err
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const generateDiagnosticUI = useCallback(
    async (criticalPath: string, issueType: 'latency' | 'errors' | 'throughput') => {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/ui-generator/diagnostic', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            criticalPath,
            issueType
          })
        })

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const result = await response.json()
        setData(result)
        return result
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        setError(errorMessage)
        console.error('Diagnostic UI generation failed:', err)
        throw err
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const reset = useCallback(() => {
    setData(null)
    setError(null)
    setLoading(false)
  }, [])

  return {
    data,
    loading,
    error,
    generateUI,
    generateDiagnosticUI,
    reset
  }
}
