import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  // Theme
  darkMode: boolean;
  toggleDarkMode: () => void;

  // Layout
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Query state
  activeQuery: string;
  setActiveQuery: (query: string) => void;
  
  // Connection settings
  clickhouseUrl: string;
  clickhouseAuth: {
    username: string;
    password: string;
  };
  setClickhouseConnection: (url: string, username: string, password: string) => void;

  // Time range
  timeRange: {
    start: string;
    end: string;
  };
  setTimeRange: (start: string, end: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Theme
      darkMode: false,
      toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),

      // Layout
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      // Query state
      activeQuery: '',
      setActiveQuery: (query: string) => set({ activeQuery: query }),

      // Connection settings
      clickhouseUrl: '/api/clickhouse',
      clickhouseAuth: {
        username: 'otel',
        password: 'otel123',
      },
      setClickhouseConnection: (url: string, username: string, password: string) =>
        set({
          clickhouseUrl: url,
          clickhouseAuth: { username, password },
        }),

      // Time range
      timeRange: {
        start: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
        end: new Date().toISOString(),
      },
      setTimeRange: (start: string, end: string) =>
        set({ timeRange: { start, end } }),
    }),
    {
      name: 'otel-ai-app-storage',
      version: 2, // Increment to force storage reset
      partialize: (state) => ({
        darkMode: state.darkMode,
        sidebarCollapsed: state.sidebarCollapsed,
        clickhouseUrl: state.clickhouseUrl,
        clickhouseAuth: state.clickhouseAuth,
      }),
      migrate: (persistedState: any, version: number) => {
        // Force reset to ensure we use proxy URL
        if (version < 2) {
          return {
            darkMode: persistedState?.darkMode || false,
            sidebarCollapsed: persistedState?.sidebarCollapsed || false,
            clickhouseUrl: '/api/clickhouse',
            clickhouseAuth: {
              username: 'otel',
              password: 'otel123',
            },
          };
        }
        return persistedState;
      },
    }
  )
);