import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Helper function to extract meaningful description from SQL query
const extractQueryDescription = (query: string): string => {
  const cleanQuery = query.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim().toLowerCase()

  // Extract table name
  const fromMatch = cleanQuery.match(/from\s+(\w+\.\w+|\w+)/)
  const tableName = fromMatch ? fromMatch[1] : 'unknown'

  // Extract WHERE conditions
  const whereMatch = cleanQuery.match(/where\s+(.+?)(?:\s+order\s+by|\s+group\s+by|\s+limit|\s+$)/)

  if (whereMatch) {
    const whereClause = whereMatch[1]

    // Look for common filter patterns
    const filters = []

    // Time range filters
    if (whereClause.includes('timestamp') || whereClause.includes('time')) {
      if (
        whereClause.includes('subtracthours') ||
        whereClause.includes('subtracthours') ||
        whereClause.includes('interval')
      ) {
        const timeMatch = whereClause.match(/subtracthours?\([^,)]+,\s*(\d+)\)/i)
        if (timeMatch) {
          filters.push(`${timeMatch[1]}h timespan`)
        } else {
          filters.push('time filter')
        }
      } else if (whereClause.includes('>=') || whereClause.includes('between')) {
        filters.push('time range')
      }
    }

    // Service filters
    const serviceMatch = whereClause.match(/service_name\s*[=~]\s*['"](.*?)['"]/)
    if (serviceMatch) {
      filters.push(`service: ${serviceMatch[1]}`)
    }

    // Ingestion path filters
    const pathMatch = whereClause.match(/ingestion_path\s*=\s*['"](.*?)['"]/)
    if (pathMatch) {
      filters.push(`path: ${pathMatch[1]}`)
    }

    // Error filters
    if (whereClause.includes('is_error') || whereClause.includes('status_code')) {
      if (whereClause.includes('= 1') || whereClause.includes('error')) {
        filters.push('errors only')
      } else {
        filters.push('status filter')
      }
    }

    // Operation filters
    const opMatch = whereClause.match(/operation_name\s*[=~]\s*['"](.*?)['"]/)
    if (opMatch) {
      filters.push(`op: ${opMatch[1]}`)
    }

    if (filters.length > 0) {
      return `${tableName}: ${filters.join(', ')}`
    }
  }

  // Extract LIMIT
  const limitMatch = cleanQuery.match(/limit\s+(\d+)/)
  const limit = limitMatch ? ` (${limitMatch[1]} rows)` : ''

  return `${tableName} query${limit}`
}

interface AppState {
  // Theme
  darkMode: boolean
  toggleDarkMode: () => void

  // Layout
  sidebarCollapsed: boolean
  toggleSidebar: () => void

  // Query state
  activeQuery: string
  setActiveQuery: (query: string) => void
  queryHistory: Array<{
    query: string
    timestamp: string
    description: string
  }>
  addToQueryHistory: (query: string) => void
  clearQueryHistory: () => void

  // Connection settings
  clickhouseUrl: string
  clickhouseAuth: {
    username: string
    password: string
  }
  setClickhouseConnection: (url: string, username: string, password: string) => void

  // Time range
  timeRange: {
    start: string
    end: string
  }
  setTimeRange: (start: string, end: string) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Theme
      darkMode: false,
      toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),

      // Layout
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      // Query state
      activeQuery: '',
      setActiveQuery: (query: string) => set({ activeQuery: query }),
      queryHistory: [],
      addToQueryHistory: (query: string) =>
        set((state) => {
          const trimmedQuery = query.trim()
          if (!trimmedQuery || state.queryHistory.some((h) => h.query === trimmedQuery))
            return state

          const description = extractQueryDescription(trimmedQuery)
          const timestamp = new Date().toLocaleString()

          const newEntry = {
            query: trimmedQuery,
            timestamp,
            description
          }

          const newHistory = [newEntry, ...state.queryHistory.slice(0, 9)] // Keep last 10
          return { queryHistory: newHistory }
        }),
      clearQueryHistory: () => set({ queryHistory: [] }),

      // Connection settings
      clickhouseUrl: '/api/clickhouse',
      clickhouseAuth: {
        username: 'otel',
        password: 'otel123'
      },
      setClickhouseConnection: (url: string, username: string, password: string) =>
        set({
          clickhouseUrl: url,
          clickhouseAuth: { username, password }
        }),

      // Time range
      timeRange: {
        start: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
        end: new Date().toISOString()
      },
      setTimeRange: (start: string, end: string) => set({ timeRange: { start, end } })
    }),
    {
      name: 'otel-ai-app-storage',
      version: 2, // Increment to force storage reset
      partialize: (state) => ({
        darkMode: state.darkMode,
        sidebarCollapsed: state.sidebarCollapsed,
        clickhouseUrl: state.clickhouseUrl,
        clickhouseAuth: state.clickhouseAuth,
        queryHistory: state.queryHistory
      }),
      migrate: (persistedState: any, version: number) => {
        // Force reset to ensure we use proxy URL and new history format
        if (version < 2) {
          return {
            darkMode: persistedState?.darkMode || false,
            sidebarCollapsed: persistedState?.sidebarCollapsed || false,
            clickhouseUrl: '/api/clickhouse',
            clickhouseAuth: {
              username: 'otel',
              password: 'otel123'
            },
            queryHistory: [] // Reset to new format
          }
        }
        return persistedState
      }
    }
  )
)
