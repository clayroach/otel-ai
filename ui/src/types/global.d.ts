// Global type declarations for Electron API
declare global {
  interface Window {
    electronAPI?: {
      onMenuAction: (callback: (action: string, data?: unknown) => void) => void
      off: (channel: string, callback?: Function) => void
      removeAllListeners?: (channel: string) => void
      showSaveDialog: (
        options: Record<string, unknown>
      ) => Promise<{ canceled: boolean; filePath?: string }>
      showOpenDialog: (
        options: Record<string, unknown>
      ) => Promise<{ canceled: boolean; filePaths: string[] }>
      writeFile: (path: string, content: string) => Promise<void>
      readFile: (path: string) => Promise<string>
      // Add other electron API methods as needed
    }
  }
}

export {}
