import React, { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ChartErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log the error for debugging
    console.error('Chart error boundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div
          className="bg-red-50 border border-red-200 rounded p-4 m-2"
          data-testid="chart-error-fallback"
        >
          <h3 className="text-red-800 font-medium mb-2">Chart Error</h3>
          <p className="text-red-600 text-sm">
            Unable to render chart component.
            {this.state.error?.message && (
              <span className="block mt-1 font-mono text-xs">{this.state.error.message}</span>
            )}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            className="mt-2 px-3 py-1 bg-red-100 text-red-700 text-xs rounded hover:bg-red-200"
          >
            Retry
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
