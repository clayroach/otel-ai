import { App as AntdApp, ConfigProvider, theme } from 'antd'
import React from 'react'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom'
import { Layout } from './components/Layout/Layout'
import { ModelSelectionProvider } from './contexts/ModelSelectionContext'
import { useMenuActions } from './hooks/useMenuActions'
import { useAppStore } from './store/appStore'
import { LLMDebugView } from './views/LLMDebugView'
import ServiceTopologyView from './views/ServiceTopologyView/ServiceTopologyView'
import { TracesView } from './views/TracesView/TracesView'

// Create a client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity, // Never auto-refetch by default
      gcTime: 30 * 60 * 1000, // Keep in memory for 30 min
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      retry: 1
    }
  }
})

// Create persister for localStorage
const persister = createSyncStoragePersister({
  storage: window.localStorage
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
        <Route path="/llm-debug" element={<LLMDebugView />} />
        {/* <Route path="/metrics" element={<MetricsView />} />
        <Route path="/logs" element={<LogsView />} />
        <Route path="/dynamic-ui" element={<DynamicUIDemo />} /> */}
      </Routes>
    </Layout>
  )
}

const App: React.FC = () => {
  const { darkMode } = useAppStore()

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
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
            <Router>
              <AppContent />
            </Router>
          </ModelSelectionProvider>
        </AntdApp>
      </ConfigProvider>
    </PersistQueryClientProvider>
  )
}

export default App
