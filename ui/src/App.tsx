import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { ConfigProvider, theme, App as AntdApp } from 'antd'
import { QueryClient, QueryClientProvider } from 'react-query'
import { Layout } from './components/Layout/Layout'
import { TracesView } from './views/TracesView/TracesView'
import { MetricsView } from './views/MetricsView/MetricsView'
import { LogsView } from './views/LogsView/LogsView'
import ServiceTopologyView from './views/ServiceTopologyView/ServiceTopologyView'
import { LLMDebugView } from './views/LLMDebugView'
import { DynamicUIDemo } from './components/DynamicCharts/DynamicUIDemo'
import { useMenuActions } from './hooks/useMenuActions'
import { useAppStore } from './store/appStore'
import { ModelSelectionProvider } from './contexts/ModelSelectionContext'

// Create a client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000 // 5 minutes
    }
  }
})

// Component that needs to be inside Router context
const AppContent: React.FC = () => {
  // Set up menu action handlers for Electron (needs Router context)
  useMenuActions()

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/servicetopology" replace />} />
        <Route path="/servicetopology" element={<ServiceTopologyView />} />
        <Route path="/traces" element={<TracesView />} />
        <Route path="/metrics" element={<MetricsView />} />
        <Route path="/logs" element={<LogsView />} />
        <Route path="/llm-debug" element={<LLMDebugView />} />
        <Route path="/dynamic-ui" element={<DynamicUIDemo />} />
      </Routes>
    </Layout>
  )
}

const App: React.FC = () => {
  const { darkMode } = useAppStore()

  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        theme={{
          algorithm: darkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
          token: {
            colorPrimary: '#1890ff',
            borderRadius: 6
          }
        }}
      >
        <AntdApp>
          <ModelSelectionProvider>
            <Router
              future={{
                v7_startTransition: true,
                v7_relativeSplatPath: true
              }}
            >
              <AppContent />
            </Router>
          </ModelSelectionProvider>
        </AntdApp>
      </ConfigProvider>
    </QueryClientProvider>
  )
}

export default App
